import { UNI_OS_ENABLED } from '../featureFlags.js';
import { routeCognitiveRequest } from './cognitiveRouter.js';
import { createCognitiveGatewaySnapshot } from './cognitiveSchema.js';

function defaultIdFactory() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `uni-gateway-${Date.now().toString(36)}`;
}

export function adaptCognitiveInput(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultIdFactory;
  const routing = routeCognitiveRequest(source.parsedIntent);

  return createCognitiveGatewaySnapshot({
    gatewayId: idFactory(),
    timestamp: now(),
    structuredInput: {
      intent: source.parsedIntent,
      context: source.contextSnapshot,
      memory: source.memorySnapshot,
      planning: source.planningSnapshot,
      reflection: source.reflectionSnapshot,
      security: source.securitySnapshot,
      permissions: source.permissionsSnapshot,
    },
    metadata: {
      requestedCapability: routing.requestedCapability,
    },
  });
}

export function logCognitiveGatewaySummary(logger, gateway) {
  logger.info?.('[UNI OS] Cognitive Gateway', {
    capability: gateway.metadata.requestedCapability,
    route: gateway.route,
    shouldInvokeModel: gateway.shouldInvokeModel,
  });
}

export async function runCognitiveGatewayShadow(input, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', gateway: null });

  try {
    const gateway = adaptCognitiveInput(input, options.adapterOptions);
    if (typeof options.observer === 'function') await options.observer(gateway);
    if (options.isDevelopment === true) {
      logCognitiveGatewaySummary(options.logger ?? console, gateway);
    }
    return Object.freeze({ status: 'OBSERVED', gateway: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Cognitive Gateway failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', gateway: null });
  }
}
