// Criar, editar, excluir ou consultar uma meta pela conversa ou pela voz
// (#192). O uni-interpret diz o que a pessoa pediu; aqui, sem efeito
// colateral, o pedido é conferido (meta encontrada, nome repetido, o que
// muda) e vira o card que a pessoa confirma, ou o texto da consulta. Quem
// grava é o chat, depois do Confirmar, pelo mesmo hook da tela Metas.
//
// Aporte e retirada ficam para depois da #158: as regras de aporte (criar
// transferência, conta vinculada, retirada bloqueada) ainda não existem.
import { normalizeSearchText } from '../../utils/searchText.js';
import { formatCurrency } from '../../utils/formatters.js';
import { calcRemaining, calcRequiredMonthlyAmount } from '../goals/goalCalc.js';
import { classifyPendingActionReply } from './pendingActionInput.js';
import { formatarData } from './edicaoDeLancamento.js';

// actionKind do card.
export const ACTION_KIND_META = 'manage_goal';

export const ACOES_DE_META = Object.freeze({
  CRIAR: 'criar',
  EDITAR: 'editar',
  EXCLUIR: 'excluir',
  CONSULTAR: 'consultar',
});

const TITULO_DO_CARD = Object.freeze({
  criar: 'Criar meta',
  editar: 'Alterar meta',
  excluir: 'Excluir meta',
});

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
// ajustes } do uni-interpret. metas: as metas do espaço. Devolve { erro } com
// o texto para a pessoa, ou o pedido pronto para o card. Consultar não passa
// por aqui: veja textoDaConsultaDeMetas.
export function montarPedidoDeMeta(pedido, { metas = [], hoje = null } = {}) {
  const acao = pedido?.acao;
  const abertas = metasEmAberto(metas);
  const ajustes = Array.isArray(pedido?.ajustes) ? pedido.ajustes : [];

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
  if (!meta) {
    if (abertas.length === 0) return { erro: 'Você ainda não tem metas em aberto. Para criar uma, diga quanto quer juntar e para quê.' };
    return { erro: `Não encontrei essa meta. As suas metas em aberto são: ${listarNomes(abertas)}.` };
  }

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
  if (nome && nome !== meta.name) {
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
  if (pedido?.alvo?.id) {
    return abertas.length === 0
      ? 'Você não tem metas em aberto no momento.'
      : `Não encontrei essa meta. As suas metas em aberto são: ${listarNomes(abertas)}.`;
  }
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

// Meta com aporte registrado não sai pela conversa: o histórico de aportes
// iria junto. A tela Metas mostra o que seria apagado.
export function textoDaMetaComAportes(meta, quantidade) {
  const aportes = quantidade === 1 ? '1 aporte registrado' : `${quantidade} aportes registrados`;
  return `A meta ${meta.name} tem ${aportes}. Para excluir, abra a tela Metas: lá você vê o que seria apagado.`;
}

// O que a Uni diz depois de gravar. É este texto que a voz fala.
export function textoDoPedidoDeMetaFeito(pronto) {
  if (pronto.acao === ACOES_DE_META.CRIAR) {
    return `Meta ${pronto.nome} criada. Quando guardar dinheiro para ela, registre o aporte na tela Metas.`;
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
});

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
