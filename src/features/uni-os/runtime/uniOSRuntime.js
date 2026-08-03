import { UNI_OS_ENABLED } from '../adapters/featureFlags.js';
import { validateRuntimeInvariants } from './runtimeInvariants.js';
import { executeRuntimePipeline } from './runtimePipeline.js';
import { createRuntimeResult } from './runtimeSchema.js';
import {
  createRuntimeTelemetry,
  logPipelineFinished,
  logPipelineStarted,
} from './runtimeTelemetry.js';

function defaultIdFactory() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `uni-runtime-${Date.now().toString(36)}`;
}

function defaultClock() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function notifyTelemetry(observer, telemetry) {
  try {
    observer?.(telemetry);
  } catch {
    // Telemetry can never interrupt the shadow pipeline.
  }
}

export function createUniOSRuntime() {
  return Object.freeze({
    async process(input = {}, options = {}) {
      const enabled = options.enabled ?? UNI_OS_ENABLED;
      if (!enabled) return null;

      const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
      const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultIdFactory;
      const clock = typeof options.clock === 'function' ? options.clock : defaultClock;
      const logger = options.logger ?? console;
      const trace = [];
      const startedAt = clock();
      if (options.isDevelopment === true) logPipelineStarted(logger);

      try {
        const snapshots = await executeRuntimePipeline(input, {
          adapters: options.adapters,
          adapterOptions: options.adapterOptions,
          executionTrace: trace,
          now,
        });
        const invariants = validateRuntimeInvariants(snapshots, trace);
        const telemetry = createRuntimeTelemetry({
          startedAt,
          finishedAt: clock(),
          adaptersExecuted: trace,
          validationErrors: invariants.errors,
        });
        notifyTelemetry(options.onTelemetry, telemetry);
        if (!invariants.valid) {
          if (options.isDevelopment === true) logPipelineFinished(logger, telemetry, false);
          return null;
        }
        const result = createRuntimeResult({
          runtimeId: idFactory(),
          timestamp: now(),
          ...snapshots,
          completed: true,
          telemetry,
        });
        if (options.isDevelopment === true) logPipelineFinished(logger, telemetry, true);
        return result;
      } catch {
        const telemetry = createRuntimeTelemetry({
          startedAt,
          finishedAt: clock(),
          adaptersExecuted: trace,
          validationErrors: ['PIPELINE_FAILURE'],
        });
        notifyTelemetry(options.onTelemetry, telemetry);
        if (options.isDevelopment === true) logPipelineFinished(logger, telemetry, false);
        return null;
      }
    },
  });
}

export const uniOSRuntime = createUniOSRuntime();

export async function runUniOSRuntimeShadow(input, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', result: null, telemetry: null });
  let telemetry = null;
  const result = await uniOSRuntime.process(input, {
    ...options,
    enabled: true,
    onTelemetry: (value) => {
      telemetry = value;
      options.onTelemetry?.(value);
    },
  });
  if (!result) return Object.freeze({ status: 'FAILED_SAFE', result: null, telemetry });
  try {
    if (typeof options.observer === 'function') await options.observer(result);
  } catch {
    return Object.freeze({ status: 'FAILED_SAFE', result: null, telemetry });
  }
  return Object.freeze({ status: 'OBSERVED', result: null, telemetry });
}
