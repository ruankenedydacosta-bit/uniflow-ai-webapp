// Testes dos contratos do Motor de Raciocínio Financeiro (Fase 15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyFinancialReasoningResult,
  createEmptyFinancialStageResults,
  validateFinancialSnapshot,
  validateFinancialDiagnostics,
  validateFinancialInferences,
  validateFinancialReasoningResult,
  isFinancialObjectSerializable,
  FINANCIAL_REASONING_SAFETY_KEYS,
} from './financialReasoningContracts.js';
import { FINANCIAL_REASONING_STAGES } from '../types/financialReasoningTypes.js';

test('contratos: resultado vazio é seguro, congelado e serializável', () => {
  const empty = createEmptyFinancialReasoningResult({ turnId: 't1', messageId: 'm1' });
  assert.equal(empty.status, 'engine_disabled');
  assert.equal(empty.mode, 'shadow');
  assert.equal(empty.influenceApplied, false);
  assert.equal(empty.discarded, true);
  assert.equal(empty.serializable, true);
  assert.equal(empty.turnId, 't1');
  assert.equal(empty.messageId, 'm1');
  assert.ok(Object.isFrozen(empty));
  assert.ok(Object.isFrozen(empty.safety));
  assert.equal(isFinancialObjectSerializable(empty), true);
  assert.doesNotThrow(() => JSON.stringify(empty));
});

test('contratos: resultado vazio normaliza ids inválidos para null', () => {
  const empty = createEmptyFinancialReasoningResult({ turnId: 42, messageId: null });
  assert.equal(empty.turnId, null);
  assert.equal(empty.messageId, null);
});

test('contratos: estágios vazios cobrem toda a pipeline do Bloco 7', () => {
  const stages = createEmptyFinancialStageResults();
  for (const stage of FINANCIAL_REASONING_STAGES) {
    assert.ok(stages[stage], `faltou estágio ${stage}`);
    assert.equal(stages[stage].present, false);
    assert.equal(stages[stage].executed, false);
    assert.equal(stages[stage].status, null);
  }
});

test('contratos: chaves de segurança são apenas leitura e cobertas', () => {
  assert.ok(Object.isFrozen(FINANCIAL_REASONING_SAFETY_KEYS));
  assert.ok(FINANCIAL_REASONING_SAFETY_KEYS.includes('influenceApplied'));
  assert.ok(FINANCIAL_REASONING_SAFETY_KEYS.includes('financialMutation'));
  assert.ok(FINANCIAL_REASONING_SAFETY_KEYS.includes('networkAccessed'));
});

test('contratos: snapshot válido passa na validação', () => {
  const snapshot = {
    serializable: true,
    totalBalance: 100,
    hasData: true,
  };
  const result = validateFinancialSnapshot(snapshot);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('contratos: snapshot inválido falha com código', () => {
  const result = validateFinancialSnapshot({ totalBalance: 'x' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('BALANCE_MISSING'));
  assert.ok(result.errors.includes('HAS_DATA_MISSING'));
  assert.ok(result.errors.includes('SNAPSHOT_MUST_BE_JSON_SAFE'));
  assert.equal(validateFinancialSnapshot(null).valid, false);
});

test('contratos: diagnósticos precisam de id, tipo, confiança e evidências', () => {
  const good = [{
    id: 'd1',
    type: 'cash_risk',
    confidence: 0.8,
    evidences: [],
  }];
  assert.equal(validateFinancialDiagnostics(good).valid, true);
  const bad = [{ confidence: 0.5 }];
  assert.equal(validateFinancialDiagnostics(bad).valid, false);
  assert.equal(validateFinancialDiagnostics('nope').valid, false);
});

test('contratos: inferências nunca podem aplicar decisão', () => {
  const good = [{ type: 'saves', confidence: 0.8, appliedToDecision: false }];
  assert.equal(validateFinancialInferences(good).valid, true);
  const bad = [{ type: 'saves', confidence: 0.8, appliedToDecision: true }];
  assert.equal(validateFinancialInferences(bad).valid, false);
});

test('contratos: resultado do motor valida invariantes de shadow', () => {
  const result = createEmptyFinancialReasoningResult();
  assert.equal(validateFinancialReasoningResult(result).valid, true);
  assert.equal(
    validateFinancialReasoningResult({ ...result, influenceApplied: true }).valid,
    false,
  );
  assert.equal(
    validateFinancialReasoningResult({ ...result, discarded: false }).valid,
    false,
  );
});