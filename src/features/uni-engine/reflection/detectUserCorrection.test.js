// Testes de detecção de correção do usuário (Fase 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectUserCorrection,
  detectTopicChange,
} from './detectUserCorrection.js';

test('correção: "não, é..."', () => {
  const result = detectUserCorrection('não, é a conta Nubank');
  assert.equal(result.isCorrection, true);
  assert.equal(result.type, 'correction');
});

test('correção: "eu quis dizer..."', () => {
  const result = detectUserCorrection('eu quis dizer a conta Itaú');
  assert.equal(result.isCorrection, true);
});

test('correção: "não foi isso"', () => {
  const result = detectUserCorrection('não foi isso que eu falei');
  assert.equal(result.isCorrection, true);
});

test('correção: "corrige..."', () => {
  const result = detectUserCorrection('corrige a categoria para transporte');
  assert.equal(result.isCorrection, true);
});

test('correção: "não é X, é Y" extrai par', () => {
  const result = detectUserCorrection('não é alimentação, é saúde');
  assert.equal(result.isCorrection, true);
  assert.deepEqual(result.correctionPair, { from: 'alimentação', to: 'saúde' });
});

test('correção: "você entendeu errado"', () => {
  const result = detectUserCorrection('você entendeu errado');
  assert.equal(result.isCorrection, true);
});

test('correção: "de novo não" e "já falei"', () => {
  assert.equal(detectUserCorrection('de novo não, a conta certa é Nubank').isCorrection, true);
  assert.equal(detectUserCorrection('já falei que é Nubank').isCorrection, true);
});

test('correção: cancelamento não vira correção', () => {
  const result = detectUserCorrection('não quero registrar essa despesa');
  assert.equal(result.isCorrection, false);
  assert.equal(result.isCancellation, true);
});

test('correção: confirmação não vira correção', () => {
  const result = detectUserCorrection('isso mesmo, pode registrar');
  assert.equal(result.isCorrection, false);
  assert.equal(result.isConfirmation, true);
});

test('correção: nova ação não vira correção', () => {
  const result = detectUserCorrection('gastei 50 reais no mercado');
  assert.equal(result.isCorrection, false);
  assert.equal(result.isNewAction, true);
});

test('correção: simples negação não vira correção', () => {
  const result = detectUserCorrection('não');
  assert.equal(result.isCorrection, false);
  assert.equal(result.isSimpleNegation, true);
});

test('correção: texto vazio ou nulo', () => {
  assert.equal(detectUserCorrection('').isCorrection, false);
  assert.equal(detectUserCorrection(null).type, 'none');
  assert.equal(detectUserCorrection(undefined).type, 'none');
});

test('correção: mudança de assunto não vira correção', () => {
  const result = detectTopicChange({
    text: 'gastei 50 reais no mercado',
    pendingActive: true,
    pendingIntent: 'register_expense',
    declaredIntent: 'check_balance',
  });
  assert.equal(result, true);
});

test('correção: mesma intenção não é mudança de assunto', () => {
  const result = detectTopicChange({
    text: 'gastei 50 reais no mercado',
    pendingActive: true,
    pendingIntent: 'register_expense',
    declaredIntent: 'register_expense',
  });
  assert.equal(result, false);
});
