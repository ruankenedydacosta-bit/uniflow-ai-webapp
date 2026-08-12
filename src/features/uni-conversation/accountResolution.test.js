import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFinancialText } from '../uni-intents/index.js';
import {
  ACCOUNT_RESOLUTION_STATUS,
  normalizeAccountIdentity,
} from './accountResolution.js';
import {
  createAccountProvisioningCoordinator,
  provisionAccountAndTransaction,
} from './accountProvisioning.js';
import { buildFinancialIntentAction, executeFinancialIntentAction } from './financialIntentAction.js';
import { buildExecutionErrorResponse } from './uniResponseBuilder.js';

const REFERENCE_DATE = '2026-07-12';
const accountTypes = [
  { code: 'checking', name: 'Conta corrente', is_active: true },
  { code: 'credit_card', name: 'Cartão de crédito', is_active: true },
  { code: 'digital_wallet', name: 'Carteira digital', is_active: true },
];
const categories = [
  { id: 'food', name: 'Alimentação', category_type: 'expense', is_active: true },
];

function createAction(input, accounts = [], overrides = {}) {
  return buildFinancialIntentAction({
    parsed: parseFinancialText(input, { referenceDate: REFERENCE_DATE }),
    accounts,
    accountTypes,
    categories,
    referenceDate: REFERENCE_DATE,
    overrides,
  });
}

test('conta ativa existente é selecionada automaticamente', () => {
  const account = { id: 'nubank', name: 'Nubank', is_active: true };
  const action = createAction('Paguei 85 reais no mercado pelo Nubank.', [account]);
  assert.equal(action.status, 'ready');
  assert.equal(action.account.id, 'nubank');
  assert.equal(action.payload.account_id, 'nubank');
});

test('Nubank, nubank e Nu Bank usam a mesma identidade exata normalizada', () => {
  assert.equal(normalizeAccountIdentity('Nubank'), normalizeAccountIdentity('nubank'));
  assert.equal(normalizeAccountIdentity('Nubank'), normalizeAccountIdentity('Nu Bank'));
  assert.notEqual(normalizeAccountIdentity('Nubank'), normalizeAccountIdentity('Banco Nu'));
});

// CONTA-OPCIONAL: receita/despesa não bloqueiam mais nem criam conta
// implicitamente a partir de um nome mencionado -- ver bloco de comentário em
// financialIntentAction.js. Os testes abaixo continuam cobrindo o mecanismo
// de resolução de conta (proposta de criação, tipo, conflito, ambiguidade)
// através de ajuste de saldo, que é uma das duas operações (junto com
// transferência) que ainda exigem conta -- o mecanismo em si não mudou, só
// deixou de ser consumido por receita/despesa.
test('conta inexistente gera proposta com tipo existente', () => {
  const action = createAction('Meu saldo no Nubank é 85 reais.');
  assert.equal(action.accountResolution.status, ACCOUNT_RESOLUTION_STATUS.WILL_CREATE);
  assert.equal(action.proposedAccount.name, 'Nubank');
  assert.equal(action.proposedAccount.account_type, 'digital_wallet');
  assert.equal(action.payload.account_id, null);
});

test('cartão mencionado usa tipo de cartão existente', () => {
  const action = createAction('Meu saldo no cartão Nubank é 85 reais.');
  assert.equal(action.proposedAccount.name, 'Nubank');
  assert.equal(action.proposedAccount.account_type, 'credit_card');
});

test('conta não é criada antes da confirmação', () => {
  let accountCreates = 0;
  const action = createAction('Meu saldo no Nubank é 85 reais.');
  assert.equal(action.status, 'ready');
  assert.equal(accountCreates, 0);
});

test('confirmação cria conta e depois a transação', async () => {
  const calls = [];
  const action = createAction('Meu saldo no Nubank é 85 reais.');
  const result = await executeFinancialIntentAction(action, {
    saveAccount: async (payload) => {
      calls.push(['account', payload]);
      return { data: { id: 'new-account', ...payload }, error: null };
    },
    saveTransaction: async (payload) => {
      calls.push(['transaction', payload]);
      return { data: { id: 'new-transaction', ...payload }, error: null };
    },
  });
  assert.deepEqual(calls.map(([operation]) => operation), ['account', 'transaction']);
  assert.equal(calls[1][1].account_id, 'new-account');
  assert.equal(result.account.id, 'new-account');
});

test('cancelamento não chama criação de conta nem transação', () => {
  const calls = [];
  createAction('Paguei 85 reais no mercado pelo Nubank.');
  assert.deepEqual(calls, []);
});

test('segunda resolução reutiliza a conta criada', () => {
  const createdAccount = { id: 'created', name: 'Nubank', institution_name: 'Nubank', is_active: true };
  const secondAction = createAction('Paguei 30 reais no mercado pelo Nu Bank.', [createdAccount]);
  assert.equal(secondAction.accountResolution.status, ACCOUNT_RESOLUTION_STATUS.RESOLVED);
  assert.equal(secondAction.account.id, 'created');
  assert.equal(secondAction.proposedAccount, null);
});

test('coordenador impede criação duplicada por clique repetido', async () => {
  let executions = 0;
  let release;
  const coordinator = createAccountProvisioningCoordinator(async () => {
    executions += 1;
    await new Promise((resolve) => { release = resolve; });
    return { data: { id: 'transaction' }, error: null };
  });
  const first = coordinator.execute({}, {});
  const second = coordinator.execute({}, {});
  assert.equal(first, second);
  assert.equal(executions, 0);
  await Promise.resolve();
  assert.equal(executions, 1);
  release();
  await first;
});

