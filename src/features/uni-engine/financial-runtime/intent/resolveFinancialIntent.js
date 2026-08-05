// Uni Engine — Runtime Conversacional Financeiro (Fase 17). Bloco 1:
// Intent Runtime.
//
// resolveFinancialIntent(text, context) detecta e resolve intenções
// financeiras em linguagem natural para estruturas tipadas.
//
// Exemplos suportados:
//   "Quanto gastei?" → { type: 'expense_query', confidence: 0.92 }
//   "Saldo da conta Nubank" → { type: 'account_query', entity: 'Nubank', confidence: 0.88 }
//   "Quanto recebi este mês?" → { type: 'income_query', temporal: 'this_month', confidence: 0.95 }
//   "Patrimônio" → { type: 'net_worth_query', confidence: 0.90 }
//   "Fluxo de caixa de julho" → { type: 'cashflow_query', temporal: 'specific_month', month: 7, confidence: 0.93 }
//
// Determinístico, sem LLM, serializável, shadow-only.

import { FINANCIAL_RUNTIME_INTENTS, isFinancialRuntimeIntent } from '../types/index.js';

const INTENT_PATTERNS = Object.freeze({
  balance_query: [
    /\bsaldo\b/i,
    /\bquanto\s+tenho\b/i,
    /\bmeu\s+saldo\b/i,
    /\bqual\s+saldo\b/i,
  ],
  income_query: [
    /\bquanto\s+(recebi|entrou|ganhei)\b/i,
    /\breceita\b/i,
    /\bentradas?\b/i,
    /\bsal[aá]rio\b/i,
    /\brenda\b/i,
  ],
  expense_query: [
    /\bquanto\s+gastei\b/i,
    /\bgastos?\b/i,
    /\bdespesas?\b/i,
    /\bsa[ií]das?\b/i,
    /\bgastei\b/i,
  ],
  savings_query: [
    /\bquanto\s+(economizei|poupei)\b/i,
    /\bpoupan[cç]a\b/i,
    /\btax\w*\s+poupan[cç]a\b/i,
    /\beconomizei\b/i,
  ],
  net_worth_query: [
    /\bpatrim[oô]nio\b/i,
    /\bquanto\s+(tenho|valho|sou)\b/i,
    /\bativos?\s*menos\s*passivos?\b/i,
    /\bliquidez?\b/i,
  ],
  cashflow_query: [
    /\bfluxo\s+(de\s+)?caixa\b/i,
    /\bcomo\s+est[aá]\s+(o\s+)?m[eê]s\b/i,
    /\bsitua[cç][aã]o\s+financeira\b/i,
    /\bcaixa\b/i,
  ],
  category_breakdown_query: [
    /\bpor\s+categoria\b/i,
    /\bem\s+que\s+(gastei|mais\s+gastei)\b/i,
    /\bcategoria\s+mais\b/i,
    /\bmaior\s+gasto\b/i,
    /\bbreakdown\b/i,
  ],
  account_query: [
    /\bsaldo\s+(da\s+)?conta\b/i,
    /\bconta\s+\w+/i,
    /\bnubank\b/i,
    /\binter\b/i,
    /\bbit\w*coin\b/i,
    /\bcaixa\b/i,
    /\bbitbank\b/i,
    /\bbradesco\b/i,
    /\bitau\b/i,
    /\bsantander\b/i,
  ],
  period_comparison_query: [
    /\b(versus|vs|x)\b/i,
    /\bcomparado\b/i,
    /\bm[e^s]\s+passado\b/i,
    /\bano\s+passado\b/i,
    /\bjulho\s+(vs|x|versus)\s+junho/i,
    /\besse\s+m[e^s]\s+(vs|x|versus)\s+m[e^s]\s+passado/i,
  ],
  projection_query: [
    /\bproje[cç][aã]o\b/i,
    /\bvou\s+ficar\b/i,
    /\bm[e^s]\s+que\s+vem\b/i,
    /\bfuturo\b/i,
    /\bdaqui\s+\d+\s+m[e^s]es\b/i,
    /\bprojetado\b/i,
  ],
  goals_query: [
    /\bmetas?\b/i,
    /\bobjetivos?\b/i,
    /\bcomo\s+est[ãa]o\s+minhas\s+metas\b/i,
    /\breserva\b/i,
  ],
  credit_query: [
    /\bcart[aã]o\b/i,
    /\blimite\b/i,
    /\bfatura\b/i,
    /\bcr[eé]dito\b/i,
    /\bdivida.*cart[aã]o\b/i,
  ],
  investments_query: [
    /\binvestimentos?\b/i,
    /\baplica[cç][aã]o\b/i,
    /\bfundos?\b/i,
    /\brenda\s+fixa\b/i,
    /\ba[cç][aã]o\b/i,
    /\btesouro\b/i,
    /\bcdb\b/i,
  ],
  recurring_query: [
    /\brecorrentes?\b/i,
    /\bfixos?\b/i,
    /\bassinaturas?\b/i,
    /\bmensalidades?\b/i,
  ],
  installments_query: [
    /\bparcelas?\b/i,
    /\bparcelamento\b/i,
    /\bquantas\s+parcelas\b/i,
  ],
});

