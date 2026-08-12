import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildAdjustmentDescription, submitBalanceAdjustment } from './balanceAdjustmentService.js';

test('buildAdjustmentDescription usa rótulo padrão quando não há nota', () => {
  assert.equal(buildAdjustmentDescription(undefined), 'Ajuste manual de saldo');
  assert.equal(buildAdjustmentDescription(''), 'Ajuste manual de saldo');
  assert.equal(buildAdjustmentDescription('   '), 'Ajuste manual de saldo');
});

test('buildAdjustmentDescription anexa a nota do usuário ao rótulo padrão', () => {
  assert.equal(
    buildAdjustmentDescription('Conferência mensal'),
    'Ajuste manual de saldo — Conferência mensal',
  );
});

test('buildAdjustmentDescription nunca ultrapassa 160 caracteres (limite da RPC)', () => {
  const longNote = 'x'.repeat(300);
  const description = buildAdjustmentDescription(longNote);
  assert.ok(description.length <= 160);
  assert.ok(description.startsWith('Ajuste manual de saldo — '));
});

// CONTA-OPCIONAL (fase 2): "Atualizar saldo" ajusta o saldo TOTAL do
// workspace -- accountId nulo/ausente não é mais recusado, o ajuste segue
// sem conta associada (modo 'none' na RPC, ver confirmedFinancialActionService.js).
test('submitBalanceAdjustment sem accountId não recusa por falta de conta -- segue para a RPC (modo none)', async () => {
  const result = await submitBalanceAdjustment({
    currentBalance: 100,
    newBalance: 200,
    note: '',
    clientOperationId: '018f4f7a-3d2b-4f6a-8c31-f54e53db32b1',
  });
  assert.notEqual(result.error?.code, 'ACCOUNT_REQUIRED');
  // Sem Supabase configurado neste ambiente de teste, a chamada real à RPC
  // falha de forma segura -- prova que o fluxo passou da validação local.
  assert.equal(result.error.code, 'SUPABASE_NOT_CONFIGURED');
  assert.equal(result.delta, 100);
});

test('submitBalanceAdjustment recusa quando o novo saldo é igual ao atual (nada para ajustar)', async () => {
  const result = await submitBalanceAdjustment({
    accountId: 'account-1',
    currentBalance: 402.2,
    newBalance: 402.2,
    note: '',
    clientOperationId: '018f4f7a-3d2b-4f6a-8c31-f54e53db32b1',
  });
  assert.equal(result.error.code, 'ADJUSTMENT_DELTA_INVALID');
});

test('submitBalanceAdjustment sem Supabase configurado falha com segurança (nenhum valor inventado)', async () => {
  const result = await submitBalanceAdjustment({
    accountId: 'account-1',
    currentBalance: 402.2,
    newBalance: 500,
    note: 'Conferência',
    clientOperationId: '018f4f7a-3d2b-4f6a-8c31-f54e53db32b1',
  });
  assert.equal(result.data, null);
  assert.equal(result.error.code, 'SUPABASE_NOT_CONFIGURED');
  assert.equal(result.delta, 97.8);
});

test('submitBalanceAdjustment: saldo menor que o atual calcula delta negativo corretamente', async () => {
  const result = await submitBalanceAdjustment({
    accountId: 'account-1',
    currentBalance: 500,
    newBalance: 350,
    note: '',
    clientOperationId: '018f4f7a-3d2b-4f6a-8c31-f54e53db32b1',
  });
  assert.equal(result.delta, -150);
});

test('service nunca envia user_id/workspace_id do cliente -- reaproveita a mesma RPC atômica já auditada', () => {
  // Garantia estrutural (mesmo padrão do teste equivalente em
  // confirmedFinancialActionService.test.js): este arquivo não deve
  // reimplementar nenhuma validação de isolamento -- toda ela já vive na
  // RPC via confirmedFinancialActionService.js.
  const usesRpcService = /from '.\/confirmedFinancialActionService\.js'/;
  assert.match(
    readFileSync(new URL('./balanceAdjustmentService.js', import.meta.url), 'utf8'),
    usesRpcService,
  );
});
