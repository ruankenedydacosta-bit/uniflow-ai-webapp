// Uni Engine — Controlled Question (Parte 6, Bloco Único): telemetria.
//
// Telemetria REDIGIDA da pergunta controlada: NUNCA contém o texto da
// pergunta (finalQuestion), o texto legado (originalLegacyText) nem conteúdo
// dos diagnósticos. Apenas sinais booleanos, enum fechado e contadores.
export const CONTROLLED_QUESTION_TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  'version',
  'enabled',
  'applied',
  'capability',
  'decisionType',
  'requestedField',
  'templateKey',
  'fallbackUsed',
  'fallbackReason',
  'sameTurn',
  'pendingActionPreserved',
  'confirmationPreserved',
  'safety',
  'latencyMs',
]);

export function redactControlledQuestionTelemetry(result) {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return null;
  const telemetry = {};
  for (const key of CONTROLLED_QUESTION_TELEMETRY_ALLOWED_FIELDS) {
    telemetry[key] = result[key];
  }
  telemetry.safety = typeof result.safety === 'object' && result.safety !== null
    ? { ...result.safety }
    : {};
  return Object.freeze(telemetry);
}
