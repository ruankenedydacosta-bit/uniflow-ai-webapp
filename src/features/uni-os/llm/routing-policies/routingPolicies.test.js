import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { capabilityRegistry, findCapability } from '../capability-registry/index.js';
import { providerRegistry } from '../provider-registry/index.js';
import {
  ROUTING_POLICY_CATALOG,
  ROUTING_POLICY_IDS,
  RoutingPolicyValidationError,
  createRoutingPolicySchema,
  evaluateRoutingPolicy,
  findRoutingPolicy,
  runRoutingPoliciesShadow,
  validateRoutingDecision,
  validateRoutingInput,
  validateRoutingPolicyCatalog,
} from './index.js';

function input(policy = 'DEFAULT', capabilityId = 'GENERAL_REASONING', metadata = {}) {
  return {
    policy,
    capability: findCapability(capabilityRegistry, capabilityId),
    providerRegistry,
    compiledContextMetadata: metadata,
  };
}

test('catálogo registra as quatorze policies oficiais', () => {
  assert.equal(ROUTING_POLICY_CATALOG.length, 14);
  assert.deepEqual(ROUTING_POLICY_CATALOG.map((policy) => policy.id), ROUTING_POLICY_IDS);
  assert.equal(Object.isFrozen(ROUTING_POLICY_CATALOG), true);
  assert.equal(ROUTING_POLICY_CATALOG.every(Object.isFrozen), true);
});

test('todas as policies produzem decisão estruturada sem seleção final', () => {
  ROUTING_POLICY_IDS.forEach((policy) => {
    const metadata = policy === 'PREMIUM_ONLY'
      ? { accessTier: 'PREMIUM' }
      : policy === 'ENTERPRISE_ONLY' ? { accessTier: 'ENTERPRISE' } : {};
    const snapshot = evaluateRoutingPolicy(input(policy, 'CONVERSATION', metadata));
    assert.equal(snapshot.routingDecision.policy, policy);
    assert.equal(snapshot.routingDecision.metadata.selectedProvider, null);
    assert.equal(snapshot.routingDecision.metadata.finalSelectionPerformed, false);
    assert.equal(snapshot.metadata.finalProviderSelected, false);
  });
});

test('DEFAULT usa prioridade declarada sem escolher vencedor', () => {
  const decision = evaluateRoutingPolicy(input()).routingDecision;
  assert.equal(decision.priorityOrder[0], 'OPENAI');
  assert.equal(decision.allowedProviders.includes('CUSTOM'), false);
  assert.equal(decision.blockedProviders.includes('CUSTOM'), true);
});

test('LOW_COST ordena custos baixos antes dos demais', () => {
  const decision = evaluateRoutingPolicy(input('LOW_COST')).routingDecision;
  assert.equal(decision.priorityOrder[0], 'MISTRAL');
  assert.equal(decision.metadata.orderStrategy, 'COST');
});

test('LOW_LATENCY ordena latência baixa antes dos demais', () => {
  const decision = evaluateRoutingPolicy(input('LOW_LATENCY', 'CONVERSATION')).routingDecision;
  const first = decision.priorityOrder[0];
  assert.equal(['OPENAI', 'CLAUDE', 'GEMINI', 'MISTRAL', 'QWEN'].includes(first), true);
  assert.equal(decision.metadata.orderStrategy, 'LATENCY');
});

test('HIGH_QUALITY preserva a prioridade catalogal', () => {
  const decision = evaluateRoutingPolicy(input('HIGH_QUALITY')).routingDecision;
  assert.equal(decision.priorityOrder[0], 'OPENAI');
  assert.equal(decision.metadata.orderStrategy, 'PRIORITY');
});

test('VISION_REQUIRED mantém somente providers com visão', () => {
  const decision = evaluateRoutingPolicy(input('VISION_REQUIRED', 'VISION')).routingDecision;
  assert.equal(decision.requiresVision, true);
  assert.equal(decision.allowedProviders.length > 0, true);
  assert.equal(decision.allowedProviders.every((id) => (
    providerRegistry.providers.find((provider) => provider.id === id).supportsVision
  )), true);
});

