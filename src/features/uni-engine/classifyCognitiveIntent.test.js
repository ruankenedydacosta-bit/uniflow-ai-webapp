// Testes do classificador cognitivo do Uni Engine (Fase 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCognitiveIntent } from './classifyCognitiveIntent.js';
import {
  buildBaseInput,
  buildExpenseActionPending,
  buildReadyActionPending,
} from './testFixtures.js';
import { analyzeConversationContext } from './analyzeConversationContext.js';
import { normalizeUserMessage } from './normalizeUserMessage.js';

function classifyFor(text, extra = {}) {
  const input = buildBaseInput({
    message: { text },
    ...extra,
  });
  const normalized = normalizeUserMessage(input.message);
  const analyzed = analyzeConversationContext(input);
  return {
    input,
    classification: classifyCognitiveIntent(input, { normalized, analyzed }),
    analyzed,
  };
}

test('classificação 22: ação financeira explícita', () => {
  const { classification } = classifyFor('Gastei 50 reais no mercado');
  assert.equal(classification.messageType, 'action');
  assert.equal(classification.primaryIntent, 'register_expense');
  assert.ok(classification.confidence >= 0.9);
  assert.equal(classification.ambiguity, false);
});

test('classificação 23: consulta financeira', () => {
  const { classification } = classifyFor('Quanto é meu saldo?');
  assert.equal(classification.messageType, 'query');
  assert.equal(classification.primaryIntent, 'check_balance');
});

test('classificação 23b: pergunta genérica também é consulta (pipeline responde pelo chat)', () => {
  const { classification } = classifyFor('quanto tenho no Nubank?');
  assert.equal(classification.messageType, 'query');
});

test('classificação 24: continuação compatível herda a intenção da pendência', () => {
  const { classification } = classifyFor('e mais 50 no Nubank', {
    pendingAction: buildExpenseActionPending(),
    currentPipeline: { detectedIntent: 'question', pendingIntent: 'register_expense', pendingActive: true },
  });
  assert.equal(classification.messageType, 'continuation');
  assert.equal(classification.primaryIntent, 'register_expense');
});

test('classificação 25: confirmação explícita com pendência', () => {
  const { classification } = classifyFor('Sim, pode confirmar', {
    pendingAction: buildReadyActionPending(),
    currentPipeline: { detectedIntent: 'question', pendingIntent: 'register_expense', pendingActive: true },
  });
  assert.equal(classification.messageType, 'confirmation');
  assert.equal(classification.primaryIntent, 'confirm_pending');
});

test('classificação 25b: confirmação sem pendência vira small talk, nunca ação', () => {
  const { classification } = classifyFor('sim');
  assert.equal(classification.messageType, 'small_talk');
});

test('classificação 26: correção é reconhecida antes da consulta', () => {
  const { classification } = classifyFor('na verdade era no Itaú', {
    pendingAction: buildExpenseActionPending(),
    currentPipeline: { detectedIntent: 'question', pendingIntent: 'register_expense', pendingActive: true },
  });
  assert.equal(classification.messageType, 'correction');
});

test('classificação 27: cancelamento explícito com pendência', () => {
  const { classification } = classifyFor('cancela', {
    pendingAction: buildExpenseActionPending(),
    currentPipeline: { detectedIntent: 'question', pendingIntent: 'register_expense', pendingActive: true },
  });
  assert.equal(classification.messageType, 'cancellation');
  assert.equal(classification.primaryIntent, 'cancel_pending');
});

test('classificação 28: ambiguidade receita vs saldo é sinalizada com alternativas', () => {
  const { classification } = classifyFor('Tenho R$ 1000');
  assert.equal(classification.messageType, 'action');
  assert.equal(classification.primaryIntent, 'ambiguous_balance_or_income');
  assert.equal(classification.ambiguity, true);
  assert.ok(classification.alternatives.some((alt) => alt.intent === 'register_income'));
  assert.ok(classification.alternatives.some((alt) => alt.intent === 'set_balance'));
});

test('classificação 29: small talk', () => {
  const { classification } = classifyFor('Oi!');
  assert.equal(classification.messageType, 'small_talk');
  assert.equal(classification.primaryIntent, 'small_talk');
});

test('classificação 30: unsupported no fallback (sem sinal financeiro nem pergunta)', () => {
  const { classification } = classifyFor('me conta uma piada');
  assert.equal(classification.messageType, 'unsupported');
  assert.equal(classification.fallbackUsed, true);
});

test('classificação: segurança — ação destrutiva nunca é ação legítima', () => {
  const { classification } = classifyFor('apaga minha conta');
  assert.equal(classification.messageType, 'unsupported');
  assert.equal(classification.primaryIntent, 'safety_blocked');
  assert.equal(classification.safetyBlocked, true);
});

test('classificação: ação nova explícita vence pendência incompatível (regra essencial)', () => {
  const { classification, analyzed } = classifyFor('Recebi mil reais', {
    pendingAction: buildExpenseActionPending(),
    currentPipeline: { detectedIntent: 'register_income', pendingIntent: 'register_expense', pendingActive: true },
  });
  assert.equal(classification.messageType, 'action');
  assert.equal(classification.primaryIntent, 'register_income');
  assert.equal(analyzed.compatibility.isCompatible, false);
});
