import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAccountCreationConfirmation,
  buildCategoryCreationConfirmation,
  cancelAccountCreationDependency,
  cancelCategoryCreationDependency,
  completeAccountCreationDependency,
  completeCategoryCreationDependency,
  findAccountCreationConflicts,
  FINANCIAL_PENDING_ACTION_TYPES,
  isCancelEntirePendingFlow,
  isCategoryCreationDependency,
  startAccountCreationDependency,
  startCategoryCreationDependency,
  updateResumedFinancialSnapshot,
} from './financialPendingActionFlow.js';
import {
  createPendingActionCoordinator,
  getActivePendingAction,
} from './index.js';
import {
  buildFinancialIntentAction,
  executeFinancialIntentAction,
} from './financialIntentAction.js';

const identity = Object.freeze({
  userId: 'user-business',
  workspaceId: 'workspace-business',
  conversationId: 'conversation-1',
});
const financialSnapshot = Object.freeze({
  parsed: { intent: 'register_expense' },
  action: {
    clientOperationId: 'operation-1',
    intent: 'register_expense',
    status: 'needs_clarification',
    amount: 50,
    description: 'Almoço',
    date: '2026-07-27',
    transactionType: 'expense',
  },
  response: 'Em qual conta?',
  memory: null,
});
const proposedAccount = Object.freeze({
  name: 'Nubank',
  institution_name: 'Nubank',
  account_type: 'checking',
  currency_code: 'BRL',
  initial_balance: 0,
  current_balance: 0,
  is_active: true,
});

test('empilha criação da conta sobre a movimentação preservando todos os campos', () => {
  const transition = startAccountCreationDependency({
    identity,
    financialSnapshot,
    proposedAccount,
    now: '2026-07-27T12:00:00.000Z',
  });

  assert.equal(transition.stack.actions.length, 2);
  assert.equal(transition.stack.actions[0].status, 'suspended');
  assert.equal(transition.activeAction.type, FINANCIAL_PENDING_ACTION_TYPES.CREATE_ACCOUNT);
  assert.equal(transition.stack.actions[0].fields.snapshot.action.amount, 50);
  assert.equal(transition.stack.actions[0].fields.snapshot.action.description, 'Almoço');
  assert.equal(transition.stack.actions[0].fields.snapshot.action.date, '2026-07-27');
  assert.equal(transition.stack.actions[0].fields.snapshot.action.transactionType, 'expense');
  assert.equal(
    transition.stack.actions[0].fields.snapshot.action.status,
    'needs_clarification',
  );
  assert.equal(
    transition.stack.actions[0].fields.snapshot.action.issues[0].field,
    'account',
  );
});

test('não duplica a mesma dependência de conta no replay', () => {
  const first = startAccountCreationDependency({
    identity,
    financialSnapshot,
    proposedAccount,
  });
  const replay = startAccountCreationDependency({
    stack: first.stack,
    identity,
    financialSnapshot,
    proposedAccount,
  });

  assert.equal(replay.changed, false);
  assert.equal(replay.reason, 'duplicate');
  assert.equal(replay.stack.actions.length, 2);
});

test('conclusão da conta retoma a movimentação original e permite atualizar o snapshot', () => {
  const started = startAccountCreationDependency({
    identity,
    financialSnapshot,
    proposedAccount,
  });
  const completed = completeAccountCreationDependency(
    started.stack,
    { id: 'account-created', ...proposedAccount },
  );
  const readySnapshot = {
    ...financialSnapshot,
    action: {
      ...financialSnapshot.action,
      status: 'ready',
      account: { id: 'account-created', name: 'Nubank' },
    },
  };
  const updated = updateResumedFinancialSnapshot(completed.stack, readySnapshot);

  assert.equal(completed.resumedAction.id, 'operation-1');
  assert.equal(getActivePendingAction(updated.stack).fields.snapshot.action.status, 'ready');
  assert.equal(
    getActivePendingAction(updated.stack).fields.snapshot.action.account.id,
    'account-created',
  );
});

