export const GOAL_POLICY = Object.freeze({
  maxMissingFieldsForReady: 2,
  maxRisksForFeasible: 1,
  minConfidenceForReady: 0.5,
  minConfidenceForActive: 0.7,
  maxAmbiguousMatchesForDetection: 1,
  horizonMonthsShort: 6,
  horizonMonthsMedium: 24,

  priorityWeights: Object.freeze({
    explicitUserStatement: 20,
    hasTargetAmount: 15,
    hasTargetDate: 10,
    hasHorizon: 8,
    hasFinancialSnapshot: 12,
    hasMemory: 5,
    hasDependencies: -3,
    hasConflicts: -10,
    hasHighRisks: -8,
    shortTermHorizon: 6,
    mediumTermHorizon: 3,
    personalWorkspace: 0,
  }),

  confidenceDefaults: Object.freeze({
    explicitGoal: 0.75,
    implicitGoal: 0.45,
    ambiguousGoal: 0.25,
    withTargetAmount: 0.08,
    withTargetDate: 0.06,
    withSnapshot: 0.10,
    withMemory: 0.05,
    missingAmount: -0.08,
    missingDate: -0.05,
    multipleGoals: -0.10,
    conflictingGoals: -0.12,
    businessWorkspace: -0.05,
    unknownType: -0.35,
  }),

  feasibilityWeights: Object.freeze({
    hasAmount: 0.15,
    hasDate: 0.10,
    hasSnapshot: 0.20,
    hasMemory: 0.10,
    hasDepsSatisfied: 0.15,
    noConflicts: 0.10,
    lowRisk: 0.20,
  }),

  keywordMap: Object.freeze({
    SAVINGS: ['poupar', 'guardar', 'reserva', 'economizar', 'juntar', 'acumular', 'fundo', 'pé de meia', 'poupança'],
    EMERGENCY_FUND: ['emergência', 'imprevisto', 'reserva de emergência', 'colchão', 'segurança financeira'],
    DEBT_REDUCTION: ['reduzir dívida', 'quitar dívida', 'pagar parcela', 'abaixar dívida', 'negociar dívida'],
    DEBT_PAYOFF: ['quitar totalmente', 'pagar tudo', 'zerar dívida', 'limpar nome', 'sair da dívida'],
    PURCHASE: ['comprar', 'adquirir', 'aquisição', 'compra'],
    INVESTMENT: ['investir', 'investimento', 'aplicação', 'renda fixa', 'variável', 'ações', 'tesouro', 'carteira', 'dividendos'],
    INCOME: ['fonte de renda', 'ganhar mais', 'aumentar renda', 'renda extra', 'freela', 'trabalho extra'],
    EXPENSE_REDUCTION: ['cortar', 'reduzir gasto', 'diminuir despesa', 'enxugar'],
    BUDGET: ['orçar', 'planejamento mensal', 'controle de gastos', 'planilha', 'categoria gasto'],
    CASH_FLOW: ['fluxo de caixa', 'entradas e saídas', 'saldo mensal', 'fluxo financeiro'],
    BUSINESS: ['empresa', 'negócio', 'abrir empresa', 'cnpj', 'fluxo empresarial', 'faturamento'],
    FINANCIAL_ORGANIZATION: ['organizar', 'organização financeira', 'planejamento financeiro', 'saúde financeira', 'bem-estar financeiro'],
  }),
});

export function clamp01(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function clampMinusOneOne(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}