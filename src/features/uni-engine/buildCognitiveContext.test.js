// Testes do Motor de Contexto Cognitivo do Uni Engine (Fase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCognitiveContext } from './buildCognitiveContext.js';
import { createOperationalMemory } from './operationalMemory.js';
import { buildBaseInput, buildExpenseActionPending, buildReadyActionPending } from './testFixtures.js';

function contextFor(input, options = {}) {
  return buildCognitiveContext(input, {
    analyzed: options.analyzed ?? {
      pending: { exists: false, intent: null, awaitedField: null, awaitingConfirmation: false },
      history: {},
      compatibility: {},
    },
    classification: options.classification ?? { messageType: 'action', primaryIntent: 'register_expense' },
    epistemic: options.epistemic ?? null,
    referenceResolution: options.referenceResolution ?? null,
    memory: options.memory ?? null,
  });
}

test('contexto 80: rodada inicial — sem memória, contexto raso mas completo', () => {
  const ctx = contextFor(buildBaseInput());
  assert.equal(ctx.lastIntent, null);
  assert.equal(ctx.lastAction, null);
  assert.equal(ctx.pendingActive, false);
  assert.equal(ctx.confirmationPending, false);
  assert.equal(ctx.subjectChanged, false);
  assert.equal(ctx.turnCount, 0);
  assert.equal(ctx.contextRecovered, false);
  assert.equal(ctx.currentSubject, 'register_expense');
});

test('contexto 81: memória preenchida alimenta todas as últimas entidades', () => {
  const memory = createOperationalMemory({
    lastIntent: 'register_income',
    lastAction: 'register_income',
    lastAccount: 'Nubank',
    lastCategory: 'Salário',
    lastValue: 1000,
    lastEntity: 'Salário de julho',
    lastQuery: 'quanto tenho?',
    lastSubject: 'register_income:Salário de julho',
    turnCount: 3,
  });
  const ctx = contextFor(buildBaseInput(), {
    classification: { messageType: 'action', primaryIntent: 'register_expense' },
    epistemic: {
      description: { value: 'Mercado', status: 'confirmed_user' },
      account: { value: 'Itaú', status: 'confirmed_database' },
    },
    memory,
  });
  assert.equal(ctx.lastIntent, 'register_income');
  assert.equal(ctx.lastAction, 'register_income');
  assert.equal(ctx.lastAccount, 'Nubank');
  assert.equal(ctx.lastCategory, 'Salário');
  assert.equal(ctx.lastValue, 1000);
  assert.equal(ctx.lastTransaction, 'Salário de julho');
  assert.equal(ctx.lastQuery, 'quanto tenho?');
  assert.equal(ctx.turnCount, 3);
});

test('contexto 82: mudança de assunto detectada entre intenções', () => {
  const memory = createOperationalMemory({ lastSubject: 'register_income:Salário' });
  const ctx = contextFor(buildBaseInput(), {
    classification: { messageType: 'action', primaryIntent: 'register_expense' },
    epistemic: { description: { value: 'Mercado', status: 'confirmed_user' } },
    memory,
  });
  assert.equal(ctx.subjectChanged, true);
  assert.equal(ctx.currentSubject, 'register_expense:Mercado');
});

test('contexto 83: mesmo assunto não gera mudança', () => {
  const memory = createOperationalMemory({ lastSubject: 'register_expense:Mercado' });
  const ctx = contextFor(buildBaseInput(), {
    classification: { messageType: 'continuation', primaryIntent: 'register_expense' },
    epistemic: { description: { value: 'Mercado', status: 'confirmed_user' } },
    memory,
  });
  assert.equal(ctx.subjectChanged, false);
});

test('contexto 84: pendência ativa expõe campo aguardado, pergunta e confirmação', () => {
  const input = buildBaseInput({
    pendingAction: buildExpenseActionPending(),
    currentPipeline: { detectedIntent: 'register_expense', pendingIntent: 'register_expense', pendingActive: true },
  });
  const ctx = contextFor(input, {
    analyzed: {
      pending: {
        exists: true,
        intent: 'register_expense',
        awaitedField: 'account',
        awaitingConfirmation: false,
        collectedFields: { amount: 50, category: 'Alimentação' },
        status: 'needs_clarification',
      },
      history: {},
    },
    classification: { messageType: 'clarification', primaryIntent: 'register_expense' },
  });
  assert.equal(ctx.pendingActive, true);
  assert.equal(ctx.pendingIntent, 'register_expense');
  assert.equal(ctx.pendingAwaitedField, 'account');
  assert.equal(ctx.confirmationPending, false);
  assert.match(ctx.lastQuestionAsked, /conta/);
  assert.equal(ctx.executorExpected, null);
});

test('contexto 85: confirmação pendente prevê executor de confirmação', () => {
  const input = buildBaseInput({
    pendingAction: buildReadyActionPending(),
    currentPipeline: { detectedIntent: 'question', pendingIntent: 'register_expense', pendingActive: true },
  });
  const ctx = contextFor(input, {
    analyzed: {
      pending: { exists: true, intent: 'register_expense', awaitedField: null, awaitingConfirmation: true },
      history: {},
    },
    classification: { messageType: 'confirmation', primaryIntent: 'confirm_pending' },
  });
  assert.equal(ctx.confirmationPending, true);
  assert.equal(ctx.executorExpected, 'execute_confirmed_financial_action');
});

test('contexto 86: consulta prevê executor FinancialQueryEngine', () => {
  const ctx = contextFor(buildBaseInput(), {
    classification: { messageType: 'query', primaryIntent: 'check_balance' },
  });
  assert.equal(ctx.executorExpected, 'FinancialQueryEngine');
});

test('contexto 87: contexto recuperado reflete referência resolvida', () => {
  const ctx = contextFor(buildBaseInput(), {
    referenceResolution: {
      resolved: true,
      source: 'operational_memory',
      referenceType: 'account',
    },
  });
  assert.equal(ctx.contextRecovered, true);
});

test('contexto: última pergunta vem da memória quando não há pendência', () => {
  const memory = createOperationalMemory({ lastQuestion: 'Qual é o valor?' });
  const ctx = contextFor(buildBaseInput(), { memory });
  assert.equal(ctx.lastQuestionAsked, 'Qual é o valor?');
});
