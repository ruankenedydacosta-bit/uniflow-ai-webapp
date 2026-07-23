import { calcMonthlyAverages } from './futureCalculations.js';
import { buildFutureProjections } from './futureService.js';

// ─────────────────────────────────────────────────────────────────────────
// Fundação lógica das simulações "E se?" do módulo Future.
//
// Princípio: dados reais → overrides → adaptação isolada das entradas →
// buildFutureProjections() (motor oficial, inalterado) → simulatedProjections.
//
// Esta camada NUNCA altera o motor (futureCalculations.js/futureService.js),
// nunca persiste nada, nunca muta os dados reais recebidos. Ela adapta as
// ENTRADAS do motor (saldo e um array de transações com entradas sintéticas
// somadas) e chama o mesmo `buildFutureProjections` já usado pelo restante
// do produto — a simulação é, estruturalmente, um segundo caller do motor.

const OVERRIDE_KEYS = ['monthlyIncomeDelta', 'monthlyExpenseDelta', 'initialBalanceDelta'];

function toSafeDelta(value) {
  if (typeof value !== 'number') return 0;
  return Number.isFinite(value) ? value : 0;
}

/**
 * Normaliza o contrato de overrides da simulação. Sempre retorna um objeto
 * novo com exatamente as 3 chaves suportadas na V1, nunca muta a entrada.
 * Campos ausentes/null/undefined/NaN/Infinity/-Infinity/strings viram 0;
 * números negativos válidos são preservados; propriedades desconhecidas são
 * ignoradas.
 */
export function normalizeFutureSimulationOverrides(overrides) {
  const source = overrides && typeof overrides === 'object' ? overrides : {};
  const normalized = {};
  for (const key of OVERRIDE_KEYS) {
    normalized[key] = toSafeDelta(source[key]);
  }
  return normalized;
}

function isSimulationActive(normalizedOverrides) {
  return OVERRIDE_KEYS.some((key) => normalizedOverrides[key] !== 0);
}

function safeFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

// Mesmo padrão seguro de extração de mês civil (YYYY-MM) já usado em
// futureCalculations.js (F2): nunca constrói um `Date` a partir da string,
// evitando deslocamento de timezone. Reimplementado aqui deliberadamente —
// é apenas preparação de dados (identificar em quais meses já existe
// histórico real para ancorar as entradas sintéticas), não lógica de
// projeção; a fórmula de projeção em si permanece inteiramente no motor.
function extractMonthKey(dateValue) {
  if (typeof dateValue !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(dateValue);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

function collectMonthKeysWithData(transactions) {
  const keys = new Set();
  for (const t of transactions) {
    const key = extractMonthKey(t?.transaction_date);
    if (key) keys.add(key);
  }
  return keys;
}

// Cria uma transação sintética, exclusivamente em memória, para representar
// o delta mensal em UM mês que já possui histórico real. Nunca é persistida;
// existe somente no array entregue à segunda chamada de
// buildFutureProjections. Identificador e marcador deixam claro que não é
// uma transação real.
function buildSyntheticTransaction(type, amount, monthKey) {
  return Object.freeze({
    id: `future-simulation__${type}__${monthKey}`,
    transaction_type: type,
    amount,
    transaction_date: `${monthKey}-01`,
    __futureSimulation: true,
  });
}

/**
 * Prepara um array de transações (nunca muta o original) somando o delta
 * mensal de receita/despesa via entradas sintéticas — uma por mês que já
 * possui dados reais, distribuindo o ajuste da mesma forma que a média
 * mensal do motor já soma/divide por mês. Se não houver nenhum mês com
 * histórico real, retorna o array original inalterado: a simulação não
 * fabrica histórico onde não existe nenhum.
 */
function buildSimulatedTransactions(transactions, incomeDeltaPerMonth, expenseDeltaPerMonth) {
  const monthKeys = collectMonthKeysWithData(transactions);
  if (monthKeys.size === 0) return transactions;

  const synthetic = [];
  for (const monthKey of monthKeys) {
    if (incomeDeltaPerMonth !== 0) {
      synthetic.push(buildSyntheticTransaction('income', incomeDeltaPerMonth, monthKey));
    }
    if (expenseDeltaPerMonth !== 0) {
      synthetic.push(buildSyntheticTransaction('expense', expenseDeltaPerMonth, monthKey));
    }
  }

  if (!synthetic.length) return transactions;
  return [...transactions, ...synthetic];
}

/**
 * Função pura principal. Recebe os mesmos dados reais usados por
 * useFutureData()/buildFutureProjections() mais um objeto de overrides, e
 * devolve uma segunda projeção hipotética — sem alterar o motor, sem mutar
 * nenhuma entrada, sem persistir nada.
 */
export function buildFutureSimulation({
  workspaceBalance = 0,
  transactions = [],
  goals = [],
  overrides,
  scenarioIds,
  selectedHorizon = 6,
} = {}) {
  const safeWorkspaceBalance = safeFiniteNumber(workspaceBalance);
  const normalizedOverrides = normalizeFutureSimulationOverrides(overrides);
  const isActive = isSimulationActive(normalizedOverrides);

  const baseInputs = {
    workspaceBalance: safeWorkspaceBalance,
    transactions: transactions.slice(),
    goals: goals.slice(),
  };

  if (!isActive) {
    const simulatedProjections = buildFutureProjections({
      workspaceBalance: safeWorkspaceBalance,
      transactions,
      goals,
      scenarioIds,
      selectedHorizon,
    });

    return {
      isActive: false,
      overrides: normalizedOverrides,
      baseInputs,
      simulatedInputs: baseInputs,
      simulatedProjections,
    };
  }

  const { avgIncome, avgExpense, monthsWithData } = calcMonthlyAverages(transactions);
  const hasHistory = monthsWithData > 0;

  // O delta é limitado (clamped) ANTES de virar transação sintética, de
  // forma que a média resultante nunca fique negativa — sem precisar de
  // nenhum clamp dentro do motor (que não tem, e não deve ganhar, esse
  // conceito). Sem histórico real, não há média para ajustar: o delta não
  // produz efeito algum (a simulação não fabrica histórico do nada).
  const clampedIncomeDelta = hasHistory
    ? Math.max(normalizedOverrides.monthlyIncomeDelta, -avgIncome)
    : 0;
  const clampedExpenseDelta = hasHistory
    ? Math.max(normalizedOverrides.monthlyExpenseDelta, -avgExpense)
    : 0;

  const simulatedTransactions = hasHistory
    ? buildSimulatedTransactions(transactions, clampedIncomeDelta, clampedExpenseDelta)
    : transactions.slice();

  const simulatedWorkspaceBalance = safeFiniteNumber(
    safeWorkspaceBalance + normalizedOverrides.initialBalanceDelta,
  );

  const simulatedInputs = {
    workspaceBalance: simulatedWorkspaceBalance,
    transactions: simulatedTransactions.slice(),
    goals: goals.slice(),
  };

  const simulatedProjections = buildFutureProjections({
    workspaceBalance: simulatedWorkspaceBalance,
    transactions: simulatedTransactions,
    goals,
    scenarioIds,
    selectedHorizon,
  });

  return {
    isActive: true,
    overrides: normalizedOverrides,
    baseInputs,
    simulatedInputs,
    simulatedProjections,
  };
}
