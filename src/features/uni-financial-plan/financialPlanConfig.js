// BLOCO E: limiares e limites centralizados do plano financeiro (modo
// financial_plan da Edge Function uni-chat-llm). Liga junto com a camada de
// LLM (uni-llm/llmConfig.js), sem flag propria.

export const FINANCIAL_PLAN_VERSION = '1';

export const FINANCIAL_PLAN_DECISIONS = Object.freeze({
  SINGLE_OPERATION: 'single_operation',
  MULTIPLE_OPERATIONS: 'multiple_operations',
  CLARIFICATION_REQUIRED: 'clarification_required',
  UNSUPPORTED: 'unsupported',
});

export const FINANCIAL_OPERATION_TYPES = Object.freeze({
  EXPENSE: 'expense',
  INCOME: 'income',
  TRANSFER: 'transfer',
  INSTALLMENT_PURCHASE: 'installment_purchase',
  RECURRING_EXPENSE: 'recurring_expense',
  RECURRING_INCOME: 'recurring_income',
});

export const RECURRENCE_FREQUENCIES = Object.freeze(['daily', 'weekly', 'monthly', 'yearly']);

// Nomes conhecidos de campo ausente -- qualquer valor fora desta lista em
// `missing_fields` e descartado (nunca repassado cru ao restante do app).
export const KNOWN_MISSING_FIELD_NAMES = Object.freeze([
  'amount', 'description', 'date', 'source_account', 'destination_account',
  'category', 'installments', 'recurrence', 'operation_type',
]);

// Confianca >= HIGH: operacao pode ser apresentada como pronta (ainda
// sujeita a confirmacao final, nunca persiste sozinha). >= MID e < HIGH:
// pede confirmacao explicita. < MID: nunca assume.
export const FINANCIAL_PLAN_HIGH_CONFIDENCE = 0.90;
export const FINANCIAL_PLAN_MID_CONFIDENCE = 0.70;

export const MAX_OPERATIONS_PER_PLAN = 6;
export const MAX_PHRASE_CHARS = 240;
export const MAX_PENDING_SUMMARY_CHARS = 300;
export const MAX_ACCOUNTS_SENT = 12;
export const MAX_CATEGORIES_SENT = 12;
export const MAX_ACCOUNT_NAME_CHARS = 60;
export const MAX_CATEGORY_NAME_CHARS = 60;
export const MAX_OPERATION_DESCRIPTION_CHARS = 160;
export const MAX_ACCOUNT_REFERENCE_CHARS = 80;
export const MAX_REASON_CHARS = 140;
export const MAX_CLARIFICATION_CHARS = 140;

// Tolerancia de arredondamento (em reais) ao validar parcela x total em
// compras parceladas -- cobre diferenca de centavos por parcela.
export const INSTALLMENT_ROUNDING_TOLERANCE = 0.02;

// Resposta e um JSON maior que o de category_inference (varias
// operacoes) -- orcamento proporcionalmente maior, ainda fixo e nunca
// controlado pelo cliente.
export const FINANCIAL_PLAN_OUTPUT_TOKENS = 900;

// Timeout dedicado, um pouco maior que o da inferencia de categoria (8s)
// por o payload/resposta serem maiores, mas ainda bem abaixo do timeout
// geral do chat (20s) -- a compreensao de um plano acontece no meio do
// fluxo de voz e nao pode travar a experiencia por muito tempo.
export const FINANCIAL_PLAN_TIMEOUT_MS = 10000;

export const FINANCIAL_PLAN_LOCALE = 'pt-BR';
