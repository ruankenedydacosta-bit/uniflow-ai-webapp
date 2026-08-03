import { useCallback, useEffect, useRef, useState } from 'react';
import { UNI_OS_ENABLED } from '../../../../features/uni-os/adapters/featureFlags.js';
import { runUniOSRuntimeShadow } from '../../../../features/uni-os/runtime/index.js';
import { inspectorPipelineStages, inspectorRuntimeMock } from '../mocks/inspectorRuntime.mock.js';
import { formatInspectorTime } from './useMockInspectorRuntime.js';

const REDACTED = '[REDACTED]';
const AUTO_REFRESH_INTERVAL_MS = 2000;
const SENSITIVE_KEY = /(^name$|full.?name|address|birth|document|original.*text|^text$|message|content|transcript|utterance|raw|description|email|phone|telefone|cpf|card|cartao|token|jwt|password|secret|authorization|service.?role|private.?key)/i;
const FINANCIAL_KEY = /^(account|accounts|merchant|merchants|amount|amounts|value|values|balance|balances)$/i;
const EMAIL_VALUE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i;
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
const CPF_VALUE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const PHONE_VALUE = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}/;
const CARD_VALUE = /\b(?:\d[ -]*?){13,19}\b/;

const INSPECTOR_RUNTIME_INPUT = Object.freeze({
  parsedIntent: Object.freeze({}),
  runtimeContext: Object.freeze({}),
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function redactCollection(value) {
  if (Array.isArray(value)) return value.map(() => REDACTED);
  if (value && typeof value === 'object') return REDACTED;
  return value === null || value === undefined ? value : REDACTED;
}

function stringContainsSensitiveValue(value) {
  return EMAIL_VALUE.test(value)
    || JWT_VALUE.test(value)
    || CPF_VALUE.test(value)
    || PHONE_VALUE.test(value)
    || CARD_VALUE.test(value)
    || /service_role/i.test(value);
}

export function sanitizeInspectorSnapshot(value, key = '') {
  const isInternalId = key === 'id' || key.endsWith('_id') || key.endsWith('Id');
  if (isInternalId || SENSITIVE_KEY.test(key)) {
    return value === null || value === undefined ? value : REDACTED;
  }
  if (FINANCIAL_KEY.test(key)) return redactCollection(value);
  if (typeof value === 'string') return stringContainsSensitiveValue(value) ? REDACTED : value;
  if (Array.isArray(value)) return value.map((item) => sanitizeInspectorSnapshot(item));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([nestedKey, nestedValue]) => [
      nestedKey,
      sanitizeInspectorSnapshot(nestedValue, nestedKey),
    ]),
  );
}

export function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function buildRuntimeView(result, telemetry) {
  const sanitized = sanitizeInspectorSnapshot(result);
  const validationErrors = telemetry?.validationErrors ?? [];

  return deepFreeze({
    timestamp: sanitized.timestamp || new Date().toISOString(),
    version: sanitized.metadata?.version ?? '1.0',
    pipeline: sanitized.completed ? 'completed' : 'failed',
    shadowMode: sanitized.metadata?.shadowMode === true,
    executionAllowed: false,
    deepFreeze: isDeepFrozen(result),
    adaptersExecuted: telemetry?.adaptersExecuted?.length ?? 0,
    executionTimeMs: telemetry?.pipelineDurationMs ?? 0,
    featureFlag: UNI_OS_ENABLED,
    validationResult: validationErrors.length === 0 ? 'Passed' : 'Failed',
    source: 'runtime',
    parsedIntent: sanitized.parsedIntent ?? {},
    context: sanitized.context ?? {},
    memory: sanitized.memory ?? {},
    planning: sanitized.planning ?? {},
    reflection: sanitized.reflection ?? {},
    security: sanitized.security ?? {},
    permissions: sanitized.permissions ?? {},
    gateway: sanitized.cognition ?? {},
    response: sanitized.structuredResponse ?? {},
    communication: sanitized.communication ?? {},
  });
}

function buildMockView(reason = 'unavailable') {
  return deepFreeze({
    ...inspectorRuntimeMock,
    validationResult: reason === 'loading' ? 'Waiting' : 'Mock fallback',
    source: 'mock',
  });
}

export function buildInspectorStages({ runtime, status = 'idle' } = {}) {
  const executed = runtime?.source === 'runtime'
    ? runtime.adaptersExecuted
    : 0;

  return deepFreeze(inspectorPipelineStages.map((stage, index) => {
    let stageStatus = 'waiting';
    if (runtime?.source === 'mock') stageStatus = 'shadow';
    if (status === 'running') stageStatus = index === 0 ? 'running' : 'waiting';
    if (status === 'completed') stageStatus = index === 0 || index <= executed ? 'completed' : 'waiting';
    if (status === 'failed') {
      stageStatus = index === 0 && executed === 0
        ? 'failed'
        : index === 0 || index < executed
          ? 'completed'
          : index === executed
            ? 'failed'
            : 'waiting';
    }

    return { ...stage, status: stageStatus, shadow: true };
  }));
}

export async function loadInspectorRuntime({
  runner = runUniOSRuntimeShadow,
  isDevelopment = false,
} = {}) {
  let observedResult = null;

  try {
    const outcome = await runner(INSPECTOR_RUNTIME_INPUT, {
      enabled: true,
      isDevelopment,
      observer(result) {
        observedResult = result;
      },
    });

    if (outcome?.status !== 'OBSERVED' || !observedResult) {
      return Object.freeze({ runtime: buildMockView(outcome?.status ?? 'unavailable'), status: 'failed' });
    }

    return Object.freeze({
      runtime: buildRuntimeView(observedResult, outcome.telemetry),
      status: 'completed',
    });
  } catch {
    return Object.freeze({ runtime: buildMockView('failed'), status: 'failed' });
  }
}

export function startInspectorAutoRefresh(callback, {
  intervalMs = AUTO_REFRESH_INTERVAL_MS,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  const intervalId = setIntervalFn(callback, intervalMs);
  return () => clearIntervalFn(intervalId);
}

export function useInspectorRuntime({
  runner = runUniOSRuntimeShadow,
  autoRefresh = import.meta.env.DEV,
} = {}) {
  const [state, setState] = useState(() => ({ runtime: buildMockView('loading'), status: 'idle' }));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(false);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (mountedRef.current) setIsRefreshing(true);

    const nextState = await loadInspectorRuntime({
      runner,
      isDevelopment: import.meta.env.DEV,
    });

    if (!mountedRef.current || requestRef.current !== requestId) return;
    setState(nextState);
    setIsRefreshing(false);
  }, [runner]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const stopAutoRefresh = autoRefresh ? startInspectorAutoRefresh(refresh) : null;

    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      stopAutoRefresh?.();
    };
  }, [autoRefresh, refresh]);

  const timelineStatus = isRefreshing ? 'running' : state.status;

  return {
    runtime: state.runtime,
    stages: buildInspectorStages({ runtime: state.runtime, status: timelineStatus }),
    displayTime: formatInspectorTime(state.runtime.timestamp),
    isMockRuntime: state.runtime.source === 'mock',
    isRefreshing,
    refresh,
  };
}

export { AUTO_REFRESH_INTERVAL_MS, REDACTED };
