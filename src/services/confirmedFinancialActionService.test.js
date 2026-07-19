import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildConfirmedFinancialActionRpcPayload,
  executeConfirmedFinancialAction,
  getConfirmedAccountMode,
} from './confirmedFinancialActionService.js';
import {
  createAccountProvisioningCoordinator,
  createClientOperationId,
  provisionAccountAndTransaction,
} from '../features/uni-conversation/accountProvisioning.js';

const OPERATION_ID = '018f4f7a-3d2b-4f6a-8c31-f54e53db32b1';

function createAction(overrides = {}) {
  return {
    status: 'ready',
    clientOperationId: OPERATION_ID,
    account: { id: 'account-id', name: 'Nubank', is_active: true },
    accountResolution: { status: 'resolved' },
    category: { id: 'category-id', name: 'Alimentação' },
    payload: {
      account_id: 'account-id',
      destination_account_id: null,
      category_id: 'category-id',
      transaction_type: 'expense',
      description: 'Mercado',
      amount: 85,
      transaction_date: '2026-07-12',
      status: 'completed',
    },
    ...overrides,
  };
}

test('gera client_operation_id UUID uma única vez por chamada', () => {
  const runtime = { crypto: { randomUUID: () => OPERATION_ID } };
  assert.equal(createClientOperationId(runtime), OPERATION_ID);
});

test('payload existing preserva valor e data sem user ou workspace', () => {
  const action = createAction();
  const original = structuredClone(action);
  const result = buildConfirmedFinancialActionRpcPayload(action);

  assert.equal(result.error, null);
  assert.equal(result.data.p_account_mode, 'existing');
  assert.equal(result.data.p_amount, 85);
  assert.equal(result.data.p_transaction_date, '2026-07-12');
  assert.equal('user_id' in result.data, false);
  assert.equal('workspace_id' in result.data, false);
  assert.deepEqual(action, original);
});

test('payload create envia apenas a conta proposta confirmada', () => {
  const action = createAction({
    account: null,
    accountResolution: { status: 'will_create' },
    proposedAccount: {
      name: 'Nubank',
      account_type: 'digital_wallet',
      institution_name: 'Nubank',
    },
    payload: { ...createAction().payload, account_id: null },
  });
  const { data } = buildConfirmedFinancialActionRpcPayload(action);
  assert.equal(getConfirmedAccountMode(action), 'create');
  assert.equal(data.p_account_id, null);
  assert.equal(data.p_account_name, 'Nubank');
  assert.equal(data.p_account_type, 'digital_wallet');
});

test('payload reactivate mantém conta escolhida', () => {
  const action = createAction({
    account: { id: 'archived-id', name: 'Nubank', is_active: false },
    accountResolution: { status: 'resolved', provisioning: 'reactivate' },
  });
  const { data } = buildConfirmedFinancialActionRpcPayload(action);
  assert.equal(getConfirmedAccountMode(action), 'reactivate');
  assert.equal(data.p_account_id, 'archived-id');
});

test('operação inválida não chega à RPC', () => {
  const result = buildConfirmedFinancialActionRpcPayload(
    createAction({ clientOperationId: 'not-a-uuid' }),
  );
  assert.equal(result.error.code, 'INVALID_OPERATION_ID');
});

test('modo atômico não chama saves locais separados', async () => {
  let atomicCalls = 0;
  let localCalls = 0;
  const result = await provisionAccountAndTransaction(createAction(), {
    executeAtomicAction: async () => {
      atomicCalls += 1;
      return { data: { id: 'transaction-id' }, error: null };
    },
    saveAccount: async () => { localCalls += 1; },
    saveTransaction: async () => { localCalls += 1; },
  });
  assert.equal(result.data.id, 'transaction-id');
  assert.equal(atomicCalls, 1);
  assert.equal(localCalls, 0);
});

test('falha atômica não deixa alteração no estado local do fluxo', async () => {
  const localState = { accounts: [], transactions: [] };
  const result = await provisionAccountAndTransaction(createAction(), {
    executeAtomicAction: async () => ({
      data: null,
      error: { code: 'ATOMIC_FINANCIAL_ACTION_FAILED', message: 'Nada foi registrado.' },
    }),
    saveAccount: async (account) => localState.accounts.push(account),
    saveTransaction: async (transaction) => localState.transactions.push(transaction),
  });
  assert.equal(result.error.code, 'ATOMIC_FINANCIAL_ACTION_FAILED');
  assert.deepEqual(localState, { accounts: [], transactions: [] });
});

test('clique duplo compartilha uma única chamada atômica', async () => {
  let calls = 0;
  let release;
  const coordinator = createAccountProvisioningCoordinator(async () => {
    calls += 1;
    await new Promise((resolve) => { release = resolve; });
    return { data: { id: 'transaction-id' }, error: null };
  });
  const action = createAction();
  const first = coordinator.execute(action, {});
  const second = coordinator.execute(action, {});
  await Promise.resolve();
  assert.equal(first, second);
  assert.equal(calls, 1);
  release();
  await first;
});

