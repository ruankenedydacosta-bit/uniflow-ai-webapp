// Criar, editar, excluir ou consultar uma meta pela conversa ou pela voz
// (#192). O uni-interpret diz o que a pessoa pediu; aqui, sem efeito
// colateral, o pedido é conferido (meta encontrada, nome repetido, o que
// muda) e vira o card que a pessoa confirma, ou o texto da consulta. Quem
// grava é o chat, depois do Confirmar, pelo mesmo hook da tela Metas.
//
// Aporte e retirada (#161) seguem as regras da folha da tela (#158): a
// transferência vai da conta escolhida para a conta vinculada da meta (na
// retirada, o inverso), retirada maior que o guardado e meta concluída são
// bloqueadas, e meta pausada só aceita retirada.
import { normalizeSearchText } from '../../utils/searchText.js';
import { formatCurrency } from '../../utils/formatters.js';
import { calcRemaining, calcRequiredMonthlyAmount } from '../goals/goalCalc.js';
import {
  mensagemDoErro,
  montarMovimento as montarMovimentoDaFolha,
  MOVIMENTOS,
  transferenciaDaMeta,
} from '../goals/aporteDaMeta.js';
import { classifyPendingActionReply } from './pendingActionInput.js';
import { formatarData } from './edicaoDeLancamento.js';

// actionKind do card.
export const ACTION_KIND_META = 'manage_goal';

export const ACOES_DE_META = Object.freeze({
  CRIAR: 'criar',
  EDITAR: 'editar',
  EXCLUIR: 'excluir',
  CONSULTAR: 'consultar',
  APORTAR: 'aportar',
  RETIRAR: 'retirar',
});

const TITULO_DO_CARD = Object.freeze({
  criar: 'Criar meta',
  editar: 'Alterar meta',
  excluir: 'Excluir meta',
  aportar: 'Registrar aporte',
  retirar: 'Retirar da meta',
});

// Mais contas que isso na pergunta vira lista cansativa na voz.
const MAX_CONTAS_NA_PERGUNTA = 4;

const NOME_MAX = 60;
// Mais que isso na voz vira lista cansativa: o resto fica na tela Metas.
const MAX_METAS_NA_RESPOSTA = 4;

