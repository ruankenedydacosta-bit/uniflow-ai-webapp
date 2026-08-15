// Regras puras de confiabilidade do billing-webhook. Mantidas separadas do
// handler Deno para que retry e falhas de escrita possam ser testados sem
// rede, Supabase remoto ou payloads reais da Asaas.

export type WebhookEventProcessingState = {
  processed_at?: string | null;
  processing_error?: string | null;
};

export function isWebhookEventEligibleForProcessing(
  event: WebhookEventProcessingState | null,
): boolean {
  if (!event) return false;
  return !event.processed_at || Boolean(event.processing_error);
}

export function buildWebhookProcessingSuccessPatch(now: string) {
  return {
    processed_at: now,
    processing_error: null,
  };
}

export function buildWebhookProcessingFailurePatch(processingError: string) {
  return {
    processed_at: null,
    processing_error: processingError,
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
