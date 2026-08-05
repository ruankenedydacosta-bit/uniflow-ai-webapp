// Uni Engine — Fase 18: Matriz de Intenções Elegíveis.
// Allowlist explícita de intenções financeiras que podem gerar resposta visível.
import { FINANCIAL_RUNTIME_INTENTS } from '../types/index.js';

// Intenções de leitura permitidas para resposta visível na Fase 18.
// Apenas intenções de leitura já suportadas e testadas.
export const FINANCIAL_VISIBLE_INTENTS = Object.freeze([
  'balance_query',              // "Qual meu saldo?"
  'income_query',               // "Quanto entrou?", "Quanto recebi?"
  'expense_query',              // "Quanto gastei?", "Gastos"
  'savings_query',              // "Quanto economizei?", "Poupança"
  'net_worth_query',            // "Patrimônio?", "Quanto tenho?"
  'cashflow_query',             // "Fluxo de caixa", "Como está o mês?"
  'category_breakdown_query',   // "Por categoria", "Em que gastei mais?"
  'account_query',              // "Saldo da conta X", "Conta Nubank"
  'period_comparison_query',    // "Julho vs Junho", "Mês passado vs este mês"
  'projection_query',           // "Projeção", "Vou ficar no vermelho?" (determinístico)
  'goals_query',                // "Metas", "Como estão minhas metas?"
  'credit_query',               // "Cartão", "Limite", "Fatura"
  'investments_query',          // "Investimentos", "Aplicações" (quando houver dados)
  'recurring_query',            // "Recorrentes", "Fixos"
  'installments_query',         // "Parcelas", "Parcelamentos"
]);

// Intenções explicitamente bloqueadas para resposta visível.
export const FINANCIAL_BLOCKED_INTENTS = Object.freeze([
  // Intenções de escrita/mutação
  'register_income',
  'register_expense',
  'register_transfer',
  'set_balance',
  'create_goal',
  'update_goal',
  'delete_goal',
  'create_account',
  'update_account',
  'delete_account',
  'create_category',
  'update_category',
  'delete_category',
  'create_transaction',
  'update_transaction',
  'delete_transaction',
  'process_payment',
  'confirm_payment',
  'cancel_payment',
  // Intenções não determinísticas ou de aconselhamento
  'tax_advice',
  'investment_advice',
  'legal_advice',
  'financial_planning_advice',
  // Intenções ambíguas ou não suportadas
  'unknown',
  'unsupported',
]);

// Verifica se uma intenção está na allowlist para resposta visível.
export function isIntentVisibleAllowed(intentType) {
  return FINANCIAL_VISIBLE_INTENTS.includes(intentType);
}

// Verifica se uma intenção está explicitamente bloqueada.
export function isIntentBlockedForVisible(intentType) {
  return FINANCIAL_BLOCKED_INTENTS.includes(intentType);
}

// Verifica se a intenção é de escrita/mutação (nunca elegível para visível).
export function isWriteIntent(intentType) {
  const writeIntents = [
    'register_income',
    'register_expense',
    'register_transfer',
    'set_balance',
    'create_goal',
    'update_goal',
    'delete_goal',
    'create_account',
    'update_account',
    'delete_account',
    'create_category',
    'update_category',
    'delete_category',
    'create_transaction',
    'update_transaction',
    'delete_transaction',
    'process_payment',
    'confirm_payment',
    'cancel_payment',
  ];
  return writeIntents.includes(intentType);
}

// Obtém todas as intenções visíveis permitidas.
export function getVisibleIntents() {
  return [...FINANCIAL_VISIBLE_INTENTS];
}

// Obtém todas as intenções bloqueadas.
export function getBlockedIntents() {
  return [...FINANCIAL_BLOCKED_INTENTS];
}

// Verifica se todas as intenções visíveis estão presentes no runtime.
export function validateVisibleIntentsCoverage() {
  const missing = FINANCIAL_VISIBLE_INTENTS.filter(
    (intent) => !FINANCIAL_RUNTIME_INTENTS.includes(intent)
  );
  return {
    complete: missing.length === 0,
    missing,
  };
}
