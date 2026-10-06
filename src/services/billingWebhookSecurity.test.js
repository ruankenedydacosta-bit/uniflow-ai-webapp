import assert from 'node:assert/strict';
import test from 'node:test';
import { webhookTokenMatches } from '../../supabase/functions/_shared/billingWebhookReliability.ts';
import { isEventConfirmedByRemotePayment } from '../../supabase/functions/_shared/billingSubscriptionRules.ts';

// Épico #116 / #114: o webhook passa a liberar minutos de voz, então o corpo
// do evento deixa de decidir qualquer coisa.

test('token: só o valor exato passa; vazio nunca passa', async () => {
  assert.equal(await webhookTokenMatches('segredo-123', 'segredo-123'), true);
  assert.equal(await webhookTokenMatches('segredo-124', 'segredo-123'), false);
  assert.equal(await webhookTokenMatches('segredo', 'segredo-123'), false);
  assert.equal(await webhookTokenMatches('', 'segredo-123'), false);
  assert.equal(await webhookTokenMatches('segredo-123', ''), false);
  assert.equal(await webhookTokenMatches('', ''), false);
});

test('evento que ativa só vale se a cobrança reconsultada estiver paga', () => {
  for (const event of ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']) {
    assert.equal(isEventConfirmedByRemotePayment(event, 'CONFIRMED'), true, event);
    assert.equal(isEventConfirmedByRemotePayment(event, 'RECEIVED'), true, event);
    assert.equal(isEventConfirmedByRemotePayment(event, 'received_in_cash'), true, event);
    assert.equal(isEventConfirmedByRemotePayment(event, 'PENDING'), false, event);
    assert.equal(isEventConfirmedByRemotePayment(event, 'OVERDUE'), false, event);
    assert.equal(isEventConfirmedByRemotePayment(event, undefined), false, event);
  }
});

test('atraso só vale se a cobrança ainda estiver vencida; paga depois, não suspende', () => {
  assert.equal(isEventConfirmedByRemotePayment('PAYMENT_OVERDUE', 'OVERDUE'), true);
  assert.equal(isEventConfirmedByRemotePayment('PAYMENT_OVERDUE', 'RECEIVED'), false);
});

test('eventos que não mudam a assinatura não dependem de confirmação', () => {
  assert.equal(isEventConfirmedByRemotePayment('PAYMENT_CREATED', 'PENDING'), true);
  assert.equal(isEventConfirmedByRemotePayment('PAYMENT_DELETED', 'DELETED'), true);
});
