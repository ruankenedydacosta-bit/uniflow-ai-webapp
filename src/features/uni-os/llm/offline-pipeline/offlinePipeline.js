import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { executeOfflinePipelineStages } from './offlinePipelineRunner.js';
import { createOfflinePipelineResult } from './offlinePipelineSchema.js';
import {
  createOfflinePipelineTelemetry,
  logOfflinePipelineFinished,
  logOfflinePipelineStarted,
} from './offlinePipelineTelemetry.js';
import { validateOfflinePipelineResult } from './offlinePipelineValidator.js';

export class OfflinePipelineValidationError extends Error {
  constructor(errors) {
    super('Offline cognitive pipeline validation failed.');
    this.name = 'OfflinePipelineValidationError';
    this.codes = Object.freeze([...errors]);
  }
}

function clock(options) {
  return typeof options.now === 'function' ? options.now : () => performance.now();
}

export async function executeOfflinePipeline(input = {}, options = {}) {
  const now = clock(options);
  const startedAt = now();
  const logger = options.logger ?? console;
  if (options.isDevelopment === true) logOfflinePipelineStarted(logger);

  const stages = await executeOfflinePipelineStages(input, options);
  const finishedAt = now();
  const validationStatus = stages.envelope.validationReport.validationReport.status;
  const telemetry = createOfflinePipelineTelemetry({
    startedAt,
    finishedAt,
    executedModules: stages.trace,
    validationStatus,
    mockExecuted: stages.envelope.mockResponse !== null,
  });
  const snapshot = createOfflinePipelineResult({ ...stages.envelope, telemetry });
  const validation = validateOfflinePipelineResult(snapshot);
  if (!validation.valid) throw new OfflinePipelineValidationError(validation.errors);
  if (options.isDevelopment === true) logOfflinePipelineFinished(logger, telemetry);
  return snapshot;
}

export async function runOfflinePipelineShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) {
    return Object.freeze({ status: 'DISABLED', offlinePipelineResult: null });
  }

  try {
    const snapshot = await executeOfflinePipeline(input, options);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    return Object.freeze({ status: 'OBSERVED', offlinePipelineResult: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Offline Pipeline failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', offlinePipelineResult: null });
  }
}

export const offlinePipeline = Object.freeze({ process: executeOfflinePipeline });
