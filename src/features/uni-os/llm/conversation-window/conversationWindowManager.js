import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { resolvePolicyFromRoutingResult } from './windowPolicy.js';
import { createConversationWindowSchema } from './windowSchema.js';
import { selectConversationWindow } from './windowSelector.js';
import { validateConversationWindow } from './windowValidator.js';

export class ConversationWindowValidationError extends Error {
  constructor(errors) {
    super('Conversation window validation failed.');
    this.name = 'ConversationWindowValidationError';
    this.codes = Object.freeze([...errors]);
  }
}

export function buildConversationWindow(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const policy = resolvePolicyFromRoutingResult(source.routingResult);
  const selection = selectConversationWindow(source.compiledContext, policy.limits);
  const snapshot = createConversationWindowSchema({
    ...selection,
    policy: policy.id,
    limits: policy.limits,
  });
  const validation = validateConversationWindow(snapshot);
  if (!validation.valid) throw new ConversationWindowValidationError(validation.errors);
  return snapshot;
}

export function logConversationWindowSummary(logger, snapshot) {
  logger.info?.('[UNI OS] Conversation Window Built', {
    messagesSelected: snapshot.statistics.selected.messages,
    goalsSelected: snapshot.statistics.selected.goals,
    memorySelected: snapshot.statistics.selected.memory,
    windowPolicy: snapshot.conversationWindow.metadata.policy,
  });
}

export async function runConversationWindowShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', conversationWindow: null });

  try {
    const snapshot = buildConversationWindow(input);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (options.isDevelopment === true) {
      logConversationWindowSummary(options.logger ?? console, snapshot);
    }
    return Object.freeze({ status: 'OBSERVED', conversationWindow: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Conversation Window failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', conversationWindow: null });
  }
}

export const conversationWindowManager = Object.freeze({ build: buildConversationWindow });
