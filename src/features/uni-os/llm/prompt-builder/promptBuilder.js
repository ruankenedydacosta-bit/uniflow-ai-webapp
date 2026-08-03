import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { assemblePromptSections } from './promptAssembler.js';
import { PROMPT_POLICY_METADATA } from './promptPolicy.js';
import { createStructuredPromptSchema } from './promptSchema.js';
import { buildPromptSectionContent, resolvePromptInputs } from './promptSections.js';
import { validateStructuredPrompt } from './promptValidator.js';

export class StructuredPromptValidationError extends Error {
  constructor(errors) {
    super('Structured prompt validation failed.');
    this.name = 'StructuredPromptValidationError';
    this.codes = Object.freeze([...errors]);
  }
}

function buildRoutingSummary(routing = {}) {
  return {
    requestedCapability: routing.requestedCapability ?? null,
    resolvedCapability: routing.resolvedCapability ?? null,
    selectedProvider: routing.selectedProvider ?? null,
    routingPolicy: routing.routingPolicy ?? null,
    decisionReason: routing.decisionReason ?? null,
    requiresStructuredContext: routing.requiresStructuredContext === true,
    requiresStreaming: routing.requiresStreaming === true,
    requiresVision: routing.requiresVision === true,
    requiresVoice: routing.requiresVoice === true,
    representationalOnly: true,
  };
}

export function buildStructuredPrompt(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const resolved = resolvePromptInputs(source);
  const sections = assemblePromptSections(buildPromptSectionContent(source), resolved.budget);
  const snapshot = createStructuredPromptSchema({
    sections,
    estimatedCost: resolved.routing.estimatedCost,
    allocatedBudget: resolved.budget.allocatedBudget,
    routing: buildRoutingSummary(resolved.routing),
    policy: PROMPT_POLICY_METADATA.id,
  });
  const validation = validateStructuredPrompt(snapshot);
  if (!validation.valid) throw new StructuredPromptValidationError(validation.errors);
  return snapshot;
}

export function logStructuredPromptSummary(logger, snapshot) {
  logger.info?.('[UNI OS] Prompt Built', {
    sectionsCount: snapshot.structuredPrompt.statistics.sectionsCount,
    estimatedTokens: snapshot.structuredPrompt.estimatedTokens,
    estimatedCost: snapshot.structuredPrompt.estimatedCost,
    capability: snapshot.structuredPrompt.routing.resolvedCapability,
    provider: snapshot.structuredPrompt.routing.selectedProvider,
  });
}

export async function runPromptBuilderShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', structuredPrompt: null });

  try {
    const snapshot = buildStructuredPrompt(input);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (options.isDevelopment === true) {
      logStructuredPromptSummary(options.logger ?? console, snapshot);
    }
    return Object.freeze({ status: 'OBSERVED', structuredPrompt: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Prompt Builder failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', structuredPrompt: null });
  }
}

export const promptBuilder = Object.freeze({ build: buildStructuredPrompt });
