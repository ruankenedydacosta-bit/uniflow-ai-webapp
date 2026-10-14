// Resposta da consulta a partir dos parâmetros do uni-interpret (#80).
//
// O modelo diz o que a pessoa perguntou (tipo, período, categoria, conta,
// termo); a soma sai das movimentações reais do período, nunca do modelo.
// Antes, a regex lia a pergunta: "quanto gastei com saúde em agosto" só
// conhecia o mês atual para categoria.

import { formatCurrency } from '../../utils/formatters.js';
import { roundMoney } from '../uni-chat/financialSnapshot.js';
import { normalizeSearchText } from '../../utils/searchText.js';
import { splitCategoriesByType } from '../categories/categoryUtils.js';

const TIPOS_RESPONDIVEIS = new Set([
  'saidas', 'entradas', 'resumo', 'lancamentos', 'categorias', 'maior_gasto', 'comparacao', 'a_pagar',
]);
// Quantas categorias o maior gasto cita depois da primeira.
const MAX_CATEGORIAS_SEGUINTES = 2;
// Sem período, "o que tenho pra pagar" olha os próximos 7 dias e as
// atrasadas de até 45 dias, que ainda estão por pagar.
const DIAS_A_PAGAR = 7;
const DIAS_DE_ATRASO = 45;
const TRANSACTION_TYPE_POR_TIPO = Object.freeze({
  saidas: 'expense', entradas: 'income', comparacao: 'expense', a_pagar: 'expense',
});

// Quantos lançamentos a resposta lista por extenso. A voz lê a resposta
// inteira; o resto fica na tela Financeiro.
export const MAX_LANCAMENTOS_LISTADOS = 5;

const ROTULO_DO_TIPO_DE_CATEGORIA = Object.freeze({ expense: 'de saída', income: 'de entrada', transfer: 'de transferência' });

const NOME_DO_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

function emUtc(iso) {
  return new Date(`${iso}T12:00:00Z`);
}

