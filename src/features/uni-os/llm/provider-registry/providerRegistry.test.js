import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  PROVIDER_CATALOG,
  PROVIDER_IDS,
  ProviderRegistryValidationError,
  createProviderRegistry,
  findProvider,
  findProvidersByCapability,
  isProviderHealthy,
  listProviders,
  normalizeProviderHealth,
  providerRegistry,
  runProviderRegistryShadow,
  summarizeProviderHealth,
  validateProvider,
  validateProviderCatalog,
} from './index.js';

test('registra os oito providers mock oficiais', () => {
  assert.equal(providerRegistry.providers.length, 8);
  assert.deepEqual(providerRegistry.providers.map((item) => item.id), PROVIDER_IDS);
  assert.equal(providerRegistry.metadata.providerCount, 8);
  assert.equal(providerRegistry.metadata.operationalProviders, 0);
});

test('cada provider possui todos os campos obrigatórios', () => {
  providerRegistry.providers.forEach((provider) => {
    assert.deepEqual(Object.keys(provider), [
      'id', 'name', 'status', 'priority', 'type', 'supportedCapabilities',
      'estimatedLatency', 'estimatedCost', 'supportsStreaming', 'supportsVision',
      'supportsVoice', 'supportsStructuredOutput', 'supportsFunctionCalling',
      'healthStatus', 'fallbackPriority', 'metadata',
    ]);
  });
});

test('busca provider por ID normalizado', () => {
  assert.equal(findProvider(providerRegistry, ' llama_local ').name, 'Llama Local');
  assert.equal(findProvider(providerRegistry, 'UNKNOWN'), null);
});

test('listagem retorna coleção imutável', () => {
  assert.equal(listProviders(providerRegistry), providerRegistry.providers);
  assert.equal(Object.isFrozen(listProviders(providerRegistry)), true);
});

test('filtra providers por capability sem selecionar execução', () => {
  const vision = findProvidersByCapability(providerRegistry, ' vision ');
  assert.equal(vision.length > 0, true);
  assert.equal(vision.every((provider) => provider.supportedCapabilities.includes('VISION')), true);
  assert.equal(Object.isFrozen(vision), true);
  assert.deepEqual(findProvidersByCapability(providerRegistry, 'UNKNOWN'), []);
});

test('catálogo declara somente capabilities oficiais', () => {
  assert.equal(validateProviderCatalog(PROVIDER_CATALOG).valid, true);
  assert.equal(PROVIDER_CATALOG.every((provider) => provider.metadata.operational === false), true);
});

test('status representa catálogo mock sem disponibilidade operacional', () => {
  assert.equal(findProvider(providerRegistry, 'OPENAI').status, 'EXPERIMENTAL');
  assert.equal(findProvider(providerRegistry, 'CUSTOM').status, 'DISABLED');
});

test('health é apenas representação local e começa desconhecido', () => {
  assert.equal(normalizeProviderHealth('HEALTHY'), 'HEALTHY');
  assert.equal(normalizeProviderHealth('INVALID'), 'UNKNOWN');
  assert.equal(isProviderHealthy(findProvider(providerRegistry, 'OPENAI')), false);
  assert.deepEqual(summarizeProviderHealth(providerRegistry.providers), {
    UNKNOWN: 8, HEALTHY: 0, DEGRADED: 0, OFFLINE: 0,
  });
});

test('validador aprova catálogo oficial', () => {
  assert.deepEqual(validateProviderCatalog(PROVIDER_CATALOG), { valid: true, errors: [] });
  assert.equal(validateProvider(PROVIDER_CATALOG[0]).valid, true);
});

test('validador rejeita IDs duplicados', () => {
  const result = validateProviderCatalog([PROVIDER_CATALOG[0], {
    ...PROVIDER_CATALOG[0], priority: 20, fallbackPriority: 20,
  }]);
  assert.equal(result.errors.includes('DUPLICATE_PROVIDER_ID:OPENAI'), true);
});

test('validador rejeita prioridades duplicadas', () => {
  const result = validateProviderCatalog([PROVIDER_CATALOG[0], {
    ...PROVIDER_CATALOG[1], priority: 1, fallbackPriority: 1,
  }]);
  assert.equal(result.errors.includes('DUPLICATE_PRIORITY:1'), true);
  assert.equal(result.errors.includes('DUPLICATE_FALLBACK_PRIORITY:1'), true);
});

