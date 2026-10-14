// Confirmar um lançamento previsto pela conversa (#262): "já paguei o
// aluguel", "o salário caiu". O uni-interpret não conhece os previstos e lê a
// frase como lançamento realizado. Antes de abrir o rascunho de um lançamento
// novo, o chat procura um previsto parecido e oferece confirmá-lo, como o
// "Marcar como pago" da tela. Tudo aqui é puro; quem busca e grava é o chat.
import { analisarAlvo, bateComPalavras } from './edicaoDeLancamento.js';
import { normalizeSearchText } from '../../utils/searchText.js';

// Previsto atrasado até 45 dias e adiantado até 10 dias ainda é o mesmo
// compromisso: o aluguel do dia 10 pago no dia 5.
const DIAS_ANTES = 45;
const DIAS_DEPOIS = 10;

// Frase de quem ainda vai pagar não confirma nada: "vou pagar o aluguel".
const FALA_DE_FUTURO = /\b(?:vou|vai|vamos|irei|ira|preciso|precisa|tenho\s+que|tem\s+que|devo|vence|vencer)\b/;

const TIPO_DA_OPERACAO = Object.freeze({ saida: 'expense', entrada: 'income' });

function deslocar(iso, dias) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return data.toISOString().slice(0, 10);
}

function distancia(isoA, isoB) {
  return Math.abs(Date.parse(`${isoA}T00:00:00Z`) - Date.parse(`${isoB}T00:00:00Z`)) / 86400000;
}

// Período em que o chat busca os previstos no servidor.
export function janelaDosPrevistos(referenceDate) {
  return { dateFrom: deslocar(referenceDate, -DIAS_ANTES), dateTo: deslocar(referenceDate, DIAS_DEPOIS) };
}

// A operação lida pelo modelo pode ser a confirmação de um previsto: uma
// saída ou entrada única, já acontecida, com descrição.
export function podeSerConfirmacaoDePrevisto(operacao, texto, referenceDate) {
  if (!operacao || !TIPO_DA_OPERACAO[operacao.tipo]) return false;
  if (operacao.parcelas || operacao.recorrente) return false;
  if (operacao.data && operacao.data > referenceDate) return false;
  if (FALA_DE_FUTURO.test(normalizeSearchText(texto ?? ''))) return false;
  return Boolean(analisarAlvo(operacao.descricao ?? '').palavras?.length);
}

// { tipo: 'unico', transacao } | { tipo: 'varios', candidatos, total } |
// { tipo: 'nenhum' }. Os mais perto da data de referência vêm primeiro.
export function acharPrevisto(operacao, previstos, { referenceDate, categories = [], limite = 5 } = {}) {
  const tipo = TIPO_DA_OPERACAO[operacao?.tipo];
  const { palavras = [] } = analisarAlvo(operacao?.descricao ?? '');
  const { dateFrom, dateTo } = janelaDosPrevistos(referenceDate);
  const achados = (Array.isArray(previstos) ? previstos : [])
    .filter((transacao) => transacao?.status === 'pending' && transacao.transaction_type === tipo)
    .filter((transacao) => transacao.transaction_date >= dateFrom && transacao.transaction_date <= dateTo)
    .filter((transacao) => bateComPalavras(transacao, palavras, categories))
    .sort((a, b) => distancia(a.transaction_date, referenceDate) - distancia(b.transaction_date, referenceDate));
  if (!achados.length) return { tipo: 'nenhum' };
  if (achados.length === 1) return { tipo: 'unico', transacao: achados[0] };
  return { tipo: 'varios', candidatos: achados.slice(0, limite), total: achados.length };
}

// Mudança que o card de alteração mostra: situação, a data em que pagou
// (hoje, se a frase não diz) e o valor, se a frase diz um.
export function mudancasDaConfirmacao(operacao, referenceDate) {
  return {
    confirmar: true,
    date: operacao?.data && operacao.data <= referenceDate ? operacao.data : referenceDate,
    ...(Number(operacao?.valor) > 0 ? { amount: Number(operacao.valor) } : {}),
  };
}
