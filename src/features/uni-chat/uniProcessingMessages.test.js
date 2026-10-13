// FASE ESTADOS DE PROCESSAMENTO (HOTFIX P1: mensagens honestas, sem
// rotação): uniProcessingMessages.js é puro (sem React, sem timers) --
// coberto integralmente com node:test, sem fake timers (mesmo padrão de
// useVoiceIntensity.js).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProcessingRotationPlan,
  getProcessingMessageSequence,
  resolveOperationHintFromIntent,
} from './uniProcessingMessages.js';

// ============================================================================
// getProcessingMessageSequence -- honestidade: cada estado produz NO MÁXIMO
// uma mensagem (nunca rotaciona), compatível com o que está de fato
// acontecendo.
// ============================================================================

test('interpreting sem operationHint cai no genérico honesto "Entendendo seu pedido…" -- nunca rotaciona', () => {
  assert.deepEqual(getProcessingMessageSequence('interpreting'), ['Entendendo seu pedido…']);
  assert.deepEqual(getProcessingMessageSequence('interpreting', {}), ['Entendendo seu pedido…']);
});

test('interpreting com operationHint reconhecido escolhe UMA mensagem específica e honesta', () => {
  assert.deepEqual(
    getProcessingMessageSequence('interpreting', { operationHint: 'consulting_data' }),
    ['Consultando seu histórico financeiro…'],
  );
  assert.deepEqual(
    getProcessingMessageSequence('interpreting', { operationHint: 'organizing_transaction' }),
    ['Organizando suas movimentações…'],
  );
  assert.deepEqual(
    getProcessingMessageSequence('interpreting', { operationHint: 'preparing_recommendation' }),
    ['Preparando uma recomendação…'],
  );
  assert.deepEqual(
    getProcessingMessageSequence('interpreting', { operationHint: 'calculating_impact' }),
    ['Calculando impacto no seu fluxo de caixa…'],
  );
});

test('interpreting com operationHint desconhecido cai no genérico (nunca inventa uma operação)', () => {
  assert.deepEqual(
    getProcessingMessageSequence('interpreting', { operationHint: 'something-not-mapped' }),
    ['Entendendo seu pedido…'],
  );
});

test('waiting_confirmation produz exatamente "Aguardando sua confirmação…"', () => {
  assert.deepEqual(getProcessingMessageSequence('waiting_confirmation'), ['Aguardando sua confirmação…']);
});

test('executing escolhe UMA mensagem compatível com o actionKind real -- nunca rotaciona por várias', () => {
  assert.deepEqual(getProcessingMessageSequence('executing', { actionKind: 'adjustment' }), ['Atualizando seu saldo…']);
  assert.deepEqual(getProcessingMessageSequence('executing', { actionKind: 'transfer' }), ['Organizando seus registros…']);
  assert.deepEqual(getProcessingMessageSequence('executing', { actionKind: 'income' }), ['Registrando sua movimentação…']);
  assert.deepEqual(getProcessingMessageSequence('executing', { actionKind: 'expense' }), ['Registrando sua movimentação…']);
});

test('executing sem actionKind reconhecido cai no rótulo genérico honesto', () => {
  assert.deepEqual(getProcessingMessageSequence('executing', {}), ['Aplicando a alteração…']);
  assert.deepEqual(getProcessingMessageSequence('executing', { actionKind: 'unknown-thing' }), ['Aplicando a alteração…']);
  assert.deepEqual(getProcessingMessageSequence('executing'), ['Aplicando a alteração…']);
});

test('estados que já têm UI própria (idle/speaking/success/error) não produzem mensagem de processamento', () => {
  assert.deepEqual(getProcessingMessageSequence('idle'), []);
  assert.deepEqual(getProcessingMessageSequence('speaking'), []);
  assert.deepEqual(getProcessingMessageSequence('success'), []);
  assert.deepEqual(getProcessingMessageSequence('error'), []);
  assert.deepEqual(getProcessingMessageSequence('estado-inexistente'), []);
});

test('sequências retornadas são congeladas (nunca mutáveis pelo chamador) e nunca têm mais de uma mensagem', () => {
  assert.ok(Object.isFrozen(getProcessingMessageSequence('waiting_confirmation')));
  assert.ok(Object.isFrozen(getProcessingMessageSequence('interpreting')));
  assert.ok(Object.isFrozen(getProcessingMessageSequence('executing', { actionKind: 'income' })));
  assert.ok(getProcessingMessageSequence('interpreting').length <= 1);
  assert.ok(getProcessingMessageSequence('executing').length <= 1);
});

// ============================================================================
// resolveOperationHintFromIntent -- reaproveita a classificação já existente
// (classifyIntent) para escolher a mensagem certa, nunca inventa uma regra
// nova só para isto.
// ============================================================================

test('resolveOperationHintFromIntent mapeia intents de consulta/lançamento/projeção para o hint honesto correspondente', () => {
  assert.equal(resolveOperationHintFromIntent('check_balance'), 'consulting_data');
  assert.equal(resolveOperationHintFromIntent('register_income'), 'organizing_transaction');
  assert.equal(resolveOperationHintFromIntent('register_expense'), 'organizing_transaction');
  assert.equal(resolveOperationHintFromIntent('register_transfer'), 'organizing_transaction');
  assert.equal(resolveOperationHintFromIntent('set_balance'), 'organizing_transaction');
  assert.equal(resolveOperationHintFromIntent('ambiguous_balance_or_income'), 'organizing_transaction');
  assert.equal(resolveOperationHintFromIntent('forecast'), 'calculating_impact');
});

test('resolveOperationHintFromIntent devolve null para intents sem mapeamento honesto (nunca adivinha)', () => {
  assert.equal(resolveOperationHintFromIntent('question'), null);
  assert.equal(resolveOperationHintFromIntent('create_goal'), null);
  assert.equal(resolveOperationHintFromIntent('unknown'), null);
  assert.equal(resolveOperationHintFromIntent(undefined), null);
});

// ============================================================================
// buildProcessingRotationPlan -- HOTFIX: não existe mais rotação nenhuma;
// mantido como no-op estável só para não quebrar o wiring do hook.
// ============================================================================

test('nunca produz um plano de rotação, para nenhum tamanho de sequência (não há mais o que rotacionar)', () => {
  assert.deepEqual(buildProcessingRotationPlan(0), []);
  assert.deepEqual(buildProcessingRotationPlan(1), []);
  assert.deepEqual(buildProcessingRotationPlan(4), []);
  assert.deepEqual(buildProcessingRotationPlan(), []);
});
