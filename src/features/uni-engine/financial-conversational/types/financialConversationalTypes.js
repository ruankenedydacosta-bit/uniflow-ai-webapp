// Uni Engine — Inteligência Financeira Conversacional (Fase 16). Tipos.
//
// Catálogo fechado de constantes semânticas da camada conversacional
// sobre o motor financeiro. Tudo em Shadow Mode: serializável, em memória,
// descartável, sem efeitos visíveis. Esta camada CONSOME o motor da Fase 15
// e adiciona capacidade de responder perguntas financeiras em linguagem natural
// sem nunca executar, persistir ou alterar a resposta visível.

export const FINANCIAL_CONVERSATIONAL_VERSION = '1.0';

// Tipos de intenção financeira conversacional reconhecidos.
export const FINANCIAL_CONVERSATIONAL_INTENTS = Object.freeze([
  'balance_query',           // "Qual meu saldo?"
  'income_query',            // "Quanto ganhei este mês?"
  'expense_query',           // "Quanto gastei com alimentação?"
  'cash_flow_query',         // "Como está meu fluxo de caixa?"
  'goal_query',              // "Como está minha meta de reserva?"
  'projection_query',        // "Vou ficar no vermelho mês que vem?"
  'comparison_query',        // "Gastei mais que mês passado?"
  'category_breakdown_query',// "Em que mais gastei?"
  'account_query',           // "Saldo da conta Nubank"
  'transaction_search_query',// "Onde gastei 150 reais?"
  'financial_health_query',  // "Como estão minhas finanças?"
  'investment_query',        // "Quanto tenho em investimentos?"
  'credit_query',            // "Quanto devo no cartão?"
  'recurring_query',         // "Quais meus gastos fixos?"
  'installment_query',       // "Quantas parcelas faltam?"
  'budget_query',            // "Tenho orçamento para X?"
  'savings_rate_query',      // "Qual minha taxa de poupança?"
  'net_worth_query',         // "Qual meu patrimônio líquido?"
  'liquidity_query',         // "Tenho liquidez para emergência?"
  'debt_query',              // "Quanto devo no total?"
]);

// Tipos de entidade temporal resolvidas.
export const TEMPORAL_ENTITY_TYPES = Object.freeze([
  'current_month',
  'previous_month',
  'last_n_months',
  'year_to_date',
  'last_n_days',
  'specific_month',
  'specific_date_range',
  'since_date',
  'until_date',
  'relative_period',         // "últimos 3 meses", "este ano"
  'fiscal_quarter',
  'fiscal_year',
]);

// Tipos de granularidade temporal.
export const TEMPORAL_GRANULARITY = Object.freeze([
  'day',
  'week',
  'month',
  'quarter',
  'year',
]);

// Tipos de comparação temporal.
export const TEMPORAL_COMPARISON_TYPES = Object.freeze([
  'month_over_month',
  'year_over_year',
  'quarter_over_quarter',
  'period_over_period',
  'rolling_window',
  'trend_analysis',
]);

// Status do resolvedor temporal.
export const TEMPORAL_RESOLVER_STATUS = Object.freeze([
  'resolved',
  'ambiguous',
  'out_of_scope',
  'invalid_format',
  'fallback_applied',
]);

// Tipos de plano de consulta financeira.
export const FINANCIAL_QUERY_PLAN_TYPES = Object.freeze([
  'single_metric',           // Uma métrica direta (saldo, receita)
  'breakdown',               // Quebra por categoria/conta
  'comparison',              // Comparação entre períodos
  'projection',              // Projeção futura
  'search',                  // Busca de transação
  'health_check',            // Diagnóstico geral
  'goal_tracking',           // Acompanhamento de meta
  'multi_metric',            // Múltiplas métricas combinadas
]);

// Status do executor financeiro.
export const FINANCIAL_EXECUTOR_STATUS = Object.freeze([
  'executed',
  'partial_data',
  'no_data',
  'out_of_scope',
  'error_safe',
]);

// Tipos de narrativa financeira.
export const FINANCIAL_NARRATIVE_TYPES = Object.freeze([
  'direct_answer',           // Resposta direta à pergunta
  'contextual_insight',      // Insight contextual não perguntado
  'comparison_narrative',    // Narrativa de comparação
  'trend_narrative',         // Narrativa de tendência
  'alert_narrative',         // Alerta financeiro
  'goal_progress_narrative', // Progresso de meta
  'projection_narrative',    // Narrativa de projeção
  'health_summary',          // Resumo de saúde financeira
  'disclaimer',              // Aviso de limitação
]);

// Estilos de narrativa.
export const FINANCIAL_NARRATIVE_STYLES = Object.freeze([
  'concise',                 // Resposta direta, uma frase
  'structured',              // Tópicos organizados
  'detailed',                // Explicação completa
  'conversational',          // Tom natural, conversa
  'executive',               // Resumo executivo
]);

// Prioridades de insight narrativo.
export const NARRATIVE_INSIGHT_PRIORITIES = Object.freeze([
  'critical',                // Risco imediato (caixa negativo, etc)
  'high',                    // Atenção necessária (meta atrasada)
  'medium',                  // Informação relevante (tendência)
  'low',                     // Contexto adicional
  'info',                    // Curiosidade/dado extra
]);

// Status da integração shadow conversacional.
export const FINANCIAL_CONVERSATIONAL_STATUS = Object.freeze([
  'disabled',
  'skipped',
  'no_financial_context',
  'intent_not_recognized',
  'temporal_unresolved',
  'query_planned',
  'executed',
  'narrated',
  'completed',
  'fallback',
]);

// Estágios da pipeline conversacional (ordem fixa).
export const FINANCIAL_CONVERSATIONAL_STAGES = Object.freeze([
  'intent_detection',
  'temporal_resolution',
  'context_enrichment',
  'query_planning',
  'shadow_execution',
  'period_comparison',
  'narrative_generation',
  'telemetry',
  'discarded',
]);

// Chaves de segurança da camada conversacional.
export const FINANCIAL_CONVERSATIONAL_SAFETY_KEYS = Object.freeze([
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
]);

export function isFinancialConversationalIntent(value) {
  return FINANCIAL_CONVERSATIONAL_INTENTS.includes(value);
}

export function isTemporalEntityType(value) {
  return TEMPORAL_ENTITY_TYPES.includes(value);
}

export function isTemporalGranularity(value) {
  return TEMPORAL_GRANULARITY.includes(value);
}

export function isTemporalComparisonType(value) {
  return TEMPORAL_COMPARISON_TYPES.includes(value);
}

export function isTemporalResolverStatus(value) {
  return TEMPORAL_RESOLVER_STATUS.includes(value);
}

export function isFinancialQueryPlanType(value) {
  return FINANCIAL_QUERY_PLAN_TYPES.includes(value);
}

export function isFinancialExecutorStatus(value) {
  return FINANCIAL_EXECUTOR_STATUS.includes(value);
}

export function isFinancialNarrativeType(value) {
  return FINANCIAL_NARRATIVE_TYPES.includes(value);
}

export function isFinancialNarrativeStyle(value) {
  return FINANCIAL_NARRATIVE_STYLES.includes(value);
}

export function isNarrativeInsightPriority(value) {
  return NARRATIVE_INSIGHT_PRIORITIES.includes(value);
}

export function isFinancialConversationalStatus(value) {
  return FINANCIAL_CONVERSATIONAL_STATUS.includes(value);
}

export function isFinancialConversationalStage(value) {
  return FINANCIAL_CONVERSATIONAL_STAGES.includes(value);
}