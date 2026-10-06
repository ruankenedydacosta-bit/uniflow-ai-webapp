// Épico #116 / #113: qual cobrança paga abre um ciclo de minutos de voz.
// Puro, sem I/O: o webhook e o billing-sync chamam voice_grant_cycle para
// cada cobrança que passar aqui, e a função do banco é idempotente pelo id.

const PAID_PAYMENT_STATUSES = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);

export type VoiceCycleGrant = { asaasPaymentId: string; dueDate: string };

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Vencimento + 1 mês ainda no futuro: o ciclo dessa cobrança ainda vale.
// Cobranças antigas do histórico não abrem ciclo vencido.
export function isVoiceCycleStillOpen(dueDate: string, today: string): boolean {
  if (!isIsoDate(dueDate) || !isIsoDate(today)) return false;
  const [year, month, day] = dueDate.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, day));
  return end.toISOString().slice(0, 10) > today;
}

export function selectVoiceCycleGrants(
  payments: Array<Record<string, unknown>>,
  today: string,
): VoiceCycleGrant[] {
  return payments
    .filter((payment) => typeof payment?.id === 'string')
    .filter((payment) => PAID_PAYMENT_STATUSES.has(String(payment.status ?? '').toUpperCase()))
    .filter((payment) => payment.subscription === undefined || typeof payment.subscription === 'string')
    .filter((payment) => isIsoDate(payment.dueDate) && isVoiceCycleStillOpen(payment.dueDate, today))
    .map((payment) => ({ asaasPaymentId: payment.id as string, dueDate: payment.dueDate as string }));
}

export async function grantVoiceCycle({
  supabaseUrl, serviceRoleKey, subscriptionId, grant,
}: { supabaseUrl: string; serviceRoleKey: string; subscriptionId: string; grant: VoiceCycleGrant }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/voice_grant_cycle`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_subscription_id: subscriptionId,
      p_asaas_payment_id: grant.asaasPaymentId,
      p_due_date: grant.dueDate,
    }),
  });
  if (!response.ok) throw new Error('BILLING_WEBHOOK_WRITE_FAILED:voice_grant_cycle');
}
