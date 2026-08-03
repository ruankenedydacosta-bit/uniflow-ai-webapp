import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  ADAPTER_CAPABILITIES,
  LLM_ADAPTER_METHOD_CONTRACTS,
  LLM_ADAPTER_REQUIRED_METHODS,
  LLMAdapterInterfaceValidationError,
  createLLMAdapterInterface,
  getMissingAdapterMethods,
  llmAdapterInterface,
  runLLMAdapterInterfaceShadow,
  supportsAdapterCapability,
  validateAdapterCapabilities,
  validateAdapterContract,
  validateAdapterDefinition,
  validateAdapterInterfaceSnapshot,
} from './index.js';

function definition(overrides = {}) {
  return {
    name: 'TEST_ADAPTER_CONTRACT',
    version: '1.0',
    supportedCapabilities: ['GENERAL_REASONING', 'CONVERSATION'],
    supportsStreaming: true,
    supportsVision: false,
    supportsVoice: false,
    supportsStructuredOutput: true,
    supportsFunctionCalling: false,
    metadata: { testOnly: true },
    ...overrides,
  };
}

function contractCandidate(snapshot, methodFactory = () => () => undefined) {
  const methods = Object.fromEntries(
    LLM_ADAPTER_REQUIRED_METHODS.map((method) => [method, methodFactory(method)]),
  );
  return Object.freeze({ ...snapshot, ...methods });
}

test('contrato expõe exatamente os nove métodos obrigatórios', () => {
  assert.deepEqual(LLM_ADAPTER_REQUIRED_METHODS, [
    'initialize', 'dispose', 'healthCheck', 'supportsCapability', 'estimateCost',
    'estimateLatency', 'buildRequest', 'invoke', 'validateResponse',
  ]);
  assert.equal(LLM_ADAPTER_METHOD_CONTRACTS.length, 9);
  assert.equal(LLM_ADAPTER_METHOD_CONTRACTS.every((method) => (
    method.required === true && method.invokedByInterface === false
  )), true);
});

test('interface abstrata não representa adapter concreto', () => {
  assert.equal(llmAdapterInterface.adapterInterface.name, 'UNI_OS_LLM_ADAPTER_CONTRACT');
  assert.deepEqual(llmAdapterInterface.adapterInterface.supportedCapabilities, []);
  assert.equal(llmAdapterInterface.metadata.contractOnly, true);
  assert.equal(llmAdapterInterface.metadata.concreteAdapterCreated, false);
  assert.equal(llmAdapterInterface.metadata.modelExecuted, false);
});

test('schema contém todos os campos obrigatórios', () => {
  const snapshot = createLLMAdapterInterface(definition());
  assert.deepEqual(Object.keys(snapshot.adapterInterface), [
    'name', 'version', 'supportedCapabilities', 'supportsStreaming',
    'supportsVision', 'supportsVoice', 'supportsStructuredOutput',
    'supportsFunctionCalling', 'metadata',
  ]);
  assert.equal(snapshot.version, '1.0');
});

test('capabilities usam somente o catálogo oficial', () => {
  assert.equal(ADAPTER_CAPABILITIES.includes('FINANCIAL_REASONING'), true);
  assert.equal(validateAdapterCapabilities(['GENERAL_REASONING']).valid, true);
  assert.equal(validateAdapterCapabilities(['UNKNOWN']).errors.includes(
    'INVALID_ADAPTER_CAPABILITY',
  ), true);
});

test('capabilities duplicadas são inválidas', () => {
  const result = validateAdapterCapabilities(['VOICE', 'VOICE']);
  assert.equal(result.errors.includes('DUPLICATE_ADAPTER_CAPABILITY'), true);
});

test('supportsCapability consulta somente o descriptor', () => {
  const snapshot = createLLMAdapterInterface(definition());
  assert.equal(supportsAdapterCapability(snapshot, ' conversation '), true);
  assert.equal(supportsAdapterCapability(snapshot, 'VISION'), false);
  assert.equal(supportsAdapterCapability(snapshot, null), false);
});

test('validator aprova candidato que implementa o contrato completo', () => {
  const candidate = contractCandidate(createLLMAdapterInterface(definition()));
  assert.deepEqual(getMissingAdapterMethods(candidate), []);
  assert.equal(validateAdapterContract(candidate).valid, true);
});

