// Uni Engine — Cognitive Comparison (Fase 14, Bloco 3).
//
// Deriva a rota do PIPELINE LEGADO a partir do resultado legado observável
// (responseType + pendência ativa). A rota legada é sempre uma rota fechada
// do vocabulário existente (ROUTE_*); dados ausentes caem em
// ROUTE_LEGACY_FALLBACK. Nunca lê texto completo, nunca executa nada.
const LEGACY_RESPONSE_TYPE_TO_ROUTE = Object.freeze({
  confirmation: 'ROUTE_CONFIRMATION',
  clarification: 'ROUTE_CLARIFICATION',
  question: 'ROUTE_QUESTION',
  generic: 'ROUTE_ANSWER',
});

// Rota legada derivada do tipo de resposta legada observado no turno.
export function legacyRouteFromResponse(legacyResult) {
  const safe = legacyResult && typeof legacyResult === 'object' ? legacyResult : null;
  const responseType = typeof safe?.responseType === 'string' ? safe.responseType : null;
  if (responseType && Object.prototype.hasOwnProperty.call(LEGACY_RESPONSE_TYPE_TO_ROUTE, responseType)) {
    return LEGACY_RESPONSE_TYPE_TO_ROUTE[responseType];
  }
  // Pendência ativa sem tipo de resposta legada: a máquina de estados legada
  // está aguardando confirmação/continuidade — rota de confirmação.
  if (safe?.pendingActive === true) {
    return 'ROUTE_CONFIRMATION';
  }
  return 'ROUTE_LEGACY_FALLBACK';
}