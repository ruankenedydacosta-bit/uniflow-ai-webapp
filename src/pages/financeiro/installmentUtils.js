// Lógica pura de parcelamento de lançamentos financeiros.
// Nenhuma dependência de React/Supabase — testável via node --test.
//
// Modelo de dados usado (colunas reais já existentes em public.transactions,
// ver supabase/migrations/20260711_002_financial_core.sql — nenhuma coluna nova):
// - installment_number / installment_total: já existiam.
// - metadata.installment_group_id: convenção nova, guardada dentro do jsonb
//   `metadata` já existente (nenhuma migration necessária), gerada uma única
//   vez (uuid) no cliente e replicada em todas as parcelas do mesmo grupo.

export const MAX_INSTALLMENTS = 360;
export const MIN_INSTALLMENTS = 1;

/**
 * Valida se `count` é um número inteiro de parcelas dentro do limite
 * permitido (1 a 360) — protege contra geração descontrolada.
 */
export function validateInstallmentCount(count) {
  const n = Number(count);
  return Number.isInteger(n) && n >= MIN_INSTALLMENTS && n <= MAX_INSTALLMENTS;
}

/**
 * Divide `totalAmount` (em reais, número ou string numérica) em `count`
 * parcelas, arredondando em centavos. A última parcela absorve a diferença
 * de arredondamento para que a soma bata exatamente com o total.
 * Retorna um array de números (reais) com 2 casas decimais efetivas.
 */
export function splitInstallmentAmounts(totalAmount, count) {
  const total = Number(totalAmount);

  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('Valor total invalido para parcelamento.');
  }
  if (!validateInstallmentCount(count)) {
    throw new Error('Numero de parcelas invalido (deve ser um inteiro entre 1 e 360).');
  }

  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / count);
  const distributed = baseCents * count;
  const remainderCents = totalCents - distributed;

  const amountsCents = Array.from({ length: count }, () => baseCents);
  amountsCents[count - 1] += remainderCents;

  return amountsCents.map((cents) => Math.round(cents) / 100);
}

/**
 * Soma `monthsToAdd` meses a uma data no formato 'YYYY-MM-DD', usando UTC
 * para evitar deslocamento por fuso horário. O dia fica limitado ao fim do
 * mês (31/01 + 1 mês -> 28/02), como o Postgres faz na RPC
 * registrar_compra_parcelada: sem isso, 31/01 + 1 mês virava 03/03 e a
 * compra ficava sem parcela em fevereiro e com duas em março.
 */
export function addMonthsToDate(dateStr, monthsToAdd) {
  const [year, month, day] = String(dateStr)
    .split('-')
    .map((part) => Number(part));

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error('Data invalida para calculo de parcelas.');
  }

  const lastDay = new Date(Date.UTC(year, month - 1 + monthsToAdd + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, month - 1 + monthsToAdd, Math.min(day, lastDay)));
  return date.toISOString().slice(0, 10);
}

/**
 * Gera as `count` datas de vencimento das parcelas, uma por mês, a partir
 * de `startDate` (parcela 1 = startDate, sem deslocamento).
 */
export function generateInstallmentDates(startDate, count) {
  if (!validateInstallmentCount(count)) {
    throw new Error('Numero de parcelas invalido (deve ser um inteiro entre 1 e 360).');
  }
  return Array.from({ length: count }, (_, index) => addMonthsToDate(startDate, index));
}

/**
 * Regra de status por parcela: 'completed' se a data da parcela já
 * ocorreu (hoje ou passado), 'pending' se for futura. Confirmado seguro
 * porque o saldo derivado (RPC de
 * supabase/migrations/20260716_009_fix_atomic_financial_action_and_balances.sql)
 * já filtra `transaction.status = 'completed'` — parcelas 'pending' não
 * distorcem o saldo atual.
 */
export function resolveInstallmentStatus(installmentDate, todayDate) {
  return String(installmentDate) <= String(todayDate) ? 'completed' : 'pending';
}

/**
 * Monta os N payloads de transação para uma compra parcelada, prontos para
 * `transactionService.createTransactions`, que grava todos num insert só.
 *
 * `baseTransaction` deve ser o payload já normalizado (o mesmo formato de
 * `buildTransactionMutationPayload`, sem `installment_number`/`installment_total`/
 * `status`/`metadata.installment_group_id`, que são preenchidos aqui).
 */
export function buildInstallmentPayloads(baseTransaction, count, { groupId, today } = {}) {
  if (!groupId) {
    throw new Error('groupId e obrigatorio para gerar parcelas.');
  }
  if (!today) {
    throw new Error('today (data de referencia) e obrigatorio para gerar parcelas.');
  }

  const amounts = splitInstallmentAmounts(baseTransaction.amount, count);
  const dates = generateInstallmentDates(baseTransaction.transaction_date, count);

  return dates.map((date, index) => ({
    ...baseTransaction,
    amount: amounts[index],
    transaction_date: date,
    installment_number: index + 1,
    installment_total: count,
    status: resolveInstallmentStatus(date, today),
    metadata: {
      ...(baseTransaction.metadata || {}),
      installment_group_id: groupId,
    },
  }));
}

/**
 * Resolve quais transações (ids) um escopo de edição/exclusão afeta.
 * - 'only': somente a transação alvo.
 * - 'forward': a transação alvo e as parcelas seguintes do mesmo grupo
 *   (installment_number >= installment_number da transação alvo).
 * - 'all': todas as transações do mesmo grupo (`metadata.installment_group_id`).
 *
 * Se a transação alvo não pertence a nenhum grupo (sem
 * `metadata.installment_group_id`), qualquer escopo se comporta como 'only'.
 */
export function resolveInstallmentScope(transactions, targetTransaction, scope = 'only') {
  if (!targetTransaction || !targetTransaction.id) {
    return [];
  }

  const groupId = targetTransaction?.metadata?.installment_group_id;

  if (!groupId) {
    return [targetTransaction.id];
  }

  const groupTransactions = (transactions || []).filter(
    (transaction) => transaction?.metadata?.installment_group_id === groupId,
  );

  if (scope === 'all') {
    return groupTransactions.map((transaction) => transaction.id);
  }

  if (scope === 'forward') {
    const targetNumber = Number(targetTransaction.installment_number) || 0;
    return groupTransactions
      .filter((transaction) => (Number(transaction.installment_number) || 0) >= targetNumber)
      .map((transaction) => transaction.id);
  }

  return [targetTransaction.id];
}
