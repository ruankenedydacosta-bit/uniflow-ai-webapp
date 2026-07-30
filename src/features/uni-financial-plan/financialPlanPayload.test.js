import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinancialPlanPayload } from './financialPlanPayload.js';
import { MAX_ACCOUNTS_SENT, MAX_CATEGORIES_SENT, MAX_PHRASE_CHARS } from './financialPlanConfig.js';

const ACCOUNTS = [{ id: 'account-nubank', name: 'Nubank' }, { id: 'account-caixa', name: 'Caixa' }];
const CATEGORIES = [{ id: 'category-food', name: 'Alimentação', applies_to: 'personal' }];

test('payload contém apenas os campos permitidos', () => {
  const payload = buildFinancialPlanPayload({
    phrase: 'Gastei R$ 80 no mercado e R$ 50 de gasolina.',
    pendingPlanSummary: '',
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    referenceDate: '2026-07-29',
    timezone: 'America/Sao_Paulo',
  });
  assert.deepEqual(Object.keys(payload).sort(), [
    'accounts', 'categories', 'locale', 'pendingPlanSummary', 'phrase', 'referenceDate', 'timezone',
  ].sort());
  assert.equal(payload.locale, 'pt-BR');
  assert.equal(payload.referenceDate, '2026-07-29');
});

test('nunca inclui saldo, CPF, e-mail, telefone ou JWT -- por construção', () => {
  const payload = buildFinancialPlanPayload({
    phrase: 'Gastei 80 no mercado',
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    balance: 999999,
    cpf: '000.000.000-00',
    email: 'user@example.com',
    phone: '+5511999999999',
    jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  });
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /999999|000\.000\.000-00|user@example\.com|5511999999999|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
});

test('remove contas/categorias Business mesmo se vierem na lista', () => {
  const payload = buildFinancialPlanPayload({
    phrase: 'x',
    accounts: ACCOUNTS,
    categories: [
      ...CATEGORIES,
      { id: 'category-business', name: 'Marketing', applies_to: 'business' },
    ],
  });
  assert.equal(payload.categories.length, 1);
  assert.equal(payload.categories[0].id, 'category-food');
});

test('limita quantidade de contas e categorias aos tetos configurados', () => {
  const manyAccounts = Array.from({ length: MAX_ACCOUNTS_SENT + 5 }, (_, i) => ({ id: `acc-${i}`, name: `Conta ${i}` }));
  const manyCategories = Array.from({ length: MAX_CATEGORIES_SENT + 5 }, (_, i) => ({ id: `cat-${i}`, name: `Categoria ${i}` }));
  const payload = buildFinancialPlanPayload({ phrase: 'x', accounts: manyAccounts, categories: manyCategories });
  assert.equal(payload.accounts.length, MAX_ACCOUNTS_SENT);
  assert.equal(payload.categories.length, MAX_CATEGORIES_SENT);
});

test('frase é truncada no limite configurado', () => {
  const payload = buildFinancialPlanPayload({ phrase: 'a'.repeat(500) });
  assert.ok(payload.phrase.length <= MAX_PHRASE_CHARS);
});

test('timezone ausente cai no default America/Sao_Paulo', () => {
  const payload = buildFinancialPlanPayload({ phrase: 'x' });
  assert.equal(payload.timezone, 'America/Sao_Paulo');
});

test('referenceDate inválida (não string) vira null, nunca lança', () => {
  const payload = buildFinancialPlanPayload({ phrase: 'x', referenceDate: 12345 });
  assert.equal(payload.referenceDate, null);
});

test('entradas vazias/ausentes nunca lançam', () => {
  const payload = buildFinancialPlanPayload();
  assert.equal(payload.phrase, '');
  assert.deepEqual(payload.accounts, []);
  assert.deepEqual(payload.categories, []);
});

test('pendingPlanSummary é sanitizado (sem espaços duplicados nem caracteres de controle)', () => {
  const payload = buildFinancialPlanPayload({ phrase: 'x', pendingPlanSummary: 'Despesa   pendente' });
  assert.equal(payload.pendingPlanSummary, 'Despesa pendente');
});