test('cancelar criação retoma a movimentação; cancelar tudo encerra o ramo', () => {
  const started = startAccountCreationDependency({
    identity,
    financialSnapshot,
    proposedAccount,
  });
  const dependencyOnly = cancelAccountCreationDependency(started.stack);
  const entireFlow = cancelAccountCreationDependency(started.stack, { cascade: true });

  assert.equal(dependencyOnly.resumedAction.id, 'operation-1');
  assert.equal(dependencyOnly.stack.actions.length, 1);
  assert.equal(
    dependencyOnly.resumedAction.fields.snapshot.action.status,
    'needs_clarification',
  );
  assert.equal(entireFlow.stack.actions.length, 0);
});

test('detecta conta exata e semelhante somente dentro do workspace atual', () => {
  const conflicts = findAccountCreationConflicts({
    requestedName: 'Nubank',
    workspaceId: 'workspace-business',
    accounts: [
      { id: 'exact', workspace_id: 'workspace-business', name: 'Nu Bank' },
      { id: 'similar', workspace_id: 'workspace-business', name: 'Nubank Empresa' },
      { id: 'typo', workspace_id: 'workspace-business', name: 'Nubnk' },
      { id: 'personal', workspace_id: 'workspace-personal', name: 'Nubank' },
      { id: 'archived', workspace_id: 'workspace-business', name: 'Nubank', is_active: false },
    ],
  });

  assert.deepEqual(conflicts.exact.map((account) => account.id), ['exact']);
  assert.deepEqual(conflicts.similar.map((account) => account.id), ['similar', 'typo']);
});

test('confirmação da criação exibe campos obrigatórios e workspace Empresa', () => {
  const started = startAccountCreationDependency({
    identity,
    financialSnapshot,
    proposedAccount,
  });
  const confirmation = buildAccountCreationConfirmation(started.activeAction, {
    accountTypes: [{ code: 'checking', name: 'Conta corrente' }],
    workspaceType: 'business',
  });

  assert.equal(confirmation.title, 'Criar conta para continuar');
  assert.deepEqual(confirmation.rows.map((row) => row.value), [
    'Nubank',
    'Conta corrente',
    'Empresa',
  ]);
  assert.equal(confirmation.editable, false);
});

test('distingue cancelamento da subação e de todo o fluxo', () => {
  assert.equal(isCancelEntirePendingFlow('cancelar tudo'), true);
  assert.equal(isCancelEntirePendingFlow('cancelar a operação'), true);
  assert.equal(isCancelEntirePendingFlow('cancelar'), false);
});

// CONTA-OPCIONAL: receita/despesa não passam mais por esta dependência de
// criação de conta -- nunca bloqueiam nem criam conta a partir de um nome
// mencionado (ver bloco de comentário em financialIntentAction.js). O
// mecanismo em si (proposta -> confirmação -> criação -> retomada) continua
// existindo e é coberto aqui via ajuste de saldo, uma das duas operações
// (junto com transferência) que ainda exigem conta.
test('adjustment: cria conta confirmada, retoma e registra a movimentação', async () => {
  const parsed = {
    intent: 'set_balance',
    input: 'meu saldo na Nubank e 50',
    normalizedInput: 'meu saldo na nubank e 50',
    entities: {
      amount: 50,
      account: 'Nubank',
      category: null,
      description: null,
      date: '2026-07-27',
    },
  };
  const initialAction = buildFinancialIntentAction({
    parsed,
    accounts: [],
    accountTypes: [{ code: 'checking', is_active: true }],
    categories: [],
    referenceDate: '2026-07-27',
    overrides: { clientOperationId: 'operation-adjustment' },
  });
  const started = startAccountCreationDependency({
    identity,
    financialSnapshot: {
      parsed,
      action: initialAction,
      response: '',
      memory: null,
    },
    proposedAccount: initialAction.proposedAccount,
  });
  let accountCreates = 0;
  const accountCoordinator = createPendingActionCoordinator({
    create_financial_account: async ({ fields }) => {
      accountCreates += 1;
      return {
        data: {
          id: 'account-adjustment',
          workspace_id: identity.workspaceId,
          ...fields.account,
        },
      };
    },
  });
  const dependencyOutcome = await accountCoordinator.execute(started.stack);
  const account = dependencyOutcome.completedAction.result;
  const resumedAction = buildFinancialIntentAction({
    parsed,
    accounts: [account],
    accountTypes: [{ code: 'checking', is_active: true }],
    categories: [],
    referenceDate: '2026-07-27',
    accountBalances: { [account.id]: 0 },
    overrides: {
      clientOperationId: initialAction.clientOperationId,
      accountId: account.id,
    },
  });
  let transactionCreates = 0;
  const transactionResult = await executeFinancialIntentAction(resumedAction, {
    executeAtomicAction: async (action) => {
      transactionCreates += 1;
      return { data: { id: 'transaction-adjustment', ...action.payload }, error: null };
    },
  });

  assert.equal(accountCreates, 1);
  assert.equal(transactionCreates, 1);
  assert.equal(resumedAction.status, 'ready');
  assert.equal(resumedAction.payload.account_id, account.id);
  assert.equal(resumedAction.amount, 50);
  assert.equal(resumedAction.date, '2026-07-27');
  assert.equal(resumedAction.transactionType, 'adjustment');
  assert.equal(transactionResult.data.id, 'transaction-adjustment');
});

