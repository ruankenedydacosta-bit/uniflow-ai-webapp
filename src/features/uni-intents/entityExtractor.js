import { normalizeFinancialText } from './intentClassifier.js';

const MONEY_PATTERN = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(milhares?|milhar|mil|k|reais?|contos?)?/iu;

function parseNumericToken(token) {
  if (token.includes(',') && token.includes('.')) {
    return Number(token.replace(/\./g, '').replace(',', '.'));
  }
  if (token.includes(',')) {
    return Number(token.replace(',', '.'));
  }
  if (/\.\d{3}$/.test(token)) {
    return Number(token.replace(/\./g, ''));
  }
  return Number(token);
}

export function extractAmount(input) {
  if (typeof input !== 'string') return null;

  const match = input.match(MONEY_PATTERN);
  if (!match) return null;

  const numericValue = parseNumericToken(match[1]);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;

  const multiplier = /^(?:mil|milhar|milhares|k)$/i.test(match[2] ?? '')
    ? 1000
    : 1;

  return Number((numericValue * multiplier).toFixed(2));
}

function titleCase(value) {
  const trimmed = value.trim().replace(/[.!?,;:]+$/g, '');
  if (!trimmed) return null;

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

export function extractAccount(input, intent = 'register_transfer') {
  if (typeof input !== 'string') return null;

  const transferPattern = /\b(?:para|pro|pra)\s+(?:(?:a\s+)?conta\s+|o\s+|a\s+)?([\p{L}\d][\p{L}\d._ -]*?)(?=\s+(?:hoje|ontem|amanh[ãa]|dia\s+\d)\b|[.!?,;:]|$)/iu;
  const paymentPattern = /\b(?:pelo|pela|na\s+conta|no\s+banco|da\s+conta|do\s+banco)\s+([\p{L}\d][\p{L}\d._ -]*?)(?=\s+(?:hoje|ontem|amanh[ãa]|dia\s+\d)\b|[.!?,;:]|$)/iu;
  const match = input.match(
    intent === 'register_transfer' ? transferPattern : paymentPattern,
  );

  return match ? titleCase(match[1]) : null;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function shiftIsoDate(referenceDate, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate ?? '')) return null;

  const date = new Date(`${referenceDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;

  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function extractDate(input, referenceDate = null) {
  const normalizedText = normalizeFinancialText(input);
  const explicitDate = normalizedText.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);

  if (explicitDate) {
    const [, day, month, year] = explicitDate;
    const candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const parsed = new Date(`${candidate}T00:00:00.000Z`);

    return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === candidate
      ? candidate
      : null;
  }

  if (/\bhoje\b/.test(normalizedText)) return shiftIsoDate(referenceDate, 0);
  if (/\bontem\b/.test(normalizedText)) return shiftIsoDate(referenceDate, -1);
  if (/\bamanha\b/.test(normalizedText)) return shiftIsoDate(referenceDate, 1);
  return null;
}

function extractDescription(input, intent, account) {
  if (typeof input !== 'string') return null;
  const cleanInput = input.trim().replace(/[.!?,;:]+$/g, '');

  if (intent === 'register_transfer') {
    return account ? `Transferência para ${account}` : 'Transferência';
  }

  let description = cleanInput.replace(MONEY_PATTERN, ' ');
  if (account) {
    description = description.replace(
      new RegExp(
        `\\b(?:pelo|pela|na\\s+conta|no\\s+banco|da\\s+conta|do\\s+banco)\\s+${account.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        'iu',
      ),
      ' ',
    );
  }
  description = description
    .replace(/^(?:eu\s+)?(?:paguei|gastei|comprei|abasteci|recebi|ganhei|faturei|entrou|caiu|custou|saiu)\b/iu, '')
    .replace(/^(?:quero\s+)?(?:juntar|guardar|economizar)\b/iu, '')
    .replace(
      /^\s*(?:de|do|da|no|na|em|para|pra|pro)\s+(?:(?:uma|um|o|a)\b)?\s*/iu,
      '',
    )
    .trim();

  if (/^(?:mais|e\s+mais|tambem)$/iu.test(description)) return null;
  return titleCase(description);
}

export function extractEntities(input, options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const intent = safeOptions.intent ?? 'question';
  const referenceDate = safeOptions.referenceDate ?? null;
  const account = ['register_income', 'register_expense', 'register_transfer'].includes(intent)
    ? extractAccount(input, intent)
    : null;

  return {
    amount: extractAmount(input),
    category: null,
    description: extractDescription(input, intent, account),
    account,
    date: extractDate(input, referenceDate),
  };
}
