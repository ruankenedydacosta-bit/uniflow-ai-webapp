import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  CAPABILITY_CATALOG,
  CAPABILITY_IDS,
  CapabilityRegistryValidationError,
  capabilityRegistry,
  createCapabilityRegistry,
  findCapability,
  hasCapability,
  listCapabilities,
  runCapabilityRegistryShadow,
  validateCapability,
  validateCapabilityCatalog,
} from './index.js';

test('registra as dezessete capabilities oficiais', () => {
  assert.equal(capabilityRegistry.capabilities.length, 17);
  assert.deepEqual(capabilityRegistry.capabilities.map((item) => item.id), CAPABILITY_IDS);
  assert.equal(capabilityRegistry.metadata.capabilityCount, 17);
});

test('cada capability possui todos os campos obrigatórios', () => {
  capabilityRegistry.capabilities.forEach((capability) => {
    assert.deepEqual(Object.keys(capability), [
      'id', 'name', 'description', 'complexity', 'estimatedCost', 'estimatedLatency',
      'supportsStreaming', 'supportsVision', 'supportsVoice',
      'requiresStructuredContext', 'metadata',
    ]);
  });
});

test('busca capability por ID normalizado', () => {
  assert.equal(findCapability(capabilityRegistry, ' financial_reasoning ').id, 'FINANCIAL_REASONING');
  assert.equal(hasCapability(capabilityRegistry, 'VISION'), true);
});

test('busca desconhecida retorna null sem criar capability', () => {
  assert.equal(findCapability(capabilityRegistry, 'UNKNOWN'), null);
  assert.equal(hasCapability(capabilityRegistry, 'UNKNOWN'), false);
  assert.equal(capabilityRegistry.capabilities.length, 17);
});

test('listagem retorna a coleção imutável do registry', () => {
  const list = listCapabilities(capabilityRegistry);
  assert.equal(list, capabilityRegistry.capabilities);
  assert.equal(Object.isFrozen(list), true);
});

test('validador aprova catálogo oficial', () => {
  assert.deepEqual(validateCapabilityCatalog(CAPABILITY_CATALOG), { valid: true, errors: [] });
  assert.equal(validateCapability(CAPABILITY_CATALOG[0]).valid, true);
});

test('validador rejeita IDs duplicados', () => {
  const result = validateCapabilityCatalog([CAPABILITY_CATALOG[0], CAPABILITY_CATALOG[0]]);
  assert.equal(result.valid, false);
  assert.equal(result.errors.includes('DUPLICATE_CAPABILITY_ID:GENERAL_REASONING'), true);
});

test('validador exige nome e descrição', () => {
  const invalid = { ...CAPABILITY_CATALOG[0], name: '', description: '' };
  const result = validateCapability(invalid);
  assert.equal(result.errors.includes('CAPABILITY_NAME_REQUIRED'), true);
  assert.equal(result.errors.includes('CAPABILITY_DESCRIPTION_REQUIRED'), true);
});

test('validador rejeita capability e complexidade desconhecidas', () => {
  const invalid = { ...CAPABILITY_CATALOG[0], id: 'UNKNOWN', complexity: 'EXTREME' };
  const result = validateCapability(invalid);
  assert.equal(result.errors.includes('INVALID_CAPABILITY_ID'), true);
  assert.equal(result.errors.includes('INVALID_COMPLEXITY'), true);
});

test('validador exige estimativas e booleanos válidos', () => {
  const invalid = {
    ...CAPABILITY_CATALOG[0], estimatedCost: 'FREE', estimatedLatency: 'INSTANT',
    supportsStreaming: 'yes',
  };
  const result = validateCapability(invalid);
  assert.equal(result.errors.includes('INVALID_ESTIMATED_COST'), true);
  assert.equal(result.errors.includes('INVALID_ESTIMATED_LATENCY'), true);
  assert.equal(result.errors.includes('INVALID_SUPPORTSSTREAMING'), true);
});

test('schema aplica deep clone e deep freeze sem congelar fonte', () => {
  const source = [{ ...CAPABILITY_CATALOG[0], metadata: { category: 'test' } }];
  const registry = createCapabilityRegistry(source);
  assert.equal(Object.isFrozen(registry), true);
  assert.equal(Object.isFrozen(registry.capabilities), true);
  assert.equal(Object.isFrozen(registry.capabilities[0]), true);
  assert.equal(Object.isFrozen(registry.capabilities[0].metadata), true);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(source[0].metadata), false);
});

test('registry vazio mantém schema seguro', () => {
  const registry = createCapabilityRegistry([]);
  assert.deepEqual(registry.capabilities, []);
  assert.equal(registry.metadata.capabilityCount, 0);
  assert.equal(findCapability(registry, 'GENERAL_REASONING'), null);
});

test('catálogo inválido lança erro controlado e codificado', () => {
  assert.throws(
    () => createCapabilityRegistry([{}]),
    (error) => error instanceof CapabilityRegistryValidationError
      && error.codes.includes('INVALID_CAPABILITY_ID:0'),
  );
});

test('capabilities multimodais declaram somente suportes necessários', () => {
  assert.equal(findCapability(capabilityRegistry, 'VISION').supportsVision, true);
  assert.equal(findCapability(capabilityRegistry, 'OCR').supportsVision, true);
  assert.equal(findCapability(capabilityRegistry, 'VOICE').supportsVoice, true);
  assert.equal(findCapability(capabilityRegistry, 'CALCULATION').supportsVision, false);
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runCapabilityRegistryShadow(), { status: 'DISABLED', registry: null });
});

test('modo sombra observa registry e descarta resultado', async () => {
  let observed;
  const result = await runCapabilityRegistryShadow({
    enabled: true,
    observer: (registry) => { observed = registry; },
  });
  assert.equal(observed.capabilities.length, 17);
  assert.deepEqual(result, { status: 'OBSERVED', registry: null });
});

test('modo sombra contém falha de catálogo inválido', async () => {
  const result = await runCapabilityRegistryShadow({ enabled: true, catalog: [{}] });
  assert.deepEqual(result, { status: 'FAILED_SAFE', registry: null });
});

test('log DEV contém somente carregamento, contagem e versão', async () => {
  const logs = [];
  await runCapabilityRegistryShadow({
    enabled: true,
    isDevelopment: true,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /Capability Registry Loaded/);
  assert.match(serialized, /capabilitiesCount/);
  assert.match(serialized, /registryVersion/);
  assert.doesNotMatch(serialized, /description|financial_context|user/i);
});

test('registry não chama rede, não cria prompts e não seleciona execução externa', async () => {
  const sources = await Promise.all([
    'capabilityRegistry.js', 'capabilityCatalog.js', 'capabilitySchema.js', 'capabilityValidator.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const source = sources.join('\n');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(source, /promptTemplate|systemPrompt|apiKey|endpoint/i);
  assert.doesNotMatch(source, /selectProvider|selectModel|invokeModel/i);
});
