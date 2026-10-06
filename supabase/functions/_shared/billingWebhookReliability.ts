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

// Compara o token recebido com o esperado em tempo constante. Comparar as
// strings direto sai no primeiro byte diferente e vaza o tamanho do segredo;
// o SHA-256 dos dois lados dá dois buffers de 32 bytes sempre.
export async function webhookTokenMatches(received: string, expected: string): Promise<boolean> {
  if (!received || !expected) return false;
  const encoder = new TextEncoder();
  const [receivedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(receivedDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
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