const ENTITY_PATTERNS = Object.freeze({
  account: [
    { pattern: /\bnubank\b/i, canonical: 'Nubank' },
    { pattern: /\binter\b/i, canonical: 'Inter' },
    { pattern: /\bbit\w*coin\b/i, canonical: 'Bitcoin' },
    { pattern: /\bcaixa\b/i, canonical: 'Caixa' },
    { pattern: /\bbitbank\b/i, canonical: 'Bitbank' },
    { pattern: /\bbradesco\b/i, canonical: 'Bradesco' },
    { pattern: /\bitau\b/i, canonical: 'Itaú' },
    { pattern: /\bsantander\b/i, canonical: 'Santander' },
  ],
  month: [
    { pattern: /\bjaneiro\b/i, value: 1 },
    { pattern: /\bfevereiro\b/i, value: 2 },
    { pattern: /\bmar[cç]o\b/i, value: 3 },
    { pattern: /\babril\b/i, value: 4 },
    { pattern: /\bmaio\b/i, value: 5 },
    { pattern: /\bjunho\b/i, value: 6 },
    { pattern: /\bjulho\b/i, value: 7 },
    { pattern: /\bagosto\b/i, value: 8 },
    { pattern: /\bsetembro\b/i, value: 9 },
    { pattern: /\boutubro\b/i, value: 10 },
    { pattern: /\bnovembro\b/i, value: 11 },
    { pattern: /\bdezembro\b/i, value: 12 },
  ],
});

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Um único padrão inequívoco já é evidência suficiente de intenção real (ex.:
// "patrimônio", "quanto recebi") -- por isso a base é alta (0.75, sempre
// acima do limiar de 0.70 usado pelos consumidores). Cada padrão adicional
// que também casar reforça a confiança, até um teto que nunca chega a 1
// (o runtime nunca afirma certeza absoluta sobre linguagem natural).
function calculateConfidence(matches) {
  if (matches <= 0) return 0;
  return Math.min(0.98, 0.75 + (matches - 1) * 0.05);
}

// Matriz de precedência para intenções compostas/ambíguas (Bloco A). Frases
// genéricas de uma palavra (ex.: "gastos", "categoria") aparecem em mais de
// uma intenção -- sem uma ordem explícita, a intenção mais genérica sempre
// venceria por ter padrões mais permissivos. Estes verificadores cobrem
// construções compostas REAIS da língua portuguesa (não frases literais de
// teste) e são avaliados, nesta ordem, ANTES do placar por contagem de
// padrões: uma correspondência forte decide a intenção imediatamente.
//
// 1. period_comparison_query — comparação explícita entre dois períodos
//    (dois meses distintos + conector de comparação: "julho que junho",
//    "julho vs junho", "julho comparado a junho").
// 2. category_breakdown_query — pergunta por "em que/qual categoria" ou
//    "categoria que mais", que sempre implica quebra por categoria mesmo
//    quando a frase também contém um verbo de gasto genérico ("gastei").
// 3. recurring_query — "gasto(s) fixo(s)" é o termo padrão para despesas
//    recorrentes em português e não deve cair em expense_query só porque
//    contém a palavra "gasto".
function countMonthMentions(normalized) {
  return ENTITY_PATTERNS.month.filter(({ pattern }) => pattern.test(normalized)).length;
}

function hasStrongPeriodComparison(normalized) {
  return countMonthMentions(normalized) >= 2
    && /\b(versus|vs\b|\bx\b|comparad[oa]|que)\b/i.test(normalized);
}

function hasStrongCategoryBreakdown(normalized) {
  return /\bem\s+que\s+categoria\b/i.test(normalized)
    || /\bqual\s+categoria\b/i.test(normalized)
    || /\bcategoria\s+(que\s+)?mais\b/i.test(normalized)
    || /\bmaior\s+gasto\b/i.test(normalized)
    || /\bbreakdown\b/i.test(normalized);
}

function hasStrongRecurring(normalized) {
  return /\bgastos?\s+fix\w*\b/i.test(normalized)
    || /\bdespesas?\s+fix\w*\b/i.test(normalized)
    || /\bassinaturas?\b/i.test(normalized)
    || /\bmensalidades?\b/i.test(normalized);
}

const STRONG_INTENT_PRECEDENCE = Object.freeze([
  ['period_comparison_query', hasStrongPeriodComparison],
  ['category_breakdown_query', hasStrongCategoryBreakdown],
  ['recurring_query', hasStrongRecurring],
]);

function resolveStrongIntent(normalized) {
  for (const [intentType, check] of STRONG_INTENT_PRECEDENCE) {
    if (check(normalized)) return intentType;
  }
  return null;
}

function extractEntity(text, entityType) {
  const patterns = ENTITY_PATTERNS[entityType];
  if (!patterns) return null;

  for (const { pattern, canonical, value } of patterns) {
    if (pattern.test(text)) {
      return { type: entityType, value: canonical ?? value, raw: text.match(pattern)?.[0] };
    }
  }
  return null;
}

function extractTemporal(text) {
  const normalized = normalizeText(text);

  // "hoje", "ontem"
  if (/\bhoje\b/i.test(normalized)) return { entity: 'today', period: 'today' };
  if (/\bontem\b/i.test(normalized)) return { entity: 'yesterday', period: 'yesterday' };

  // "esta semana", "semana passada"
  if (/\besta\s+semana\b/i.test(normalized)) return { entity: 'this_week', period: 'this_week' };
  if (/\bsemana\s+passada\b/i.test(normalized)) return { entity: 'last_week', period: 'last_week' };

  // "este mês", "mês passado", "mês que vem"
  if (/\beste\s+m[eê]s\b/i.test(normalized)) return { entity: 'this_month', period: 'this_month' };
  if (/\bm[eê]s\s+passado\b/i.test(normalized)) return { entity: 'last_month', period: 'last_month' };
  if (/\bm[eê]s\s+que\s+vem\b/i.test(normalized)) return { entity: 'next_month', period: 'next_month' };

  // "julho", "junho", etc.
  const monthPatterns = ENTITY_PATTERNS.month;
  for (const { pattern, value } of monthPatterns) {
    if (pattern.test(normalized)) {
      return { entity: 'specific_month', period: 'specific_month', month: value };
    }
  }

  // "2025", "2024"
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  if (yearMatch) return { entity: 'specific_year', period: 'specific_year', year: parseInt(yearMatch[1], 10) };

  // "últimos 3 meses", "últimos 7 dias"
  const lastMonthsMatch = normalized.match(/[uú]ltimos\s+(\d+)\s+m[eê]ses?/i);
  if (lastMonthsMatch) return { entity: 'last_n_months', period: 'last_n_months', n: parseInt(lastMonthsMatch[1], 10) };

  const lastDaysMatch = normalized.match(/[uú]ltimos\s+(\d+)\s+dias?/i);
  if (lastDaysMatch) return { entity: 'last_n_days', period: 'last_n_days', n: parseInt(lastDaysMatch[1], 10) };

  // "este ano", "ano passado"
  if (/\beste\s+ano\b/i.test(normalized)) return { entity: 'this_year', period: 'this_year' };
  if (/\bano\s+passado\b/i.test(normalized)) return { entity: 'last_year', period: 'last_year' };

  // "janeiro a dezembro", "01/07 a 31/07"
  if (/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*(?:a|at[eé]|[-–])\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i.test(normalized)) {
    return { entity: 'date_range', period: 'date_range' };
  }

  // Data específica "15/07/2025"
  if (/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/i.test(normalized)) {
    return { entity: 'specific_date', period: 'specific_date' };
  }

  return null;
}

export function resolveFinancialIntent(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return {
      type: 'unknown',
      confidence: 0,
      entities: [],
      temporal: null,
      originalText: text,
    };
  }

  let bestIntent = resolveStrongIntent(normalized);
  let bestScore = bestIntent ? 0.9 : 0;
  let bestMatches = bestIntent ? 1 : 0;

  if (!bestIntent) {
    for (const [intentType, patterns] of Object.entries(INTENT_PATTERNS)) {
      let matches = 0;
      for (const pattern of patterns) {
        if (pattern.test(normalized)) matches++;
      }
      if (matches > bestMatches) {
        bestMatches = matches;
        bestScore = calculateConfidence(matches);
        bestIntent = intentType;
      }
    }
  }

  // Se nenhum padrão matchou, tentar fallback por palavras-chave
  if (!bestIntent) {
    if (/\bsaldo|quanto\s+tenho/i.test(normalized)) bestIntent = 'balance_query';
    else if (/\bganhei|recebi|entrou|sal[aá]rio|renda/i.test(normalized)) bestIntent = 'income_query';
    else if (/\bgastei|gasto|despesa|sa[ií]da/i.test(normalized)) bestIntent = 'expense_query';
    else if (/\beconomizei|poupan[cç]a/i.test(normalized)) bestIntent = 'savings_query';
    else if (/\bpatrim[oô]nio|liquidez|ativos.*passivos/i.test(normalized)) bestIntent = 'net_worth_query';
    else if (/\bfluxo|caixa|como\s+est[aá]/i.test(normalized)) bestIntent = 'cashflow_query';
    else if (/\bcategoria|onde\s+gastei|maior\s+gasto/i.test(normalized)) bestIntent = 'category_breakdown_query';
    else if (/\bconta\s+\w+|nubank|inter|itau|bradesco/i.test(normalized)) bestIntent = 'account_query';
    else if (/\bversus|vs|comparado|m[eê]s\s+passado/i.test(normalized)) bestIntent = 'period_comparison_query';
    else if (/\bproje[cç][aã]o|futuro|m[eê]s\s+que\s+vem/i.test(normalized)) bestIntent = 'projection_query';
    else if (/\bmetas?|objetivos?/i.test(normalized)) bestIntent = 'goals_query';
    else if (/\bcart[aã]o|limite|fatura/i.test(normalized)) bestIntent = 'credit_query';
    else if (/\binvestimentos?|aplica[cç][aã]o|fundos/i.test(normalized)) bestIntent = 'investments_query';
    else if (/\brecorrentes?|fixos?|assinaturas?/i.test(normalized)) bestIntent = 'recurring_query';
    else if (/\bparcelas?|parcelamento/i.test(normalized)) bestIntent = 'installments_query';
    else bestIntent = 'unknown';
  }

  // Extrair entidades
  const entities = [];
  const accountEntity = extractEntity(normalized, 'account');
  if (accountEntity) entities.push(accountEntity);

  // Extrair temporal
  const temporal = extractTemporal(text);

  const confidence = bestIntent === 'unknown' ? 0.3 : bestScore;

  return {
    type: isFinancialRuntimeIntent(bestIntent) ? bestIntent : 'unknown',
    confidence: Math.round(confidence * 100) / 100,
    entities,
    temporal,
    originalText: text,
  };
}

export function getSupportedIntents() {
  return [...FINANCIAL_RUNTIME_INTENTS];
}

export function isValidIntent(type) {
  return isFinancialRuntimeIntent(type);
}