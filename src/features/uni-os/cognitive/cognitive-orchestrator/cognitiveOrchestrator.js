import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  executeOrchestratorPipeline,
  OrchestratorPipelineError,
} from './orchestratorPipeline.js';
import { createOrchestratorSnapshot } from './orchestratorSchema.js';
import { validateCognitiveOrchestration } from './orchestratorValidator.js';

export function processCognitiveContext(input = {}, options = {}) {
  const startedAt = options.clock?.() ?? Date.now();
  try {
    const pipeline = executeOrchestratorPipeline(input, options);
    return createOrchestratorSnapshot({
      status: 'COMPLETED',
      snapshots: pipeline.snapshots,
      trace: pipeline.trace,
      generatedAt: options.now,
      durationMs: (options.clock?.() ?? Date.now()) - startedAt,
    });
  } catch (error) {
    const structured = error instanceof OrchestratorPipelineError
      ? error
      : new OrchestratorPipelineError('MODULE_FAILURE', null);
    return createOrchestratorSnapshot({
      status: 'FAILED',
      snapshots: structured.snapshots ?? {},
      trace: structured.trace ?? [],
      error: structured,
      generatedAt: options.now,
      durationMs: (options.clock?.() ?? Date.now()) - startedAt,
    });
  }
}

export function logCognitiveOrchestrationSummary(logger, result) {
  logger.info?.('[UNI OS] Cognitive Orchestrator', {
    status: result.status,
    modulesExecuted: result.metrics.modulesExecuted,
    validationErrors: result.metrics.validationErrors,
    durationMs: result.metrics.durationMs,
    shadowMode: result.metadata.shadowMode,
  });
}

export async function runCognitiveOrchestratorShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', orchestration: null });
  try {
    const result = processCognitiveContext(input, options.orchestratorOptions);
    const validation = validateCognitiveOrchestration(result);
    if (!validation.valid) return Object.freeze({ status: 'FAILED_SAFE', orchestration: null });
    if (typeof options.observer === 'function') await options.observer(result);
    if (options.isDevelopment === true) {
      logCognitiveOrchestrationSummary(options.logger ?? console, result);
    }
    return Object.freeze({
      status: result.status === 'COMPLETED' ? 'OBSERVED' : 'FAILED_SAFE',
      orchestration: null,
    });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Cognitive Orchestrator failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', orchestration: null });
  }
}

export const cognitiveOrchestrator = Object.freeze({ process: processCognitiveContext });