test('VOICE_REQUIRED mantém somente providers com voz', () => {
  const decision = evaluateRoutingPolicy(input('VOICE_REQUIRED', 'VOICE')).routingDecision;
  assert.equal(decision.requiresVoice, true);
  assert.deepEqual(decision.allowedProviders, ['OPENAI', 'GEMINI']);
});

test('STRUCTURED_OUTPUT exige suporte declarado', () => {
  const decision = evaluateRoutingPolicy(input('STRUCTURED_OUTPUT')).routingDecision;
  assert.equal(decision.metadata.structuredOutputRequired, true);
  assert.equal(decision.allowedProviders.every((id) => (
    providerRegistry.providers.find((provider) => provider.id === id).supportsStructuredOutput
  )), true);
});

test('FUNCTION_CALLING exige suporte declarado', () => {
  const decision = evaluateRoutingPolicy(input('FUNCTION_CALLING')).routingDecision;
  assert.equal(decision.metadata.functionCallingRequired, true);
  assert.equal(decision.allowedProviders.every((id) => (
    providerRegistry.providers.find((provider) => provider.id === id).supportsFunctionCalling
  )), true);
});

test('OFFLINE_ONLY e LOCAL_ONLY não tornam provider desabilitado elegível', () => {
  assert.deepEqual(evaluateRoutingPolicy(input('OFFLINE_ONLY')).routingDecision.allowedProviders, []);
  assert.deepEqual(evaluateRoutingPolicy(input('LOCAL_ONLY')).routingDecision.allowedProviders, []);
});

test('PREMIUM_ONLY exige tier explícito e aceita enterprise', () => {
  const denied = evaluateRoutingPolicy(input('PREMIUM_ONLY')).routingDecision;
  const allowed = evaluateRoutingPolicy(input('PREMIUM_ONLY', 'GENERAL_REASONING', {
    accessTier: 'ENTERPRISE',
  })).routingDecision;
  assert.equal(denied.allowedProviders.length, 0);
  assert.equal(denied.metadata.accessSatisfied, false);
  assert.equal(allowed.allowedProviders.length > 0, true);
});

test('ENTERPRISE_ONLY não infere acesso sem metadata', () => {
  const denied = evaluateRoutingPolicy(input('ENTERPRISE_ONLY', 'GENERAL_REASONING', {
    accessTier: 'PREMIUM',
  })).routingDecision;
  const allowed = evaluateRoutingPolicy(input('ENTERPRISE_ONLY', 'GENERAL_REASONING', {
    accessTier: 'ENTERPRISE',
  })).routingDecision;
  assert.equal(denied.allowedProviders.length, 0);
  assert.equal(allowed.allowedProviders.length > 0, true);
});

test('FALLBACK_ALLOWED habilita fallback e usa sua prioridade', () => {
  const decision = evaluateRoutingPolicy(input('FALLBACK_ALLOWED')).routingDecision;
  assert.equal(decision.fallbackEnabled, true);
  assert.equal(decision.metadata.orderStrategy, 'FALLBACK');
  assert.equal(decision.priorityOrder[0], 'OPENAI');
});

test('SAFE_MODE aceita somente provider disponível e saudável', () => {
  const providers = providerRegistry.providers.map((provider) => ({
    ...provider,
    supportedCapabilities: [...provider.supportedCapabilities],
    metadata: { ...provider.metadata },
    status: provider.id === 'OPENAI' ? 'AVAILABLE' : provider.status,
    healthStatus: provider.id === 'OPENAI' ? 'HEALTHY' : provider.healthStatus,
  }));
  const registry = { ...providerRegistry, providers };
  const decision = evaluateRoutingPolicy({ ...input('SAFE_MODE'), providerRegistry: registry })
    .routingDecision;
  assert.deepEqual(decision.allowedProviders, ['OPENAI']);
});

test('requirements do contexto filtram streaming sem expor contexto', () => {
  const decision = evaluateRoutingPolicy(input('DEFAULT', 'GENERAL_REASONING', {
    requiresStreaming: true,
    privateValue: 'must-not-appear',
  })).routingDecision;
  assert.equal(decision.requiresStreaming, true);
  assert.equal(JSON.stringify(decision).includes('must-not-appear'), false);
});

