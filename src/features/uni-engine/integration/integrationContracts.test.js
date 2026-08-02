// Integration — contratos (Parte 1). Garantias estruturais do resultado da
// integração: serializável, sem funções, sem clientes externos, legacy
// preservado por padrão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyIntegrationResult,
  createIntegrationResult,
  validateIntegrationResult,
} from './integrationContracts.js';
import {
  INTEGRATION_VERSION,
} from './integrationTypes.js';

test('I-1: resultado vazio e desligado é válido e preserva o legado por padrão', () => {
  const result = createEmptyIntegrationResult({});
  assert.equal(result.version, INTEGRATION_VERSION);
  assert.equal(result.status, 'DISABLED');
  assert.equal(result.applied, false);
  assert.equal(result.legacyPreserved, true);
  assert.equal(result.fallbackUsed, true);
  const validation = validateIntegrationResult(result);
  assert.equal(validation.valid, true, validation.errors.join(','));
});

test('I-2: resultado serializado contém somente valores primitivos e arrays', () => {
  const result = createEmptyIntegrationResult({});
  const json = JSON.parse(JSON.stringify(result));
  assert.deepEqual(json, result);
});

test('I-3: resultado nunca contém funções nem referências circulares', () => {
  const result = createIntegrationResult({
    enabled: true,
    status: 'active',
    finalText: 'Olá',
    capabilitiesRequested: ['QUESTION_GUIDANCE'],
  });
  assert.deepEqual(result, JSON.parse(JSON.stringify(result)));
});

test('I-4: capacidades fora da allowlist são removidas do resultado', () => {
  const result = createIntegrationResult({
    enabled: true,
    status: 'active',
    capabilitiesRequested: ['FINANCIAL_EXECUTION', 'MEMORY_WRITE', 'QUESTION_GUIDANCE'],
    capabilitiesApplied: ['FINANCIAL_EXECUTION'],
  });
  assert.deepEqual(result.capabilitiesRequested, ['QUESTION_GUIDANCE']);
  assert.deepEqual(result.capabilitiesApplied, []);
});

test('I-5: fallbackReason inválido vira UNKNOWN', () => {
  const result = createIntegrationResult({
    enabled: true,
    status: 'FALLBACK',
    fallbackUsed: true,
    fallbackReason: 'QUALQUER_COISA',
  });
  assert.equal(result.fallbackReason, 'UNKNOWN');
});

test('I-6: legado preservado exige fallbackReason válido quando fallbackUsed', () => {
  const result = createIntegrationResult({
    enabled: true,
    status: 'fallback',
    fallbackUsed: true,
    fallbackReason: 'LEGACY_INVALID',
  });
  const validation = validateIntegrationResult(result);
  assert.equal(validation.valid, true);
});

test('I-7: aplicado sem capacidades aplicadas é normalizado para applied=false', () => {
  const result = createIntegrationResult({
    enabled: true,
    status: 'APPLIED',
    applied: true,
    finalText: 'texto',
    capabilitiesRequested: ['QUESTION_GUIDANCE'],
    capabilitiesApplied: [],
    fallbackUsed: false,
    fallbackReason: null,
  });
  // Novo contrato: applied é forçado a false quando capabilitiesApplied está vazio
  assert.equal(result.applied, false);
  const validation = validateIntegrationResult(result);
  assert.equal(validation.valid, true);
});
