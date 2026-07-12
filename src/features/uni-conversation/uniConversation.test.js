import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFinancialText } from '../uni-intents/index.js';
import {
  buildFinancialIntentAction,
  executeFinancialIntentAction,
} from './financialIntentAction.js';
import {
  initialUniConversationState,
  uniConversationReducer,
} from './uniConversationReducer.js';
import {
  buildCompletionResponse,
  buildExecutionErrorResponse,
} from './uniResponseBuilder.js';

const REFERENCE_DATE = '2026-07-11';
const accounts = [
  { id: 'account-nubank', name: 'Nubank', institution_name: 'Nubank', is_active: true },
  { id: 'account-main', name: 'Conta principal', institution_name: 'Itaú', is_active: true },
  { id: 'account-old', name: 'Conta antiga', institution_name: 'Banco Antigo', is_active: false },
];
const categories = [
  { id: 'category-food', name: 'Alimentação', category_type: 'expense', is_active: true },
  { id: 'category-income', name: 'Salário', category_type: 'income', is_active: true },
  { id: 'category-transfer', name: 'Transferência', category_type: 'transfer', is_active: true },
];

function createAction(input, options = {}) {
  const parsed = parseFinancialText(input, { referenceDate: REFERENCE_DATE });
  return buildFinancialIntentAction({
    parsed,
    accounts: options.accounts ?? accounts,
    categories: options.categories ?? categories,
    referenceDate: REFERENCE_DATE,
    overrides: options.overrides,
  });
}

test('despesa completa fica pronta para confirmação', () => {
  const action = createAction('Paguei 85 reais no mercado pelo Nubank.');

  assert.equal(action.status, 'ready');
  assert.equal(action.transactionType, 'expense');
  assert.equal(action.account.id, 'account-nubank');
  assert.equal(action.category.id, 'category-food');
  assert.equal(action.description, 'Mercado');
});

test('receita completa fica pronta para confirmação', () => {
  const action = createAction('Recebi 3000 de salário pela Conta principal.');

  assert.equal(action.status, 'ready');
  assert.equal(action.transactionType, 'income');
  assert.equal(action.account.id, 'account-main');
  assert.equal(action.category.id, 'category-income');
});

test('campo obrigatório ausente pergunta primeiro pela conta', () => {
  const action = createAction('Gastei 40 reais.');

  assert.equal(action.status, 'needs_clarification');
  assert.equal(action.issues[0].field, 'account');
  assert.equal(action.issues[0].code, 'account_required');
});

test('conta inexistente não é substituída silenciosamente', () => {
  const action = createAction('Paguei 40 de mercado pelo Banco Fantasma.');

  assert.equal(action.status, 'needs_clarification');
  assert.equal(action.issues[0].code, 'account_not_found');
});

test('conta arquivada é bloqueada para novo lançamento', () => {
  const action = createAction('Paguei 40 de mercado pela Conta antiga.');

  assert.equal(action.status, 'needs_clarification');
  assert.equal(action.issues[0].code, 'account_archived');
});

test('categoria aproximada existente é resolvida sem ser criada', () => {
  const action = createAction('Paguei 40 no mercado pelo Nubank.', {
    categories: [
      { id: 'category-market', name: 'Alimentação e mercado', category_type: 'expense', is_active: true },
    ],
  });

  assert.equal(action.status, 'ready');
  assert.equal(action.category.id, 'category-market');
  assert.equal(action.categoryWasApproximate, true);
});

test('confirmação envia somente o payload financeiro validado', async () => {
  const action = createAction('Paguei 85 reais no mercado pelo Nubank.');
  let receivedPayload = null;
  const result = await executeFinancialIntentAction(action, async (payload) => {
    receivedPayload = payload;
    return { data: { id: 'transaction-created', ...payload }, error: null };
  });

  assert.deepEqual(receivedPayload, {
    account_id: 'account-nubank',
    destination_account_id: null,
    category_id: 'category-food',
    transaction_type: 'expense',
    description: 'Mercado',
    amount: 85,
    transaction_date: REFERENCE_DATE,
    status: 'completed',
  });
  assert.equal(result.data.id, 'transaction-created');
  assert.equal(Object.hasOwn(receivedPayload, 'workspace_id'), false);
});

test('cancelamento muda o estado sem executar criação', () => {
  let createCalls = 0;
  const state = uniConversationReducer(
    { ...initialUniConversationState, status: 'awaiting_confirmation', action: createAction('Paguei 85 no mercado pelo Nubank.') },
    { type: 'CANCEL', response: 'Tudo bem. Não registrei nada.' },
  );
  if (state.status === 'executing') {
    createCalls += 1;
  }

  assert.equal(state.status, 'canceled');
  assert.equal(createCalls, 0);
});

test('erro do Supabase gera mensagem humana sem expor detalhe técnico', async () => {
  const action = createAction('Paguei 85 no mercado pelo Nubank.');
  const result = await executeFinancialIntentAction(action, async () => ({
    data: null,
    error: { code: '42501', message: 'new row violates row-level security policy' },
  }));
  const response = buildExecutionErrorResponse(result.error);

  assert.equal(result.error.code, '42501');
  assert.match(response.text, /Não consegui registrar/);
  assert.doesNotMatch(response.text, /row-level security/);
});

test('personalidade altera a redação sem alterar a ação financeira', () => {
  const action = createAction('Paguei 85 no mercado pelo Nubank.');
  const direct = buildCompletionResponse(action, { profileId: 'direct' });
  const warm = buildCompletionResponse(action, { profileId: 'warm' });

  assert.notEqual(direct.text, warm.text);
  assert.deepEqual(action.payload, createAction('Paguei 85 no mercado pelo Nubank.').payload);
  assert.equal(direct.personality.profileId, 'direct');
  assert.equal(warm.personality.profileId, 'warm');
});
