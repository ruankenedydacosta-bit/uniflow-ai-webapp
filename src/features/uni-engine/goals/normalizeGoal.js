export function normalizeGoal(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const candidate = safe.candidate ?? {};
  const text = String(candidate.normalizedText ?? '');

  if (!text) return null;

  return {
    text: text,
    ambiguous: Boolean(candidate.ambiguous),
    score: Math.min(1, Math.max(0, candidate.score ?? 0)),
    source: candidate.detectionSource ?? 'unknown',
    workspaceType: String(safe.workspaceType ?? 'personal'),
  };
}