// Testes da Memória Operacional do Uni Engine (Fase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATIONAL_MEMORY_FIELDS,
  buildMemoryPatch,
  createOperationalMemory,
  readOperationalMemory,
  resetOperationalMemory,
  updateOperationalMemory,
} from './operationalMemory.js';
import { TEST_SNAPSHOT } from './testFixtures.js';

test('memória 70: fábrica cria memória vazia com todos os campos', () => {
  const memory = createOperationalMemory();
  assert.equal(memory.lastIntent, null);
  assert.equal(memory.lastAccount, null);
  assert.equal(memory.lastValue, null);
  assert.equal(memory.turnCount, 0);
  OPERATIONAL_MEMORY_FIELDS.forEach((field) => {
    assert.ok(Object.hasOwn(memory, field), `campo ${field} deve existir`);
  });
});

test('memória 71: fábrica aceita seed e ignora chaves desconhecidas', () => {
  const memory = createOperationalMemory({
    lastIntent: 'register_expense',
    lastAccount: 'Nubank',
    chaveDesconhecida: 'não entra',
  });
  assert.equal(memory.lastIntent, 'register_expense');
  assert.equal(memory.lastAccount, 'Nubank');
  assert.equal(Object.hasOwn(memory, 'chaveDesconhecida'), false);
});

test('memória 72: update aplica patch apenas em campos conhecidos', () => {
  const memory = createOperationalMemory();
  updateOperationalMemory(memory, {
    lastIntent: 'register_expense',
    lastValue: 50,
    lixo: true,
  });
  assert.equal(memory.lastIntent, 'register_expense');
  assert.equal(memory.lastValue, 50);
  assert.equal(Object.hasOwn(memory, 'lixo'), false);
});

test('memória 73: read devolve cópia segura e não compartilha referência', () => {
  const memory = createOperationalMemory({ lastAccount: 'Nubank', lastValue: 50 });
  const copy = readOperationalMemory(memory);
  assert.equal(copy.lastAccount, 'Nubank');
  assert.equal(copy.lastValue, 50);
  copy.lastAccount = 'Itaú';
  assert.equal(memory.lastAccount, 'Nubank', 'cópia não pode alterar a memória original');
});

test('memória 74: reset volta ao estado inicial sem trocar o objeto', () => {
  const memory = createOperationalMemory({ lastIntent: 'register_expense', turnCount: 4 });
  const same = resetOperationalMemory(memory);
  assert.equal(same, memory);
  assert.equal(memory.lastIntent, null);
  assert.equal(memory.turnCount, 0);
});

test('memória 75: buildMemoryPatch deriva todos os campos da rodada', () => {
  const patch = buildMemoryPatch({
    classification: {
      messageType: 'action',
      primaryIntent: 'register_expense',
    },
    plan: {
      decision: 'confirm',
      planType: 'register_expense',
      executorExpected: 'execute_confirmed_financial_action',
    },
    epistemic: {
      amount: { value: 50, status: 'confirmed_user' },
      account: { value: 'Nubank', status: 'confirmed_database' },
      category: { value: 'Alimentação', status: 'inferred_high' },
      description: { value: 'Mercado', status: 'confirmed_user' },
    },
    referenceResolution: { resolved: false },
    cognitiveContext: {
      currentSubject: 'register_expense:Mercado',
      lastQuestionAsked: 'Em qual conta você fez esse lançamento?',
    },
    messageText: 'Gastei 50 no mercado no Nubank',
    lastUniMessage: 'Em qual conta?',
    snapshot: TEST_SNAPSHOT,
    memory: { turnCount: 2 },
  });
  assert.equal(patch.lastIntent, 'register_expense');
  assert.equal(patch.lastMessageType, 'action');
  assert.equal(patch.lastAction, 'register_expense');
  assert.equal(patch.lastAccount, 'Nubank');
  assert.equal(patch.lastAccountId, 'acc-nubank');
  assert.equal(patch.lastCategory, 'Alimentação');
  assert.equal(patch.lastValue, 50);
  assert.equal(patch.lastEntity, 'Mercado');
  assert.equal(patch.lastExecutor, 'execute_confirmed_financial_action');
  assert.equal(patch.lastPlanDecision, 'confirm');
  assert.equal(patch.lastPlanType, 'register_expense');
  assert.equal(patch.lastQuestion, 'Em qual conta você fez esse lançamento?');
  assert.equal(patch.lastSubject, 'register_expense:Mercado');
  assert.equal(patch.lastUserMessage, 'Gastei 50 no mercado no Nubank');
  assert.equal(patch.lastUniMessage, 'Em qual conta?');
  assert.equal(patch.turnCount, 3);
  assert.equal(patch.lastConfirmation, undefined, 'sem confirmação não altera o campo');
});

test('memória 76: confirmação e cancelamento gravam lastConfirmation', () => {
  const confirmed = buildMemoryPatch({
    classification: { messageType: 'confirmation', primaryIntent: 'confirm_pending' },
    cognitiveContext: { currentSubject: 'register_expense:pending' },
    memory: { turnCount: 0 },
  });
  assert.equal(confirmed.lastConfirmation, 'confirmed');

  const cancelled = buildMemoryPatch({
    classification: { messageType: 'cancellation', primaryIntent: 'cancel_pending' },
    cognitiveContext: { currentSubject: 'register_expense:pending' },
    memory: { turnCount: 0 },
  });
  assert.equal(cancelled.lastConfirmation, 'cancelled');
});

test('memória 77: correção grava lastCorrection e query grava lastQuery', () => {
  const correction = buildMemoryPatch({
    classification: { messageType: 'correction', primaryIntent: 'register_expense' },
    messageText: 'na verdade era 80',
    memory: { turnCount: 0 },
  });
  assert.equal(correction.lastCorrection, 'na verdade era 80');

  const query = buildMemoryPatch({
    classification: { messageType: 'query', primaryIntent: 'check_balance' },
    messageText: 'quanto tenho?',
    memory: { turnCount: 0 },
  });
  assert.equal(query.lastQuery, 'quanto tenho?');
});

test('memória 78: referência resolvida é registrada em lastReference', () => {
  const patch = buildMemoryPatch({
    classification: { messageType: 'action', primaryIntent: 'register_expense' },
    referenceResolution: {
      resolved: true,
      referenceType: 'account',
      resolution: {
        type: 'account',
        value: 'Nubank',
        description: 'Nubank',
        source: 'operational_memory',
        confidence: 0.9,
      },
    },
    cognitiveContext: { currentSubject: 'register_expense:Nubank' },
    memory: { turnCount: 1 },
  });
  assert.deepEqual(patch.lastReference, {
    type: 'account',
    value: 'Nubank',
    source: 'operational_memory',
    confidence: 0.9,
  });
});

test('memória: update integrado com patch completo funciona em cadeia', () => {
  const memory = createOperationalMemory();
  const patch = buildMemoryPatch({
    classification: { messageType: 'action', primaryIntent: 'register_expense' },
    epistemic: {
      amount: { value: 50, status: 'confirmed_user' },
      account: { value: 'Nubank', status: 'confirmed_database' },
    },
    cognitiveContext: { currentSubject: 'register_expense:Nubank' },
    snapshot: TEST_SNAPSHOT,
    memory,
  });
  updateOperationalMemory(memory, patch);
  assert.equal(memory.lastIntent, 'register_expense');
  assert.equal(memory.lastAccount, 'Nubank');
  assert.equal(memory.lastValue, 50);
  assert.equal(memory.turnCount, 1);
});