test('validador rejeita capability desconhecida', () => {
  const invalid = { ...PROVIDER_CATALOG[0], supportedCapabilities: ['UNKNOWN'] };
  assert.equal(validateProvider(invalid).errors.includes('INVALID_SUPPORTED_CAPABILITY'), true);
});

test('validador rejeita status e health desconhecidos', () => {
  const invalid = { ...PROVIDER_CATALOG[0], status: 'LIVE', healthStatus: 'ONLINE' };
  const result = validateProvider(invalid);
  assert.equal(result.errors.includes('INVALID_PROVIDER_STATUS'), true);
  assert.equal(result.errors.includes('INVALID_HEALTH_STATUS'), true);
});

test('validador exige campos e tipos corretos', () => {
  const invalid = {
    ...PROVIDER_CATALOG[0], name: '', priority: 0, type: 'REMOTE',
    estimatedCost: 'FREE', supportsStreaming: 'yes', metadata: null,
  };
  const result = validateProvider(invalid);
  assert.equal(result.errors.includes('PROVIDER_NAME_REQUIRED'), true);
  assert.equal(result.errors.includes('INVALID_PRIORITY'), true);
  assert.equal(result.errors.includes('INVALID_PROVIDER_TYPE'), true);
  assert.equal(result.errors.includes('INVALID_ESTIMATED_COST'), true);
  assert.equal(result.errors.includes('INVALID_SUPPORTSSTREAMING'), true);
  assert.equal(result.errors.includes('PROVIDER_METADATA_REQUIRED'), true);
});

test('schema aplica deep clone e deep freeze sem congelar fonte', () => {
  const source = [{
    ...PROVIDER_CATALOG[0],
    supportedCapabilities: ['CONVERSATION'],
    metadata: { mock: true },
  }];
  const registry = createProviderRegistry(source);
  assert.equal(Object.isFrozen(registry), true);
  assert.equal(Object.isFrozen(registry.providers), true);
  assert.equal(Object.isFrozen(registry.providers[0]), true);
  assert.equal(Object.isFrozen(registry.providers[0].supportedCapabilities), true);
  assert.equal(Object.isFrozen(registry.providers[0].metadata), true);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(source[0].metadata), false);
});

test('registry vazio mantém schema seguro', () => {
  const registry = createProviderRegistry([]);
  assert.deepEqual(registry.providers, []);
  assert.equal(registry.metadata.providerCount, 0);
  assert.equal(findProvider(registry, 'OPENAI'), null);
});

test('catálogo inválido lança erro controlado e codificado', () => {
  assert.throws(
    () => createProviderRegistry([{}]),
    (error) => error instanceof ProviderRegistryValidationError
      && error.codes.includes('INVALID_PROVIDER_ID:0'),
  );
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runProviderRegistryShadow(), { status: 'DISABLED', registry: null });
});

test('modo sombra observa registry e descarta resultado', async () => {
  let observed;
  const result = await runProviderRegistryShadow({
    enabled: true,
    observer: (registry) => { observed = registry; },
  });
  assert.equal(observed.providers.length, 8);
  assert.deepEqual(result, { status: 'OBSERVED', registry: null });
});

test('modo sombra contém falhas controladas', async () => {
  const result = await runProviderRegistryShadow({ enabled: true, catalog: [{}] });
  assert.deepEqual(result, { status: 'FAILED_SAFE', registry: null });
});

test('log DEV contém somente carregamento, contagem e versão', async () => {
  const logs = [];
  await runProviderRegistryShadow({
    enabled: true,
    isDevelopment: true,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /Provider Registry Loaded/);
  assert.match(serialized, /providersCount/);
  assert.match(serialized, /registryVersion/);
  assert.doesNotMatch(serialized, /credential|token|user|email/i);
});

test('registry não contém integração externa ou material sensível', async () => {
  const files = [
    'providerRegistry.js', 'providerCatalog.js', 'providerSchema.js',
    'providerValidator.js', 'providerHealth.js',
  ];
  const source = (await Promise.all(
    files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
  )).join('\n');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(source, /apiKey|secret|authorization|bearer|https?:\/\//i);
  assert.doesNotMatch(source, /invokeModel|selectModel|createPrompt|promptTemplate/i);
});

