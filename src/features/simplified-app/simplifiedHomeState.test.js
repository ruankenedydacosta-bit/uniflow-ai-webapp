import assert from 'node:assert/strict';
import test from 'node:test';
import { VOICE_CAPTURE_STATES } from '../uni-voice/voiceCaptureReducer.js';
import {
  isVoiceErrorState,
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
  voiceStatus: VOICE_CAPTURE_STATES.IDLE,
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

test('isSpeaking=false preserva todo o comportamento anterior (idle/listening/transcribing/success/error)', () => {
  assert.equal(resolveSimplifiedUniState({ ...BASE }), SIMPLIFIED_UNI_STATES.IDLE);
  assert.equal(
    resolveSimplifiedUniState({ ...BASE, voiceStatus: VOICE_CAPTURE_STATES.LISTENING }),
    SIMPLIFIED_UNI_STATES.LISTENING,
  );
  assert.equal(
    resolveSimplifiedUniState({ ...BASE, voiceStatus: VOICE_CAPTURE_STATES.PROCESSING }),
    SIMPLIFIED_UNI_STATES.TRANSCRIBING,
  );
  assert.equal(
    resolveSimplifiedUniState({ ...BASE, voiceStatus: VOICE_CAPTURE_STATES.COMPLETED }),
    SIMPLIFIED_UNI_STATES.SUCCESS,
  );
  assert.equal(
    resolveSimplifiedUniState({ ...BASE, voiceStatus: VOICE_CAPTURE_STATES.ERROR, hasError: false }),
    SIMPLIFIED_UNI_STATES.ERROR,
  );
  assert.equal(isVoiceErrorState(VOICE_CAPTURE_STATES.ERROR), true);
});

test('SIMPLIFIED_UNI_STATES.SPEAKING existe e é distinto de todos os outros valores', () => {
  const values = Object.values(SIMPLIFIED_UNI_STATES);
  assert.ok(values.includes('speaking'));
  assert.equal(new Set(values).size, values.length, 'nenhum valor duplicado');
});
