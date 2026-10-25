// Regras puras de confiabilidade do billing-webhook. Mantidas separadas do
// handler Deno para que retry e falhas de escrita possam ser testados sem
// rede, Supabase remoto ou payloads reais da Asaas.

export type WebhookEventProcessingState = {
  processed_at?: string | null;
  processing_error?: string | null;
  processing_started_at?: string | null;
  next_attempt_at?: string | null;
  processing_attempts?: number;
  max_processing_attempts?: number;
};

export const WEBHOOK_PROCESSING_MAX_ATTEMPTS = 8;
export const WEBHOOK_PROCESSING_LEASE_MS = 10 * 60 * 1000;
export const WEBHOOK_RETRY_BASE_DELAY_MS = 30 * 1000;
export const WEBHOOK_RETRY_MAX_DELAY_MS = 30 * 60 * 1000;

export function isWebhookEventEligibleForProcessing(
  event: WebhookEventProcessingState | null,
): boolean {
  if (!event) return false;
  return (!event.processed_at || Boolean(event.processing_error))
    && (event.processing_attempts ?? 0) < (event.max_processing_attempts ?? WEBHOOK_PROCESSING_MAX_ATTEMPTS);
}

export function buildWebhookProcessingSuccessPatch(now: string) {
  return {
    processed_at: now,
    processing_error: null,
    processing_started_at: null,
    next_attempt_at: null,
  };
}

export function buildWebhookProcessingFailurePatch(
  processingError: string,
  processingAttempt = 1,
  now = new Date(),
) {
  const attempt = Math.max(1, Math.floor(processingAttempt));
  const delay = Math.min(
    WEBHOOK_RETRY_BASE_DELAY_MS * (2 ** (attempt - 1)),
    WEBHOOK_RETRY_MAX_DELAY_MS,
  );

  return {
    processed_at: null,
    processing_error: processingError,
    processing_started_at: null,
    next_attempt_at: new Date(now.getTime() + delay).toISOString(),
  };
}

export function assertBillingWebhookWriteSucceeded(
  response: { ok: boolean },
  operation: string,
): void {
  if (response.ok) return;

  // Erro deliberadamente categórico: nunca incorpora response body, URL,
  // payload, token ou outro dado potencialmente sensível.
  throw new Error(`BILLING_WEBHOOK_WRITE_FAILED:${operation}`);
}
