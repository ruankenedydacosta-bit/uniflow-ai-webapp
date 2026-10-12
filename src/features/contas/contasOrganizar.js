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

// ----- Cartões de crédito (handoff 10j–10k) -----

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-10-05" vira "5 out". */
export function formatarDiaCurto(data) {
  const [, mes, dia] = String(data).split('-');
  return `${Number(dia)} ${MESES_CURTOS[Number(mes) - 1] ?? ''}`.trim();
}

function paraIso(ano, mes, dia) {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function hojeIso(hoje) {
  const data = hoje instanceof Date ? hoje : new Date(hoje ?? Date.now());
  return paraIso(data.getFullYear(), data.getMonth() + 1, data.getDate());
}

/** Dia `dia` do mês (1-12) de `ano`, limitado ao último dia desse mês (dia 31 em abril vira 30). */
function dataNoMes(ano, mes, dia) {
  const ultimo = new Date(ano, mes, 0).getDate();
  return paraIso(ano, mes, Math.min(Number(dia), ultimo));
}

function mesSeguinte(ano, mes) {
  return mes === 12 ? [ano + 1, 1] : [ano, mes + 1];
}

function mesAnterior(ano, mes) {
  return mes === 1 ? [ano - 1, 12] : [ano, mes - 1];
}

/**
 * Ciclo aberto de um cartão: começa no dia seguinte ao último fechamento e
 * termina no próximo fechamento (inclusive). O vencimento é o primeiro
 * `due_day` depois do fechamento. Sem `closing_day`, o ciclo é o mês civil
 * e o vencimento fica nulo. Datas em ISO (`YYYY-MM-DD`).
 */
export function cicloDoCartao(cartao, hoje = new Date()) {
  const ref = hojeIso(hoje);
  const ano = Number(ref.slice(0, 4));
  const mes = Number(ref.slice(5, 7));
  const closingDay = Number(cartao?.closing_day);
  const dueDay = Number(cartao?.due_day);

  if (!(closingDay >= 1 && closingDay <= 31)) {
    const ultimo = new Date(ano, mes, 0).getDate();
    return { inicio: paraIso(ano, mes, 1), fechamento: paraIso(ano, mes, ultimo), vencimento: null };
  }

  let fechamento = dataNoMes(ano, mes, closingDay);
  let [anoFecha, mesFecha] = [ano, mes];
  if (ref > fechamento) {
    [anoFecha, mesFecha] = mesSeguinte(ano, mes);
    fechamento = dataNoMes(anoFecha, mesFecha, closingDay);
  }

  const [anoAnterior, mesAnteriorNum] = mesAnterior(anoFecha, mesFecha);
  const fechamentoAnterior = new Date(`${dataNoMes(anoAnterior, mesAnteriorNum, closingDay)}T00:00:00`);
  fechamentoAnterior.setDate(fechamentoAnterior.getDate() + 1);
  const inicio = paraIso(
    fechamentoAnterior.getFullYear(),
    fechamentoAnterior.getMonth() + 1,
    fechamentoAnterior.getDate(),
  );

  let vencimento = null;
  if (dueDay >= 1 && dueDay <= 31) {
    vencimento = dueDay > closingDay
      ? dataNoMes(anoFecha, mesFecha, dueDay)
      : dataNoMes(...mesSeguinte(anoFecha, mesFecha), dueDay);
  }

  return { inicio, fechamento, vencimento };
}

/** Dias antes do vencimento em que o lembrete do cartão é enviado (#184, migration 067). */
export const ANTECEDENCIA_DO_LEMBRETE_DIAS = 2;

/**
 * Próximo vencimento a partir de `hoje`: o `due_day` deste mês se ainda não
 * passou, senão o do mês seguinte. Espelha proxima_data_de_vencimento no
 * banco. Sem `due_day` válido devolve null.
 */
export function proximoVencimento(cartao, hoje = new Date()) {
  const dueDay = Number(cartao?.due_day);
  if (!(dueDay >= 1 && dueDay <= 31)) return null;
  const ref = hojeIso(hoje);
  const ano = Number(ref.slice(0, 4));
  const mes = Number(ref.slice(5, 7));
  const nesteMes = dataNoMes(ano, mes, dueDay);
  if (nesteMes >= ref) return nesteMes;
  return dataNoMes(...mesSeguinte(ano, mes), dueDay);
}

/**
 * Data em que a pessoa recebe o lembrete do próximo vencimento: 2 dias
 * antes (`ANTECEDENCIA_DO_LEMBRETE_DIAS`). Cartão sem `due_day` não recebe
 * lembrete e devolve null.
 */
export function dataDoLembreteDoCartao(cartao, hoje = new Date()) {
  const vencimento = proximoVencimento(cartao, hoje);
  if (!vencimento) return null;
  const data = new Date(`${vencimento}T00:00:00`);
  data.setDate(data.getDate() - ANTECEDENCIA_DO_LEMBRETE_DIAS);
  return paraIso(data.getFullYear(), data.getMonth() + 1, data.getDate());
}

/**
 * Linha do detalhe do cartão sobre o lembrete. Com a data do aviso ainda por
 * vir, diz o dia. Entre o aviso e o vencimento, o aviso deste mês já saiu e
 * a linha fala só da regra. Sem `due_day`, diz como ativar.
 */
export function textoDoLembreteDoCartao(cartao, hoje = new Date()) {
  const lembrete = dataDoLembreteDoCartao(cartao, hoje);
  if (!lembrete) {
    return 'Cadastre o dia do vencimento em Editar cartão para receber um aviso antes da fatura vencer.';
  }
  const regra = `Você recebe uma notificação ${ANTECEDENCIA_DO_LEMBRETE_DIAS} dias antes de cada vencimento.`;
  if (lembrete < hojeIso(hoje)) return regra;
  return `${regra} O próximo aviso chega em ${formatarDiaCurto(lembrete)}.`;
}

/**
 * Fatura aberta: o que saiu do cartão dentro do ciclo aberto, descontado o
 * que entrou nele (pagamento feito antes do fechamento). Nunca negativa.
 */
export function faturaAberta(transactions, cartaoId, ciclo) {
  let total = 0;
  for (const t of lancamentosDaConta(transactions, cartaoId)) {
    const data = String(t.transaction_date).slice(0, 10);
    if (data < ciclo.inicio || data > ciclo.fechamento) continue;
    total -= sinalDoLancamento(t, cartaoId) * Math.abs(Number(t.amount || 0));
  }
  return Math.max(0, total);
}

/**
 * Limite usado: tudo o que o cartão deve (saldo derivado negativo) contra o
 * limite. `percentual` fica nulo sem limite cadastrado e passa de 100 quando
 * o cartão estoura.
 */
export function limiteUsado(saldo, creditLimit) {
  const usado = Math.max(0, -Number(saldo || 0));
  const limite = Number(creditLimit);
  if (!(limite > 0)) return { usado, limite: null, disponivel: null, percentual: null };
  return {
    usado,
    limite,
    disponivel: limite - usado,
    percentual: Math.round((usado / limite) * 100),
  };
}

/**
 * Linhas de cartão da lista (10j): fatura aberta pelo ciclo, limite usado e
 * as datas de fechamento e vencimento. `cartoes` vem de montarListaDeContas.
 */
export function montarListaDeCartoes({ cartoes, transactions, hoje = new Date() }) {
  return (Array.isArray(cartoes) ? cartoes : []).map((cartao) => {
    const ciclo = cicloDoCartao(cartao, hoje);
    return {
      ...cartao,
      ciclo,
      fatura: faturaAberta(transactions, cartao.id, ciclo),
      limite: limiteUsado(cartao.saldo, cartao.credit_limit),
    };
  });
}

/** Intervalo de datas que cobre o ciclo aberto de todos os cartões (para buscar os lançamentos). */
export function periodoDosCartoes(cartoes, hoje = new Date()) {
  const ciclos = (Array.isArray(cartoes) ? cartoes : []).map((cartao) => cicloDoCartao(cartao, hoje));
  if (ciclos.length === 0) return null;
  return {
    dateFrom: ciclos.map((c) => c.inicio).sort()[0],
    dateTo: ciclos.map((c) => c.fechamento).sort().at(-1),
  };
}

function diaValido(valor) {
  const dia = Number(valor);
  return Number.isInteger(dia) && dia >= 1 && dia <= 31;
}

/**
 * Valida a folha de cartão. Devolve a mensagem de erro ou null. Os limites
 * seguem os CHECKs de accounts (credit_limit >= 0, dias entre 1 e 31).
 */
export function validarCartao({ nome, limite, fechamento, vencimento }) {
  if (!String(nome ?? '').trim()) return 'Digite um nome para o cartão.';
  if (!(Number(limite) >= 0)) return 'Informe o limite do cartão.';
  if (!diaValido(fechamento)) return 'Informe o dia do fechamento, de 1 a 31.';
  if (!diaValido(vencimento)) return 'Informe o dia do vencimento, de 1 a 31.';
  if (Number(fechamento) === Number(vencimento)) return 'O vencimento precisa ser num dia diferente do fechamento.';
  return null;
}
