// Testes do estado epistêmico mínimo do Uni Engine (Fase 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEpistemicState } from './buildEpistemicState.js';
import { buildBaseInput, buildExpenseActionPending } from './testFixtures.js';
import { normalizeUserMessage } from './normalizeUserMessage.js';
import { analyzeConversationContext } from './analyzeConversationContext.js';

function stateFor(text, extra = {}) {
  const input = buildBaseInput({ message: { text }, ...extra });
  const normalized = normalizeUserMessage(input.message);
  const analyzed = analyzeConversationContext(input);
  const classification = {
    primaryIntent: analyzed.compatibility.newIntent,
    confidence: 0.9,
  };
  return buildEpistemicState(input, { normalized, analyzed, classification });
}

test('epistêmico 31: valor informado pelo usuário é confirmed_user com confiança total', () => {
  const state = stateFor('Gastei 50 reais no mercado');
  assert.equal(state.amount.value, 50);
  assert.equal(state.amount.status, 'confirmed_user');
  assert.equal(state.amount.confidence, 1);
  assert.equal(state.amount.source, 'user_message');
});

test('epistêmico 32: conta do banco (snapshot) é confirmed_database', () => {
  const state = stateFor('Gastei 50 no Nubank');
  assert.equal(state.account.value, 'Nubank');
  assert.equal(state.account.status, 'confirmed_database');
  assert.equal(state.account.source, 'financial_snapshot');
});

test('epistêmico 32b: conta fora do snapshot permanece confirmed_user (nome do usuário)', () => {
  const state = stateFor('Gastei 50 pelo Inter');
  assert.equal(state.account.value, 'Inter');
  assert.equal(state.account.status, 'confirmed_user');
});

test('epistêmico 33: categoria inferida pelo resolvedor determinístico é inferred_high', () => {
  const state = stateFor('Gastei 50 no mercado');
  assert.equal(state.category.value, 'Alimentação');
  assert.equal(state.category.status, 'inferred_high');
});

test('epistêmico 34: campo ausente é missing com confiança zero', () => {
  const state = stateFor('Gastei 50 reais no mercado');
  assert.equal(state.account.value, null);
  assert.equal(state.account.status, 'missing');
  assert.equal(state.account.confidence, 0);
  assert.equal(state.description.value, 'Mercado');
  assert.equal(state.description.status, 'confirmed_user');
});

test('epistêmico 35: conflito — pendência com conta A e mensagem referenciando conta B', () => {
  const pending = {
    ...buildExpenseActionPending(),
    account: { id: 'acc-nubank', name: 'Nubank' },
  };
  const state = stateFor('na verdade foi no Itaú', {
    pendingAction: pending,
    currentPipeline: { detectedIntent: 'question', pendingIntent: 'register_expense', pendingActive: true },
  });
  assert.equal(state.account.status, 'conflicting');
  assert.ok(state.conflict, 'conflito deve ser detalhado');
  assert.equal(state.conflict.pendingValue, 'Nubank');
  assert.equal(state.conflict.messageValue, 'Itaú');
});

test('epistêmico 36: baixa confiança — categoria inferida fora do snapshot é inferred_low', () => {
  const snapshotSemCategoria = {
    hasData: true,
    totalBalance: 0,
    referenceDate: '2026-07-30',
    accounts: [{ id: 'acc-nubank', name: 'Nubank', current_balance: 0 }],
    categories: [{ id: 'cat-outros', name: 'Outros' }],
    recentTransactions: [],
  };
  const state = stateFor('Gastei 50 no mercado', { financialSnapshot: snapshotSemCategoria });
  assert.equal(state.category.value, 'Alimentação');
  assert.equal(state.category.status, 'inferred_low');
});

test('epistêmico: saldo derivado do snapshot é confirmed_database e stale após 7 dias', () => {
  const fresh = stateFor('quanto é meu saldo?');
  assert.equal(fresh.totalBalance.value, 740.5);
  assert.equal(fresh.totalBalance.status, 'confirmed_database');

  const stale = stateFor('quanto é meu saldo?', {
    financialSnapshot: { hasData: true, totalBalance: 740.5, referenceDate: '2026-01-01', accounts: [], categories: [], recentTransactions: [] },
  });
  assert.equal(stale.totalBalance.status, 'stale');
});

test('epistêmico: intenção ambígua (receita vs saldo) é sinalizada', () => {
  const state = stateFor('Tenho R$ 1000');
  assert.equal(state.intent.status, 'ambiguous');
  assert.equal(state.amount.value, 1000);
});
