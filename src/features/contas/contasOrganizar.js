// Lista e detalhe de contas da tela Organizar (handoff 10g–10i). Lógica
// pura, sem React, para rodar em `node --test`.

// Os 7 valores válidos de accounts.account_type
// (supabase/migrations/20260711000200_002_financial_core.sql).
export const ACCOUNT_TYPE_LABELS = Object.freeze({
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro',
  credit_card: 'Cartão de crédito',
  investment: 'Investimento',
  digital_wallet: 'Carteira digital',
  other: 'Outra conta',
});

export const TIPO_CARTAO = 'credit_card';

/** Tipos que a folha curta de nova conta oferece. Cartão tem folha própria (#183). */
export const TIPOS_DE_CONTA = Object.freeze(
  Object.keys(ACCOUNT_TYPE_LABELS).filter((tipo) => tipo !== TIPO_CARTAO),
);

export function rotuloDoTipo(accountType) {
  return ACCOUNT_TYPE_LABELS[accountType] ?? ACCOUNT_TYPE_LABELS.other;
}

/** Conta que o banco mantém pelo Open Finance: a pessoa não edita nem ajusta o saldo. */
export function ehContaDoOpenFinance(conta) {
  return conta?.source_type === 'open_finance';
}

export function ehCartao(conta) {
  return conta?.account_type === TIPO_CARTAO;
}

/**
 * Permissões sobre uma conta: editar e ajustar saldo pedem canUpdate e conta
 * manual; excluir pede canDelete e conta manual. Papel ainda carregando nega tudo.
 */
export function permissoesDaConta(conta, { canUpdate = false, canDelete = false, isLoading = false } = {}) {
  if (!conta || isLoading || ehContaDoOpenFinance(conta)) {
    return { editar: false, ajustarSaldo: false, excluir: false };
  }
  return {
    editar: canUpdate === true,
    ajustarSaldo: canUpdate === true,
    excluir: canDelete === true,
  };
}

/** Saldo de uma conta: o derivado pela RPC quando existe, senão o inicial. */
export function saldoDaConta(conta, balances) {
  const derivado = (Array.isArray(balances) ? balances : [])
    .find((saldo) => saldo.account_id === conta.id)?.derived_balance;
  return Number(derivado ?? conta.initial_balance ?? 0);
}

/**
 * Contas ativas com saldo, em ordem alfabética, separadas de cartões de
 * crédito (que a #183 mostra com fatura e limite). `total` soma só as contas.
 */
export function montarListaDeContas({ accounts, balances }) {
  const linhas = (Array.isArray(accounts) ? accounts : [])
    .filter((conta) => conta.is_active !== false)
    .map((conta) => ({
      ...conta,
      saldo: saldoDaConta(conta, balances),
      tipoRotulo: rotuloDoTipo(conta.account_type),
      openFinance: ehContaDoOpenFinance(conta),
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  const contas = linhas.filter((linha) => !ehCartao(linha));
  const cartoes = linhas.filter((linha) => ehCartao(linha));
  return {
    contas,
    cartoes,
    total: contas.reduce((soma, linha) => soma + linha.saldo, 0),
  };
}

/**
 * Sinal de um lançamento visto pela conta: +1 quando o dinheiro entra
 * (entrada, transferência recebida, ajuste positivo) e -1 quando sai.
 */
export function sinalDoLancamento(transacao, accountId) {
  switch (transacao.transaction_type) {
    case 'income':
      return 1;
    case 'expense':
      return -1;
    case 'transfer':
      return transacao.destination_account_id === accountId ? 1 : -1;
    case 'adjustment':
      return Number(transacao.adjustment_delta || 0) < 0 ? -1 : 1;
    default:
      return 1;
  }
}

/** Lançamentos concluídos que tocam a conta (origem ou destino), do mais recente ao mais antigo. */
export function lancamentosDaConta(transactions, accountId) {
  return (Array.isArray(transactions) ? transactions : [])
    .filter((t) => t.status === 'completed'
      && (t.account_id === accountId || t.destination_account_id === accountId))
    .sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
}

/** Entradas, saídas e quantidade dos lançamentos da conta num mês já filtrado. */
export function resumoDaConta(transactions, accountId) {
  const lista = lancamentosDaConta(transactions, accountId);
  let entradas = 0;
  let saidas = 0;
  for (const t of lista) {
    const valor = Math.abs(Number(t.amount || 0));
    if (sinalDoLancamento(t, accountId) > 0) entradas += valor;
    else saidas += valor;
  }
  return { entradas, saidas, quantidade: lista.length };
}
