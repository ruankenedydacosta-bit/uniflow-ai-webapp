// Testes do Intent Runtime (Fase 17, Bloco 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFinancialIntent,
  getSupportedIntents,
  isValidIntent,
} from '../intent/index.js';

test('intent: texto vazio retorna unknown', () => {
  const result = resolveFinancialIntent('');
  assert.equal(result.type, 'unknown');
  assert.equal(result.confidence, 0);
});

test('intent: "qual meu saldo" detecta balance_query', () => {
  const result = resolveFinancialIntent('qual meu saldo');
  assert.equal(result.type, 'balance_query');
  assert.ok(result.confidence > 0.7);
});

test('intent: "quanto gastei" detecta expense_query', () => {
  const result = resolveFinancialIntent('quanto gastei');
  assert.equal(result.type, 'expense_query');
  assert.ok(result.confidence > 0.7);
});

test('intent: "quanto recebi" detecta income_query', () => {
  const result = resolveFinancialIntent('quanto recebi');
  assert.equal(result.type, 'income_query');
  assert.ok(result.confidence > 0.7);
});

test('intent: "quanto economizei" detecta savings_query', () => {
  const result = resolveFinancialIntent('quanto economizei');
  assert.equal(result.type, 'savings_query');
  assert.ok(result.confidence > 0.7);
});

test('intent: "patrimônio" detecta net_worth_query', () => {
  const result = resolveFinancialIntent('patrimônio');
  assert.equal(result.type, 'net_worth_query');
  assert.ok(result.confidence > 0.7);
});

test('intent: "fluxo de caixa" detecta cashflow_query', () => {
  const result = resolveFinancialIntent('fluxo de caixa');
  assert.equal(result.type, 'cashflow_query');
  assert.ok(result.confidence > 0.7);
});

test('intent: "em que categoria gastei mais" detecta category_breakdown_query', () => {
  const result = resolveFinancialIntent('em que categoria gastei mais');
  assert.equal(result.type, 'category_breakdown_query');
  assert.ok(result.confidence > 0.7);
});

test('intent: "saldo da conta Nubank" detecta account_query com entidade', () => {
  const result = resolveFinancialIntent('saldo da conta Nubank');
  assert.equal(result.type, 'account_query');
  assert.ok(result.entities.some(e => e.type === 'account' && e.value === 'Nubank'));
});

test('intent: "gastei mais em julho que em junho" detecta period_comparison_query', () => {
  const result = resolveFinancialIntent('gastei mais em julho que em junho');
  assert.equal(result.type, 'period_comparison_query');
  assert.ok(result.temporal?.entity === 'specific_month' || result.temporal?.entity === 'last_month');
});

test('intent: "projeção para próximo mês" detecta projection_query', () => {
  const result = resolveFinancialIntent('projeção para próximo mês');
  assert.equal(result.type, 'projection_query');
});

test('intent: "como estão minhas metas" detecta goals_query', () => {
  const result = resolveFinancialIntent('como estão minhas metas');
  assert.equal(result.type, 'goals_query');
});

test('intent: "fatura do cartão" detecta credit_query', () => {
  const result = resolveFinancialIntent('fatura do cartão');
  assert.equal(result.type, 'credit_query');
});

test('intent: "meus investimentos" detecta investments_query', () => {
  const result = resolveFinancialIntent('meus investimentos');
  assert.equal(result.type, 'investments_query');
});

test('intent: "gastos fixos" detecta recurring_query', () => {
  const result = resolveFinancialIntent('gastos fixos');
  assert.equal(result.type, 'recurring_query');
});

test('intent: "parcelas restantes" detecta installments_query', () => {
  const result = resolveFinancialIntent('parcelas restantes');
  assert.equal(result.type, 'installments_query');
});

test('intent: texto sem intenção financeira retorna unknown', () => {
  const result = resolveFinancialIntent('olá mundo como vai você');
  assert.equal(result.type, 'unknown');
  assert.equal(result.confidence, 0.3);
});

test('intent: getSupportedIntents retorna lista completa', () => {
  const intents = getSupportedIntents();
  assert.ok(Array.isArray(intents));
  assert.ok(intents.length >= 15);
  assert.ok(intents.includes('balance_query'));
  assert.ok(intents.includes('expense_query'));
  assert.ok(intents.includes('income_query'));
});

test('intent: isValidIntent valida corretamente', () => {
  assert.ok(isValidIntent('balance_query'));
  assert.ok(isValidIntent('expense_query'));
  assert.ok(!isValidIntent('invalid_intent'));
});

test('intent: resultado é serializável', () => {
  const result = resolveFinancialIntent('qual meu saldo este mês');
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});