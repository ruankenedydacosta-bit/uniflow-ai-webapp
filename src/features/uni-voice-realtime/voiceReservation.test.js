import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyVoiceRenewal,
  createVoiceReservation,
  resolveVoiceReservationAction,
  VOICE_RESERVATION_ACTIONS,
} from './voiceReservation.js';

const HOOK = readFileSync(new URL('./useRealtimeVoiceSession.js', import.meta.url), 'utf8');
const START = Date.parse('2026-10-06T20:00:00Z');
const reservedUntil = new Date(START + 330000).toISOString(); // bloco de 300 s + 30 s de folga

test('reserva para no fim do bloco, sem usar a folga do servidor', () => {
  const reservation = createVoiceReservation({ sessionId: 's1', reservedUntil, accessToken: 't' });
  assert.equal(reservation.stopAt, START + 300000);
  assert.equal(createVoiceReservation({ sessionId: '', reservedUntil }), null);
  assert.equal(createVoiceReservation({ sessionId: 's1', reservedUntil: 'ontem' }), null);
});

test('renova a 1 minuto do fim, uma vez, e para quando o bloco acaba', () => {
  const reservation = createVoiceReservation({ sessionId: 's1', reservedUntil });
  assert.equal(resolveVoiceReservationAction(reservation, START + 200000), VOICE_RESERVATION_ACTIONS.NONE);
  assert.equal(resolveVoiceReservationAction(reservation, START + 240000), VOICE_RESERVATION_ACTIONS.RENEW);
  assert.equal(resolveVoiceReservationAction({ ...reservation, renewing: true }, START + 250000), VOICE_RESERVATION_ACTIONS.NONE);
  assert.equal(resolveVoiceReservationAction(reservation, START + 300000), VOICE_RESERVATION_ACTIONS.STOP);
  assert.equal(resolveVoiceReservationAction({ ...reservation, closed: true }, START + 300000), VOICE_RESERVATION_ACTIONS.NONE);
  assert.equal(resolveVoiceReservationAction(null, START), VOICE_RESERVATION_ACTIONS.NONE);
});

test('renovação com segundos novos estende o fim; sem saldo, a conversa acaba no fim do bloco', () => {
  const reservation = { ...createVoiceReservation({ sessionId: 's1', reservedUntil }), renewing: true };
  const extended = applyVoiceRenewal(reservation, { added_seconds: 300, expires_at: new Date(START + 630000).toISOString() });
  assert.equal(extended.stopAt, START + 600000);
  assert.equal(extended.renewing, false);

  const exhausted = applyVoiceRenewal(reservation, { added_seconds: 0, expires_at: reservedUntil });
  assert.equal(exhausted.exhausted, true);
  assert.equal(exhausted.stopAt, reservation.stopAt);
  assert.equal(resolveVoiceReservationAction(exhausted, START + 280000), VOICE_RESERVATION_ACTIONS.NONE);
  assert.equal(resolveVoiceReservationAction(exhausted, START + 300000), VOICE_RESERVATION_ACTIONS.STOP);

  assert.equal(applyVoiceRenewal(reservation, null).exhausted, true);
});

test('o app encerra a reserva com keepalive, que sobrevive ao fechar a aba', () => {
  assert.match(HOOK, /\/rest\/v1\/rpc\/voice_close/);
  assert.match(HOOK, /keepalive: true/);
  assert.match(HOOK, /supabase\.rpc\('voice_renew_block', \{ p_session_id:/);
});
