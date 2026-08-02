// Diagnósticos da reflexão (Fase 8).
//
// Registra o que a reflexão fez e por quê — em códigos fechados. Puramente
// informativo; nada aqui executa ou altera comportamento.
import { isValidReflectionDiagnostic } from './reflectionTypes.js';

export function buildReflectionDiagnostics(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const diagnostics = [];

  if (safe.reflectionTriggered) diagnostics.push('REFLECTION_TRIGGERED');
  if (safe.outcomeClassified) diagnostics.push('OUTCOME_CLASSIFIED');
  if (safe.correctionDetected) diagnostics.push('CORRECTION_DETECTED');
  if (safe.correctionDetected === false) diagnostics.push('NO_CORRECTION_DETECTED');
  if (safe.signalsLimited) diagnostics.push('SIGNALS_LIMITED');
  if (safe.candidatesLimited) diagnostics.push('CANDIDATES_LIMITED');
  if (safe.providerFailureIgnored) diagnostics.push('PROVIDER_FAILURE_IGNORED');
  if (safe.sensitiveBlocked) diagnostics.push('SENSITIVE_CONTENT_BLOCKED');
  if (safe.successfulPattern) diagnostics.push('SUCCESSFUL_PATTERN_DETECTED');
  if (safe.fallbackUsed) diagnostics.push('FALLBACK_USED');

  diagnostics.push('SHADOW_ONLY');
  diagnostics.push('NO_LEARNING_APPLIED');

  return diagnostics.filter(isValidReflectionDiagnostic);
}
