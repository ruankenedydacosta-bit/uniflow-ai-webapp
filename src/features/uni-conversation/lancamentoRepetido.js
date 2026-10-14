// Lançamento repetido: antes de gravar um lançamento pela Uni, o chat procura
// um que já existe com o mesmo tipo, o mesmo valor e a mesma categoria (ou a
// mesma descrição) em datas próximas. Achou, a Uni avisa e pede a confirmação
// de novo. Não bloqueia: duas compras iguais no mesmo dia existem. Tudo aqui é
// puro; quem busca é o chat.
import { descreverLancamento } from './edicaoDeLancamento.js';
import { normalizeSearchText } from '../../utils/searchText.js';

// O mesmo gasto lançado de novo costuma vir no mesmo dia ou com a data de
// hoje no lugar da data certa. Três dias pegam os dois casos sem confundir a
// mensalidade de um mês com a do mês seguinte.
const DIAS_DE_DISTANCIA = 3;

const TIPOS_VERIFICADOS = new Set(['expense', 'income']);
const SITUACOES_QUE_CONTAM = new Set(['completed', 'pending']);

function deslocar(iso, dias) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

function distancia(isoA, isoB) {
  return Math.abs(Date.parse(`${isoA}T00:00:00Z`) - Date.parse(`${isoB}T00:00:00Z`)) / 86400000;
}

function centavos(valor) {
  return Math.round(Number(valor) * 100);
}

// Só o rascunho de uma saída ou entrada única, pronto para gravar, passa pela
// verificação. Sem clientOperationId não há como lembrar o aviso já dado.
export function deveProcurarRepetido(action) {
  return action?.status === 'ready'
    && Boolean(action.clientOperationId)
    && TIPOS_VERIFICADOS.has(action.payload?.transaction_type)
    && Number(action.payload?.amount) > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(action.payload?.transaction_date ?? '');
}

// Período em que o chat busca lançamentos no servidor.
export function janelaDoRepetido(data) {
  return { dateFrom: deslocar(data, -DIAS_DE_DISTANCIA), dateTo: deslocar(data, DIAS_DE_DISTANCIA) };
}

// O lançamento existente mais perto da data do rascunho, ou null.
export function acharLancamentoRepetido(action, transacoes) {
  if (!deveProcurarRepetido(action)) return null;
  const { transaction_type: tipo, amount, transaction_date: data, category_id: categoriaId } = action.payload;
  const descricao = normalizeSearchText(action.payload.description ?? '');
  const { dateFrom, dateTo } = janelaDoRepetido(data);
  const achados = (Array.isArray(transacoes) ? transacoes : [])
    .filter((transacao) => SITUACOES_QUE_CONTAM.has(transacao?.status) && transacao.transaction_type === tipo)
    .filter((transacao) => transacao.transaction_date >= dateFrom && transacao.transaction_date <= dateTo)
    .filter((transacao) => centavos(transacao.amount) === centavos(amount))
    .filter((transacao) => (categoriaId && transacao.category_id === categoriaId)
      || (descricao && normalizeSearchText(transacao.description ?? '') === descricao))
    .sort((a, b) => distancia(a.transaction_date, data) - distancia(b.transaction_date, data));
  return achados[0] ?? null;
}

// "Mensalidade escolar, R$ 300,00, Nubank, 13/10/2026"
export function linhaDoRepetido(transacao, { accounts = [] } = {}) {
  return { key: 'repeated', label: 'Já lançado', value: descreverLancamento(transacao, { accounts }) };
}

export function textoDoRepetido(transacao, { accounts = [] } = {}) {
  return `Parece que esse lançamento já existe: ${descreverLancamento(transacao, { accounts })}. `
    + 'Confirme para lançar de novo ou cancele.';
}
