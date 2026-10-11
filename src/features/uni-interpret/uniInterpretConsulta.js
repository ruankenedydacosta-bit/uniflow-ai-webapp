// Resposta da consulta a partir dos parâmetros do uni-interpret (#80).
//
// O modelo diz o que a pessoa perguntou (tipo, período, categoria, conta,
// termo); a soma sai das movimentações reais do período, nunca do modelo.
// Antes, a regex lia a pergunta: "quanto gastei com saúde em agosto" só
// conhecia o mês atual para categoria.

import { formatCurrency } from '../../utils/formatters.js';
import { roundMoney } from '../uni-chat/financialSnapshot.js';
import { normalizeSearchText } from '../../utils/searchText.js';

const TIPOS_RESPONDIVEIS = new Set(['saidas', 'entradas', 'resumo']);
const TRANSACTION_TYPE_POR_TIPO = Object.freeze({ saidas: 'expense', entradas: 'income' });

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

// Sem período, vale o mês da data de referência.
export function periodoDaConsulta(consulta, dataReferencia) {
  if (consulta?.inicio && consulta?.fim) return { inicio: consulta.inicio, fim: consulta.fim };
  const [ano, mes] = dataReferencia.split('-').map(Number);
  const prefixo = dataReferencia.slice(0, 7);
  return { inicio: `${prefixo}-01`, fim: `${prefixo}-${String(ultimoDiaDoMes(ano, mes)).padStart(2, '0')}` };
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

function filtrar(transacoes, { transactionType, categoria, conta, termo }) {
  const termoNormalizado = termo ? normalizeSearchText(termo) : '';
  return transacoes.filter((transacao) => transacao?.transaction_type === transactionType
    && (!categoria || transacao.category_id === categoria.id)
    && (!conta || transacao.account_id === conta.id)
    && (!termoNormalizado || normalizeSearchText(transacao.description).includes(termoNormalizado)));
}

function somar(transacoes) {
  return roundMoney(transacoes.reduce((total, transacao) => total + roundMoney(transacao.amount), 0));
}

// transacoes: as movimentações concluídas do período, já buscadas no banco.
export function responderConsulta({ consulta, transacoes, dataReferencia }) {
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

  const encontradas = filtrar(lista, {
    transactionType: TRANSACTION_TYPE_POR_TIPO[consulta.tipo],
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
