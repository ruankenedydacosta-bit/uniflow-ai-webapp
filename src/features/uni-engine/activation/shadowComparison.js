// Activation Engine — comparação segura (Fase 9).
//
// Compara o comportamento legado com a orientação sugerida pela Uni Engine.
// Registra APENAS: tipo de divergência, igualdade estrutural, confiança,
// risco, gate responsável e fallback. Nunca registra texto integral.
export function createShadowComparison(options = {}) {
  const safe = options ?? {};

  const legacy = safe.legacy ?? null;
  const suggested = safe.suggested ?? null;

  let divergenceType;
  if (safe.blockingGate && safe.fallbackUsed) {
    divergenceType = 'blocked_by_gate';
  } else if (legacy === null && suggested === null) {
    divergenceType = 'none';
  } else if (legacy !== null && suggested !== null) {
    if (suggested.effect === 'none') {
      divergenceType = 'none';
    } else if (legacy.effect === suggested.effect) {
      divergenceType = 'agreement';
    } else if (legacy.effect === 'none') {
      divergenceType = 'guidance_added';
    } else {
      divergenceType = 'guidance_differs';
    }
  } else {
    divergenceType = 'guidance_added';
  }

  return {
    divergenceType,
    structuralEquality: legacy !== null
      && suggested !== null
      && legacy.effect === suggested.effect,
    confidence: typeof safe.confidence === 'number' ? safe.confidence : null,
    risk: typeof safe.risk === 'string' ? safe.risk : null,
    blockingGate: typeof safe.blockingGate === 'string' ? safe.blockingGate : null,
    fallbackUsed: Boolean(safe.fallbackUsed),
    legacyEffect: legacy?.effect ?? null,
    suggestedEffect: suggested?.effect ?? null,
  };
}
