import { createMockLLMAdapter } from '../adapters/mock/index.js';
import { buildConversationWindow } from '../conversation-window/index.js';
import { routeModel } from '../model-router/index.js';
import { buildStructuredPrompt } from '../prompt-builder/index.js';
import { validatePrompt } from '../prompt-validator/index.js';
import { buildTokenBudget } from '../token-budget/index.js';
import { createOfflinePipelineInput, deepFreeze } from './offlinePipelineSchema.js';

export class OfflinePipelineStageError extends Error {
  constructor(stage, code = 'STAGE_FAILED') {
    super('Offline cognitive pipeline stage failed.');
    this.name = 'OfflinePipelineStageError';
    this.stage = stage;
    this.code = code;
  }
}

function fingerprint(value) {
  return JSON.stringify(value);
}

async function executeStage(envelope, trace, name, key, executor) {
  const before = fingerprint(envelope);
  trace.push(name);
  const snapshot = await executor(envelope);
  if (fingerprint(envelope) !== before) {
    throw new OfflinePipelineStageError(name, 'PREVIOUS_SNAPSHOT_MODIFIED');
  }
  return deepFreeze({ ...envelope, [key]: snapshot });
}

function routerInput(envelope) {
  const source = envelope.input;
  return {
    compiledContext: source.compiledContext,
    requestedCapability: source.requestedCapability,
    routingPolicy: source.routingPolicy,
    capabilityRegistry: source.capabilityRegistry ?? undefined,
    providerRegistry: source.providerRegistry ?? undefined,
    routingPolicies: source.routingPolicies ?? undefined,
  };
}

async function invokeMockAdapter(envelope, options = {}) {
  const adapter = createMockLLMAdapter(options.mockAdapterOptions);
  try {
    await adapter.initialize();
    const request = adapter.buildRequest({
      capability: envelope.routing.routingResult.resolvedCapability,
      compiledContext: envelope.input.compiledContext,
      routingResult: envelope.routing,
      request: {
        structuredPrompt: envelope.structuredPrompt,
        validationReport: envelope.validationReport,
      },
      latencyProfile: envelope.input.latencyProfile,
    });
    const response = await adapter.invoke(request);
    const validation = adapter.validateResponse(response);
    if (!validation.valid) {
      throw new OfflinePipelineStageError('LLM_ADAPTER_MOCK', 'INVALID_MOCK_RESPONSE');
    }
    return response;
  } finally {
    await adapter.dispose();
  }
}

export async function executeOfflinePipelineStages(input = {}, options = {}) {
  const trace = [];
  let envelope = deepFreeze({ input: createOfflinePipelineInput(input) });

  envelope = await executeStage(envelope, trace, 'MODEL_ROUTER', 'routing', (current) => (
    routeModel(routerInput(current))
  ));
  envelope = await executeStage(
    envelope,
    trace,
    'CONVERSATION_WINDOW',
    'conversationWindow',
    (current) => buildConversationWindow({
      compiledContext: current.input.compiledContext,
      routingResult: current.routing,
    }),
  );
  envelope = await executeStage(envelope, trace, 'TOKEN_BUDGET', 'tokenBudget', (current) => (
    buildTokenBudget({
      conversationWindow: current.conversationWindow,
      routingResult: current.routing,
    })
  ));
  envelope = await executeStage(
    envelope,
    trace,
    'PROMPT_BUILDER',
    'structuredPrompt',
    (current) => buildStructuredPrompt({
      conversationWindow: current.conversationWindow,
      tokenBudget: current.tokenBudget,
      routingResult: current.routing,
      compiledContext: current.input.compiledContext,
    }),
  );
  envelope = await executeStage(
    envelope,
    trace,
    'PROMPT_VALIDATOR',
    'validationReport',
    (current) => validatePrompt({
      structuredPrompt: current.structuredPrompt,
      routingResult: current.routing,
      tokenBudget: current.tokenBudget,
    }),
  );

  if (envelope.validationReport.validationReport.approved === true) {
    envelope = await executeStage(
      envelope,
      trace,
      'LLM_ADAPTER_MOCK',
      'mockResponse',
      (current) => invokeMockAdapter(current, options),
    );
  } else {
    envelope = deepFreeze({ ...envelope, mockResponse: null });
  }

  return Object.freeze({ envelope, trace: Object.freeze([...trace]) });
}
