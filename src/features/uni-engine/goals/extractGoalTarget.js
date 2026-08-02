// Extração de alvo do objetivo (Fase 7 — Goal Engine, Shadow-only).
//
// Somente EVIDÊNCIA explícita no texto do usuário vira alvo: valor, data ou
// horizonte. Nenhum dado é inventado — ausência permanece `null` (nunca 0).
// O valor monetário e a data explícita reutilizam os parsers determinísticos
// já existentes do uni-intents (somente leitura).
import { extractAmount, extractDate } from '../../uni-intents/entityExtractor.js';

const HORIZON_MONTHS_PATTERNS = [
  { regex: /(?:em|daqui a|dentro de)\s+(\d{1,3})\s*(?:meses|mês|mes)\b/i, factor: 1 },
  { regex: /(?:em|daqui a|dentro de)\s+(\d{1,3})\s*(?:anos|ano)\b/i, factor: 12 },
];

const WRITTEN_HORIZONS = Object.freeze({
  'um mes': 1,
  'um mês': 1,
  'dois meses': 2,
  'seis meses': 6,
  'um ano': 12,
});

function extractHorizonMonths(text) {
  const lower = text.toLowerCase();
  for (const { regex, factor } of HORIZON_MONTHS_PATTERNS) {
    const match = lower.match(regex);
    if (!match) continue;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0 || value > 1200) return null;
    return Math.round(value * factor);
  }
  for (const [expression, months] of Object.entries(WRITTEN_HORIZONS)) {
    if (new RegExp(`\\b${expression}\\b`).test(lower)) return months;
  }
  return null;
}

export function extractGoalTarget(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const text = String(
    safe.normalizedMessage?.searchableText
      ?? safe.normalizedMessage?.text
      ?? '',
  );
  const referenceDate = typeof safe.referenceDate === 'string' ? safe.referenceDate : null;

  if (!text.trim()) {
    return { amount: null, currency: null, date: null, horizonMonths: null, description: null };
  }

  const amount = extractAmount(text);
  const horizonMonths = extractHorizonMonths(text);

  // Data-alvo somente quando explícita (dd/mm/aaaa). Expressões relativas de
  // transação (hoje/ontem/amanhã/dia N) não fazem sentido como prazo de
  // objetivo e nunca são aceitas.
  const hasExplicitDate = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(text);
  const date = hasExplicitDate ? extractDate(text, referenceDate) : null;

  return {
    amount,
    currency: amount != null ? 'BRL' : null,
    date,
    horizonMonths,
    description: null,
  };
}
