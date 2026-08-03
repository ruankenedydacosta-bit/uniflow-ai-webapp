import { UNI_OS_ENABLED } from '../featureFlags.js';
import { evaluateSecuritySnapshots } from './securityEngine.js';
import { createSecurityDecision } from './securitySchema.js';

function defaultIdFactory() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `uni-security-${Date.now().toString(36)}`;
}

export function adaptSecurityInput(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultIdFactory;
  const evaluation = evaluateSecuritySnapshots({
    parsedIntent: source.parsedIntent,
    contextSnapshot: source.contextSnapshot,
    memorySnapshot: source.memorySnapshot,
    planningSnapshot: source.planningSnapshot,
    reflectionSnapshot: source.reflectionSnapshot,
  });
  return createSecurityDecision({
    securityId: idFactory(),
    timestamp: now(),
    ...evaluation,
  });
}

export function logSecuritySummary(logger, security) {
  logger.info?.('[UNI OS] Security', {
    status: security.status,
    reasons: security.reasons,
    warnings: security.warnings,
    flags: {
      blocked: security.blocked,
      confirmationRequired: security.confirmationRequired,
      executionAllowed: security.executionAllowed,
    },
    confidence: security.confidence,
    risk: security.risk,
  });
}

export async function runSecurityAdapterShadow(input, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', security: null });

  try {
    const security = adaptSecurityInput(input, options.adapterOptions);
    if (typeof options.observer === 'function') await options.observer(security);
    if (options.isDevelopment === true) logSecuritySummary(options.logger ?? console, security);
    return Object.freeze({ status: 'OBSERVED', security: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Security shadow validation failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', security: null });
  }
}
