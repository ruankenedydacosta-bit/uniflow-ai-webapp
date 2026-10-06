// Saldo de minutos da conversa por voz (épico #116 / #113), lido da função
// get_my_voice_balance. O app só lê: reservar e cobrar é do servidor.
import { supabase } from './supabaseClient.js';

export function parseVoiceBalance(row) {
  if (!row || typeof row !== 'object') return null;
  const secondsGranted = Number(row.seconds_granted);
  const remainingSeconds = Number(row.remaining_seconds);
  return {
    tierId: typeof row.tier_id === 'string' ? row.tier_id : null,
    secondsGranted: Number.isFinite(secondsGranted) ? secondsGranted : 0,
    remainingSeconds: Number.isFinite(remainingSeconds) ? Math.max(0, remainingSeconds) : 0,
    cycleEndsAt: typeof row.cycle_ends_at === 'string' ? row.cycle_ends_at : null,
    hasActiveSubscription: row.has_active_subscription === true,
  };
}

export async function getMyVoiceBalance({ client = supabase } = {}) {
  if (!client) return { data: null, error: { code: 'NOT_CONFIGURED' } };
  try {
    const { data, error } = await client.rpc('get_my_voice_balance');
    if (error) return { data: null, error: { code: 'VOICE_BALANCE_UNAVAILABLE' } };
    return { data: parseVoiceBalance(Array.isArray(data) ? data[0] : data), error: null };
  } catch {
    return { data: null, error: { code: 'VOICE_BALANCE_UNAVAILABLE' } };
  }
}