test('capability incompatível resulta em provider bloqueado', () => {
  const decision = evaluateRoutingPolicy(input('DEFAULT', 'VISION')).routingDecision;
  assert.equal(decision.allowedProviders.includes('DEEPSEEK'), false);
  assert.equal(decision.blockedProviders.includes('DEEPSEEK'), true);
});

test('validator rejeita policy, provider e capability inválidos', () => {
  assert.equal(validateRoutingInput({}).valid, false);
  assert.throws(
    () => evaluateRoutingPolicy({}),
    (error) => error instanceof RoutingPolicyValidationError
      && error.codes.includes('INVALID_CAPABILITY'),
  );
  const invalidRegistry = {
    providers: [{ ...providerRegistry.providers[0], id: 'UNKNOWN' }],
  };
  const validation = validateRoutingInput({
    capability: findCapability(capabilityRegistry, 'GENERAL_REASONING'),
    providerRegistry: invalidRegistry,
    policy: findRoutingPolicy('DEFAULT'),
  });
  assert.equal(validation.errors.includes('UNKNOWN_PROVIDER'), true);
});

test('validator rejeita catálogo de policies duplicado', () => {
  const validation = validateRoutingPolicyCatalog([
    ROUTING_POLICY_CATALOG[0], ROUTING_POLICY_CATALOG[0],
  ]);
  assert.equal(validation.errors.includes('DUPLICATE_ROUTING_POLICY:DEFAULT'), true);
});

test('validator detecta provider incompatível em decisão adulterada', () => {
  const snapshot = createRoutingPolicySchema({
    policy: 'DEFAULT',
    allowedProviders: ['DEEPSEEK'],
    blockedProviders: providerRegistry.providers.filter((item) => item.id !== 'DEEPSEEK')
      .map((item) => item.id),
    priorityOrder: ['DEEPSEEK'],
  });
  const validation = validateRoutingDecision(snapshot, {
    capability: findCapability(capabilityRegistry, 'VISION'), providerRegistry,
  });
  assert.equal(validation.errors.includes('INCOMPATIBLE_PROVIDER_CAPABILITY'), true);
});

test('schema aplica deep clone e deep freeze sem congelar fonte', () => {
  const source = {
    policy: 'DEFAULT', allowedProviders: ['OPENAI'], blockedProviders: [],
    priorityOrder: ['OPENAI'], metadata: { nested: { value: true } },
  };
  const snapshot = createRoutingPolicySchema(source);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.routingDecision), true);
  assert.equal(Object.isFrozen(snapshot.routingDecision.allowedProviders), true);
  assert.equal(Object.isFrozen(snapshot.routingDecision.metadata.nested), true);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(source.metadata), false);
});

test('objetos vazios falham de forma controlada no modo sombra', async () => {
  const result = await runRoutingPoliciesShadow({}, { enabled: true });
  assert.deepEqual(result, { status: 'FAILED_SAFE', routingDecision: null });
});

test('feature flag compartilhada mantém engine inativo', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runRoutingPoliciesShadow(input()), {
    status: 'DISABLED', routingDecision: null,
  });
});

test('modo sombra observa decisão e descarta resultado', async () => {
  let observed;
  const result = await runRoutingPoliciesShadow(input(), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
  });
  assert.equal(observed.routingDecision.policy, 'DEFAULT');
  assert.deepEqual(result, { status: 'OBSERVED', routingDecision: null });
});

test('log DEV contém somente policy, contagem e fallback', async () => {
  const logs = [];
  await runRoutingPoliciesShadow(input(), {
    enabled: true,
    isDevelopment: true,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /Routing Policy Loaded/);
  assert.match(serialized, /policySelected|allowedProvidersCount|fallbackEnabled/);
  assert.doesNotMatch(serialized, /user|email|context|description/i);
});

test('engine não contém integração externa ou seleção final', async () => {
  const files = [
    'routingPolicyCatalog.js', 'routingPolicyEngine.js', 'routingPolicySchema.js',
    'routingPolicyValidator.js', 'routingDecision.js',
  ];
  const source = (await Promise.all(
    files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
  )).join('\n');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//);
  assert.doesNotMatch(source, /apiKey|secret|authorization|bearer|endpoint/i);
  assert.doesNotMatch(source, /invokeModel|selectModel|executeProvider/i);
});