function deslocarDias(iso, dias) {
  const data = emUtc(iso);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

function ultimoDiaDoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

// Outra forma de consulta (meta, maior gasto, comparação...) segue para as
// regras de consulta.
export function consultaRespondivel(consulta) {
  return TIPOS_RESPONDIVEIS.has(consulta?.tipo);
}

// Sem período, vale o mês da data de referência; em a_pagar, os próximos
// 7 dias.
export function periodoDaConsulta(consulta, dataReferencia) {
  if (consulta?.inicio && consulta?.fim) return { inicio: consulta.inicio, fim: consulta.fim };
  if (consulta?.tipo === 'a_pagar') {
    return { inicio: deslocarDias(dataReferencia, -DIAS_DE_ATRASO), fim: deslocarDias(dataReferencia, DIAS_A_PAGAR) };
  }
  const [ano, mes] = dataReferencia.split('-').map(Number);
  const prefixo = dataReferencia.slice(0, 7);
  return { inicio: `${prefixo}-01`, fim: `${prefixo}-${String(ultimoDiaDoMes(ano, mes)).padStart(2, '0')}` };
}

// Período anterior para a comparação. Mês inteiro compara com o mês
// anterior; outro período, com o mesmo número de dias logo antes. Período
// ainda em andamento compara só o trecho que já passou: de 1 a 14 de outubro
// contra de 1 a 14 de setembro.
export function periodoAnterior({ inicio, fim }, dataReferencia = fim) {
  const fimEfetivo = fim > dataReferencia ? dataReferencia : fim;
  const decorridos = Math.round((emUtc(fimEfetivo) - emUtc(inicio)) / 86400000);
  const [anoInicio, mesInicio, diaInicio] = inicio.split('-').map(Number);
  const [anoFim, mesFim, diaFim] = fim.split('-').map(Number);
  if (anoInicio === anoFim && mesInicio === mesFim && diaInicio === 1 && diaFim === ultimoDiaDoMes(anoFim, mesFim)) {
    const fimDoMesAnterior = deslocarDias(inicio, -1);
    const inicioAnterior = `${fimDoMesAnterior.slice(0, 7)}-01`;
    if (fimEfetivo === fim) return { inicio: inicioAnterior, fim: fimDoMesAnterior };
    const fimAnterior = deslocarDias(inicioAnterior, decorridos);
    return { inicio: inicioAnterior, fim: fimAnterior < fimDoMesAnterior ? fimAnterior : fimDoMesAnterior };
  }
  const dias = Math.round((emUtc(fim) - emUtc(inicio)) / 86400000) + 1;
  const inicioAnterior = deslocarDias(inicio, -dias);
  return { inicio: inicioAnterior, fim: deslocarDias(inicioAnterior, decorridos) };
}

function diaEMes(iso, comAno) {
  const [ano, mes, dia] = iso.split('-');
  return comAno ? `${dia}/${mes}/${ano}` : `${dia}/${mes}`;
}

// Como o período entra na frase: "neste mês", "em agosto", "de 01/09 a 15/09".
export function rotuloDoPeriodo({ inicio, fim }, dataReferencia) {
  const anoReferencia = dataReferencia.slice(0, 4);
  const [anoInicio, mesInicio, diaInicio] = inicio.split('-').map(Number);
  const [anoFim, mesFim, diaFim] = fim.split('-').map(Number);

  if (inicio === fim) {
    if (inicio === dataReferencia) return 'hoje';
    if (inicio === deslocarDias(dataReferencia, -1)) return 'ontem';
    return `em ${diaEMes(inicio, String(anoInicio) !== anoReferencia)}`;
  }

  const mesInteiro = anoInicio === anoFim && mesInicio === mesFim
    && diaInicio === 1 && diaFim === ultimoDiaDoMes(anoFim, mesFim);
  if (mesInteiro) {
    const prefixo = inicio.slice(0, 7);
    if (prefixo === dataReferencia.slice(0, 7)) return 'neste mês';
    if (prefixo === deslocarDias(`${dataReferencia.slice(0, 7)}-01`, -1).slice(0, 7)) return 'no mês passado';
    const nome = NOME_DO_MES.format(emUtc(inicio));
    return String(anoInicio) === anoReferencia ? `em ${nome}` : `em ${nome} de ${anoInicio}`;
  }

  // Semana de segunda a domingo, como o prompt pede.
  const diaDaSemana = emUtc(dataReferencia).getUTCDay();
  const segunda = deslocarDias(dataReferencia, diaDaSemana === 0 ? -6 : 1 - diaDaSemana);
  if (fim === deslocarDias(inicio, 6)) {
    if (inicio === segunda) return 'nesta semana';
    if (inicio === deslocarDias(segunda, -7)) return 'na semana passada';
  }

  if (anoInicio === anoFim && inicio.endsWith('-01-01') && fim.endsWith('-12-31')) {
    return String(anoInicio) === anoReferencia ? 'neste ano' : `em ${anoInicio}`;
  }

  const comAno = String(anoInicio) !== anoReferencia || String(anoFim) !== anoReferencia;
  return `de ${diaEMes(inicio, comAno)} a ${diaEMes(fim, comAno)}`;
}

function comInicialMaiuscula(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function contagem(quantidade, singular, plural) {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

// "2 entradas, que somam R$ 300,00".
function parteDoResumo(transacoes, singular, plural) {
  const verbo = transacoes.length === 1 ? 'que soma' : 'que somam';
  return `${contagem(transacoes.length, singular, plural)}, ${verbo} ${formatCurrency(somar(transacoes))}`;
}

// Na lista (transactionType null) vale qualquer lançamento, e a conta casa
// também com o destino: a transferência que entrou na conta é dela também.
function filtrar(transacoes, { transactionType, categoria, conta, termo }) {
  const termoNormalizado = termo ? normalizeSearchText(termo) : '';
  const daConta = (transacao) => transacao.account_id === conta.id
    || (transactionType === null && transacao.destination_account_id === conta.id);
  return transacoes.filter((transacao) => (transactionType === null || transacao?.transaction_type === transactionType)
    && (!categoria || transacao.category_id === categoria.id)
    && (!conta || daConta(transacao))
    && (!termoNormalizado || normalizeSearchText(transacao.description).includes(termoNormalizado)));
}

function somar(transacoes) {
  return roundMoney(transacoes.reduce((total, transacao) => total + roundMoney(transacao.amount), 0));
}

// "Alimentação, Transporte e Saúde".
function enumerar(nomes) {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

// "Você tem 3 categorias: 2 de saída, Alimentação e Transporte; e 1 de
// entrada, Salário." O catálogo é o que o chat já carregou (só as ativas,
// como a tela Categorias); não vai ao banco.
function responderCategorias(categorias) {
  const porTipo = Object.entries(splitCategoriesByType(categorias))
    .map(([tipo, lista]) => ({
      rotulo: ROTULO_DO_TIPO_DE_CATEGORIA[tipo],
      nomes: lista.map((categoria) => categoria.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    }))
    .filter((grupo) => grupo.nomes.length > 0);
  if (porTipo.length === 0) return 'Você ainda não tem categorias. Crie uma pela conversa ou em Categorias, no menu Mais.';

  if (porTipo.length === 1) {
    const [grupo] = porTipo;
    return `Você tem ${contagem(grupo.nomes.length, 'categoria', 'categorias')} ${grupo.rotulo}: ${enumerar(grupo.nomes)}.`;
  }
  const total = porTipo.reduce((soma, grupo) => soma + grupo.nomes.length, 0);
  const partes = porTipo.map((grupo) => `${grupo.nomes.length} ${grupo.rotulo}, ${enumerar(grupo.nomes)}`);
  return `Você tem ${total} categorias: ${partes.join('; e ')}.`;
}

// "02/10, Uber, R$ 25,00, no Nubank". Transferência diz de onde para onde.
function linhaDoLancamento(transacao, contasPorId) {
  const origem = contasPorId.get(transacao.account_id);
  const destino = transacao.transaction_type === 'transfer' ? contasPorId.get(transacao.destination_account_id) : null;
  const onde = origem && destino ? `do ${origem.name} para o ${destino.name}`
    : destino ? `para o ${destino.name}`
      : origem ? `no ${origem.name}` : '';
  const descricao = String(transacao.description ?? '').trim() || 'sem descrição';
  const data = typeof transacao.transaction_date === 'string' ? diaEMes(transacao.transaction_date.slice(0, 10), false) : '';
  return [data, descricao, formatCurrency(roundMoney(transacao.amount)), onde].filter(Boolean).join(', ');
}

// Mais recente primeiro: data e, no mesmo dia, o que foi registrado por
// último (o banco devolve o dia em ordem de inserção).
function maisRecentePrimeiro(a, b) {
  return String(b.transaction_date).localeCompare(String(a.transaction_date))
    || String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
}

// Lista do mais recente ao mais antigo, com total quando todos são do mesmo
// tipo (somar entrada com saída não diz nada).
function responderLancamentos({ encontradas, quando, filtro, contas }) {
  const tipos = new Set(encontradas.map((transacao) => transacao.transaction_type));
  const [singular, plural] = tipos.size === 1 && tipos.has('expense') ? ['saída', 'saídas']
    : tipos.size === 1 && tipos.has('income') ? ['entrada', 'entradas']
      : ['lançamento', 'lançamentos'];
  if (encontradas.length === 0) return `${quando}, não encontrei lançamentos${filtro}.`;

  const contasPorId = new Map((Array.isArray(contas) ? contas : []).map((conta) => [conta.id, conta]));
  const ordenadas = [...encontradas].sort(maisRecentePrimeiro);
  const linhas = ordenadas.slice(0, MAX_LANCAMENTOS_LISTADOS).map((transacao) => linhaDoLancamento(transacao, contasPorId));
  const soma = tipos.size === 1 && !tipos.has('transfer') ? `, que ${encontradas.length === 1 ? 'soma' : 'somam'} ${formatCurrency(somar(encontradas))}` : '';

  if (encontradas.length === 1) return `${quando}, encontrei 1 ${singular}${filtro}: ${linhas[0]}.`;
  const restantes = encontradas.length - linhas.length;
  const abertura = restantes > 0 ? ' Os mais recentes: ' : ' ';
  const fecho = restantes > 0
    ? ` E mais ${contagem(restantes, 'lançamento', 'lançamentos')}, que você vê em Financeiro.`
    : '';
  return `${quando}, encontrei ${contagem(encontradas.length, singular, plural)}${filtro}${soma}.${abertura}${linhas.join('; ')}.${fecho}`;
}

// "Em agosto, onde você mais gastou foi Alimentação: R$ 1.200,00, 40% das
// saídas. Depois vêm Transporte, R$ 400,00, e Lazer, R$ 300,00."
function responderMaiorGasto({ saidas, quando, naConta, categorias }) {
  if (saidas.length === 0) return `${quando}, não encontrei saídas${naConta}.`;
  const nomes = new Map((Array.isArray(categorias) ? categorias : []).map((categoria) => [categoria.id, categoria.name]));
  const porCategoria = new Map();
  for (const transacao of saidas) {
    const nome = nomes.get(transacao.category_id) ?? 'Sem categoria';
    porCategoria.set(nome, roundMoney((porCategoria.get(nome) ?? 0) + roundMoney(transacao.amount)));
  }
  const ranking = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
  const total = somar(saidas);
  const [[primeira, valor], ...resto] = ranking;
  const parte = total > 0 ? Math.round((valor / total) * 100) : 0;
  const seguintes = resto.slice(0, MAX_CATEGORIAS_SEGUINTES).map(([nome, soma]) => `${nome}, ${formatCurrency(soma)}`);
  const depois = seguintes.length ? ` Depois ${seguintes.length === 1 ? 'vem' : 'vêm'} ${enumerar(seguintes)}.` : '';
  return `${quando}${naConta}, onde você mais gastou foi ${primeira}: ${formatCurrency(valor)}, ${parte}% das saídas.${depois}`;
}

// "Neste mês você gastou R$ 1.500,00; no mês passado, R$ 1.200,00. São
// R$ 300,00 a mais, 25%."
function responderComparacao({ atual, anterior, quando, quandoAnterior, filtro }) {
  const somaAtual = somar(atual);
  const somaAnterior = somar(anterior);
  const abertura = `${quando} você gastou ${formatCurrency(somaAtual)}${filtro}; ${quandoAnterior}, ${formatCurrency(somaAnterior)}.`;
  const diferenca = roundMoney(somaAtual - somaAnterior);
  if (diferenca === 0) return `${abertura} Ficou igual.`;
  const sentido = diferenca > 0 ? 'a mais' : 'a menos';
  const percentual = somaAnterior > 0 ? `, ${Math.round((Math.abs(diferenca) / somaAnterior) * 100)}%` : '';
  return `${abertura} São ${formatCurrency(Math.abs(diferenca))} ${sentido}${percentual}.`;
}

// Saídas previstas, da mais próxima à mais distante. A voz lê a resposta
// inteira; o resto fica em Registros. Sem período na pergunta, as
// atrasadas vêm à parte, depois das próximas.
function responderAPagar({ previstas, quando, filtro, contas, atrasadas = null }) {
  if (atrasadas) {
    const proximas = responderAPagar({ previstas, quando: 'Nos próximos 7 dias', filtro, contas });
    if (atrasadas.length === 0) return proximas;
    const ordenadas = [...atrasadas].sort((a, b) => String(a.transaction_date).localeCompare(String(b.transaction_date)));
    const contasPorId = new Map((Array.isArray(contas) ? contas : []).map((conta) => [conta.id, conta]));
    const linhas = ordenadas.slice(0, MAX_LANCAMENTOS_LISTADOS).map((transacao) => linhaDoLancamento(transacao, contasPorId));
    return `${proximas} Atrasadas: ${contagem(atrasadas.length, 'saída', 'saídas')}, que ${atrasadas.length === 1 ? 'soma' : 'somam'} ${formatCurrency(somar(atrasadas))}: ${linhas.join('; ')}.`;
  }
  if (previstas.length === 0) return `${quando}, você não tem saídas previstas${filtro}.`;
  const contasPorId = new Map((Array.isArray(contas) ? contas : []).map((conta) => [conta.id, conta]));
  const ordenadas = [...previstas].sort((a, b) => String(a.transaction_date).localeCompare(String(b.transaction_date)));
  const linhas = ordenadas.slice(0, MAX_LANCAMENTOS_LISTADOS).map((transacao) => linhaDoLancamento(transacao, contasPorId));
  const restantes = previstas.length - linhas.length;
  const fecho = restantes > 0 ? ` E mais ${contagem(restantes, 'saída prevista', 'saídas previstas')}, que você vê em Registros.` : '';
  const verbo = previstas.length === 1 ? 'que soma' : 'que somam';
  return `${quando}, você tem ${contagem(previstas.length, 'saída prevista', 'saídas previstas')}${filtro}, ${verbo} ${formatCurrency(somar(previstas))}: ${linhas.join('; ')}.${fecho}`;
}

// transacoes: as movimentações concluídas do período, já buscadas no banco.
// categorias e contas: o catálogo que o chat já tem, para listar categorias e
// dizer a conta de cada lançamento.
// Tipo que não é respondido aqui devolve null: o chamador segue com as regras.
// Em comparacao, transacoesAnteriores são as concluídas do período anterior;
// em a_pagar, transacoes são as previstas (pendentes) do período.
export function responderConsulta({
  consulta, transacoes, transacoesAnteriores = [], dataReferencia, categorias = [], contas = [],
}) {
  if (!consultaRespondivel(consulta)) return null;
  if (consulta.tipo === 'categorias') return responderCategorias(categorias);

  const periodo = periodoDaConsulta(consulta, dataReferencia);
  const quando = comInicialMaiuscula(rotuloDoPeriodo(periodo, dataReferencia));
  const lista = Array.isArray(transacoes) ? transacoes : [];
  const naConta = consulta.conta ? ` na conta ${consulta.conta.name}` : '';

  if (consulta.tipo === 'resumo') {
    const entradas = filtrar(lista, { transactionType: 'income', conta: consulta.conta });
    const saidas = filtrar(lista, { transactionType: 'expense', conta: consulta.conta });
    if (entradas.length === 0 && saidas.length === 0) {
      return `${quando}, você não registrou entradas nem saídas${naConta}.`;
    }
    const onde = `${quando}${naConta ? `,${naConta}` : ''}`;
    if (entradas.length === 0) return `${onde}, você teve ${parteDoResumo(saidas, 'saída', 'saídas')}, e nenhuma entrada.`;
    if (saidas.length === 0) return `${onde}, você teve ${parteDoResumo(entradas, 'entrada', 'entradas')}, e nenhuma saída.`;
    return `${onde}, você teve ${parteDoResumo(entradas, 'entrada', 'entradas')}, `
      + `e ${parteDoResumo(saidas, 'saída', 'saídas')}.`;
  }

  if (consulta.tipo === 'maior_gasto') {
    const saidas = filtrar(lista, { transactionType: 'expense', conta: consulta.conta });
    return responderMaiorGasto({ saidas, quando, naConta, categorias });
  }

  const encontradas = filtrar(lista, {
    transactionType: TRANSACTION_TYPE_POR_TIPO[consulta.tipo] ?? null,
    categoria: consulta.categoria,
    conta: consulta.conta,
    termo: consulta.termo,
  });
  // Categoria e termo juntos somam só parte da categoria, e a frase diz isso.
  const comTermo = consulta.termo ? ` com ${consulta.termo}` : '';
  const doQue = consulta.categoria
    ? `${comTermo}${comTermo ? ' em' : ' com'} ${consulta.categoria.name}`
    : comTermo;
  const filtro = `${doQue}${naConta}`;

  if (consulta.tipo === 'lancamentos') return responderLancamentos({ encontradas, quando, filtro, contas });
  if (consulta.tipo === 'a_pagar') {
    if (consulta.inicio) return responderAPagar({ previstas: encontradas, quando, filtro, contas });
    const atraso = (transacao) => String(transacao.transaction_date) < dataReferencia;
    return responderAPagar({
      previstas: encontradas.filter((transacao) => !atraso(transacao)),
      atrasadas: encontradas.filter(atraso),
      quando,
      filtro,
      contas,
    });
  }
  if (consulta.tipo === 'comparacao') {
    const anterior = filtrar(Array.isArray(transacoesAnteriores) ? transacoesAnteriores : [], {
      transactionType: 'expense', categoria: consulta.categoria, conta: consulta.conta, termo: consulta.termo,
    });
    return responderComparacao({
      atual: encontradas,
      anterior,
      quando,
      quandoAnterior: rotuloDoPeriodo(periodoAnterior(periodo, dataReferencia), dataReferencia),
      filtro,
    });
  }

  if (consulta.tipo === 'saidas') {
    if (encontradas.length === 0) return `${quando}, não encontrei saídas${filtro}.`;
    return `${quando}, você gastou ${formatCurrency(somar(encontradas))}${filtro}, em ${contagem(encontradas.length, 'saída', 'saídas')}.`;
  }
  if (encontradas.length === 0) return `${quando}, não encontrei entradas${filtro}.`;
  return `${quando}, você recebeu ${formatCurrency(somar(encontradas))}${filtro}, em ${contagem(encontradas.length, 'entrada', 'entradas')}.`;
}

// O que a memória da conversa guarda depois da resposta: a conta e a
// categoria para "nessa conta"/"essa categoria", e esta consulta como a
// última, para as regras não refinarem uma pergunta anterior.
export function memoriaDaConsulta(consulta, resposta) {
  return {
    account: consulta.conta?.name ?? null,
    category: consulta.categoria?.name ?? null,
    queryType: 'uni_interpret_consulta',
    queryParams: { kind: 'uni_interpret_consulta' },
    response: resposta,
  };
}