const proposedCategory = Object.freeze({
  name: 'Pet',
  category_type: 'expense',
  applies_to: 'personal',
});

test('empilha criação da categoria sobre a movimentação preservando todos os campos', () => {
  const transition = startCategoryCreationDependency({
    identity,
    financialSnapshot,
    proposedCategory,
    now: '2026-07-27T12:00:00.000Z',
  });

  assert.equal(transition.stack.actions.length, 2);
  assert.equal(transition.stack.actions[0].status, 'suspended');
  assert.equal(transition.activeAction.type, FINANCIAL_PENDING_ACTION_TYPES.CREATE_CATEGORY);
  assert.equal(isCategoryCreationDependency(transition.activeAction), true);
  assert.equal(transition.stack.actions[0].fields.snapshot.action.amount, 50);
  assert.equal(transition.stack.actions[0].fields.snapshot.action.description, 'Almoço');
  assert.equal(
    transition.stack.actions[0].fields.snapshot.action.status,
    'needs_clarification',
  );
  assert.equal(
    transition.stack.actions[0].fields.snapshot.action.issues[0].field,
    'category',
  );
});

test('não duplica a mesma dependência de categoria no replay', () => {
  const first = startCategoryCreationDependency({
    identity,
    financialSnapshot,
    proposedCategory,
  });
  const replay = startCategoryCreationDependency({
    stack: first.stack,
    identity,
    financialSnapshot,
    proposedCategory,
  });

  assert.equal(replay.changed, false);
  assert.equal(replay.reason, 'duplicate');
  assert.equal(replay.stack.actions.length, 2);
});

test('conclusão da categoria retoma a movimentação original e permite atualizar o snapshot', () => {
  const started = startCategoryCreationDependency({
    identity,
    financialSnapshot,
    proposedCategory,
  });
  const completed = completeCategoryCreationDependency(
    started.stack,
    { id: 'category-created', ...proposedCategory },
  );
  const readySnapshot = {
    ...financialSnapshot,
    action: {
      ...financialSnapshot.action,
      status: 'ready',
      category: { id: 'category-created', name: 'Pet' },
    },
  };
  const updated = updateResumedFinancialSnapshot(completed.stack, readySnapshot);

  assert.equal(completed.resumedAction.id, 'operation-1');
  assert.equal(getActivePendingAction(updated.stack).fields.snapshot.action.status, 'ready');
  assert.equal(
    getActivePendingAction(updated.stack).fields.snapshot.action.category.id,
    'category-created',
  );
});

