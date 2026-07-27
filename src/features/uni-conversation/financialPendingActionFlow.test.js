import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAccountCreationConfirmation,
  cancelAccountCreationDependency,
  completeAccountCreationDependency,
  findAccountCreationConflicts,
  FINANCIAL_PENDING_ACTION_TYPES,
  isCancelEntirePendingFlow,
  startAccountCreationDependency,
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

for (const [intent, transactionType] of [
  ['register_expense', 'expense'],
  ['register_income', 'income'],
]) {
  test(`${transactionType}: cria conta confirmada, retoma e registra a movimentação`, async () => {
    const parsed = {
      intent,
      input: `${transactionType} de 50 na Nubank`,
      normalizedInput: `${transactionType} de 50 na nubank`,
      entities: {
        amount: 50,
        account: 'Nubank',
        category: transactionType === 'expense' ? 'Alimentação' : 'Receita',
        description: transactionType === 'expense' ? 'Almoço' : 'Venda',
        date: '2026-07-27',
      },
    };
    const categories = [{
      id: `category-${transactionType}`,
      name: transactionType === 'expense' ? 'Alimentação' : 'Receita',
      category_type: transactionType,
      is_active: true,
    }];
    const initialAction = buildFinancialIntentAction({
      parsed,
      accounts: [],
      accountTypes: [{ code: 'checking', is_active: true }],
      categories,
      referenceDate: '2026-07-27',
      overrides: { clientOperationId: `operation-${transactionType}` },
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
            id: `account-${transactionType}`,
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
      categories,
      referenceDate: '2026-07-27',
      overrides: {
        clientOperationId: initialAction.clientOperationId,
        accountId: account.id,
      },
    });
    let transactionCreates = 0;
    const transactionResult = await executeFinancialIntentAction(resumedAction, {
      executeAtomicAction: async (action) => {
        transactionCreates += 1;
        return { data: { id: `transaction-${transactionType}`, ...action.payload }, error: null };
      },
    });

    assert.equal(accountCreates, 1);
    assert.equal(transactionCreates, 1);
    assert.equal(resumedAction.status, 'ready');
    assert.equal(resumedAction.payload.account_id, account.id);
    assert.equal(resumedAction.amount, 50);
    assert.equal(resumedAction.date, '2026-07-27');
    assert.equal(resumedAction.transactionType, transactionType);
    assert.equal(transactionResult.data.id, `transaction-${transactionType}`);
  });
}

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
