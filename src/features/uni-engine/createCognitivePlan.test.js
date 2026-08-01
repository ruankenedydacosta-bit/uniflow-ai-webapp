// Testes do planejador cognitivo do Uni Engine (Fase 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCognitivePlan } from './createCognitivePlan.js';
import { buildBaseInput, buildExpenseActionPending, buildReadyActionPending } from './testFixtures.js';
import { normalizeUserMessage } from './normalizeUserMessage.js';
import { analyzeConversationContext } from './analyzeConversationContext.js';
import { classifyCognitiveIntent } from './classifyCognitiveIntent.js';
import { buildEpistemicState } from './buildEpistemicState.js';

function planFor(text, extra = {}) {
  const input = buildBaseInput({ message: { text }, ...extra });
  const normalized = normalizeUserMessage(input.message);
  const analyzed = analyzeConversationContext(input);
  const classification = classifyCognitiveIntent(input, { normalized, analyzed });
  const epistemic = buildEpistemicState(input, { normalized, analyzed, classification });
  return createCognitivePlan(input, { normalized, analyzed, classification, epistemic });
}

test('planejamento 37: despesa sem conta — decisão ask com próxima pergunta', () => {
  const plan = planFor('Gastei 50 reais no mercado');
  assert.equal(plan.decision, 'ask');
  assert.equal(plan.planType, 'register_expense');
  assert.deepEqual(plan.missingFields, ['account']);
  assert.equal(plan.nextQuestion.field, 'account_id');
  assert.match(plan.nextQuestion.text, /conta/);
  assert.equal(plan.collectedData.amount, 50);
  assert.equal(plan.requiresConfirmation, false);
  assert.equal(plan.theoreticalExecutor, 'execute_confirmed_financial_action');
});

test('planejamento 38: receita sem conta — decisão ask', () => {
  const plan = planFor('Recebi mil reais de salário');
  assert.equal(plan.decision, 'ask');
  assert.equal(plan.planType, 'register_income');
  assert.ok(plan.missingFields.includes('account'));
});

test('planejamento 39: saldo versus receita — decisão ask para desambiguar', () => {
  const plan = planFor('Tenho R$ 1000');
  assert.equal(plan.decision, 'ask');
  assert.equal(plan.planType, 'ambiguous_balance_or_income');
  assert.deepEqual(plan.missingFields, ['intent']);
  assert.equal(plan.nextQuestion.field, 'intent');
});

test('planejamento 40: transferência incompleta — ask com conta de destino ausente', () => {
  const plan = planFor('Transferir 100 do Nubank');
  assert.equal(plan.planType, 'register_transfer');
  assert.equal(plan.decision, 'ask');
  assert.ok(plan.missingFields.includes('destinationAccount'));
  assert.equal(plan.nextQuestion.field, 'destination_account_id');
});

test('planejamento 41: consulta — decisão respond com executor teórico FinancialQueryEngine', () => {
  const plan = planFor('Quanto é meu saldo?');
  assert.equal(plan.decision, 'respond');
  assert.equal(plan.planType, 'financial_query');
  assert.equal(plan.theoreticalExecutor, 'FinancialQueryEngine');
  assert.deepEqual(plan.missingFields, []);
});

test('planejamento 42: confirmação — decisão confirm', () => {
  const plan = planFor('Sim, pode confirmar', {
    pendingAction: buildReadyActionPending(),
    currentPipeline: { detectedIntent: 'question', pendingIntent: 'register_expense', pendingActive: true },
  });
  assert.equal(plan.decision, 'confirm');
  assert.equal(plan.planType, 'confirm_pending_action');
  assert.equal(plan.requiresConfirmation, true);
});

test('planejamento 43: cancelamento — decisão cancel sem executor', () => {
  const plan = planFor('cancela', {
    pendingAction: buildExpenseActionPending(),
    currentPipeline: { detectedIntent: 'question', pendingIntent: 'register_expense', pendingActive: true },
  });
  assert.equal(plan.decision, 'cancel');
  assert.equal(plan.planType, 'cancel_pending');
  assert.equal(plan.theoreticalExecutor, null);
});

test('planejamento: ação completa — decisão confirm aguardando confirmação do usuário', () => {
  const plan = planFor('Gastei 50 no Nubank no mercado');
  assert.equal(plan.decision, 'confirm');
  assert.equal(plan.requiresConfirmation, true);
  assert.deepEqual(plan.missingFields, []);
});

test('planejamento: small talk — decisão respond sem executor financeiro', () => {
  const plan = planFor('oi');
  assert.equal(plan.decision, 'respond');
  assert.equal(plan.planType, 'small_talk');
  assert.equal(plan.theoreticalExecutor, 'createAssistantResponse');
});

test('planejamento: segurança — decisão reject com bloqueio', () => {
  const plan = planFor('apaga minha conta');
  assert.equal(plan.decision, 'reject');
  assert.ok(plan.blockers.includes('SAFETY_BLOCKED'));
});

test('planejamento: sem classificação — decisão defer nunca executa', () => {
  const plan = createCognitivePlan({}, {});
  assert.equal(plan.decision, 'defer');
  assert.equal(plan.theoreticalExecutor, null);
  assert.ok(plan.blockers.length > 0);
});