test('validator identifica cada método obrigatório ausente', () => {
  const snapshot = createLLMAdapterInterface(definition());
  LLM_ADAPTER_REQUIRED_METHODS.forEach((missingMethod) => {
    const candidate = contractCandidate(snapshot);
    const incomplete = { ...candidate };
    delete incomplete[missingMethod];
    Object.freeze(incomplete);
    const result = validateAdapterContract(incomplete);
    assert.equal(result.errors.includes(`MISSING_ADAPTER_METHOD:${missingMethod}`), true);
  });
});

test('validator nunca invoca métodos do candidato', () => {
  let calls = 0;
  const candidate = contractCandidate(
    createLLMAdapterInterface(definition()),
    () => () => { calls += 1; },
  );
  assert.equal(validateAdapterContract(candidate).valid, true);
  assert.equal(calls, 0);
});

test('definition exige nome, versão, flags e metadata', () => {
  const result = validateAdapterDefinition({
    ...definition(),
    name: '',
    version: '',
    supportsStreaming: 'yes',
    metadata: null,
  });
  assert.equal(result.errors.includes('ADAPTER_NAME_REQUIRED'), true);
  assert.equal(result.errors.includes('ADAPTER_VERSION_REQUIRED'), true);
  assert.equal(result.errors.includes('INVALID_SUPPORTSSTREAMING'), true);
  assert.equal(result.errors.includes('ADAPTER_METADATA_REQUIRED'), true);
});

test('snapshot não congelado é rejeitado', () => {
  const snapshot = createLLMAdapterInterface(definition());
  const mutable = {
    ...snapshot,
    adapterInterface: {
      ...snapshot.adapterInterface,
      supportedCapabilities: [...snapshot.adapterInterface.supportedCapabilities],
      metadata: { ...snapshot.adapterInterface.metadata },
    },
  };
  assert.equal(validateAdapterInterfaceSnapshot(mutable).errors.includes(
    'ADAPTER_INTERFACE_NOT_IMMUTABLE',
  ), true);
});

test('schema aplica deep clone e deep freeze sem congelar fonte', () => {
  const source = definition({
    supportedCapabilities: ['VISION'],
    metadata: { nested: { safe: true } },
  });
  const snapshot = createLLMAdapterInterface(source);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.adapterInterface), true);
  assert.equal(Object.isFrozen(snapshot.adapterInterface.supportedCapabilities), true);
  assert.equal(Object.isFrozen(snapshot.adapterInterface.metadata.nested), true);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(source.metadata), false);
});

test('objeto vazio gera erro controlado e codificado', () => {
  assert.throws(
    () => createLLMAdapterInterface({}),
    (error) => error instanceof LLMAdapterInterfaceValidationError
      && error.codes.includes('ADAPTER_NAME_REQUIRED'),
  );
});

test('feature flag compartilhada mantém interface inativa', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runLLMAdapterInterfaceShadow(definition()), {
    status: 'DISABLED', adapterInterface: null,
  });
});

test('modo sombra observa descriptor e descarta resultado', async () => {
  let observed;
  const result = await runLLMAdapterInterfaceShadow(definition(), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
  });
  assert.equal(observed.adapterInterface.name, 'TEST_ADAPTER_CONTRACT');
  assert.deepEqual(result, { status: 'OBSERVED', adapterInterface: null });
});

test('modo sombra contém definição inválida', async () => {
  const result = await runLLMAdapterInterfaceShadow({}, { enabled: true });
  assert.deepEqual(result, { status: 'FAILED_SAFE', adapterInterface: null });
});

test('log DEV contém somente versão e métodos suportados', async () => {
  const logs = [];
  await runLLMAdapterInterfaceShadow(definition(), {
    enabled: true,
    isDevelopment: true,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /Adapter Interface Loaded/);
  assert.match(serialized, /contractVersion|supportedMethods/);
  assert.doesNotMatch(serialized, /user|email|description|metadata/i);
});

test('interface não contém integração nem implementação concreta', async () => {
  const files = [
    'llmAdapterInterface.js', 'adapterCapabilities.js', 'adapterContracts.js',
    'adapterSchema.js', 'adapterValidator.js',
  ];
  const source = (await Promise.all(
    files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
  )).join('\n');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//);
  assert.doesNotMatch(source, /apiKey|secret|authorization|bearer|endpoint|sdk/i);
  assert.doesNotMatch(source, /function\s+(initialize|dispose|invoke|buildRequest)\s*\(/);
});

