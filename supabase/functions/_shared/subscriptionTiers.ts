// Épico #116 / #114: níveis do Plano Pessoal (public.subscription_tiers).
// O preço vem sempre do banco, nunca do corpo da requisição.

export const SUBSCRIPTION_TIER_IDS = new Set(['essencial', 'uni_voz', 'uni_voz_plus']);

// Versão antiga do app, que não manda o nível, assina o Uni Voz: o mesmo
// preço de antes dos três planos.
export const DEFAULT_SUBSCRIPTION_TIER_ID = 'uni_voz';

export type SubscriptionTier = {
  id: string;
  name: string;
  priceBrl: number;
  voiceSecondsPerCycle: number;
};

// null quando o valor enviado não é um nível conhecido.
export function resolveRequestedTierId(value: unknown): string | null {
  if (value === undefined || value === null) return DEFAULT_SUBSCRIPTION_TIER_ID;
  return typeof value === 'string' && SUBSCRIPTION_TIER_IDS.has(value) ? value : null;
}

export function parseSubscriptionTierRow(row: Record<string, unknown> | null | undefined): SubscriptionTier | null {
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') return null;
  const priceBrl = Number(row.price_brl);
  const voiceSecondsPerCycle = Number(row.voice_seconds_per_cycle);
  if (!Number.isFinite(priceBrl) || priceBrl <= 0 || !Number.isFinite(voiceSecondsPerCycle)) return null;
  return { id: row.id, name: row.name, priceBrl, voiceSecondsPerCycle };
}

export async function fetchActiveSubscriptionTier({
  supabaseUrl, apiKey, authorization, tierId,
}: { supabaseUrl: string; apiKey: string; authorization: string; tierId: string }): Promise<SubscriptionTier | null> {
  const params = new URLSearchParams({
    select: 'id,name,price_brl,voice_seconds_per_cycle',
    id: `eq.${tierId}`,
    active: 'eq.true',
    limit: '1',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/subscription_tiers?${params}`, {
    headers: { Authorization: authorization, apikey: apiKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? parseSubscriptionTierRow(rows[0]) : null;
}

export function buildSubscriptionDescription(tier: SubscriptionTier): string {
  return `Assinatura ${tier.name} - UniFlow AI`;
}
