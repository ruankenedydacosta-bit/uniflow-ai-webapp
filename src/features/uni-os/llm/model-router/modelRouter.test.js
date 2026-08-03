import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { capabilityRegistry } from '../capability-registry/index.js';
import { providerRegistry } from '../provider-registry/index.js';
import { ROUTING_POLICY_CATALOG } from '../routing-policies/index.js';
import {
  RoutingResolverError,
  compareRoutingCandidates,
  createModelRoutingSchema,
  routeModel,
  runModelRouterShadow,
  scoreRoutingCandidates,
} from './index.js';

function routerInput(overrides = {}) {
  return {
    compiledContext: { metadata: {} },
    requestedCapability: 'GENERAL_REASONING',
    capabilityRegistry,
    providerRegistry,
    routingPolicies: ROUTING_POLICY_CATALOG,
    routingPolicy: 'DEFAULT',
    ...overrides,
  };
}

function registryWith(...providers) {
  return { ...providerRegistry, providers };
}

function providerCopy(providerId, overrides = {}) {
  const provider = providerRegistry.providers.find((item) => item.id === providerId);
  return {
    ...provider,
    supportedCapabilities: [...provider.supportedCapabilities],
    metadata: { ...provider.metadata },
    ...overrides,
  };
}

test('capability válida produz seleção exclusivamente representacional', () => {
  const snapshot = routeModel(routerInput());
  const result = snapshot.routingResult;
  assert.equal(result.requestedCapability, 'GENERAL_REASONING');
  assert.equal(result.resolvedCapability, 'GENERAL_REASONING');
  assert.equal(result.selectedProvider, 'OPENAI');
  assert.equal(result.decisionReason, 'ROUTING_POLICY_APPLIED');
  assert.equal(result.metadata.providerInvoked, false);
  assert.equal(snapshot.metadata.modelExecuted, false);
});

test('capability inexistente retorna decisão segura sem candidates', () => {
  const result = routeModel(routerInput({ requestedCapability: 'UNKNOWN' })).routingResult;
  assert.equal(result.resolvedCapability, null);
  assert.deepEqual(result.candidateProviders, []);
  assert.equal(result.selectedProvider, null);
  assert.equal(result.decisionReason, 'CAPABILITY_NOT_REGISTERED');
  assert.equal(result.confidence, 0);
});

test('objetos vazios usam defaults e não executam nada', () => {
  const snapshot = routeModel({});
  assert.equal(snapshot.routingResult.requestedCapability, null);
  assert.equal(snapshot.routingResult.selectedProvider, null);
  assert.equal(snapshot.metadata.providerExecuted, false);
  assert.equal(snapshot.metadata.tokensConsumed, false);
});

test('registry sem providers retorna NO_ELIGIBLE_PROVIDERS', () => {
  const result = routeModel(routerInput({
    providerRegistry: registryWith(),
  })).routingResult;
  assert.deepEqual(result.candidateProviders, []);
  assert.equal(result.selectedProvider, null);
  assert.equal(result.decisionReason, 'NO_ELIGIBLE_PROVIDERS');
});

test('provider indisponível nunca participa', () => {
  const openai = providerCopy('OPENAI', { status: 'UNAVAILABLE' });
  const result = routeModel(routerInput({
    providerRegistry: registryWith(openai),
  })).routingResult;
  assert.equal(result.selectedProvider, null);
  assert.deepEqual(result.candidateProviders, []);
});

test('provider offline é removido após aplicação da policy', () => {
  const openai = providerCopy('OPENAI', { status: 'AVAILABLE', healthStatus: 'OFFLINE' });
  const result = routeModel(routerInput({
    providerRegistry: registryWith(openai),
  })).routingResult;
  assert.equal(result.selectedProvider, null);
  assert.deepEqual(result.candidateProviders, []);
});

test('provider degradado permanece representável com confiança reduzida', () => {
  const openai = providerCopy('OPENAI', { status: 'AVAILABLE', healthStatus: 'DEGRADED' });
  const result = routeModel(routerInput({
    providerRegistry: registryWith(openai),
  })).routingResult;
  assert.equal(result.selectedProvider, 'OPENAI');
  assert.equal(result.decisionReason, 'DEGRADED_PROVIDER_REPRESENTED');
  assert.equal(result.confidence, 0.5);
});

test('fallbacks são ordenados e nunca incluem selectedProvider', () => {
  const result = routeModel(routerInput({ routingPolicy: 'FALLBACK_ALLOWED' })).routingResult;
  assert.equal(result.fallbackProviders.length > 0, true);
  assert.equal(result.fallbackProviders.includes(result.selectedProvider), false);
  assert.equal(result.metadata.policyFallbackEnabled, true);
  assert.equal(result.metadata.fallbackCount, result.fallbackProviders.length);
});

test('LOW_COST combina policy e scorer deterministicamente', () => {
  const result = routeModel(routerInput({ routingPolicy: 'LOW_COST' })).routingResult;
  assert.equal(result.selectedProvider, 'MISTRAL');
  assert.equal(result.estimatedCost, 'LOW');
});

test('VISION_REQUIRED preserva requisitos e providers compatíveis', () => {
  const result = routeModel(routerInput({
    requestedCapability: 'VISION',
    routingPolicy: 'VISION_REQUIRED',
  })).routingResult;
  assert.equal(result.requiresVision, true);
  assert.equal(result.candidateProviders.every((candidate) => (
    providerRegistry.providers.find((provider) => provider.id === candidate.providerId)
      .supportsVision
  )), true);
});

