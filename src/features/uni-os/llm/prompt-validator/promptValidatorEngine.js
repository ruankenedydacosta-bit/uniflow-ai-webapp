import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { auditStructuredPrompt } from './promptAudit.js';
import { createPromptValidationReport } from './promptValidationReport.js';

export function validatePrompt(input = {}) {
  return createPromptValidationReport(auditStructuredPrompt(input));
}

export function logPromptValidationSummary(logger, report) {
  const statistics = report.validationReport.statistics;
  logger.info?.('[UNI OS] Prompt Validated', {
    validationStatus: report.validationReport.status,
    warnings: statistics.byLevel.WARNING,
    errors: statistics.byLevel.ERROR + statistics.byLevel.BLOCKING,
    approved: report.validationReport.approved,
  });
}

export async function runPromptValidatorShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', validationReport: null });

  try {
    const report = validatePrompt(input);
    if (typeof options.observer === 'function') await options.observer(report);
    if (options.isDevelopment === true) {
      logPromptValidationSummary(options.logger ?? console, report);
    }
    return Object.freeze({ status: 'OBSERVED', validationReport: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Prompt Validator failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', validationReport: null });
  }
}

export const promptValidatorEngine = Object.freeze({ validate: validatePrompt });
