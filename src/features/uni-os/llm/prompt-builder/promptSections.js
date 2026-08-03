import { PROMPT_POLICY_METADATA, SYSTEM_DIRECTIVES } from './promptPolicy.js';

function record(value) {
  return value && !Array.isArray(value) && typeof value === 'object' ? value : {};
}

function collection(value) {
  return Array.isArray(value) ? value : [];
}

export function resolvePromptInputs(input = {}) {
  const source = record(input);
  const windowSnapshot = record(source.conversationWindow);
  const budgetSnapshot = record(source.tokenBudget);
  const routingSnapshot = record(source.routingResult);
  const contextSnapshot = record(source.compiledContext);

  return {
    window: record(windowSnapshot.conversationWindow ?? windowSnapshot),
    budget: record(budgetSnapshot.tokenBudget ?? budgetSnapshot),
    routing: record(routingSnapshot.routingResult ?? routingSnapshot),
    compiled: record(contextSnapshot.compiledContext ?? contextSnapshot),
    versions: {
      conversationWindow: windowSnapshot.metadata?.version
        ?? windowSnapshot.conversationWindow?.metadata?.version
        ?? null,
      tokenBudget: budgetSnapshot.version ?? budgetSnapshot.tokenBudget?.metadata?.version ?? null,
      routing: routingSnapshot.version ?? null,
      compiledContext: contextSnapshot.metadata?.version ?? null,
    },
  };
}

export function buildPromptSectionContent(input = {}) {
  const { window, budget, routing, compiled, versions } = resolvePromptInputs(input);
  return {
    SYSTEM: {
      identity: 'UNI_OS',
      policy: PROMPT_POLICY_METADATA.id,
      directives: SYSTEM_DIRECTIVES,
    },
    CONTEXT: collection(window.context),
    GOALS: collection(window.goals),
    MEMORY: collection(window.memory),
    INSIGHTS: collection(window.insights),
    CONVERSATION: collection(window.messages),
    REFLECTION: record(window.reflection),
    SECURITY: record(window.security),
    PERMISSIONS: record(window.permissions),
    REQUEST: {
      conversation: record(compiled.conversation),
      capability: routing.resolvedCapability ?? routing.requestedCapability ?? null,
      requirements: {
        structuredContext: routing.requiresStructuredContext === true,
        streaming: routing.requiresStreaming === true,
        vision: routing.requiresVision === true,
        voice: routing.requiresVoice === true,
      },
    },
    METADATA: {
      versions,
      routingPolicy: routing.routingPolicy ?? null,
      selectedProvider: routing.selectedProvider ?? null,
      windowPolicy: window.metadata?.policy ?? null,
      budgetPolicy: budget.metadata?.policy ?? null,
    },
  };
}
