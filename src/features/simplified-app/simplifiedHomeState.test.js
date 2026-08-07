import assert from 'node:assert/strict';
import test from 'node:test';
import { VOICE_CAPTURE_STATES } from '../uni-voice/voiceCaptureReducer.js';
import {
  isCapturingVoice,
  isVoiceErrorState,
  resolveBargeInPlan,
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

// ============================================================================
// HOTFIX — Barge-in e captura imediata de voz: resolveBargeInPlan é a
// decisão pura por trás de beginVoiceCapture (SimplifiedHomeView) -- o
// MESMO pointerdown/touchstart precisa interromper a fala da Uni E iniciar
// a captura, sem esperar um segundo gesto do usuário.
// ============================================================================

test('Requisito 1 — pressionar com a Uni em silêncio inicia a gravação (proceed=true, interruptSpeech=false)', () => {
  const plan = resolveBargeInPlan({ isInteractionBusy: false, isSpeaking: false, isVoiceError: false });
  assert.deepEqual(plan, {
    proceed: true,
    interruptSpeech: false,
    resetError: false,
    startCapture: true,
  });
});

test('Requisito 2 — pressionar enquanto a Uni fala interrompe E inicia a captura no MESMO gesto (proceed=true, interruptSpeech=true, startCapture=true)', () => {
  const plan = resolveBargeInPlan({ isInteractionBusy: false, isSpeaking: true, isVoiceError: false });
  assert.equal(plan.proceed, true);
  assert.equal(plan.interruptSpeech, true);
  assert.equal(plan.startCapture, true);
});

test('erro de voz anterior é resetado antes de iniciar uma nova captura', () => {
  const plan = resolveBargeInPlan({ isInteractionBusy: false, isSpeaking: false, isVoiceError: true });
  assert.equal(plan.resetError, true);
  assert.equal(plan.startCapture, true);
});

test('interação ocupada (digitando/executando/permissão em voo) recusa o gesto inteiro -- nunca interrompe fala nem inicia captura', () => {
  const plan = resolveBargeInPlan({ isInteractionBusy: true, isSpeaking: true, isVoiceError: false });
  assert.deepEqual(plan, {
    proceed: false,
    interruptSpeech: false,
    resetError: false,
    startCapture: false,
  });
});

test('resolveBargeInPlan nunca lança com argumentos ausentes', () => {
  assert.doesNotThrow(() => resolveBargeInPlan());
  const plan = resolveBargeInPlan();
  assert.equal(plan.proceed, true);
  assert.equal(plan.interruptSpeech, false);
});

test('resolveBargeInPlan devolve um objeto congelado (nunca mutável por engano)', () => {
  const plan = resolveBargeInPlan({ isInteractionBusy: false, isSpeaking: false, isVoiceError: false });
  assert.equal(Object.isFrozen(plan), true);
});

// ============================================================================
// HOTFIX FINAL — Restaurar feedback visual do push-to-talk após o barge-in.
// Regressão real: hasPendingConfirmation (histórico de mensagens, nunca
// limpo só porque o usuário começou a falar) vencia LISTENING na prioridade
// antiga, prendendo o botão em "CONFIRME A AÇÃO" sem texto nem animação de
// escuta durante uma captura de barge-in real.
// ============================================================================

test('isCapturingVoice: verdadeiro em LISTENING e REQUESTING_PERMISSION, falso em qualquer outro status', () => {
  assert.equal(isCapturingVoice(VOICE_CAPTURE_STATES.LISTENING), true);
  assert.equal(isCapturingVoice(VOICE_CAPTURE_STATES.REQUESTING_PERMISSION), true);
  assert.equal(isCapturingVoice(VOICE_CAPTURE_STATES.IDLE), false);
  assert.equal(isCapturingVoice(VOICE_CAPTURE_STATES.PROCESSING), false);
  assert.equal(isCapturingVoice(VOICE_CAPTURE_STATES.COMPLETED), false);
  assert.equal(isCapturingVoice(undefined), false);
});

test('REGRESSÃO REAL — captura ativa vence confirmação pendente: nunca mostra CONFIRME A AÇÃO (WAITING_CONFIRMATION) enquanto o microfone está gravando', () => {
  const state = resolveSimplifiedUniState({
    ...BASE,
    voiceStatus: VOICE_CAPTURE_STATES.LISTENING,
    hasPendingConfirmation: true,
  });
  assert.equal(state, SIMPLIFIED_UNI_STATES.LISTENING);
});

test('captura ativa (aguardando permissão) também vence confirmação pendente', () => {
  const state = resolveSimplifiedUniState({
    ...BASE,
    voiceStatus: VOICE_CAPTURE_STATES.REQUESTING_PERMISSION,
    hasPendingConfirmation: true,
  });
  assert.equal(state, SIMPLIFIED_UNI_STATES.LISTENING);
});

test('captura ativa vence "falando" (barge-in real: TTS interrompido e captura já em andamento no mesmo gesto)', () => {
  const state = resolveSimplifiedUniState({
    ...BASE,
    voiceStatus: VOICE_CAPTURE_STATES.LISTENING,
    isSpeaking: true,
  });
  assert.equal(state, SIMPLIFIED_UNI_STATES.LISTENING);
});

test('captura ativa vence "executando" e "digitando" (cobertura defensiva completa da regra de prioridade do hotfix)', () => {
  assert.equal(
    resolveSimplifiedUniState({ ...BASE, voiceStatus: VOICE_CAPTURE_STATES.LISTENING, isExecuting: true }),
    SIMPLIFIED_UNI_STATES.LISTENING,
  );
  assert.equal(
    resolveSimplifiedUniState({ ...BASE, voiceStatus: VOICE_CAPTURE_STATES.LISTENING, isTyping: true }),
    SIMPLIFIED_UNI_STATES.LISTENING,
  );
});

test('erro explícito (hasError) continua vencendo captura -- única prioridade acima de LISTENING, fora do escopo deste hotfix', () => {
  const state = resolveSimplifiedUniState({
    ...BASE,
    voiceStatus: VOICE_CAPTURE_STATES.LISTENING,
    hasError: true,
  });
  assert.equal(state, SIMPLIFIED_UNI_STATES.ERROR);
});

test('sem captura ativa, todo o comportamento de prioridade anterior ao hotfix continua intacto', () => {
  assert.equal(
    resolveSimplifiedUniState({ ...BASE, hasPendingConfirmation: true }),
    SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION,
  );
  assert.equal(
    resolveSimplifiedUniState({ ...BASE, isExecuting: true, hasPendingConfirmation: true }),
    SIMPLIFIED_UNI_STATES.EXECUTING,
  );
});
