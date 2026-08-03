import {
  adaptCognitiveInput,
  adaptContextSources,
  adaptMemorySources,
  adaptPermissionsInput,
  adaptPlanningInput,
  adaptReflectionInput,
  adaptSecurityInput,
  adaptStructuredResponse,
  composeCommunication,
} from '../adapters/index.js';
import { createRuntimeInputs } from './runtimeSchema.js';

export const DEFAULT_RUNTIME_ADAPTERS = Object.freeze({
  context: adaptContextSources,
  memory: adaptMemorySources,
  planning: adaptPlanningInput,
  reflection: adaptReflectionInput,
  security: adaptSecurityInput,
  permissions: adaptPermissionsInput,
  cognitive: adaptCognitiveInput,
  structuredResponse: adaptStructuredResponse,
  communication: composeCommunication,
});

function adapterOptions(options, name) {
  return {
    now: options.now,
    ...options.adapterOptions?.[name],
  };
}

async function execute(trace, name, adapter, input, options) {
  if (typeof adapter !== 'function') throw new Error(`Runtime adapter unavailable: ${name}`);
  trace.push(name);
  return adapter(input, options);
}

export async function executeRuntimePipeline(input = {}, options = {}) {
  const safeInput = createRuntimeInputs(input);
  const parsedIntent = safeInput.parsedIntent;
  const runtimeContext = safeInput.runtimeContext;
  const adapters = { ...DEFAULT_RUNTIME_ADAPTERS, ...options.adapters };
  const trace = Array.isArray(options.executionTrace) ? options.executionTrace : [];
  const contextSources = runtimeContext.contextSources ?? runtimeContext;
  const context = await execute(trace, 'context', adapters.context, {
    ...contextSources,
    featureFlags: { ...contextSources.featureFlags, uniOS: true },
  }, adapterOptions(options, 'context'));
  const suppliedMemory = runtimeContext.memorySources ?? {};
  const memory = await execute(trace, 'memory', adapters.memory, {
    ...suppliedMemory,
    workspaceId: suppliedMemory.workspaceId ?? context.workspace?.id ?? null,
  }, adapterOptions(options, 'memory'));
  const planning = await execute(trace, 'planning', adapters.planning, {
    parsedIntent, contextSnapshot: context, memorySnapshot: memory,
  }, adapterOptions(options, 'planning'));
  const reflection = await execute(trace, 'reflection', adapters.reflection, {
    parsedIntent, contextSnapshot: context, memorySnapshot: memory, planningSnapshot: planning,
  }, adapterOptions(options, 'reflection'));
  const security = await execute(trace, 'security', adapters.security, {
    parsedIntent, contextSnapshot: context, memorySnapshot: memory,
    planningSnapshot: planning, reflectionSnapshot: reflection,
  }, adapterOptions(options, 'security'));
  const permissions = await execute(trace, 'permissions', adapters.permissions, {
    parsedIntent, contextSnapshot: context, memorySnapshot: memory,
    planningSnapshot: planning, reflectionSnapshot: reflection, securitySnapshot: security,
  }, adapterOptions(options, 'permissions'));
  const cognition = await execute(trace, 'cognitive', adapters.cognitive, {
    parsedIntent, contextSnapshot: context, memorySnapshot: memory, planningSnapshot: planning,
    reflectionSnapshot: reflection, securitySnapshot: security, permissionsSnapshot: permissions,
  }, adapterOptions(options, 'cognitive'));
  const structuredResponse = await execute(
    trace,
    'structured_response',
    adapters.structuredResponse,
    {
      parsedIntent, contextSnapshot: context, memorySnapshot: memory, planningSnapshot: planning,
      reflectionSnapshot: reflection, securitySnapshot: security,
      permissionsSnapshot: permissions, cognitiveSnapshot: cognition,
    },
    adapterOptions(options, 'structuredResponse'),
  );
  const communication = await execute(trace, 'communication', adapters.communication, {
    structuredResponse, contextSnapshot: context, memorySnapshot: memory,
  }, adapterOptions(options, 'communication'));

  return {
    parsedIntent, context, memory, planning, reflection, security,
    permissions, cognition, structuredResponse, communication,
  };
}
