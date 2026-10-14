// Lançamento repetido: antes de gravar um lançamento pela Uni, o chat procura
// um que já existe no mesmo dia, com o mesmo tipo, o mesmo valor e a mesma
// categoria (ou a mesma descrição). Achou, a Uni avisa e pede a confirmação
// de novo. Não bloqueia: duas compras iguais no mesmo dia existem. Tudo aqui é
// puro; quem busca é o chat.
import { descreverLancamento } from './edicaoDeLancamento.js';
import { normalizeSearchText } from '../../utils/searchText.js';

const TIPOS_VERIFICADOS = new Set(['expense', 'income']);
const SITUACOES_QUE_CONTAM = new Set(['completed', 'pending']);

function centavos(valor) {
  return Math.round(Number(valor) * 100);
}

// Só o rascunho de uma saída ou entrada única, pronto para gravar, passa pela
// verificação. Parcela e recorrência gravam vários lançamentos e o valor do
// rascunho é o total. Sem clientOperationId não há como lembrar o aviso dado.
export function deveProcurarRepetido(action) {
  return action?.status === 'ready'
    && Boolean(action.clientOperationId)
    && !action.installments?.count
    && !action.recurrence?.frequency
    && TIPOS_VERIFICADOS.has(action.payload?.transaction_type)
    && Number(action.payload?.amount) > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(action.payload?.transaction_date ?? '');
}

// Os campos que decidem a busca. Rascunho corrigido (outro valor, outra data)
// tem outra assinatura e é verificado de novo.
export function assinaturaDoRascunho(action) {
  const { transaction_type: tipo, amount, transaction_date: data, category_id: categoriaId, account_id: contaId } = action.payload;
  return [action.clientOperationId, tipo, centavos(amount), data, categoriaId ?? '', contaId ?? '',
    normalizeSearchText(action.payload.description ?? '')].join('|');
}

// O lançamento existente igual ao rascunho, ou null. Só o mesmo dia: o café
// de todo dia e a mensalidade de cada mês não são repetição, e o lançar direto
// (#81) existe para o gasto de hábito. Conta diferente dos dois lados também
// não: R$ 50 no mercado no cartão e outros R$ 50 no Pix.
export function acharLancamentoRepetido(action, transacoes) {
  if (!deveProcurarRepetido(action)) return null;
  const { transaction_type: tipo, amount, transaction_date: data, category_id: categoriaId, account_id: contaId } = action.payload;
  const descricao = normalizeSearchText(action.payload.description ?? '');
  return (Array.isArray(transacoes) ? transacoes : []).find((transacao) => (
    SITUACOES_QUE_CONTAM.has(transacao?.status)
    && transacao.transaction_type === tipo
    && transacao.transaction_date === data
    && centavos(transacao.amount) === centavos(amount)
    && !(contaId && transacao.account_id && transacao.account_id !== contaId)
    && ((categoriaId && transacao.category_id === categoriaId)
      || (descricao && normalizeSearchText(transacao.description ?? '') === descricao))
  )) ?? null;
}

// "Mensalidade escolar, R$ 300,00, Nubank, 13/10/2026", e ", previsto" no fim
// quando ainda não foi pago: "já existe" sem isso faria a pessoa achar que o
// pagamento está registrado.
function descreverExistente(transacao, accounts) {
  const descricao = descreverLancamento(transacao, { accounts });
  return transacao.status === 'pending' ? `${descricao}, previsto` : descricao;
}

export function linhaDoRepetido(transacao, { accounts = [] } = {}) {
  return { key: 'repeated', label: 'Já existe', value: descreverExistente(transacao, accounts) };
}

export function textoDoRepetido(transacao, { accounts = [] } = {}) {
  return `Parece que esse lançamento já existe: ${descreverExistente(transacao, accounts)}. `
    + 'Confirme para lançar de novo ou cancele.';
}
