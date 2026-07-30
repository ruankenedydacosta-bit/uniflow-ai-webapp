import {
  FINANCIAL_PLAN_LOCALE,
  MAX_ACCOUNTS_SENT,
  MAX_ACCOUNT_NAME_CHARS,
  MAX_CATEGORIES_SENT,
  MAX_CATEGORY_NAME_CHARS,
  MAX_PENDING_SUMMARY_CHARS,
  MAX_PHRASE_CHARS,
} from './financialPlanConfig.js';

// BLOCO E: payload MINIMO e sanitizado enviado a camada neural (modo
// financial_plan). So o estritamente necessario sai daqui -- por
// construcao (allowlist de campos), nunca saldo, CPF, e-mail, telefone,
// endereco, JWT, chaves, historico financeiro completo, contas/categorias
// Business ou dados de outros usuarios.

function clampText(value, max) {
  if (typeof value !== 'string') return '';
  const withoutControlCharacters = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('');
  return withoutControlCharacters.replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeNamedList(list, maxItems, maxNameChars) {
  return (Array.isArray(list) ? list : [])
    .filter((item) => item
      && typeof item.id === 'string'
      && typeof item.name === 'string'
      && item.name.trim()
      && item.applies_to !== 'business')
    .slice(0, maxItems)
    .map((item) => ({ id: item.id, name: clampText(item.name, maxNameChars) }));
}

/**
 * `pendingPlanSummary` deve ser um resumo JA construido pelo chamador (ex.:
 * "Despesa de R$ 80 no mercado, conta ainda nao informada.") -- esta funcao
 * apenas sanitiza/trunca, nunca serializa o plano inteiro ou dados
 * sensiveis.
 */
export function buildFinancialPlanPayload({
  phrase,
  pendingPlanSummary,
  accounts = [],
  categories = [],
  referenceDate,
  timezone,
} = {}) {
  return Object.freeze({
    phrase: clampText(phrase, MAX_PHRASE_CHARS),
    pendingPlanSummary: clampText(pendingPlanSummary, MAX_PENDING_SUMMARY_CHARS),
    accounts: Object.freeze(sanitizeNamedList(accounts, MAX_ACCOUNTS_SENT, MAX_ACCOUNT_NAME_CHARS)),
    categories: Object.freeze(sanitizeNamedList(categories, MAX_CATEGORIES_SENT, MAX_CATEGORY_NAME_CHARS)),
    locale: FINANCIAL_PLAN_LOCALE,
    timezone: clampText(timezone, 60) || 'America/Sao_Paulo',
    referenceDate: typeof referenceDate === 'string' ? referenceDate : null,
  });
}
