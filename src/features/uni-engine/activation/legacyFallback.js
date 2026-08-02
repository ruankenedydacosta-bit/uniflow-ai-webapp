// Activation Engine — fallback legado (Fase 9).
//
// O pipeline legado é SEMPRE a fonte final. O fallback não duplica resposta,
// não repete pergunta, não chama TTS, não executa pending action e não
// altera memória — apenas sinaliza que a orientação não será consumida.
import { createEmptyActivationDecision } from './activationContracts.js';
import { createActivationShadow } from './activationContracts.js';
import { isValidActivationCapability } from './activationTypes.js';

export function buildLegacyFallback(options = {}) {
  const safe = options ?? {};
  const capability = isValidActivationCapability(safe.capability)
    ? safe.capability
    : 'UNKNOWN';

  return createEmptyActivationDecision({
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    environment: safe.environment ?? 'unknown',
    capability,
    requested: Boolean(safe.requested),
    latencyMs: safe.latencyMs,
  });
}

export function isLegacyFallbackDecision(decision) {
  return Boolean(decision?.fallbackUsed)
    && decision?.activationStatus === 'FALLBACK_LEGACY';
}

export function preserveLegacyBehavior() {
  // No-op explícito: o pipeline legado continua sendo a fonte final. Nenhuma
  // alteração de resposta, execução, voz, memória ou banco acontece aqui.
  return { preserved: true, duplicated: false, ttsCalled: false, actionExecuted: false };
}

export function createFallbackShadow(options = {}) {
  return createActivationShadow({
    shadowMode: Boolean(options?.shadowMode),
    appliedToDecision: false,
    appliedToResponse: false,
    executed: false,
    persisted: false,
    changedBehavior: false,
    memoryModified: false,
    databaseCalled: false,
    voiceTouched: false,
  });
}
