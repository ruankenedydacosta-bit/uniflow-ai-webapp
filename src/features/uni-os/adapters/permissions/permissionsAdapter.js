import { UNI_OS_ENABLED } from '../featureFlags.js';
import { evaluateCognitivePermissions } from './permissionsEngine.js';
import { createPermissionsSnapshot } from './permissionsSchema.js';

function defaultIdFactory() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `uni-permissions-${Date.now().toString(36)}`;
}

export function adaptPermissionsInput(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultIdFactory;
  const evaluation = evaluateCognitivePermissions({
    parsedIntent: source.parsedIntent,
    contextSnapshot: source.contextSnapshot,
    memorySnapshot: source.memorySnapshot,
    planningSnapshot: source.planningSnapshot,
    reflectionSnapshot: source.reflectionSnapshot,
    securitySnapshot: source.securitySnapshot,
  });
  return createPermissionsSnapshot({
    permissionsId: idFactory(),
    timestamp: now(),
    ...evaluation,
  });
}

export function logPermissionsSummary(logger, permissions) {
  logger.info?.('[UNI OS] Permissions', {
    status: permissions.status,
    scopes: permissions.scopes,
    restrictions: permissions.restrictions,
    reasons: permissions.reasons,
  });
}

export async function runPermissionsAdapterShadow(input, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', permissions: null });

  try {
    const permissions = adaptPermissionsInput(input, options.adapterOptions);
    if (typeof options.observer === 'function') await options.observer(permissions);
    if (options.isDevelopment === true) {
      logPermissionsSummary(options.logger ?? console, permissions);
    }
    return Object.freeze({ status: 'OBSERVED', permissions: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Permissions shadow validation failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', permissions: null });
  }
}
