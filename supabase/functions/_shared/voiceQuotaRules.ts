// Épico #116 / #113: tradução do erro da reserva de minutos (função
// voice_reserve_block) para a resposta da Edge Function. Decide pelo HINT do
// banco, que é estável; a mensagem do banco nunca vai para a tela.

export type VoiceReserveRefusal = {
  status: number;
  code: string;
  message: string;
  fallback: 'text' | null;
};

const REFUSALS_BY_HINT: Record<string, VoiceReserveRefusal> = {
  voz_sem_saldo: {
    status: 403,
    code: 'VOICE_QUOTA_EXHAUSTED',
    message: 'Seus minutos de conversa por voz deste mês acabaram. Continue pelo texto.',
    fallback: 'text',
  },
  voz_sem_assinatura: {
    status: 403,
    code: 'SUBSCRIPTION_INACTIVE',
    message: 'A conversa por voz faz parte dos planos pagos. Continue pelo texto.',
    fallback: 'text',
  },
};

const UNKNOWN_REFUSAL: VoiceReserveRefusal = {
  status: 502,
  code: 'VOICE_QUOTA_UNAVAILABLE',
  message: 'Não foi possível abrir a conversa agora. Tente de novo em instantes.',
  fallback: null,
};

export function mapVoiceReserveError(body: unknown): VoiceReserveRefusal {
  const hint = typeof (body as { hint?: unknown })?.hint === 'string' ? (body as { hint: string }).hint : '';
  return REFUSALS_BY_HINT[hint] ?? UNKNOWN_REFUSAL;
}

export type VoiceReservation = {
  sessionId: string;
  reservedSeconds: number;
  expiresAt: string;
  remainingSeconds: number;
};

export function parseVoiceReservation(body: unknown): VoiceReservation | null {
  const row = Array.isArray(body) ? body[0] : body;
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  if (typeof record.session_id !== 'string' || typeof record.expires_at !== 'string') return null;
  const reservedSeconds = Number(record.reserved_seconds);
  const remainingSeconds = Number(record.remaining_seconds);
  if (!Number.isFinite(reservedSeconds) || reservedSeconds <= 0 || !Number.isFinite(remainingSeconds)) return null;
  return {
    sessionId: record.session_id,
    reservedSeconds,
    expiresAt: record.expires_at,
    remainingSeconds,
  };
}
