// Uni Engine — Runtime Conversacional Financeiro (Fase 17). Tipos.
//
// Tipos fechados para o runtime que conecta a conversa da Uni ao motor
// financeiro. Tudo em Shadow Mode: serializável, em memória, descartável.
export const FINANCIAL_RUNTIME_VERSION = '1.0';

// Intenções financeiras reconhecidas pelo runtime.
export const FINANCIAL_RUNTIME_INTENTS = Object.freeze([
  'balance_query',           // "Qual meu saldo?", "Saldo"
  'income_query',            // "Quanto entrou?", "Quanto recebi?"
  'expense_query',           // "Quanto gastei?", "Gastos"
  'savings_query',           // "Quanto economizei?", "Poupança"
  'net_worth_query',         // "Patrimônio?", "Quanto tenho?"
  'cashflow_query',          // "Fluxo de caixa", "Como está o mês?"
  'category_breakdown_query',// "Por categoria", "Em que gastei mais?"
  'account_query',           // "Saldo da conta X", "Conta Nubank"
  'period_comparison_query', // "Julho vs Junho", "Mês passado vs este mês"
  'projection_query',        // "Projeção", "Vou ficar no vermelho?"
  'goals_query',             // "Metas", "Como estão minhas metas?"
  'credit_query',            // "Cartão", "Limite", "Fatura"
  'investments_query',       // "Investimentos", "Aplicações"
  'recurring_query',         // "Recorrentes", "Fixos"
  'installments_query',      // "Parcelas", "Parcelamentos"
]);

// Tipos de entidade temporal suportados pelo runtime.
export const RUNTIME_TEMPORAL_ENTITIES = Object.freeze([
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'specific_month',          // "julho", "junho"
  'specific_year',           // "2025", "2024"
  'last_n_months',           // "últimos 3 meses"
  'last_n_days',             // "últimos 7 dias"
  'this_year',
  'last_year',
  'year_to_date',
  'quarter',
  'specific_date',           // "15/07/2025"
  'date_range',              // "01/07 a 31/07"
]);

// Tipos de consulta de dados.
export const RUNTIME_QUERY_TYPES = Object.freeze([
  'transactions',
  'accounts',
  'goals',
  'categories',
  'cashflow',
  'assets',
  'credit',
  'investments',
  'recurring',
  'installments',
]);

// Tipos de comparação.
export const RUNTIME_COMPARISON_TYPES = Object.freeze([
  'month_over_month',        // Esse mês vs mês passado
  'year_over_year',          // Esse ano vs ano passado
  'quarter_over_quarter',    // Trimestre
  'period_over_period',      // Período customizado
  'income_vs_expense',       // Receitas vs despesas
  'category_vs_category',    // Categoria vs categoria
  'account_vs_account',      // Conta vs conta
  'projected_vs_actual',     // Projetado vs realizado
]);

// Status do runtime.
export const RUNTIME_STATUS = Object.freeze([
  'initialized',
  'intent_resolved',
  'temporal_resolved',
  'query_planned',
  'executed',
  'compared',
  'narrated',
  'completed',
  'fallback',
  'error_safe',
]);

// Estágios do pipeline runtime.
export const RUNTIME_STAGES = Object.freeze([
  'intent_resolution',
  'temporal_resolution',
  'query_planning',
  'shadow_execution',
  'period_comparison',
  'narrative_generation',
  'telemetry',
  'discarded',
]);

// Chaves de segurança do runtime.
export const RUNTIME_SAFETY_KEYS = Object.freeze([
  'influenceApplied',
  'executed',
  'persisted',
  'networkAccessed',
  'apiCalled',
  'financialMutation',
  'responseModified',
  'memoryWrite',
  'databaseCalled',
  'rpcCalled',
  'externalServiceCalled',
  'userVisibleChange',
  'executionAllowed',
]);

export function isFinancialRuntimeIntent(value) {
  return FINANCIAL_RUNTIME_INTENTS.includes(value);
}

export function isRuntimeTemporalEntity(value) {
  return RUNTIME_TEMPORAL_ENTITIES.includes(value);
}

export function isRuntimeQueryType(value) {
  return RUNTIME_QUERY_TYPES.includes(value);
}

export function isRuntimeComparisonType(value) {
  return RUNTIME_COMPARISON_TYPES.includes(value);
}

export function isRuntimeStatus(value) {
  return RUNTIME_STATUS.includes(value);
}

export function isRuntimeStage(value) {
  return RUNTIME_STAGES.includes(value);
}