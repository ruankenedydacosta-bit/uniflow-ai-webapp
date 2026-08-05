// Testes do Gateway de Integração do Runtime Financeiro Visível (Fase 18).
//
// ETAPA 3 da consolidação da Fase 19: este arquivo não tinha nenhum teste e
// chamava createEmptyFinancialRuntimeResponse (indefinida) em todo caminho
// de saída -- ReferenceError reproduzível em qualquer chamada, inclusive a
// mais trivial. O arquivo é código morto (nada no repositório o importa),
// por isso o bug nunca apareceu em build/teste/produção. Estes testes
// cobrem exclusivamente o caminho corrigido -- nenhum caminho já verde foi
// alterado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFinancialRuntimeVisibleGateway } from './runFinancialRuntimeVisibleGateway.js';

test('gateway: input vazio não lança ReferenceError e retorna legado', () => {
  assert.doesNotThrow(() => runFinancialRuntimeVisibleGateway());
  const result = runFinancialRuntimeVisibleGateway();
  assert.equal(result.selectedSource, 'legacy');
  assert.equal(result.eligible, false);
  assert.equal(result.influenceApplied, false);
  assert.equal(result.fallbackUsed, true);
  assert.ok(result.reasonCodes.includes('LEGACY_TEXT_EMPTY'));
});

test('gateway: legacyText vazio retorna legado com LEGACY_TEXT_EMPTY', () => {
  const result = runFinancialRuntimeVisibleGateway({ legacyText: '' });
  assert.equal(result.selectedSource, 'legacy');
  assert.deepEqual(result.reasonCodes, ['LEGACY_TEXT_EMPTY']);
});

test('gateway: flag desligada retorna legado com FEATURE_DISABLED, preservando legacyText', () => {
  const result = runFinancialRuntimeVisibleGateway({
    legacyText: 'Seu saldo é R$ 100,00',
    config: { financialRuntimeVisibleEnabled: false },
  });
  assert.equal(result.selectedSource, 'legacy');
  assert.equal(result.selectedText, 'Seu saldo é R$ 100,00');
  assert.deepEqual(result.reasonCodes, ['FEATURE_DISABLED']);
});

test('gateway: sem runtimeResult retorna legado com NO_RUNTIME_RESULT', () => {
  const result = runFinancialRuntimeVisibleGateway({
    legacyText: 'Seu saldo é R$ 100,00',
    config: { financialRuntimeVisibleEnabled: true },
  });
  assert.equal(result.selectedSource, 'legacy');
  assert.deepEqual(result.reasonCodes, ['NO_RUNTIME_RESULT']);
});

test('gateway: resultado é sempre serializável (JSON round-trip) em todos os caminhos de saída', () => {
  const scenarios = [
    {},
    { legacyText: 'x' },
    { legacyText: 'x', config: { financialRuntimeVisibleEnabled: true } },
  ];
  for (const input of scenarios) {
    const result = runFinancialRuntimeVisibleGateway(input);
    assert.doesNotThrow(() => JSON.stringify(result));
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  }
});
