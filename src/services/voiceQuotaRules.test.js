import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { mapVoiceReserveError, parseVoiceReservation } from '../../supabase/functions/_shared/voiceQuotaRules.ts';

const SESSION_FUNCTION = readFileSync(
  new URL('../../supabase/functions/uni-voice-realtime-session/index.ts', import.meta.url),
  'utf8',
);

// Épico #116 / #113: a chave da conversa por voz só sai depois da reserva.

test('sem saldo ou sem assinatura: 403 com fallback para o texto, decidido pelo hint', () => {
  const noMinutes = mapVoiceReserveError({ code: 'P0001', hint: 'voz_sem_saldo', message: 'qualquer texto' });
  assert.equal(noMinutes.status, 403);
  assert.equal(noMinutes.code, 'VOICE_QUOTA_EXHAUSTED');
  assert.equal(noMinutes.fallback, 'text');
  assert.doesNotMatch(noMinutes.message, /qualquer texto/);

  const noSubscription = mapVoiceReserveError({ hint: 'voz_sem_assinatura' });
  assert.equal(noSubscription.code, 'SUBSCRIPTION_INACTIVE');
  assert.equal(noSubscription.fallback, 'text');
});

test('erro desconhecido do banco não vira "sem minutos": 502 sem fallback', () => {
  for (const body of [null, {}, { hint: 'outra_coisa' }, { message: 'voz_sem_saldo' }]) {
    const refusal = mapVoiceReserveError(body);
    assert.equal(refusal.status, 502);
    assert.equal(refusal.fallback, null);
  }
});

test('reserva válida só com sessão, prazo e segundos positivos', () => {
  const row = { session_id: 's1', reserved_seconds: 300, expires_at: '2026-10-06T20:00:00Z', remaining_seconds: 900 };
  assert.deepEqual(parseVoiceReservation([row]), {
    sessionId: 's1', reservedSeconds: 300, expiresAt: '2026-10-06T20:00:00Z', remainingSeconds: 900,
  });
  assert.equal(parseVoiceReservation([{ ...row, reserved_seconds: 0 }]), null);
  assert.equal(parseVoiceReservation([]), null);
  assert.equal(parseVoiceReservation(null), null);
});

test('a reserva acontece antes da chamada à OpenAI, e a falha da OpenAI devolve os minutos', () => {
  const reserveIndex = SESSION_FUNCTION.indexOf("'voice_reserve_block'");
  const openAiIndex = SESSION_FUNCTION.indexOf('providerResponse = await fetch(OPENAI_CLIENT_SECRETS_URL');
  assert.ok(reserveIndex > 0 && openAiIndex > reserveIndex);
  const releases = SESSION_FUNCTION.match(/await releaseReservation\(supabaseUrl, serviceRoleKey, reservation\);/g) ?? [];
  assert.equal(releases.length, 2);
});

test('a chave da conversa vale 60 segundos', () => {
  assert.match(SESSION_FUNCTION, /CLIENT_SECRET_TTL_SECONDS = 60;/);
  assert.match(SESSION_FUNCTION, /expires_after: \{ anchor: 'created_at', seconds: CLIENT_SECRET_TTL_SECONDS \}/);
});

test('a resposta leva o id da reserva para o app renovar e encerrar', () => {
  assert.match(SESSION_FUNCTION, /voice_session_id: reservation\.sessionId,/);
  assert.match(SESSION_FUNCTION, /reserved_until: reservation\.expiresAt,/);
});
