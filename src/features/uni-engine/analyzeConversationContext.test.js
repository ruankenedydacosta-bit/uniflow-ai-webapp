// Testes do analisador de contexto do Uni Engine (Fase 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeConversationContext } from './analyzeConversationContext.js';
import { buildBaseInput, buildExpenseActionPending, buildReadyActionPending } from './testFixtures.js';

test('contexto 15: sem pendência — nenhuma pendência é reportada', () => {
  const input = buildBaseInput();
  const analyzed = analyzeConversationContext(input);
  assert.equal(analyzed.pending.exists, false);
  assert.equal(analyzed.pending.intent, null);
  assert.equal(analyzed.compatibility.reason, 'no_pending');
});

test('contexto 16: pendência compatível — mesma intenção é continuada', () => {
  const input = buildBaseInput({
    message: { text: 'no Nubank' },
    pendingAction: buildExpenseActionPending(),
    currentPipeline: { detectedIntent: 'question', pendingIntent: 'register_expense', pendingActive: true },
  });
  const analyzed = analyzeConversationContext(input);
  assert.equal(analyzed.pending.exists, true);
  assert.equal(analyzed.pending.awaitedField, 'account');
  assert.equal(analyzed.compatibility.isCompatible, true);
  assert.equal(analyzed.compatibility.reason, 'answer_to_pending');
});

test('contexto 17: pendência incompatível — ação nova explícita não é resposta', () => {
  const input = buildBaseInput({
    message: { text: 'Recebi mil reais' },
    pendingAction: buildExpenseActionPending(),
    currentPipeline: { detectedIntent: 'register_income', pendingIntent: 'register_expense', pendingActive: true },
  });
  const analyzed = analyzeConversationContext(input);
  assert.equal(analyzed.compatibility.isCompatible, false);
  assert.equal(analyzed.compatibility.reason, 'incompatible_with_pending');
  assert.equal(analyzed.compatibility.startsNewExplicitAction, true);
});

test('contexto 18: confirmação aguardada é detectada no status ready do pipeline', () => {
  const input = buildBaseInput({
    message: { text: 'sim' },
    pendingAction: buildReadyActionPending(),
    currentPipeline: { detectedIntent: 'question', pendingIntent: 'register_expense', pendingActive: true },
  });
  const analyzed = analyzeConversationContext(input);
  assert.equal(analyzed.pending.awaitingConfirmation, true);
});

test('contexto 19: FinancialSnapshot ausente — finanças reportadas como ausentes sem quebrar', () => {
  const input = buildBaseInput({
    financialSnapshot: null,
    detectedIntent: 'question',
  });
  const analyzed = analyzeConversationContext(input);
  assert.equal(analyzed.financial.hasSnapshot, false);
  assert.equal(analyzed.financial.hasData, false);
  assert.equal(analyzed.workspace.accountCount, 0);
});

test('contexto 20: referência de conta na última mensagem do usuário', () => {
  const input = buildBaseInput({
    message: { text: 'ok' },
    conversationHistory: [
      { id: 'm1', from: 'user', text: 'Gastei 50 no Nubank' },
      { id: 'm2', from: 'uni', text: 'Registrar R$ 50?' },
    ],
    detectedIntent: 'question',
  });
  const analyzed = analyzeConversationContext(input);
  assert.equal(analyzed.history.lastUserMessage, 'Gastei 50 no Nubank');
  assert.equal(analyzed.history.lastAccountReference, 'Nubank');
});

test('contexto 21: referência de transação na última mensagem (descrição do snapshot)', () => {
  const input = buildBaseInput({
    message: { text: 'foi o mercado' },
    conversationHistory: [
      { id: 'm1', from: 'user', text: 'Mercado' },
    ],
    detectedIntent: 'question',
  });
  const analyzed = analyzeConversationContext(input);
  assert.ok(analyzed.history.lastTransactionReference);
  assert.equal(analyzed.history.lastTransactionReference.description, 'Mercado');
});

test('contexto: workspace pessoal e quantidade de contas vêm do snapshot informado', () => {
  const input = buildBaseInput({ userPreferences: { workspaceType: 'personal' } });
  const analyzed = analyzeConversationContext(input);
  assert.equal(analyzed.workspace.personal, true);
  assert.equal(analyzed.workspace.accountCount, 2);
  assert.equal(analyzed.financial.hasData, true);
});

test('contexto: dados de entrada nunca são modificados', () => {
  const input = buildBaseInput({
    pendingAction: buildExpenseActionPending(),
    currentPipeline: { detectedIntent: 'question', pendingIntent: 'register_expense', pendingActive: true },
  });
  const snapshot = JSON.stringify(input);
  analyzeConversationContext(input);
  assert.equal(JSON.stringify(input), snapshot);
});