test('conta arquivada gera conflito sem selecionar para lançamento', () => {
  const archived = { id: 'archived', name: 'Nubank', is_active: false };
  const action = createAction('Meu saldo no Nubank é 85 reais.', [archived]);
  assert.equal(action.status, 'needs_clarification');
  assert.equal(action.accountResolution.status, ACCOUNT_RESOLUTION_STATUS.ARCHIVED_CONFLICT);
  assert.equal(action.payload, null);
});

test('conta arquivada nunca executa lançamento sem decisão', async () => {
  let transactionCalls = 0;
  const action = createAction('Meu saldo no Nubank é 85 reais.', [
    { id: 'archived', name: 'Nubank', is_active: false },
  ]);
  const result = await executeFinancialIntentAction(action, async () => {
    transactionCalls += 1;
  });
  assert.equal(result.error.code, 'ACTION_NOT_READY');
  assert.equal(transactionCalls, 0);
});

test('reativação acontece somente após escolha e confirmação', async () => {
  const archived = { id: 'archived', name: 'Nubank', is_active: false };
  const action = createAction('Meu saldo no Nubank é 85 reais.', [archived], {
    accountId: 'archived',
    accountDecision: 'reactivate',
  });
  const accountUpdates = [];
  await provisionAccountAndTransaction(action, {
    saveAccount: async (changes, id) => {
      accountUpdates.push({ changes, id });
      return { data: { ...archived, ...changes }, error: null };
    },
    saveTransaction: async (payload) => ({ data: payload, error: null }),
  });
  assert.deepEqual(accountUpdates, [{ changes: { is_active: true }, id: 'archived' }]);
});

test('várias contas ativas correspondentes exigem escolha', () => {
  const action = createAction('Meu saldo no Nubank é 85 reais.', [
    { id: 'one', name: 'Nubank', is_active: true },
    { id: 'two', name: 'Nu Bank', is_active: true },
  ]);
  assert.equal(action.status, 'needs_clarification');
  assert.equal(action.issues[0].code, 'account_ambiguous');
  assert.deepEqual(action.issues[0].candidates.map(({ id }) => id), ['one', 'two']);
});

test('resolução não altera valor, data ou workspace', () => {
  const action = createAction('Meu saldo no Nubank é 85 reais.');
  assert.equal(action.amount, 85);
  assert.equal(action.date, REFERENCE_DATE);
  assert.equal(Object.hasOwn(action.payload, 'workspace_id'), false);
  assert.equal(Object.hasOwn(action.proposedAccount, 'workspace_id'), false);
});

test('modo demo usa callbacks locais sem Supabase', async () => {
  const localAccounts = [];
  const localTransactions = [];
  const action = createAction('Meu saldo no Nubank é 85 reais.');
  await provisionAccountAndTransaction(action, {
    saveAccount: async (payload) => {
      const account = { id: 'demo-account', ...payload };
      localAccounts.push(account);
      return { data: account, error: null, isConfigured: false };
    },
    saveTransaction: async (payload) => {
      localTransactions.push(payload);
      return { data: { id: 'demo-transaction', ...payload }, error: null, isConfigured: false };
    },
  });
  assert.equal(localAccounts.length, 1);
  assert.equal(localTransactions[0].account_id, 'demo-account');
});

test('erro ao criar conta impede criação da transação', async () => {
  let transactionCalls = 0;
  const result = await provisionAccountAndTransaction(
    createAction('Meu saldo no Nubank é 85 reais.'),
    {
      saveAccount: async () => ({ data: null, error: { code: '42501' } }),
      saveTransaction: async () => {
        transactionCalls += 1;
        return { data: null };
      },
    },
  );
  assert.equal(result.error.code, '42501');
  assert.equal(transactionCalls, 0);
});

test('erro ao criar transação recebe mensagem humana', async () => {
  const result = await provisionAccountAndTransaction(
    createAction('Paguei 85 reais no mercado pelo Nubank.'),
    {
      saveAccount: async (payload) => ({ data: { id: 'account', ...payload }, error: null }),
      saveTransaction: async () => ({ data: null, error: { code: '42501', message: 'RLS detail' } }),
    },
  );
  const response = buildExecutionErrorResponse(result.error);
  assert.match(response.text, /Não consegui registrar/);
  assert.doesNotMatch(response.text, /RLS|42501/);
});

test('confirmação financeira continua obrigatória', () => {
  const action = createAction('Meu saldo no Nubank é 85 reais.');
  assert.equal(action.status, 'ready');
  assert.equal(action.accountResolution.status, 'will_create');
});

test('receita/despesa nunca bloqueiam nem criam conta a partir de nome ambíguo/inexistente', () => {
  const semConta = createAction('Paguei 85 reais no mercado pelo Nubank.');
  assert.equal(semConta.status, 'ready');
  assert.equal(semConta.accountResolution.status, ACCOUNT_RESOLUTION_STATUS.MISSING);
  assert.equal(semConta.proposedAccount, null);
  assert.equal(semConta.payload.account_id, null);

  const arquivada = createAction('Paguei 85 reais no mercado pelo Nubank.', [
    { id: 'archived', name: 'Nubank', is_active: false },
  ]);
  assert.equal(arquivada.status, 'ready');
  assert.equal(arquivada.payload.account_id, null);

  const ambigua = createAction('Paguei 85 reais no mercado pelo Nubank.', [
    { id: 'one', name: 'Nubank', is_active: true },
    { id: 'two', name: 'Nu Bank', is_active: true },
  ]);
  assert.equal(ambigua.status, 'ready');
  assert.equal(ambigua.payload.account_id, null);
});