test('retry conserva a mesma chave no payload', () => {
  const action = createAction();
  const first = buildConfirmedFinancialActionRpcPayload(action);
  const retry = buildConfirmedFinancialActionRpcPayload(action);
  assert.equal(first.data.p_client_operation_id, retry.data.p_client_operation_id);
});

test('service mantém fallback controlado sem Supabase', async () => {
  const result = await executeConfirmedFinancialAction(createAction());
  assert.equal(result.data, null);
  assert.equal(result.error.code, 'SUPABASE_NOT_CONFIGURED');
});

test('migration valida isolamento, rollback implícito e concorrência', () => {
  const migration = readFileSync(
    new URL('../../supabase/migrations/20260712_008_atomic_financial_action.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /profile\.current_workspace_id/);
  assert.match(migration, /member\.user_id = v_user_id/);
  assert.match(migration, /category\.workspace_id = v_workspace_id/);
  assert.match(migration, /account\.workspace_id = v_workspace_id/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /transactions_workspace_client_operation_uidx/);
  assert.match(migration, /financial_action_idempotency_conflict/);
  assert.doesNotMatch(migration, /\bcommit\b[\s\S]*create or replace function[\s\S]*\bcommit\b[\s\S]*\bcommit\b/i);
});

test('service não aceita nem envia user_id', () => {
  const source = readFileSync(new URL('./confirmedFinancialActionService.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /p_user_id|workspace_id:/);
});

test('migration 009 restaura o índice e define saldo derivado isolado', () => {
  const migration = readFileSync(
    new URL(
      '../../supabase/migrations/20260716_009_fix_atomic_financial_action_and_balances.sql',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    migration,
    /grant execute on function public\.normalize_financial_account_identity\(text\)[\s\S]*to authenticated/,
  );
  assert.match(migration, /create or replace function public\.get_derived_account_balances\(\)/);
  assert.match(migration, /create or replace function public\.get_derived_workspace_balance\(\)/);
  assert.match(migration, /transaction\.status = 'completed'/);
  assert.match(migration, /transaction\.created_by = v_user_id/);
  assert.match(migration, /financial_action_idempotency_conflict/);
  assert.match(migration, /transaction\.destination_account_id = account\.id/);
  assert.match(migration, /profile\.current_workspace_id/);
  assert.match(migration, /member\.user_id = v_user_id/);
  assert.doesNotMatch(migration, /p_workspace_id/);
  assert.doesNotMatch(migration, /set\s+current_balance/i);
  assert.match(migration, /current_balance[\s\S]*legado\/cache sem autoridade contabil/);
});

test('migration 009 fixa owners, grants mínimos e search_path seguro', () => {
  const migration = readFileSync(
    new URL(
      '../../supabase/migrations/20260716_009_fix_atomic_financial_action_and_balances.sql',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(migration, /normalize_financial_account_identity\(text\)[\s\S]*owner to postgres/);
  assert.match(migration, /execute_confirmed_financial_action\([\s\S]*\) owner to postgres/);
  assert.match(migration, /get_derived_account_balances\(\) owner to postgres/);
  assert.match(migration, /get_derived_workspace_balance\(\) owner to postgres/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /from public, anon, authenticated/);
});

test('auditoria da migration 009 distingue ausência, prontidão e aplicação parcial', () => {
  const audit = readFileSync(
    new URL(
      '../../supabase/tests/fix_atomic_financial_action_and_balances_failed_apply_audit.sql',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(audit, /atomic_financial_action_fix_dependencies_missing/);
  assert.match(audit, /atomic_financial_action_fix_ready_for_migration/);
  assert.match(audit, /atomic_financial_action_fix_partial_apply_detected/);
  assert.match(audit, /atomic_financial_action_fix_already_present_run_validation/);
  assert.match(audit, /to_regprocedure\('public\.normalize_financial_account_identity\(text\)'\)/);
});

test('roteiro atômico prepara workspaces distintos sem credencial administrativa', () => {
  const script = readFileSync(
    new URL('../../scripts/supabase/test-atomic-financial-action.js', import.meta.url),
    'utf8',
  );

  assert.match(script, /async function ensureTestWorkspace/);
  assert.match(script, /owner_user_id: user\.id/);
  assert.match(script, /workspace_type: 'personal'/);
  assert.match(script, /role', 'owner'/);
  assert.match(script, /status', 'active'/);
  assert.match(script, /update\(\{ current_workspace_id: workspaceId \}\)/);
  assert.match(script, /workspaceA === workspaceB/);
  assert.doesNotMatch(script, /SUPABASE_SERVICE_ROLE_KEY/);
});
