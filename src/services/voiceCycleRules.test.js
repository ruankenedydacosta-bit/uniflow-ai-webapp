import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isVoiceCycleStillOpen, selectVoiceCycleGrants } from '../../supabase/functions/_shared/voiceCycleRules.ts';

const source = (path) => readFileSync(new URL(`../../supabase/functions/${path}`, import.meta.url), 'utf8');

// Épico #116 / #113: cobrança paga abre ciclo de minutos de voz.

test('ciclo vale do vencimento até o mesmo dia do mês seguinte', () => {
  assert.equal(isVoiceCycleStillOpen('2026-10-06', '2026-11-05'), true);
  assert.equal(isVoiceCycleStillOpen('2026-10-06', '2026-11-06'), false);
  assert.equal(isVoiceCycleStillOpen('2026-12-15', '2027-01-14'), true);
  assert.equal(isVoiceCycleStillOpen('06/10/2026', '2026-10-07'), false);
});

test('só cobrança paga e ainda no ciclo abre minutos', () => {
  const grants = selectVoiceCycleGrants([
    { id: 'pay_pago', status: 'RECEIVED', dueDate: '2026-10-06', subscription: 'sub_1' },
    { id: 'pay_confirmado', status: 'confirmed', dueDate: '2026-10-01' },
    { id: 'pay_pendente', status: 'PENDING', dueDate: '2026-10-06' },
    { id: 'pay_antigo', status: 'RECEIVED', dueDate: '2026-08-06' },
    { id: 'pay_sem_data', status: 'RECEIVED' },
    { status: 'RECEIVED', dueDate: '2026-10-06' },
  ], '2026-10-06');
  assert.deepEqual(grants, [
    { asaasPaymentId: 'pay_pago', dueDate: '2026-10-06' },
    { asaasPaymentId: 'pay_confirmado', dueDate: '2026-10-01' },
  ]);
});

test('webhook abre o ciclo com a cobrança reconsultada, depois da confirmação pela API', () => {
  const webhook = source('billing-webhook/index.ts');
  const confirmIndex = webhook.indexOf('if (!isEventConfirmedByRemotePayment(eventType, payment?.status))');
  const grantIndex = webhook.indexOf('selectVoiceCycleGrants([payment], today)');
  assert.ok(confirmIndex > 0 && grantIndex > confirmIndex);
});

test('billing-sync abre os ciclos que o webhook perdeu, só com assinatura ativa', () => {
  const sync = source('billing-sync/index.ts');
  assert.match(sync, /if \(updatedStatus === 'active'\) \{[\s\S]*?selectVoiceCycleGrants\(remotePayments, today\)/);
});

test('o ciclo é creditado pela função do banco, idempotente pela cobrança', () => {
  const rules = source('_shared/voiceCycleRules.ts');
  assert.match(rules, /\/rest\/v1\/rpc\/voice_grant_cycle/);
  assert.match(rules, /p_asaas_payment_id: grant\.asaasPaymentId/);
});