test('cancelar criação de categoria retoma a movimentação; cancelar tudo encerra o ramo', () => {
  const started = startCategoryCreationDependency({
    identity,
    financialSnapshot,
    proposedCategory,
  });
  const dependencyOnly = cancelCategoryCreationDependency(started.stack);
  const entireFlow = cancelCategoryCreationDependency(started.stack, { cascade: true });

  assert.equal(dependencyOnly.resumedAction.id, 'operation-1');
  assert.equal(dependencyOnly.stack.actions.length, 1);
  assert.equal(
    dependencyOnly.resumedAction.fields.snapshot.action.status,
    'needs_clarification',
  );
  assert.equal(entireFlow.stack.actions.length, 0);
});

test('confirmação da criação de categoria exibe campos obrigatórios e workspace Pessoal', () => {
  const started = startCategoryCreationDependency({
    identity,
    financialSnapshot,
    proposedCategory,
  });
  const confirmation = buildCategoryCreationConfirmation(started.activeAction, {
    workspaceType: 'personal',
  });

  assert.equal(confirmation.title, 'Criar categoria para continuar');
  assert.deepEqual(confirmation.rows.map((row) => row.value), [
    'Pet',
    'Despesa',
    'Pessoal',
  ]);
  assert.equal(confirmation.editable, false);
});

test('categoria: cria categoria confirmada, retoma e registra a movimentação', async () => {
  const parsed = {
    intent: 'register_expense',
    input: 'Gastei 90 com pet pelo Nubank',
    normalizedInput: 'gastei 90 com pet pelo nubank',
    entities: {
      amount: 90,
      account: 'Nubank',
      category: 'Pet',
      description: 'Com pet',
      date: '2026-07-27',
    },
  };
  const accounts = [{ id: 'account-nubank', name: 'Nubank', is_active: true }];
  const initialAction = buildFinancialIntentAction({
    parsed,
    accounts,
    accountTypes: [{ code: 'checking', is_active: true }],
    categories: [],
    referenceDate: '2026-07-27',
    overrides: { clientOperationId: 'operation-pet', categoryDecision: 'create_new' },
  });
  const started = startCategoryCreationDependency({
    identity,
    financialSnapshot: {
      parsed,
      action: initialAction,
      response: '',
      memory: null,
    },
    proposedCategory: initialAction.proposedCategory,
  });
  let categoryCreates = 0;
  const categoryCoordinator = createPendingActionCoordinator({
    create_financial_category: async ({ fields }) => {
      categoryCreates += 1;
      return {
        data: {
          id: 'category-pet',
          is_active: true,
          ...fields.category,
        },
      };
    },
  });
  const dependencyOutcome = await categoryCoordinator.execute(started.stack);
  const category = dependencyOutcome.completedAction.result;
  const resumedAction = buildFinancialIntentAction({
    parsed,
    accounts,
    accountTypes: [{ code: 'checking', is_active: true }],
    categories: [category],
    referenceDate: '2026-07-27',
    overrides: {
      clientOperationId: initialAction.clientOperationId,
      categoryId: category.id,
    },
  });
  let transactionCreates = 0;
  const transactionResult = await executeFinancialIntentAction(resumedAction, {
    executeAtomicAction: async (action) => {
      transactionCreates += 1;
      return { data: { id: 'transaction-pet', ...action.payload }, error: null };
    },
  });

  assert.equal(categoryCreates, 1);
  assert.equal(transactionCreates, 1);
  assert.equal(resumedAction.status, 'ready');
  assert.equal(resumedAction.payload.category_id, category.id);
  assert.equal(transactionResult.data.id, 'transaction-pet');
});

test('duplo toque compartilha a criação e não cria conta duas vezes', async () => {
  const started = startAccountCreationDependency({
    identity,
    financialSnapshot,
    proposedAccount,
  });
  let creates = 0;
  const coordinator = createPendingActionCoordinator({
    create_financial_account: async () => {
      creates += 1;
      await Promise.resolve();
      return { data: { id: 'account-created', ...proposedAccount } };
    },
  });

  const [first, second] = await Promise.all([
    coordinator.execute(started.stack),
    coordinator.execute(started.stack),
  ]);

  assert.equal(creates, 1);
  assert.equal(first.completedAction.result.id, 'account-created');
  assert.equal(second.completedAction.result.id, 'account-created');
});
