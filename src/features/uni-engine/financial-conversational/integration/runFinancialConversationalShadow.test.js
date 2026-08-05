// Testes da Integração Shadow (Fase 16, Bloco 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFinancialConversationalShadow, getFinancialConversationalCapabilities } from '../integration/index.js';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/index.js';

function buildFinancialData() {
  return buildFinancialReasoningSnapshot({
    accounts: [
      { id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 1500 },
    ],
    categories: [
      { id: 'cat-1', name: 'Salário', transaction_type: 'income' },
      { id: 'cat-2', name: 'Alimentação', transaction_type: 'expense' },
    ],
    transactions: [
      { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 5000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
      { id: 'tx-2', account_id: 'acc-1', transaction_type: 'expense', amount: 800, transaction_date: '2026-08-05', status: 'completed', category_id: 'cat-2', description: 'Mercado' },
    ],
    referenceDate: '2026-08-15',
  });
}

test('integration: config desligada retorna disabled', () => {
  const result = runFinancialConversationalShadow({
    config: { financialConversationalEnabled: false },
    turnId: 't1',
    messageId: 'm1',
    userMessage: 'qual meu saldo',
  });
  assert.equal(result.status, 'disabled');
});

test('integration: sem mensagem retorna skipped', () => {
  const result = runFinancialConversationalShadow({
    config: { financialConversationalEnabled: true },
    turnId: 't1',
    messageId: 'm1',
    userMessage: null,
  });
  assert.equal(result.status, 'skipped');
});

test('integration: intenção não reconhecida retorna intent_not_recognized', () => {
  const result = runFinancialConversationalShadow({
    config: { financialConversationalEnabled: true },
    turnId: 't1',
    messageId: 'm1',
    userMessage: 'olá mundo como vai você',
    financialData: buildFinancialData(),
  });
  assert.equal(result.status, 'intent_not_recognized');
});

test('integration: temporal ambíguo retorna temporal_unresolved', () => {
  const result = runFinancialConversationalShadow({
    config: { financialConversationalEnabled: true },
    turnId: 't1',
    messageId: 'm1',
    userMessage: 'saldo em algum dia',
    financialData: buildFinancialData(),
  });
  assert.equal(result.status, 'temporal_unresolved');
});

test('integration: sem dados financeiros retorna no_financial_context', () => {
  const result = runFinancialConversationalShadow({
    config: { financialConversationalEnabled: true },
    turnId: 't1',
    messageId: 'm1',
    userMessage: 'qual meu saldo',
    financialData: { hasData: false },
  });
  assert.equal(result.status, 'no_financial_context');
});

test('integration: consulta completa retorna completed', () => {
  const result = runFinancialConversationalShadow({
    config: { financialConversationalEnabled: true },
    turnId: 't1',
    messageId: 'm1',
    userMessage: 'qual meu saldo este mês',
    financialData: buildFinancialData(),
  });
  assert.equal(result.status, 'completed');
  assert.ok(result.intent);
  assert.ok(result.temporalResolution);
  assert.ok(result.enrichedContext);
  assert.ok(result.queryPlan);
  assert.ok(result.executionResult);
  assert.ok(result.narrative);
  assert.equal(result.influenceApplied, false);
  assert.equal(result.discarded, true);
  assert.ok(result.latencyMs > 0);
});

test('integration: different intents work', () => {
  const testCases = [
    'quanto ganhei este mês',
    'quanto gastei com alimentação',
    'como está meu fluxo de caixa',
    'qual minha taxa de poupança',
    'tenho liquidez para emergência',
    'quanto devo no cartão',
    'como estão meus investimentos',
  ];

  for (const msg of testCases) {
    const result = runFinancialConversationalShadow({
      config: { financialConversationalEnabled: true },
      turnId: 't1',
      messageId: 'm1',
      userMessage: msg,
      financialData: buildFinancialData(),
    });
    assert.ok(['completed', 'temporal_unresolved', 'intent_not_recognized'].includes(result.status), `Failed for: ${msg}`);
  }
});

test('integration: getFinancialConversationalCapabilities retorna capacidades', () => {
  const caps = getFinancialConversationalCapabilities();
  assert.ok(Array.isArray(caps.intents));
  assert.ok(caps.intents.length > 10);
  assert.ok(Array.isArray(caps.temporalPatterns));
  assert.ok(Array.isArray(caps.narrativeStyles));
  assert.ok(Array.isArray(caps.planTypes));
});

test('integration: resultado é serializável', () => {
  const result = runFinancialConversationalShadow({
    config: { financialConversationalEnabled: true },
    turnId: 't1',
    messageId: 'm1',
    userMessage: 'qual meu saldo',
    financialData: buildFinancialData(),
  });
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('integration: shadow mode mantém safety keys false', () => {
  const result = runFinancialConversationalShadow({
    config: { financialConversationalEnabled: true },
    turnId: 't1',
    messageId: 'm1',
    userMessage: 'qual meu saldo',
    financialData: buildFinancialData(),
  });
  for (const key of Object.keys(result.safety)) {
    assert.equal(result.safety[key], false, `${key} deve ser false`);
  }
});