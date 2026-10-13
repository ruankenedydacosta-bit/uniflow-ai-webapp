import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveSimplifiedUniState,
  SIMPLIFIED_UNI_STATES,
} from './simplifiedHomeState.js';

// Estado da Uni no card da Home. A voz é só a conversa em tempo real, que
// tem o próprio estado: aqui não existe "falando" nem "ouvindo".

const BASE = Object.freeze({
  isTyping: false,
  isExecuting: false,
  hasPendingConfirmation: false,
  hasError: false,
});

test('erro vence qualquer outro estado', () => {
  const state = resolveSimplifiedUniState({
    ...BASE, hasError: true, isExecuting: true, isTyping: true, hasPendingConfirmation: true,
  });
  assert.equal(state, SIMPLIFIED_UNI_STATES.ERROR);
});

test('executando vence confirmação pendente, que vence o estado parado', () => {
  assert.equal(
    resolveSimplifiedUniState({ ...BASE, hasPendingConfirmation: true }),
    SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION,
  );
  assert.equal(
    resolveSimplifiedUniState({ ...BASE, isExecuting: true, hasPendingConfirmation: true }),
    SIMPLIFIED_UNI_STATES.EXECUTING,
  );
});

test('confirmação pendente vence digitando (interpretando)', () => {
  const state = resolveSimplifiedUniState({ ...BASE, isTyping: true, hasPendingConfirmation: true });
  assert.equal(state, SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION);
  assert.equal(resolveSimplifiedUniState({ ...BASE, isTyping: true }), SIMPLIFIED_UNI_STATES.INTERPRETING);
});

test('nada em andamento -> IDLE', () => {
  assert.equal(resolveSimplifiedUniState({ ...BASE }), SIMPLIFIED_UNI_STATES.IDLE);
  assert.equal(resolveSimplifiedUniState(), SIMPLIFIED_UNI_STATES.IDLE);
});

test('a Home não tem estado de voz falando: a voz é só a conversa em tempo real', () => {
  const values = Object.values(SIMPLIFIED_UNI_STATES);
  assert.equal(values.includes('speaking'), false);
  assert.equal(new Set(values).size, values.length, 'nenhum valor duplicado');
});