test('policy premium depende somente de metadata explícita', () => {
  const denied = routeModel(routerInput({ routingPolicy: 'PREMIUM_ONLY' })).routingResult;
  const allowed = routeModel(routerInput({
    routingPolicy: 'PREMIUM_ONLY',
    compiledContext: { metadata: { accessTier: 'PREMIUM' } },
  })).routingResult;
  assert.equal(denied.selectedProvider, null);
  assert.equal(allowed.selectedProvider, 'OPENAI');
});

test('prioridade da policy permanece o primeiro critério do score', () => {
  const result = routeModel(routerInput()).routingResult;
  assert.equal(result.candidateProviders[0].policyPosition, 0);
  assert.equal(result.candidateProviders[0].providerId, result.selectedProvider);
  assert.equal(result.candidateProviders[0].score > result.candidateProviders[1].score, true);
});

test('comparador resolve empate por posição, prioridade e ID', () => {
  const base = { score: 100, healthStatus: 'UNKNOWN', status: 'AVAILABLE' };
  assert.equal(compareRoutingCandidates(
    { ...base, providerId: 'CLAUDE', policyPosition: 1, providerPriority: 2 },
    { ...base, providerId: 'OPENAI', policyPosition: 0, providerPriority: 1 },
  ) > 0, true);
  assert.equal(compareRoutingCandidates(
    { ...base, providerId: 'GEMINI', policyPosition: 0, providerPriority: 3 },
    { ...base, providerId: 'CLAUDE', policyPosition: 0, providerPriority: 2 },
  ) > 0, true);
  assert.equal(compareRoutingCandidates(
    { ...base, providerId: 'GEMINI', policyPosition: 0, providerPriority: 1 },
    { ...base, providerId: 'CLAUDE', policyPosition: 0, providerPriority: 1 },
  ) > 0, true);
});

test('scorer não altera providers ou prioridade recebida', () => {
  const providers = [providerCopy('OPENAI'), providerCopy('CLAUDE')];
  const priority = ['OPENAI', 'CLAUDE'];
  const before = JSON.stringify({ providers, priority });
  scoreRoutingCandidates(providers, priority);
  assert.equal(JSON.stringify({ providers, priority }), before);
});

test('router não altera registries, policies ou contexto', () => {
  const compiledContext = { metadata: { requiresStreaming: true } };
  const before = JSON.stringify({
    capabilityRegistry,
    providerRegistry,
    routingPolicies: ROUTING_POLICY_CATALOG,
    compiledContext,
  });
  routeModel(routerInput({ compiledContext }));
  assert.equal(JSON.stringify({
    capabilityRegistry,
    providerRegistry,
    routingPolicies: ROUTING_POLICY_CATALOG,
    compiledContext,
  }), before);
});

test('schema aplica deep clone e deep freeze sem congelar fonte', () => {
  const source = {
    requestedCapability: 'CONVERSATION',
    resolvedCapability: 'CONVERSATION',
    candidateProviders: [{ providerId: 'OPENAI', score: 10 }],
    fallbackProviders: ['CLAUDE'],
    metadata: { nested: { safe: true } },
  };
  const snapshot = createModelRoutingSchema(source);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.routingResult), true);
  assert.equal(Object.isFrozen(snapshot.routingResult.candidateProviders), true);
  assert.equal(Object.isFrozen(snapshot.routingResult.candidateProviders[0]), true);
  assert.equal(Object.isFrozen(snapshot.routingResult.metadata.nested), true);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(source.metadata), false);
});

test('policy ausente gera falha controlada', () => {
  assert.throws(
    () => routeModel(routerInput({ routingPolicies: [] })),
    (error) => error instanceof RoutingResolverError
      && error.code === 'ROUTING_POLICY_NOT_FOUND',
  );
});

test('registry inválido gera falha controlada', () => {
  assert.throws(
    () => routeModel(routerInput({ providerRegistry: {} })),
    (error) => error instanceof RoutingResolverError
      && error.code === 'INVALID_PROVIDER_REGISTRY',
  );
});

test('feature flag compartilhada mantém router inativo', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runModelRouterShadow(routerInput()), {
    status: 'DISABLED', routingResult: null,
  });
});

test('modo sombra observa resultado e o descarta', async () => {
  let observed;
  const result = await runModelRouterShadow(routerInput(), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
  });
  assert.equal(observed.routingResult.selectedProvider, 'OPENAI');
  assert.deepEqual(result, { status: 'OBSERVED', routingResult: null });
});

test('modo sombra contém falhas sem expor decisão parcial', async () => {
  const result = await runModelRouterShadow(routerInput({ routingPolicies: [] }), {
    enabled: true,
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', routingResult: null });
});

test('log DEV contém somente métricas técnicas permitidas', async () => {
  const logs = [];
  await runModelRouterShadow(routerInput(), {
    enabled: true,
    isDevelopment: true,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /capabilityRequested|candidateProviders|selectedProvider/);
  assert.match(serialized, /fallbackCount|estimatedCost|estimatedLatency/);
  assert.doesNotMatch(serialized, /user|email|description|compiledContext/i);
});

test('router não contém SDK, endpoint, credencial ou chamada externa', async () => {
  const files = [
    'modelRouter.js', 'routingResolver.js', 'routingScorer.js',
    'routingComparator.js', 'routingSchema.js',
  ];
  const source = (await Promise.all(
    files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
  )).join('\n');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//);
  assert.doesNotMatch(source, /apiKey|secret|authorization|bearer|endpoint/i);
  assert.doesNotMatch(source, /openai|anthropic|google-generative|invokeModel|executeModel/i);
});

