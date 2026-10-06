// Épico #116 / #114: troca de plano. Puro, sem I/O.
//
// Descer de plano vale na próxima cobrança: o ciclo atual nunca encolhe.
// Subir de plano cobra a diferença numa cobrança avulsa por Pix; quando ela é
// paga, o nível novo vale já no ciclo atual (voice_apply_upgrade). Nos dois
// casos, as próximas cobranças da assinatura passam a ter o preço novo.

export type PlanChangeKind = 'same' | 'downgrade' | 'upgrade';

export function resolvePlanChange(
  current: { id: string; priceBrl: number },
  target: { id: string; priceBrl: number },
): { kind: PlanChangeKind; differenceBrl: number } {
  if (current.id === target.id) return { kind: 'same', differenceBrl: 0 };
  const differenceBrl = Math.round((target.priceBrl - current.priceBrl) * 100) / 100;
  return { kind: differenceBrl > 0 ? 'upgrade' : 'downgrade', differenceBrl };
}

const UPGRADE_REFERENCE_PREFIX = 'upgrade';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIER_IDS = new Set(['essencial', 'uni_voz', 'uni_voz_plus']);

// externalReference da cobrança da diferença: o webhook usa para saber de
// qual assinatura e para qual nível ela é.
export function buildUpgradeReference(subscriptionId: string, tierId: string): string {
  return `${UPGRADE_REFERENCE_PREFIX}:${subscriptionId}:${tierId}`;
}

export function parseUpgradeReference(value: unknown): { subscriptionId: string; tierId: string } | null {
  if (typeof value !== 'string') return null;
  const [prefix, subscriptionId, tierId, ...rest] = value.split(':');
  if (prefix !== UPGRADE_REFERENCE_PREFIX || rest.length) return null;
  if (!UUID_PATTERN.test(subscriptionId ?? '') || !TIER_IDS.has(tierId ?? '')) return null;
  return { subscriptionId, tierId };
}

export function buildUpgradeChargePayload({
  asaasCustomerId, subscriptionId, tier, differenceBrl, today,
}: {
  asaasCustomerId: string;
  subscriptionId: string;
  tier: { id: string; name: string };
  differenceBrl: number;
  today: string;
}): Record<string, unknown> {
  return {
    customer: asaasCustomerId,
    billingType: 'PIX',
    value: differenceBrl,
    dueDate: today,
    description: `Troca para o ${tier.name} - UniFlow AI`,
    externalReference: buildUpgradeReference(subscriptionId, tier.id),
  };
}

const PAID_STATUSES = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);

export function isPaidCharge(payment: Record<string, unknown> | null | undefined): boolean {
  return PAID_STATUSES.has(String(payment?.status ?? '').toUpperCase());
}
