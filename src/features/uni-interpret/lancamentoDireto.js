// Lançar direto com Desfazer (#81). Quando a mesma descrição já foi
// confirmada 3 vezes seguidas na mesma categoria, sem troca, e o
// uni-interpret leu um lançamento simples com certeza, a Uni grava sem card e
// mostra o que lançou com o botão Desfazer. Qualquer dúvida volta ao card.
//
// A gravação é a mesma do card: a RPC idempotente
// execute_confirmed_financial_action, com o clientOperationId do rascunho.

import { formatCurrency } from '../../utils/formatters.js';

export const MIN_CONFIRMACOES_PARA_LANCAR_DIRETO = 3;
export const CONFIANCA_MINIMA_PARA_LANCAR_DIRETO = 0.9;
// Mais que os 20 s da exclusão: quem não pediu o card pode notar o
// lançamento só depois de ler a resposta.
export const DESFAZER_LANCAMENTO_DIRETO_MS = 60 * 1000;

const TIPO_POR_OPERACAO = Object.freeze({ saida: 'expense', entrada: 'income' });

// A operação que pode ir direto, ou null. Só a leitura do modelo: a memória e
// o rascunho montado pelo app são conferidos depois.
// Fica com o card: correção de rascunho, mais de uma operação, transferência,
// parcela, recorrência, data futura (previsto), categoria nova ou faltando,
// ajuste feito pela validação e confiança abaixo do mínimo.
export function operacaoParaLancarDireto(interpretacao) {
  if (interpretacao?.intent !== 'lancamento') return null;
  const operacoes = Array.isArray(interpretacao.operacoes) ? interpretacao.operacoes : [];
  if (operacoes.length !== 1) return null;
  const [operacao] = operacoes;
  const dataReferencia = interpretacao.dataReferencia;
  const valida = Boolean(
    TIPO_POR_OPERACAO[operacao?.tipo]
    && Number(operacao.valor) > 0
    && operacao.categoria?.id
    && !operacao.novaCategoria
    && !operacao.parcelas
    && operacao.recorrente !== true
    && Number(operacao.confianca) >= CONFIANCA_MINIMA_PARA_LANCAR_DIRETO
    && Array.isArray(operacao.faltando) && operacao.faltando.length === 0
    && Array.isArray(operacao.ajustes) && operacao.ajustes.length === 0
    && typeof dataReferencia === 'string'
    && typeof operacao.data === 'string'
    && operacao.data <= dataReferencia,
  );
  return valida ? operacao : null;
}

// O rascunho que o app montou com a operação está pronto para gravar sem
// pergunta: mesmo tipo, valor e categoria que o modelo leu, conta que já
// existe e nenhum aviso pendente.
export function rascunhoPodeIrDireto(action, operacao) {
  return Boolean(
    action?.status === 'ready'
    && action.payload
    && action.transactionType === TIPO_POR_OPERACAO[operacao?.tipo]
    && !action.planned
    && !action.installments
    && !action.categoryWasApproximate
    && action.category?.id === operacao.categoria?.id
    && action.payload.category_id === operacao.categoria?.id
    && Number(action.amount) === Number(operacao.valor)
    && action.account?.id
    && action.accountResolution?.status === 'resolved'
    && !action.accountResolution.provisioning
    && action.payload.account_id === action.account.id
    && (action.issues ?? []).length === 0,
  );
}

// Valor dito longe demais dos já confirmados ("três mil" no lugar de
// "trezentos") volta ao card.
export const FAIXA_DE_VALOR_PARA_LANCAR_DIRETO = Object.freeze({ minimo: 0.5, maximo: 2 });

// A memória da descrição autoriza: mesma categoria e tipo, confirmada vezes
// suficientes desde a última troca ou o último Desfazer, e valor entre a
// metade do menor e o dobro do maior valor confirmado.
export function memoriaPermiteLancarDireto(memoria, { categoriaId, tipo, valor }) {
  const valores = Array.isArray(memoria?.valores)
    ? memoria.valores.filter((item) => Number.isFinite(item) && item > 0)
    : [];
  const quantia = Number(valor);
  return Boolean(
    memoria
    && memoria.categoria_id === categoriaId
    && memoria.tipo === tipo
    && Number.isInteger(memoria.confirmacoes)
    && memoria.confirmacoes >= MIN_CONFIRMACOES_PARA_LANCAR_DIRETO
    && valores.length > 0
    && Number.isFinite(quantia)
    && quantia >= Math.min(...valores) * FAIXA_DE_VALOR_PARA_LANCAR_DIRETO.minimo
    && quantia <= Math.max(...valores) * FAIXA_DE_VALOR_PARA_LANCAR_DIRETO.maximo,
  );
}

// O que a Uni diz e a conversa por voz fala.
export function textoDoLancamentoDireto({ valor, categoria, descricao, conta }) {
  const segundos = Math.round(DESFAZER_LANCAMENTO_DIRETO_MS / 1000);
  const detalhes = [descricao, conta].filter(Boolean).join(', ');
  return `Lancei ${formatCurrency(valor)} em ${categoria}${detalhes ? ` (${detalhes})` : ''}. `
    + `Se não era isso, toque em Desfazer ou diga "desfazer" nos próximos ${segundos} segundos.`;
}

export function textoDoLancamentoDiretoDesfeito({ valor, categoria }) {
  return `Pronto, apaguei o lançamento de ${formatCurrency(valor)} em ${categoria}. Da próxima vez, vou mostrar o card antes de lançar.`;
}

export const TEXTO_LANCAMENTO_DIRETO_VENCIDO = 'O prazo para desfazer passou. Para apagar o lançamento, diga "apaga o último lançamento" ou exclua na tela Financeiro.';
