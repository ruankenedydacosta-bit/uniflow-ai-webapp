// Reserva de minutos da conversa por voz (épico #116 / #113). O servidor
// reserva blocos de até 5 minutos; o app renova perto do fim do bloco e
// encerra a conversa quando não há mais minutos. Puro: recebe a hora.

// Renova quando falta 1 minuto para o fim do bloco.
export const VOICE_RESERVATION_RENEW_BEFORE_MS = 60000;

// O servidor dá 30 s de folga depois do bloco (expires_at). A conversa para
// no fim do bloco de verdade, sem usar a folga.
export const VOICE_RESERVATION_GRACE_MS = 30000;

export function createVoiceReservation({ sessionId, reservedUntil, accessToken }) {
  const expiresAt = Date.parse(reservedUntil);
  if (typeof sessionId !== 'string' || !sessionId || !Number.isFinite(expiresAt)) return null;
  return {
    sessionId,
    accessToken: accessToken ?? null,
    stopAt: expiresAt - VOICE_RESERVATION_GRACE_MS,
    renewing: false,
    exhausted: false,
    closed: false,
  };
}

export const VOICE_RESERVATION_ACTIONS = Object.freeze({
  NONE: 'none',
  RENEW: 'renew',
  STOP: 'stop',
});

export function resolveVoiceReservationAction(reservation, now) {
  if (!reservation || reservation.closed) return VOICE_RESERVATION_ACTIONS.NONE;
  if (now >= reservation.stopAt) return VOICE_RESERVATION_ACTIONS.STOP;
  if (reservation.renewing || reservation.exhausted) return VOICE_RESERVATION_ACTIONS.NONE;
  if (reservation.stopAt - now <= VOICE_RESERVATION_RENEW_BEFORE_MS) return VOICE_RESERVATION_ACTIONS.RENEW;
  return VOICE_RESERVATION_ACTIONS.NONE;
}

// Resultado de voice_renew_block. Sem segundos novos, a conversa termina no
// fim do bloco atual.
export function applyVoiceRenewal(reservation, row) {
  const added = Number(row?.added_seconds);
  const expiresAt = Date.parse(row?.expires_at);
  if (!Number.isFinite(added) || added <= 0 || !Number.isFinite(expiresAt)) {
    return { ...reservation, renewing: false, exhausted: true };
  }
  return { ...reservation, renewing: false, stopAt: expiresAt - VOICE_RESERVATION_GRACE_MS };
}
