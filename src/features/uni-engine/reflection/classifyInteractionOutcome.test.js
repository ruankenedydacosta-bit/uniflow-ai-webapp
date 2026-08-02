// Testes de classificação do resultado da interação (Fase 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyInteractionOutcome } from './classifyInteractionOutcome.js';

test('outcome: sucesso confirmado exige confirmação explícita', () => {
  assert.equal(classifyInteractionOutcome({
    actionConfirmed: true,
    successExplicit: true,
    actionExecuted: true,
  }), 'SUCCESS_CONFIRMED');
});

test('outcome: sucesso confirmado com ação executada e confirmada', () => {
  assert.equal(classifyInteractionOutcome({
    actionConfirmed: true,
    actionExecuted: true,
  }), 'SUCCESS_CONFIRMED');
});

test('outcome: sucesso inferido nunca é confirmado sem evidência', () => {
  assert.equal(classifyInteractionOutcome({
    actionExecuted: true,
    responseEmitted: true,
  }), 'SUCCESS_INFERRED');
});

test('outcome: resposta emitida sozinha não marca sucesso definitivo', () => {
  assert.equal(classifyInteractionOutcome({ responseEmitted: true }), 'UNKNOWN');
});

test('outcome: sucesso parcial quando pendência avançou mas continua ativa', () => {
  assert.equal(classifyInteractionOutcome({
    pendingAdvanced: true,
    pendingStillActive: true,
  }), 'PARTIAL_SUCCESS');
});

test('outcome: correção explícita tem prioridade sobre sucesso', () => {
  assert.equal(classifyInteractionOutcome({
    userCorrected: true,
    actionConfirmed: true,
    successExplicit: true,
  }), 'USER_CORRECTED');
});

test('outcome: cancelamento tem prioridade', () => {
  assert.equal(classifyInteractionOutcome({ actionCancelled: true }), 'USER_CANCELLED');
  assert.equal(classifyInteractionOutcome({ userCancelled: true }), 'USER_CANCELLED');
});

test('outcome: rejeição explícita', () => {
  assert.equal(classifyInteractionOutcome({ userRejected: true }), 'USER_REJECTED');
});

test('outcome: erro de sistema', () => {
  assert.equal(classifyInteractionOutcome({ systemError: true }), 'SYSTEM_ERROR');
});

test('outcome: erro de provider', () => {
  assert.equal(classifyInteractionOutcome({ providerError: true }), 'PROVIDER_ERROR');
});

test('outcome: provider unavailable', () => {
  assert.equal(classifyInteractionOutcome({ providerUnavailable: true }), 'PROVIDER_ERROR');
});

test('outcome: timeout é ambíguo, não sucesso', () => {
  assert.equal(classifyInteractionOutcome({ timeout: true, responseEmitted: true }), 'PROVIDER_ERROR');
});

test('outcome: ambiguidade', () => {
  assert.equal(classifyInteractionOutcome({ ambiguous: true }), 'AMBIGUOUS_RESULT');
});

test('outcome: não resolvido por repetição', () => {
  assert.equal(classifyInteractionOutcome({ userRepeated: true }), 'UNRESOLVED');
});

test('outcome: abandonado por mudança de assunto', () => {
  assert.equal(classifyInteractionOutcome({ topicChanged: true }), 'ABANDONED');
});

test('outcome: erro de sistema domina até sobre correção', () => {
  assert.equal(classifyInteractionOutcome({
    systemError: true,
    userCorrected: true,
    actionExecuted: true,
  }), 'SYSTEM_ERROR');
});

test('outcome: entrada vazia ou nula é UNKNOWN', () => {
  assert.equal(classifyInteractionOutcome(), 'UNKNOWN');
  assert.equal(classifyInteractionOutcome(null), 'UNKNOWN');
  assert.equal(classifyInteractionOutcome({}), 'UNKNOWN');
});
