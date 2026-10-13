import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveSimplifiedUniState,
  SIMPLIFIED_UNI_STATES,
} from './simplifiedHomeState.js';

// ============================================================================
// BLOCO UNI 2: `speaking` é o estado novo desta máquina -- reflete a SAÍDA
// de voz (TTS), nunca a captura. A causa raiz da regressão de voz era
// justamente esta máquina ser cega à saída: sem `isSpeaking`, não havia
// como sequer representar "a Uni está falando" na interface da Home.
// ============================================================================

const BASE = Object.freeze({
  isTyping: false,
  isExecuting: false,
  hasPendingConfirmation: false,
  hasError: false,
  isSpeaking: false,
});

test('isSpeaking=true e nenhum estado mais prioritário ativo -> SPEAKING', () => {
  const state = resolveSimplifiedUniState({ ...BASE, isSpeaking: true });
  assert.equal(state, SIMPLIFIED_UNI_STATES.SPEAKING);
});

test('erro sempre vence "falando" -- nunca mostra SPEAKING durante um erro', () => {
  const state = resolveSimplifiedUniState({ ...BASE, isSpeaking: true, hasError: true });
  assert.equal(state, SIMPLIFIED_UNI_STATES.ERROR);
});

test('executando sempre vence "falando"', () => {
  const state = resolveSimplifiedUniState({ ...BASE, isSpeaking: true, isExecuting: true });
  assert.equal(state, SIMPLIFIED_UNI_STATES.EXECUTING);
});

test('confirmação pendente sempre vence "falando" -- mesmo que a confirmação esteja sendo falada nesse instante', () => {
  const state = resolveSimplifiedUniState({ ...BASE, isSpeaking: true, hasPendingConfirmation: true });
  assert.equal(state, SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION);
});

test('digitando (interpretando) sempre vence "falando"', () => {
  const state = resolveSimplifiedUniState({ ...BASE, isSpeaking: true, isTyping: true });
  assert.equal(state, SIMPLIFIED_UNI_STATES.INTERPRETING);
});

test('isSpeaking=false e nada em andamento -> IDLE', () => {
  assert.equal(resolveSimplifiedUniState({ ...BASE }), SIMPLIFIED_UNI_STATES.IDLE);
});

test('SIMPLIFIED_UNI_STATES.SPEAKING existe e é distinto de todos os outros valores', () => {
  const values = Object.values(SIMPLIFIED_UNI_STATES);
  assert.ok(values.includes('speaking'));
  assert.equal(new Set(values).size, values.length, 'nenhum valor duplicado');
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
