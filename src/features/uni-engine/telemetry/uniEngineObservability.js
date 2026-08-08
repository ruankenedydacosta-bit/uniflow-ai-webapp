import {
  normalizeTelemetryErrorCode,
  telemetry as runtimeTelemetry,
} from '../../observability/index.js';

function resolveApi(api) {
  return api && typeof api === 'object' ? api : runtimeTelemetry;
}

function emit(api, method, name, data, identity) {
  try {
    return Promise.resolve(resolveApi(api)?.[method]?.(name, data, identity)).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

function buildIdentity(input = {}, correlationId = null) {
  return {
    userId: input?.session?.userId ?? null,
    workspaceId: input?.session?.workspaceId ?? null,
    conversationId: input?.session?.conversationId ?? null,
    messageId: input?.message?.id ?? null,
    turnId: input?.message?.id ?? null,
    requestId: correlationId,
  };
}

function firstReason(value, fallback = null) {
  if (typeof value === 'string' && value) return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return fallback;
}

export function recordShadowStarted({ api, input, correlationId } = {}) {
  return emit(api, 'event', 'uni_engine.shadow_started', {
    status: 'started',
    source: 'shadow',
    stage: 'evaluation',
    enabled: true,
    shadowMode: true,
    executionAllowed: false,
    writes: false,
  }, buildIdentity(input, correlationId));
}

export function recordShadowResult({ api, input, result } = {}) {
  const identity = buildIdentity(input, result?.correlationId ?? null);
  const modules = [
    ['cognitive', result?.classification],
    ['epistemic', result?.epistemicModel],
    ['decision', result?.decisionLayer],
    ['planning', result?.planning],
    ['goals', result?.goals],
    ['reflection', result?.reflection],
    ['activation', result?.activation],
  ].filter(([, value]) => value != null);
  const tasks = modules.map(([capability]) => emit(
    api,
    'event',
    'uni_engine.shadow_module_evaluated',
    {
      status: 'completed',
      source: 'shadow',
      stage: 'module',
      capability,
      shadowMode: true,
      executionAllowed: false,
      writes: false,
    },
    identity,
  ));

  tasks.push(emit(api, 'event', 'uni_engine.shadow_validation', {
    status: result?.validation?.valid === true ? 'approved' : 'rejected',
    source: 'shadow',
    stage: 'plan_validation',
    reasonCode: firstReason(result?.validation?.errors),
    shadowMode: true,
    executionAllowed: false,
    writes: false,
  }, identity));

  tasks.push(emit(api, 'event', 'uni_engine.shadow_validation', {
    status: result?.classification?.safetyBlocked === true ? 'blocked' : 'approved',
    source: 'shadow',
    stage: 'safety_validation',
    reasonCode: result?.classification?.safetyBlocked === true ? 'SAFETY_BLOCKED' : null,
    shadowMode: true,
    executionAllowed: false,
    writes: false,
  }, identity));

  for (const decision of result?.activation?.decisions ?? []) {
    tasks.push(emit(api, 'event', 'activation.evaluated', {
      status: decision?.activationStatus ?? 'unknown',
      source: 'shadow',
      stage: 'activation',
      capability: decision?.capability ?? 'unknown',
      decision: decision?.activationStatus ?? 'unknown',
      reasonCode: decision?.fallbackReason ?? null,
      shadowMode: true,
      executionAllowed: false,
      writes: false,
      fallbackUsed: decision?.fallbackUsed === true,
      confidenceBand: decision?.telemetry?.confidenceBand ?? null,
      riskBand: decision?.risk ?? null,
    }, identity));

    if (decision?.telemetry?.circuitBreakerStatus) {
      tasks.push(emit(api, 'event', 'uni_engine.shadow_module_evaluated', {
        status: decision.telemetry.circuitBreakerStatus,
        source: 'shadow',
        stage: 'circuit_breaker',
        capability: decision?.capability ?? 'unknown',
        shadowMode: true,
        executionAllowed: false,
        writes: false,
      }, identity));
    }
  }

  tasks.push(emit(api, 'event', 'uni_engine.shadow_completed', {
    status: result?.diagnostics?.errorCode ? 'error_safe' : 'completed',
    source: 'shadow',
    stage: 'evaluation',
    intent: result?.classification?.primaryIntent ?? null,
    decision: result?.decisionLayer?.decisionType ?? result?.plan?.decision ?? null,
    reasonCode: result?.fallbackReason ?? result?.diagnostics?.errorCode ?? null,
    enabled: result?.enabled === true,
    shadowMode: true,
    executionAllowed: false,
    writes: false,
    fallbackUsed: result?.fallbackUsed === true,
    count: modules.length,
    latencyMs: result?.diagnostics?.latencyMs ?? 0,
  }, identity));

  tasks.push(emit(api, 'metric', 'uni_engine.latency_ms', {
    value: Math.max(0, Number(result?.diagnostics?.latencyMs) || 0),
    unit: 'ms',
    source: 'shadow',
    status: result?.diagnostics?.errorCode ? 'error_safe' : 'completed',
  }, identity));

  return Promise.all(tasks);
}

export function recordShadowFailure({ api, input, correlationId, errorCode, latencyMs } = {}) {
  const identity = buildIdentity(input, correlationId);
  const safeCode = normalizeTelemetryErrorCode(errorCode, 'ENGINE_INTERNAL_ERROR');
  return Promise.all([
    emit(api, 'error', 'uni_engine.failure', {
      errorCode: safeCode,
      stage: 'shadow_evaluation',
      source: 'shadow',
      recoverable: true,
      fallbackUsed: true,
    }, identity),
    emit(api, 'metric', 'uni_engine.latency_ms', {
      value: Math.max(0, Number(latencyMs) || 0),
      unit: 'ms',
      source: 'shadow',
      status: 'error_safe',
    }, identity),
  ]);
}

export function recordFinancialShadowValidation({
  api,
  identity = {},
  runtimeResult,
  factualValidation,
  safetyValidation,
} = {}) {
  const common = {
    source: 'financial_shadow',
    intent: runtimeResult?.intent?.type ?? null,
    shadowMode: true,
    executionAllowed: false,
    writes: false,
    latencyMs: runtimeResult?.latencyMs ?? 0,
  };
  return Promise.all([
    emit(api, 'event', 'financial_runtime.evaluated', {
      ...common,
      status: factualValidation?.valid === true ? 'approved' : 'rejected',
      stage: 'factual_validation',
      reasonCode: firstReason(factualValidation?.reasonCodes),
    }, identity),
    emit(api, 'event', 'financial_runtime.evaluated', {
      ...common,
      status: safetyValidation?.approved === true ? 'approved' : 'rejected',
      stage: 'safety_validation',
      reasonCode: firstReason(safetyValidation?.reasonCodes),
    }, identity),
  ]);
}

export function recordToolCallingProposal({ api, identity = {}, count = 0, authorization } = {}) {
  return emit(api, 'event', 'tool_calling.evaluated', {
    status: 'proposed',
    source: 'shadow',
    stage: 'proposal',
    capability: 'tool_calling',
    decision: authorization?.authorized === true ? 'conceptually_allowed' : 'refused',
    reasonCode: authorization?.reason ?? null,
    shadowMode: true,
    executionAllowed: false,
    writes: false,
    count,
  }, identity);
}

export function recordToolCallingResult({ api, identity = {}, result, errorCode = null } = {}) {
  const outcomes = Array.isArray(result?.results) ? result.results : [];
  const timeout = outcomes.some((item) => item?.status === 'timeout');
  const technicalError = errorCode ?? outcomes.find((item) => item?.errorCode)?.errorCode ?? null;
  const status = timeout
    ? 'timeout'
    : technicalError
      ? 'error_safe'
      : result?.executed
        ? 'conceptually_allowed'
        : 'refused';
  const tasks = [emit(api, 'event', 'tool_calling.evaluated', {
    status,
    source: 'shadow',
    stage: 'result',
    capability: 'tool_calling',
    decision: result?.reason ?? status,
    reasonCode: technicalError ?? result?.reason ?? null,
    shadowMode: true,
    executionAllowed: false,
    writes: false,
    fallbackUsed: result?.executed !== true,
    count: Number(result?.count) || outcomes.length,
  }, identity)];

  if (technicalError) {
    tasks.push(emit(api, 'error', 'uni_engine.failure', {
      errorCode: normalizeTelemetryErrorCode(technicalError, 'TOOL_CALLING_ERROR'),
      stage: 'tool_calling',
      source: 'shadow',
      recoverable: true,
      fallbackUsed: true,
    }, identity));
  }
  return Promise.all(tasks);
}
