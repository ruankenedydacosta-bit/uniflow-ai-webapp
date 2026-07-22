// Lógica pura de regra de recorrência de lançamentos financeiros.
// Nenhuma dependência de React/Supabase — testável via node --test.
//
// IMPORTANTE (pendência documentada): esta fase só registra a INTENÇÃO de
// recorrência no lançamento original (`is_recurring` + `recurrence_rule`,
// colunas já existentes em public.transactions). NENHUMA transação futura
// é gerada automaticamente — isso exigiria um scheduler/Edge Function
// agendado, que está fora do escopo desta implementação (infra separada).

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida se `rule` é um objeto de recorrência bem formado:
 * { frequency: 'daily'|'weekly'|'monthly'|'yearly', interval: number>=1, endDate?: 'YYYY-MM-DD' }
 */
export function isValidRecurrenceRule(rule) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    return false;
  }
  if (!RECURRENCE_FREQUENCIES.includes(rule.frequency)) {
    return false;
  }
  if (!Number.isInteger(rule.interval) || rule.interval < 1) {
    return false;
  }
  if (rule.endDate !== undefined && rule.endDate !== null) {
    if (typeof rule.endDate !== 'string' || !DATE_PATTERN.test(rule.endDate)) {
      return false;
    }
  }
  return true;
}

/**
 * Monta e valida uma `recurrence_rule` a partir dos valores brutos do
 * formulário. Retorna `null` se a entrada for inválida (o chamador decide
 * como reagir — nunca persiste uma regra inválida).
 */
export function buildRecurrenceRule({ frequency, interval, endDate } = {}) {
  const rule = {
    frequency,
    interval: Number.isFinite(Number(interval)) ? Math.trunc(Number(interval)) : NaN,
  };

  if (endDate) {
    rule.endDate = endDate;
  }

  return isValidRecurrenceRule(rule) ? rule : null;
}
