import { createGoalCandidate } from './goalContracts.js';

export function extractGoalCandidate(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const intent = safe.goalIntent ?? {};
  const text = String(safe.normalizedMessage?.searchableText ?? safe.normalizedMessage?.text ?? '');

  if (!intent.detected || !text.trim()) {
    return createGoalCandidate({ score: 0 });
  }

  const matchedKeywords = Array.isArray(intent.matchedKeywords) ? intent.matchedKeywords : [];

  return createGoalCandidate({
    rawText: text,
    normalizedText: text.toLowerCase().trim(),
    detectionSource: intent.explicit ? 'explicit_user_statement' : 'implicit_inference',
    score: intent.score ?? 0,
    matchedKeywords,
    ambiguous: Boolean(intent.ambiguous),
  });
}