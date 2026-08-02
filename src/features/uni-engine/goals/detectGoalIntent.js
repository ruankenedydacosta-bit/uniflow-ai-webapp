import { GOAL_POLICY } from './goalPolicy.js';

const EXPLICIT_HINTS = Object.freeze([
  'quero', 'objetivo', 'meta', 'planejo', 'pretendo',
  'vou', 'preciso', 'desejo', 'minha meta', 'meu objetivo',
  'queria', 'gostaria',
]);

const EXPLICIT_GOAL_INTENTS = Object.freeze(['create_goal']);

// Sinal monetário fraco: usado apenas para reconhecer metas EXPLÍCITAS sem
// keyword financeira ("minha meta é ter 100 mil guardados") sem abrir a porta
// para ruído ("quero café").
const MONEY_HINT_PATTERN = /(?:r\$\s*\d|reais?|mil|contos|\d{1,3}(?:[.,]\d{1,2})?\s*(?:reais?|mil|k|contos))/i;

// O texto normalizado do motor vem sem acentos ("reserva de emergencia");
// keywords com acento são normalizadas no momento do matching.
function stripAccents(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function detectGoalIntent(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const text = String(safe.normalizedMessage?.searchableText ?? safe.normalizedMessage?.text ?? safe.classification?.rawMessage ?? '');
  const intent = safe.classification?.intent ?? safe.classification?.messageType ?? null;

  const emptyResult = {
    detected: false,
    explicit: false,
    implicit: false,
    ambiguous: false,
    source: [],
    matchedKeywords: [],
    matchedTypeCount: 0,
    matchedTypes: [],
    score: 0,
    dominantType: null,
  };

  if (!text.trim()) return { ...emptyResult, source: null };

  const lowerText = stripAccents(text.toLowerCase());
  const isExplicit = EXPLICIT_HINTS.some((hint) => lowerText.includes(stripAccents(hint)));
  const hasGoalIntent = Boolean(intent) && EXPLICIT_GOAL_INTENTS.includes(intent);

  const matchedEntries = [];
  let totalMatches = 0;
  const pairs = [];
  for (const [type, keywords] of Object.entries(GOAL_POLICY.keywordMap)) {
    for (const keyword of keywords) {
      if (lowerText.includes(stripAccents(keyword))) pairs.push({ type, keyword });
    }
  }

  // Keywords curtas engolidas por keywords mais específicas de OUTRO tipo
  // não contam ("reserva de emergência" descarta "reserva" de SAVINGS).
  const filteredPairs = pairs.filter((pair) => (
    !pairs.some((other) => (
      other.type !== pair.type
      && other.keyword.length > pair.keyword.length
      && stripAccents(other.keyword).includes(stripAccents(pair.keyword))
    ))
  ));

  const matchedTypes = [...new Set(filteredPairs.map((pair) => pair.type))];
  for (const type of matchedTypes) {
    const hits = filteredPairs
      .filter((pair) => pair.type === type)
      .map((pair) => pair.keyword);
    matchedEntries.push({ type, hits, count: hits.length });
    totalMatches += hits.length;
  }

  // Meta explícita sem keyword financeira: só é reconhecida com sinal de
  // valor monetário no texto (nunca no vazio).
  if (matchedEntries.length === 0) {
    if (isExplicit && MONEY_HINT_PATTERN.test(lowerText)) {
      return {
        detected: true,
        explicit: true,
        implicit: false,
        ambiguous: false,
        source: ['explicit_user_statement'],
        matchedKeywords: [],
        matchedTypeCount: 0,
        matchedTypes: [],
        score: 0.6,
        dominantType: null,
      };
    }
    return emptyResult;
  }

  const score = Math.min(1, totalMatches * 0.15 + (isExplicit ? 0.3 : 0) + (hasGoalIntent ? 0.2 : 0));

  // Tipo dominante por especificidade: o keyword mais longo/descritivo vence
  // (ex.: 'reserva de emergência' sobre 'reserva'; 'fundo de investimento'
  // sobre 'fundo').
  const dominantType = [...matchedEntries].sort(
    (a, b) => keywordSpecificity(b) - keywordSpecificity(a),
  )[0].type;

  return {
    detected: true,
    explicit: isExplicit || hasGoalIntent,
    implicit: !isExplicit && !hasGoalIntent,
    ambiguous: matchedEntries.length > GOAL_POLICY.maxAmbiguousMatchesForDetection,
    source: isExplicit || hasGoalIntent ? ['explicit_user_statement'] : ['implicit_inference'],
    matchedKeywords: matchedEntries.flatMap((entry) => entry.hits),
    matchedTypeCount: matchedEntries.length,
    matchedTypes: matchedEntries.map((entry) => entry.type),
    score: Math.min(1, score),
    dominantType,
  };
}

function keywordSpecificity(entry) {
  return entry.hits.reduce((sum, keyword) => sum + keyword.length, 0);
}
