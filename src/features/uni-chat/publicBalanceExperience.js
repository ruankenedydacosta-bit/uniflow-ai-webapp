import { normalizeFinancialText } from './financialSnapshot.js';

export const PUBLIC_BALANCE_RETIREMENT_TEXT =
  'A UniFlow agora organiza suas movimentações por Entradas e Saídas. Posso mostrar quanto entrou ou quanto saiu.';

const PUBLIC_BALANCE_QUERY_PATTERNS = Object.freeze([
  /\bsaldo\b/u,
  /\bquanto\s+(?:dinheiro\s+)?(?:eu\s+)?tenho\b/u,
  /\bquanto\s+tenho\s+(?:no|na|em)\b/u,
]);

const RETIRED_PUBLIC_BALANCE_INTENTS = new Set([
  'check_balance',
  'set_balance',
  'ambiguous_balance_or_income',
]);

const PRESERVED_FUNCTIONAL_INTENTS = new Set([
  'register_income',
  'register_expense',
  'register_transfer',
  'create_goal',
]);

/**
 * Porta pública de compatibilidade: mantém intents/serviços internos, mas
 * impede que consultas ou ajustes de Saldo cheguem aos executores públicos.
 */
export function isRetiredPublicBalanceRequest(text, intent) {
  if (typeof intent === 'string' && intent.startsWith('agenda_')) return false;
  if (PRESERVED_FUNCTIONAL_INTENTS.has(intent)) return false;
  if (RETIRED_PUBLIC_BALANCE_INTENTS.has(intent)) return true;
  const normalized = normalizeFinancialText(text);
  return PUBLIC_BALANCE_QUERY_PATTERNS.some((pattern) => pattern.test(normalized));
}
