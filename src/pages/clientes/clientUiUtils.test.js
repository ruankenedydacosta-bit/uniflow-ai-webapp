import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLifecycleStageLabel, getLifecycleStageVariant } from './clientUiUtils.js';

test('getLifecycleStageLabel traduz os 5 estagios reais para PT-BR', () => {
  assert.equal(getLifecycleStageLabel('lead'), 'Lead');
  assert.equal(getLifecycleStageLabel('potential'), 'Potencial');
  assert.equal(getLifecycleStageLabel('active'), 'Ativo');
  assert.equal(getLifecycleStageLabel('at_risk'), 'Em risco');
  assert.equal(getLifecycleStageLabel('inactive'), 'Inativo');
});

test('getLifecycleStageLabel com valor desconhecido retorna o proprio valor, nao quebra', () => {
  assert.equal(getLifecycleStageLabel('algo_novo'), 'algo_novo');
});

test('getLifecycleStageLabel sem valor retorna fallback textual', () => {
  assert.equal(getLifecycleStageLabel(undefined), 'Sem estagio');
  assert.equal(getLifecycleStageLabel(null), 'Sem estagio');
});

test('getLifecycleStageVariant mapeia cada estagio para uma variante de Badge existente', () => {
  assert.equal(getLifecycleStageVariant('lead'), 'secondary');
  assert.equal(getLifecycleStageVariant('potential'), 'primary');
  assert.equal(getLifecycleStageVariant('active'), 'success');
  assert.equal(getLifecycleStageVariant('at_risk'), 'warning');
  assert.equal(getLifecycleStageVariant('inactive'), 'outline');
});

test('getLifecycleStageVariant com valor desconhecido cai em outline (nunca undefined)', () => {
  assert.equal(getLifecycleStageVariant('algo_novo'), 'outline');
  assert.equal(getLifecycleStageVariant(undefined), 'outline');
});