function nomeDeMeta(nome) {
  const limpo = String(nome ?? '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().slice(0, NOME_MAX).trim();
  return limpo ? `${limpo.charAt(0).toUpperCase()}${limpo.slice(1)}` : '';
}

function mesmoNome(a, b) {
  return normalizeSearchText(a ?? '') === normalizeSearchText(b ?? '');
}

// Metas em aberto, as mesmas que a tela Metas lista na aba Ativas.
function metasEmAberto(metas) {
  return (Array.isArray(metas) ? metas : []).filter((meta) => (
    meta && !meta.archived_at && (meta.status === 'active' || meta.status === 'paused')
  ));
}

const ERRO_PRAZO = 'Não entendi o prazo. Diga uma data daqui para frente, como "até dezembro" ou "em julho do ano que vem".';

// pedido: { acao, alvo: { id, name } | null, nome, valor, data, porMes,
// conta, soNaMeta, ajustes } do uni-interpret. metas: as metas do espaço;
// contas: as contas ativas, para a transferência do aporte, ou null quando
// ainda não foi possível lê-las; clientOperationId: a chave de idempotência
// do aporte. Devolve { erro } com o texto para a pessoa, ou o pedido pronto
// para o card. Consultar não passa por aqui: veja textoDaConsultaDeMetas.
export function montarPedidoDeMeta(pedido, {
  metas = [], contas = [], hoje = null, clientOperationId = null,
} = {}) {
  const acao = pedido?.acao;
  const abertas = metasEmAberto(metas);
  const ajustes = Array.isArray(pedido?.ajustes) ? pedido.ajustes : [];

  if (acao === ACOES_DE_META.APORTAR || acao === ACOES_DE_META.RETIRAR) {
    return montarMovimentoDaConversa(pedido, { metas, abertas, contas, hoje, ajustes, clientOperationId });
  }

  if (acao === ACOES_DE_META.CRIAR) {
    const nome = nomeDeMeta(pedido.nome);
    if (!nome) return { erro: 'Diga o nome da meta. Por exemplo: "quero juntar 5 mil para a viagem".' };
    if (ajustes.includes('data_descartada')) return { erro: ERRO_PRAZO };
    const valor = Number(pedido.valor) > 0 ? Number(pedido.valor) : null;
    if (!valor) return { erro: `Diga quanto você quer juntar na meta ${nome}.` };
    const repetida = abertas.find((meta) => mesmoNome(meta.name, nome));
    if (repetida) return { erro: `Já existe uma meta chamada ${repetida.name}. Diga outro nome ou peça para mudar essa.` };
    const data = pedido.data || null;
    const porMes = Number(pedido.porMes) > 0 ? Number(pedido.porMes) : null;
    const rows = [
      { label: 'Meta', value: nome },
      { label: 'Valor', value: formatCurrency(valor) },
    ];
    if (data) rows.push({ label: 'Prazo', value: formatarData(data) });
    if (porMes) rows.push({ label: 'Por mês', value: formatCurrency(porMes) });
    const detalhes = [
      data ? ` até ${formatarData(data)}` : '',
      porMes ? `, guardando ${formatCurrency(porMes)} por mês` : '',
    ].join('');
    return {
      acao,
      meta: null,
      nome,
      payload: {
        name: nome,
        target_amount: valor,
        ...(data ? { target_date: data } : {}),
        ...(porMes ? { planned_monthly_amount: porMes } : {}),
        ...(hoje ? { start_date: hoje } : {}),
        category: 'other',
        priority: 'medium',
      },
      texto: `Vou criar a meta ${nome} de ${formatCurrency(valor)}${detalhes}. Posso criar?`,
      card: card(acao, rows),
    };
  }

  if (acao !== ACOES_DE_META.EDITAR && acao !== ACOES_DE_META.EXCLUIR) {
    return { erro: 'Não entendi o que fazer com a meta. Diga se é para criar, mudar, excluir ou consultar.' };
  }

  const meta = abertas.find((item) => item.id === pedido.alvo?.id) ?? null;
  if (!meta) return { erro: textoDeMetaNaoEncontrada(pedido, abertas) };

  if (acao === ACOES_DE_META.EXCLUIR) {
    return {
      acao,
      meta,
      nome: null,
      payload: null,
      texto: `Vou excluir a meta ${meta.name}. Posso excluir?`,
      card: card(acao, [
        { label: 'Meta', value: meta.name },
        { label: 'Valor', value: formatCurrency(meta.target_amount) },
        { label: 'Guardado', value: formatCurrency(meta.current_amount) },
      ]),
    };
  }

  if (ajustes.includes('data_descartada')) return { erro: ERRO_PRAZO };
  const mudancas = [];
  const nome = nomeDeMeta(pedido.nome);
  // Mesmo nome com outra caixa ou acento não é renomear: o modelo capitaliza.
  if (nome && !mesmoNome(nome, meta.name)) {
    const repetida = abertas.find((item) => item.id !== meta.id && mesmoNome(item.name, nome));
    if (repetida) return { erro: `Já existe uma meta chamada ${repetida.name}. Escolha outro nome.` };
    mudancas.push({ campo: 'name', rotulo: 'Nome', antes: meta.name, depois: nome });
  }
  const valor = Number(pedido.valor) > 0 ? Number(pedido.valor) : null;
  if (valor && valor !== Number(meta.target_amount)) {
    mudancas.push({ campo: 'target_amount', rotulo: 'Valor', antes: formatCurrency(meta.target_amount), depois: formatCurrency(valor) });
  }
  if (pedido.data && pedido.data !== meta.target_date) {
    mudancas.push({ campo: 'target_date', rotulo: 'Prazo', antes: meta.target_date ? formatarData(meta.target_date) : 'sem prazo', depois: formatarData(pedido.data) });
  }
  const porMes = Number(pedido.porMes) > 0 ? Number(pedido.porMes) : null;
  if (porMes && porMes !== Number(meta.planned_monthly_amount)) {
    mudancas.push({
      campo: 'planned_monthly_amount',
      rotulo: 'Por mês',
      antes: meta.planned_monthly_amount ? formatCurrency(meta.planned_monthly_amount) : 'sem valor',
      depois: formatCurrency(porMes),
    });
  }
  if (mudancas.length === 0) {
    return { erro: `O que você quer mudar na meta ${meta.name}? Pode ser o nome, o valor, o prazo ou quanto guardar por mês.` };
  }
  const payload = Object.fromEntries(mudancas.map(({ campo }) => [campo, {
    name: nome, target_amount: valor, target_date: pedido.data, planned_monthly_amount: porMes,
  }[campo]]));
  const falado = mudancas.map(({ rotulo, antes, depois }) => `${rotulo.toLowerCase()} de ${antes} para ${depois}`);
  return {
    acao,
    meta,
    nome: nome || null,
    payload,
    texto: `Vou alterar a meta ${meta.name}: ${juntar(falado)}. Posso confirmar?`,
    card: card(acao, [
      { label: 'Meta', value: meta.name },
      ...mudancas.map(({ campo, rotulo, antes, depois }) => ({
        key: `goal-change-${campo}`, label: rotulo, value: `${antes} → ${depois}`, emphasis: true,
      })),
    ]),
  };
}

// Por que o aporte não entra no Financeiro, numa frase que dá para falar.
function motivoSemTransferencia(meta, transferencia) {
  if (!transferencia.vinculada) {
    return meta.linked_account_id ? 'a conta vinculada à meta foi arquivada' : 'a meta não tem conta vinculada';
  }
  return 'não há outra conta para a transferência';
}

function juntarComOu(partes) {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} ou ${partes.at(-1)}`;
}

function perguntaDaConta(meta, retirada, candidatas) {
  const pergunta = retirada
    ? `Para qual conta foi o dinheiro da meta ${meta.name}`
    : `De qual conta saiu o dinheiro para a meta ${meta.name}`;
  const opcoes = candidatas.length <= MAX_CONTAS_NA_PERGUNTA
    ? `: ${juntarComOu(candidatas.map((conta) => conta.name))}?`
    : '? Diga o nome da conta.';
  return `${pergunta}${opcoes} Se não quiser lançar no Financeiro, diga "só na meta".`;
}

// Aporte ou retirada. Confere a meta, o valor, a data e a conta da
// transferência antes do card; o banco confere tudo de novo ao gravar. O
// payload sai do mesmo montarMovimento da folha da tela.
function montarMovimentoDaConversa(pedido, { metas, abertas, contas, hoje, ajustes, clientOperationId }) {
  const { acao } = pedido;
  const retirada = acao === ACOES_DE_META.RETIRAR;
  const meta = abertas.find((item) => item.id === pedido.alvo?.id) ?? null;
  if (!meta) {
    // O uni-interpret só vê as metas em aberto: a concluída chega pelo nome.
    const dita = nomeDeMeta(pedido.nome);
    const concluida = dita && (Array.isArray(metas) ? metas : []).find((item) => (
      item && !item.archived_at && item.status === 'completed' && mesmoNome(item.name, dita)
    ));
    if (concluida) return { erro: `A meta ${concluida.name} está concluída e não recebe aporte nem retirada.` };
    return { erro: textoDeMetaNaoEncontrada(pedido, abertas) };
  }
  if (!retirada && meta.status !== 'active') {
    return { erro: `A meta ${meta.name} está pausada. Para registrar um aporte, retome a meta na tela Metas.` };
  }
  const valor = Number(pedido.valor) > 0 ? Math.round(Number(pedido.valor) * 100) / 100 : null;
  if (!valor) {
    return { erro: retirada ? `Quanto você quer tirar da meta ${meta.name}?` : `Quanto você guardou na meta ${meta.name}?` };
  }
  if (ajustes.includes('data_antiga')) {
    return { erro: 'Essa data tem mais de um ano. Para registrar um movimento tão antigo, use a tela Metas.' };
  }
  // O servidor confere a data no fuso de São Paulo; o aparelho pode estar
  // num dia antes.
  if (ajustes.includes('data_descartada') || (pedido.data && hoje && pedido.data > hoje)) {
    return { erro: 'Não entendi a data. Diga um dia até hoje, como "ontem" ou "dia 5".' };
  }
  const guardado = Number(meta.current_amount || 0);
  if (retirada && valor > guardado) {
    return { erro: `A retirada passa do valor guardado. A meta ${meta.name} tem ${formatCurrency(guardado)}.` };
  }
  const data = pedido.data || hoje;

  let conta = null;
  let semFinanceiro = null;
  let transferencia = null;
  if (pedido.soNaMeta) {
    semFinanceiro = 'sem lançar no Financeiro';
  } else if (contas === null && meta.linked_account_id) {
    // Sem a lista, a conta vinculada pareceria arquivada e o aporte iria sem
    // a transferência que a pessoa espera.
    return { erro: 'Não consegui ler as suas contas agora. Tente de novo em instantes ou use a tela Metas.' };
  } else {
    transferencia = transferenciaDaMeta(meta, Array.isArray(contas) ? contas : []);
    if (!transferencia.disponivel) {
      semFinanceiro = `sem lançar no Financeiro: ${motivoSemTransferencia(meta, transferencia)}`;
    } else if (pedido.conta) {
      // Conta citada que não serve de outra ponta (a própria conta
      // vinculada, ou uma arquivada): pergunta, em vez de trocar sem avisar.
      conta = transferencia.contas.find((item) => item.id === pedido.conta.id) ?? null;
    } else if (transferencia.contas.length === 1) {
      // Com uma conta só do outro lado, ela já vem escolhida, como na folha.
      [conta] = transferencia.contas;
    }
    if (transferencia.disponivel && !conta) return { erro: perguntaDaConta(meta, retirada, transferencia.contas) };
  }

  const vinculada = transferencia?.vinculada ?? null;
  const [origem, destino] = retirada ? [vinculada, conta] : [conta, vinculada];
  const depois = guardado + (retirada ? -valor : valor);
  const rows = [
    { label: 'Meta', value: meta.name },
    { label: retirada ? 'Retirada' : 'Aporte', value: formatCurrency(valor), emphasis: true },
    { label: 'Data', value: formatarData(data) },
    { label: 'Financeiro', value: conta ? `Transferência de ${origem.name} para ${destino.name}` : 'Não lança' },
    { label: 'Guardado depois', value: `${formatCurrency(depois)} de ${formatCurrency(meta.target_amount)}` },
  ];
  const quando = data && data !== hoje ? ` com data de ${formatarData(data)}` : '';
  const comoFica = conta
    ? ` e lançar a transferência de ${origem.name} para ${destino.name} no Financeiro`
    : `, ${semFinanceiro}`;
  const oQue = retirada
    ? `Vou tirar ${formatCurrency(valor)} da meta ${meta.name}`
    : `Vou registrar ${formatCurrency(valor)} na meta ${meta.name}`;
  return {
    acao,
    meta,
    nome: null,
    conta,
    origem: conta ? origem : null,
    destino: conta ? destino : null,
    payload: montarMovimentoDaFolha({
      movimento: retirada ? MOVIMENTOS.RETIRADA : MOVIMENTOS.APORTE,
      centavos: Math.round(valor * 100),
      data,
      observacao: '',
      registrarNoFinanceiro: Boolean(conta),
      contaId: conta?.id ?? null,
    }, clientOperationId),
    texto: `${oQue}${quando}${comoFica}. Posso registrar?`,
    card: card(acao, rows),
  };
}

function card(acao, rows) {
  return {
    title: TITULO_DO_CARD[acao],
    status: 'pending',
    actionKind: ACTION_KIND_META,
    editable: false,
    rows,
  };
}

function juntar(partes) {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
}

function listarNomes(metas) {
  return juntar(metas.slice(0, MAX_METAS_NA_RESPOSTA).map((meta) => meta.name));
}

// A pessoa falou de uma meta que não está em aberto. Com o nome que ela
// disse, a Uni diz qual não achou.
function textoDeMetaNaoEncontrada(pedido, abertas) {
  const dita = nomeDeMeta(pedido?.nome);
  const qual = dita ? `a meta ${dita}` : 'essa meta';
  if (abertas.length === 0) return `Não encontrei ${qual}: você não tem metas em aberto. Para criar uma, diga quanto quer juntar e para quê.`;
  return `Não encontrei ${qual}. As suas metas em aberto são: ${listarNomes(abertas)}.`;
}

// Como está uma meta, em uma frase que dá para falar: guardado, falta e, com
// prazo, quanto por mês. Mesma conta da tela (goalCalc).
export function textoDaMeta(meta) {
  const guardado = Number(meta.current_amount || 0);
  const alvo = Number(meta.target_amount || 0);
  const falta = calcRemaining(guardado, alvo);
  if (falta <= 0) return `Meta ${meta.name}: ${formatCurrency(guardado)} guardados de ${formatCurrency(alvo)}. Você já chegou lá.`;
  const partes = [`Meta ${meta.name}: ${formatCurrency(guardado)} guardados de ${formatCurrency(alvo)}. Faltam ${formatCurrency(falta)}`];
  if (meta.target_date) partes.push(` até ${formatarData(meta.target_date)}`);
  const porMes = calcRequiredMonthlyAmount(meta);
  if (porMes) partes.push(`, cerca de ${formatCurrency(porMes)} por mês`);
  return `${partes.join('')}.`;
}

// Resposta da consulta. Com alvo, só aquela meta; sem alvo, o resumo das
// metas em aberto. Nunca é card: a pessoa só quer saber.
export function textoDaConsultaDeMetas(pedido, { metas = [] } = {}) {
  const abertas = metasEmAberto(metas);
  const alvo = pedido?.alvo?.id ? abertas.find((meta) => meta.id === pedido.alvo.id) : null;
  if (alvo) return textoDaMeta(alvo);
  // Perguntou por uma meta que não existe (alvo descartado ou nome fora da
  // lista): dizer qual não achou, em vez de resumir as outras.
  if (pedido?.alvo?.id || pedido?.nome) return textoDeMetaNaoEncontrada(pedido, abertas);
  if (abertas.length === 0) {
    return 'Você ainda não tem metas. Para criar uma, diga quanto quer juntar e para quê. Por exemplo: "quero juntar 5 mil para a viagem até dezembro".';
  }
  if (abertas.length === 1) return textoDaMeta(abertas[0]);
  const guardado = abertas.reduce((soma, meta) => soma + Number(meta.current_amount || 0), 0);
  const total = abertas.reduce((soma, meta) => soma + Number(meta.target_amount || 0), 0);
  const linhas = abertas.slice(0, MAX_METAS_NA_RESPOSTA).map((meta) => (
    `${meta.name}, ${formatCurrency(meta.current_amount)} de ${formatCurrency(meta.target_amount)}`
  ));
  const resto = abertas.length > MAX_METAS_NA_RESPOSTA ? ` As outras ${abertas.length - MAX_METAS_NA_RESPOSTA} estão na tela Metas.` : '';
  return `Você tem ${abertas.length} metas em aberto, com ${formatCurrency(guardado)} guardados de ${formatCurrency(total)}: ${linhas.join('; ')}.${resto}`;
}

// Meta com dinheiro registrado (aporte ou valor guardado) não sai pela
// conversa: o histórico iria junto. A tela Metas mostra o que seria apagado.
export function metaTemDinheiro(meta, quantidadeDeAportes) {
  return quantidadeDeAportes > 0 || Number(meta?.current_amount || 0) > 0;
}

export function textoDaMetaComAportes(meta, quantidade) {
  const oQueTem = quantidade > 0
    ? (quantidade === 1 ? '1 aporte registrado' : `${quantidade} aportes registrados`)
    : `${formatCurrency(meta.current_amount)} guardados`;
  return `A meta ${meta.name} tem ${oQueTem}. Para excluir, abra a tela Metas: lá você vê o que seria apagado.`;
}

// O que a Uni diz depois de gravar. É este texto que a voz fala. No aporte e
// na retirada, metaAtualizada é a meta que o banco devolveu, com o valor
// guardado novo.
export function textoDoPedidoDeMetaFeito(pronto, { metaAtualizada = null } = {}) {
  if (pronto.acao === ACOES_DE_META.CRIAR) {
    return `Meta ${pronto.nome} criada. Quando guardar dinheiro para ela, me diga quanto, como "guardei 200 na ${pronto.nome}".`;
  }
  if (pronto.acao === ACOES_DE_META.APORTAR || pronto.acao === ACOES_DE_META.RETIRAR) {
    const valor = Math.abs(pronto.payload.amount);
    const guardado = metaAtualizada?.current_amount ?? Number(pronto.meta.current_amount || 0) + pronto.payload.amount;
    const alvo = metaAtualizada?.target_amount ?? pronto.meta.target_amount;
    const feito = pronto.acao === ACOES_DE_META.RETIRAR
      ? `Retirada de ${formatCurrency(valor)} registrada na meta ${pronto.meta.name}.`
      : `Aporte de ${formatCurrency(valor)} registrado na meta ${pronto.meta.name}.`;
    const transferencia = pronto.origem && pronto.destino
      ? ` A transferência de ${pronto.origem.name} para ${pronto.destino.name} entrou no Financeiro.`
      : '';
    return `${feito} Agora ela tem ${formatCurrency(guardado)} de ${formatCurrency(alvo)}.${transferencia}`;
  }
  if (pronto.acao === ACOES_DE_META.EDITAR) {
    return `Meta ${pronto.nome ?? pronto.meta.name} alterada.`;
  }
  return `Meta ${pronto.meta.name} excluída.`;
}

// "pode excluir", "pode criar", "muda sim" são as respostas naturais ao
// card. O classificador dos rascunhos só conhece "confirmar" e parecidos:
// aqui vale também o verbo da própria ação, sozinho ou com o nome da meta.
const VERBOS_DA_ACAO = Object.freeze({
  criar: String.raw`cri(?:ar|a|e)`,
  editar: String.raw`alter(?:ar|a|e)|muda(?:r)?|mude|edit(?:ar|a|e)|troca(?:r)?|troque`,
  excluir: String.raw`exclu(?:ir|i|a)|apag(?:ar|a|ue)|remov(?:er|e|a)|tir(?:ar|a|e)`,
  aportar: String.raw`registr(?:ar|a|e)|guard(?:ar|a|e)|aport(?:ar|a|e)|coloc(?:ar|a)|coloque`,
  retirar: String.raw`registr(?:ar|a|e)|tir(?:ar|a|e)|retir(?:ar|a|e)|sac(?:ar|a)|saque`,
});

// Erro do banco ao gravar o aporte ou a retirada, dito na conversa. A folha
// da tela fala do interruptor "Registrar também no Financeiro", que a
// conversa não tem.
export function textoDoErroDoMovimento(error, acao) {
  if (error?.message === 'meta_sem_conta_vinculada' || error?.message === 'conta_de_origem_invalida') {
    return 'A conta vinculada à meta mudou. Peça de novo para eu conferir as contas.';
  }
  return mensagemDoErro(error, acao === ACOES_DE_META.RETIRAR ? MOVIMENTOS.RETIRADA : MOVIMENTOS.APORTE);
}

export function respostaAoPedidoDeMeta(texto, pronto) {
  const nome = pronto?.meta?.name ?? pronto?.nome ?? null;
  const resposta = classifyPendingActionReply(texto, { subjectName: nome });
  if (resposta !== 'input' || !VERBOS_DA_ACAO[pronto?.acao]) return resposta;
  const frase = normalizeSearchText(texto).replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nomeNaFrase = nome ? `(?:\\s+(?:a\\s+)?(?:meta\\s+)?${escaparRegex(normalizeSearchText(nome))})?` : '';
  const confirmacao = new RegExp(
    String.raw`^(?:(?:sim|ok|isso|claro|beleza)\s+)?(?:pode\s+)?(?:${VERBOS_DA_ACAO[pronto.acao]})(?:\s+(?:sim|ela|essa))?` + nomeNaFrase + String.raw`(?:\s+(?:sim|por favor))?$`,
  );
  return confirmacao.test(frase) ? 'confirm' : 'input';
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
