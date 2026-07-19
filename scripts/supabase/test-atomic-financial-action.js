import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const DEV_PROJECT_HOST = 'ikulazofzufeblzrhtif.supabase.co';
const REQUIRED_ENV = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ATOMIC_USER_A_EMAIL',
  'SUPABASE_ATOMIC_USER_A_PASSWORD',
  'SUPABASE_ATOMIC_USER_B_EMAIL',
  'SUPABASE_ATOMIC_USER_B_PASSWORD',
];

function jwtRole(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role ?? null;
  } catch {
    return null;
  }
}

function readConfig() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Variáveis ausentes: ${missing.join(', ')}. Nenhuma conexão foi iniciada.`);
  }
  const url = new URL(process.env.VITE_SUPABASE_URL);
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (url.protocol !== 'https:' || url.hostname !== DEV_PROJECT_HOST) {
    throw new Error('Execução bloqueada: o endpoint não corresponde ao UniFlow DEV autorizado.');
  }
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    throw new Error('Execução bloqueada: use somente anon/publishable key do UniFlow DEV.');
  }
  if (process.env.SUPABASE_ATOMIC_USER_A_EMAIL === process.env.SUPABASE_ATOMIC_USER_B_EMAIL) {
    throw new Error('Os usuários A e B precisam ser contas de teste diferentes.');
  }
  return {
    url: url.toString(),
    key,
    userA: {
      email: process.env.SUPABASE_ATOMIC_USER_A_EMAIL,
      password: process.env.SUPABASE_ATOMIC_USER_A_PASSWORD,
    },
    userB: {
      email: process.env.SUPABASE_ATOMIC_USER_B_EMAIL,
      password: process.env.SUPABASE_ATOMIC_USER_B_PASSWORD,
    },
  };
}

function createTestClient(config) {
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function safeCode(error) {
  return error?.code ?? error?.name ?? 'erro_sem_codigo';
}

function record(results, name, passed, detail) {
  results.push({ name, passed });
  console.log(`${passed ? '[PASS]' : '[FAIL]'} ${name}: ${detail}`);
}

async function signIn(client, credentials, label, results) {
  const result = await client.auth.signInWithPassword(credentials);
  const passed = !result.error && Boolean(result.data.user?.id);
  record(results, `Autenticação do usuário ${label}`, passed,
    passed ? 'sessão autenticada' : `erro ${safeCode(result.error)}`);
  return passed ? result.data.user : null;
}

async function ensureTestWorkspace(client, user, label, results) {
  const profile = await client.from('profiles')
    .select('current_workspace_id').eq('id', user.id).maybeSingle();
  if (profile.error || !profile.data) {
    record(results, `Profile do usuário ${label}`, false,
      profile.error ? `erro ${safeCode(profile.error)}` : 'profile ausente');
    return null;
  }

  if (profile.data.current_workspace_id) {
    record(results, `Workspace atual do usuário ${label}`, true, 'workspace encontrado');
    return profile.data.current_workspace_id;
  }

  const workspaceName = `UniFlow Atomic Test ${label}`;
  const existing = await client.from('workspaces')
    .select('id')
    .eq('owner_user_id', user.id)
    .eq('name', workspaceName)
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    record(results, `Workspace de teste do usuário ${label}`, false,
      `erro ${safeCode(existing.error)}`);
    return null;
  }

  let workspaceId = existing.data?.id ?? null;
  if (!workspaceId) {
    const created = await client.from('workspaces').insert({
      name: workspaceName,
      workspace_type: 'personal',
      owner_user_id: user.id,
    }).select('id').single();
    if (created.error || !created.data?.id) {
      record(results, `Workspace de teste do usuário ${label}`, false,
        created.error ? `erro ${safeCode(created.error)}` : 'workspace não retornado');
      return null;
    }
    workspaceId = created.data.id;
  }

  const membership = await client.from('workspace_members')
    .select('workspace_id,role,status')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .eq('status', 'active')
    .maybeSingle();
  if (membership.error || !membership.data) {
    record(results, `Membership do usuário ${label}`, false,
      membership.error ? `erro ${safeCode(membership.error)}` : 'membership owner ausente');
    return null;
  }

  const updatedProfile = await client.from('profiles')
    .update({ current_workspace_id: workspaceId })
    .eq('id', user.id)
    .select('current_workspace_id')
    .single();
  const prepared = !updatedProfile.error
    && updatedProfile.data?.current_workspace_id === workspaceId;
  record(results, `Workspace atual do usuário ${label}`, prepared,
    prepared ? 'workspace dedicado preparado' : `erro ${safeCode(updatedProfile.error)}`);
  return prepared ? workspaceId : null;
}

function rpcPayload(overrides = {}) {
  return {
    p_client_operation_id: randomUUID(),
    p_account_mode: 'existing',
    p_account_id: null,
    p_account_name: null,
    p_account_type: null,
    p_account_institution_name: null,
    p_category_id: null,
    p_transaction_type: 'expense',
    p_description: 'Teste atômico controlado',
    p_amount: 1.23,
    p_transaction_date: new Date().toISOString().slice(0, 10),
    p_destination_account_id: null,
    ...overrides,
  };
}

async function callAtomic(client, payload) {
  return client.rpc('execute_confirmed_financial_action', payload).single();
}

async function getAccountBalance(client, accountId) {
  return client.rpc('get_derived_account_balances')
    .eq('account_id', accountId)
    .single();
}

async function getWorkspaceBalance(client) {
  return client.rpc('get_derived_workspace_balance').single();
}

function numeric(value) {
  return Number(value ?? 0);
}

async function createAccount(
  client,
  workspaceId,
  name,
  { isActive = true, initialBalance = 0, currentBalance = 0 } = {},
) {
  return client.from('accounts').insert({
    workspace_id: workspaceId,
    name,
    account_type: 'digital_wallet',
    institution_name: name,
    initial_balance: initialBalance,
    current_balance: currentBalance,
    is_active: isActive,
  }).select('id,name,is_active').single();
}

async function cleanup(client, fixtures) {
  if (fixtures.transactionIds.length) {
    await client.from('transactions').delete().in('id', fixtures.transactionIds);
  }
  if (fixtures.accountIds.length) {
    await client.from('accounts').delete().in('id', fixtures.accountIds);
  }
  if (fixtures.categoryIds.length) {
    await client.from('categories').delete().in('id', fixtures.categoryIds);
  }
}

async function run() {
  const config = readConfig();
  const clientA = createTestClient(config);
  const clientB = createTestClient(config);
  const results = [];
  const fixturesA = { transactionIds: [], accountIds: [], categoryIds: [] };
  const fixturesB = { transactionIds: [], accountIds: [], categoryIds: [] };

  try {
    const userA = await signIn(clientA, config.userA, 'A', results);
    const userB = await signIn(clientB, config.userB, 'B', results);
    if (!userA || !userB) throw new Error('Autenticação de teste incompleta.');

    const workspaceA = await ensureTestWorkspace(clientA, userA, 'A', results);
    const workspaceB = await ensureTestWorkspace(clientB, userB, 'B', results);
    if (!workspaceA || !workspaceB || workspaceA === workspaceB) {
      throw new Error('Os usuários precisam possuir workspaces de teste distintos.');
    }

    const incomeCategory = await clientA.from('categories')
      .select('id').eq('is_system', true).eq('category_type', 'income').limit(1).single();
    const expenseCategory = await clientA.from('categories')
      .select('id').eq('is_system', true).eq('category_type', 'expense').limit(1).single();
    const transferCategory = await clientA.from('categories')
      .select('id').eq('is_system', true).eq('category_type', 'transfer').limit(1).single();
    if (incomeCategory.error || expenseCategory.error || transferCategory.error) {
      throw new Error('Categorias globais de teste não foram encontradas.');
    }

    const suffix = randomUUID().slice(0, 8);
    const existing = await createAccount(clientA, workspaceA, `Atomic Existing ${suffix}`, {
      initialBalance: 100,
      currentBalance: 999,
    });
    const destination = await createAccount(clientA, workspaceA, `Atomic Destination ${suffix}`, {
      initialBalance: 50,
      currentBalance: -999,
    });
    const otherWorkspaceAccount = await createAccount(clientB, workspaceB, `Atomic Other ${suffix}`, {
      initialBalance: 25,
    });
    const directCreatePassed = !existing.error && !destination.error && !otherWorkspaceAccount.error;
    record(results, 'INSERT autenticado de conta funciona após o índice', directCreatePassed,
      directCreatePassed ? 'função do índice executável' : 'insert bloqueado');
    if (!directCreatePassed) throw new Error('Falha ao preparar contas de teste.');
    fixturesA.accountIds.push(existing.data.id, destination.data.id);
    fixturesB.accountIds.push(otherWorkspaceAccount.data.id);

    const directUpdate = await clientA.from('accounts')
      .update({ name: `Atomic Existing Updated ${suffix}` })
      .eq('workspace_id', workspaceA)
      .eq('id', existing.data.id)
      .select('id,name')
      .single();
    record(results, 'UPDATE autenticado de conta funciona após o índice',
      !directUpdate.error && directUpdate.data?.id === existing.data.id,
      directUpdate.error ? `erro ${safeCode(directUpdate.error)}` : 'update permitido');

    const anonClient = createTestClient(config);
    const anonAttempt = await callAtomic(anonClient, rpcPayload());
    record(results, 'Anon não executa a RPC atômica', Boolean(anonAttempt.error),
      anonAttempt.error ? 'bloqueado' : 'execução indevida aceita');

    const existingResult = await callAtomic(clientA, rpcPayload({
      p_account_id: existing.data.id,
      p_category_id: expenseCategory.data.id,
      p_amount: 10,
    }));
    record(results, 'Despesa confirmada gera transação', !existingResult.error,
      existingResult.error ? `erro ${safeCode(existingResult.error)}` : 'despesa criada');
    if (existingResult.data?.transaction_id) fixturesA.transactionIds.push(existingResult.data.transaction_id);

    const incomePayload = rpcPayload({
      p_account_id: existing.data.id,
      p_category_id: incomeCategory.data.id,
      p_transaction_type: 'income',
      p_description: 'Receita atômica controlada',
      p_amount: 20,
    });
    const incomeResult = await callAtomic(clientA, incomePayload);
    record(results, 'Receita confirmada gera transação', !incomeResult.error,
      incomeResult.error ? `erro ${safeCode(incomeResult.error)}` : 'receita criada');
    if (incomeResult.data?.transaction_id) fixturesA.transactionIds.push(incomeResult.data.transaction_id);

    const transferResult = await callAtomic(clientA, rpcPayload({
      p_account_id: existing.data.id,
      p_destination_account_id: destination.data.id,
      p_category_id: transferCategory.data.id,
      p_transaction_type: 'transfer',
      p_description: 'Transferência atômica controlada',
      p_amount: 15,
    }));
    record(results, 'Transferência confirmada usa uma única transação', !transferResult.error,
      transferResult.error ? `erro ${safeCode(transferResult.error)}` : 'transferência criada');
    if (transferResult.data?.transaction_id) fixturesA.transactionIds.push(transferResult.data.transaction_id);

    const sourceBalance = await getAccountBalance(clientA, existing.data.id);
    const destinationBalance = await getAccountBalance(clientA, destination.data.id);
    record(results, 'Saldo derivado trata entrada, saída e duas pernas da transferência',
      !sourceBalance.error
        && !destinationBalance.error
        && numeric(sourceBalance.data?.derived_balance) === 95
        && numeric(destinationBalance.data?.derived_balance) === 65,
      sourceBalance.error || destinationBalance.error ? 'erro ao derivar saldo' : 'saldos conferidos');

    const accountBalances = await clientA.rpc('get_derived_account_balances');
    const workspaceBalance = await getWorkspaceBalance(clientA);
    const summedBalance = (accountBalances.data ?? [])
      .reduce((total, balance) => total + numeric(balance.derived_balance), 0);
    record(results, 'Saldo consolidado soma somente contas do workspace atual',
      !accountBalances.error
        && !workspaceBalance.error
        && numeric(workspaceBalance.data?.derived_balance) === summedBalance,
      workspaceBalance.error ? `erro ${safeCode(workspaceBalance.error)}` : 'consolidação conferida');

    const userBBalances = await clientB.rpc('get_derived_account_balances');
    record(results, 'Saldos derivados permanecem isolados entre workspaces',
      !userBBalances.error
        && !(userBBalances.data ?? []).some((balance) => balance.account_id === existing.data.id),
      userBBalances.error ? `erro ${safeCode(userBBalances.error)}` : 'isolamento conferido');

    const createOperationId = randomUUID();
    const createName = `Atomic Create ${suffix}`;
    const createPayload = rpcPayload({
      p_client_operation_id: createOperationId,
      p_account_mode: 'create',
      p_account_name: createName,
      p_account_type: 'digital_wallet',
      p_account_institution_name: createName,
      p_category_id: expenseCategory.data.id,
    });
    const created = await callAtomic(clientA, createPayload);
    record(results, 'Conta nova e transação são atômicas',
      !created.error && created.data?.account_created === true,
      created.error ? `erro ${safeCode(created.error)}` : 'conta e transação criadas');
    if (created.data?.transaction_id) fixturesA.transactionIds.push(created.data.transaction_id);
    if (created.data?.account_id) fixturesA.accountIds.push(created.data.account_id);

    const balanceBeforeReplay = await getWorkspaceBalance(clientA);
    const replay = await callAtomic(clientA, createPayload);
    const balanceAfterReplay = await getWorkspaceBalance(clientA);
    record(results, 'Retry idempotente não duplica transação',
      !replay.error && replay.data?.transaction_id === created.data?.transaction_id
        && replay.data?.idempotent_replay === true
        && numeric(balanceBeforeReplay.data?.derived_balance)
          === numeric(balanceAfterReplay.data?.derived_balance),
      replay.error ? `erro ${safeCode(replay.error)}` : 'mesmo resultado retornado');

    const idempotencyConflict = await callAtomic(clientA, {
      ...createPayload,
      p_amount: createPayload.p_amount + 1,
    });
    record(results, 'Chave idempotente com payload diferente é rejeitada',
      Boolean(idempotencyConflict.error),
      idempotencyConflict.error ? 'conflito bloqueado' : 'payload conflitante aceito');

    const balanceBeforeCancel = await getAccountBalance(clientA, existing.data.id);
    const canceled = await clientA.from('transactions')
      .update({ status: 'canceled' })
      .eq('id', incomeResult.data?.transaction_id ?? randomUUID())
      .select('id,status')
      .single();
    const balanceAfterCancel = await getAccountBalance(clientA, existing.data.id);
    const canceledReplay = await callAtomic(clientA, incomePayload);
    const restored = await clientA.from('transactions')
      .update({ status: 'completed' })
      .eq('id', incomeResult.data?.transaction_id ?? randomUUID())
      .select('id,status')
      .single();
    const balanceAfterRestore = await getAccountBalance(clientA, existing.data.id);
    record(results, 'Cancelamento e restauração recalculam saldo sem cache',
      !canceled.error
        && !restored.error
        && Boolean(canceledReplay.error)
        && numeric(balanceAfterCancel.data?.derived_balance)
          === numeric(balanceBeforeCancel.data?.derived_balance) - 20
        && numeric(balanceAfterRestore.data?.derived_balance)
          === numeric(balanceBeforeCancel.data?.derived_balance),
      canceled.error || restored.error
        ? 'erro ao alterar status'
        : 'saldo derivado reverteu e replay cancelado foi bloqueado');

    const archived = await createAccount(clientA, workspaceA, `Atomic Archived ${suffix}`, {
      isActive: false,
    });
    if (archived.error) throw new Error('Falha ao preparar conta arquivada.');
    fixturesA.accountIds.push(archived.data.id);
    const reactivated = await callAtomic(clientA, rpcPayload({
      p_account_mode: 'reactivate',
      p_account_id: archived.data.id,
      p_category_id: expenseCategory.data.id,
    }));
    record(results, 'Reativação e transação são atômicas',
      !reactivated.error && reactivated.data?.account_reactivated === true,
      reactivated.error ? `erro ${safeCode(reactivated.error)}` : 'conta reativada com transação');
    if (reactivated.data?.transaction_id) fixturesA.transactionIds.push(reactivated.data.transaction_id);

    const balanceBeforeRollback = await getWorkspaceBalance(clientA);
    const rollbackCreateName = `Atomic Rollback Create ${suffix}`;
    const rollbackCreate = await callAtomic(clientA, rpcPayload({
      p_account_mode: 'create',
      p_account_name: rollbackCreateName,
      p_account_type: 'digital_wallet',
      p_account_institution_name: rollbackCreateName,
      p_category_id: transferCategory.data.id,
      p_transaction_type: 'transfer',
      p_destination_account_id: randomUUID(),
    }));
    const rolledBackAccount = await clientA.from('accounts')
      .select('id').eq('workspace_id', workspaceA).eq('name', rollbackCreateName);
    const balanceAfterRollback = await getWorkspaceBalance(clientA);
    record(results, 'Falha posterior faz rollback da conta criada',
      Boolean(rollbackCreate.error)
        && rolledBackAccount.data?.length === 0
        && numeric(balanceBeforeRollback.data?.derived_balance)
          === numeric(balanceAfterRollback.data?.derived_balance),
      rollbackCreate.error ? 'nenhum registro parcial' : 'operação indevida aceita');

    const rollbackArchived = await createAccount(clientA, workspaceA, `Atomic Rollback Reactivate ${suffix}`, {
      isActive: false,
    });
    if (rollbackArchived.error) throw new Error('Falha ao preparar rollback de reativação.');
    fixturesA.accountIds.push(rollbackArchived.data.id);
    const rollbackReactivate = await callAtomic(clientA, rpcPayload({
      p_account_mode: 'reactivate',
      p_account_id: rollbackArchived.data.id,
      p_category_id: transferCategory.data.id,
      p_transaction_type: 'transfer',
      p_destination_account_id: randomUUID(),
    }));
    const archivedAfterFailure = await clientA.from('accounts')
      .select('is_active').eq('id', rollbackArchived.data.id).single();
    record(results, 'Falha posterior desfaz reativação',
      Boolean(rollbackReactivate.error) && archivedAfterFailure.data?.is_active === false,
      rollbackReactivate.error ? 'conta permaneceu arquivada' : 'operação indevida aceita');

    const crossAccount = await callAtomic(clientA, rpcPayload({
      p_account_id: otherWorkspaceAccount.data.id,
      p_category_id: expenseCategory.data.id,
    }));
    record(results, 'Conta de outro workspace é rejeitada', Boolean(crossAccount.error),
      crossAccount.error ? 'bloqueada' : 'acesso indevido aceito');

    const customCategory = await clientB.from('categories').insert({
      workspace_id: workspaceB,
      name: `Atomic Category ${suffix}`,
      category_type: 'expense',
      is_active: true,
    }).select('id').single();
    if (customCategory.error) throw new Error('Falha ao preparar categoria do usuário B.');
    fixturesB.categoryIds.push(customCategory.data.id);
    const crossCategory = await callAtomic(clientA, rpcPayload({
      p_account_id: existing.data.id,
      p_category_id: customCategory.data.id,
    }));
    record(results, 'Categoria de outro workspace é rejeitada', Boolean(crossCategory.error),
      crossCategory.error ? 'bloqueada' : 'acesso indevido aceito');

    const invalidCases = [
      ['Conta inexistente é rejeitada', {
        p_account_id: randomUUID(), p_category_id: expenseCategory.data.id,
      }],
      ['Categoria inexistente é rejeitada', {
        p_account_id: existing.data.id, p_category_id: randomUUID(),
      }],
      ['Valor zero é rejeitado', {
        p_account_id: existing.data.id, p_category_id: expenseCategory.data.id, p_amount: 0,
      }],
      ['Valor negativo é rejeitado', {
        p_account_id: existing.data.id, p_category_id: expenseCategory.data.id, p_amount: -1,
      }],
      ['Tipo inválido é rejeitado', {
        p_account_id: existing.data.id,
        p_category_id: expenseCategory.data.id,
        p_transaction_type: 'adjustment',
      }],
      ['Data inválida é rejeitada', {
        p_account_id: existing.data.id,
        p_category_id: expenseCategory.data.id,
        p_transaction_date: 'data-invalida',
      }],
      ['Transferência para a mesma conta é rejeitada', {
        p_account_id: existing.data.id,
        p_destination_account_id: existing.data.id,
        p_category_id: transferCategory.data.id,
        p_transaction_type: 'transfer',
      }],
    ];

    for (const [name, overrides] of invalidCases) {
      const invalidResult = await callAtomic(clientA, rpcPayload(overrides));
      record(results, name, Boolean(invalidResult.error),
        invalidResult.error ? 'bloqueado' : 'operação indevida aceita');
    }
  } finally {
    await cleanup(clientA, fixturesA);
    await cleanup(clientB, fixturesB);
    await clientA.auth.signOut();
    await clientB.auth.signOut();
  }

  const failed = results.filter((result) => !result.passed);
  console.log(`Resultado: ${results.length - failed.length}/${results.length} testes aprovados.`);
  if (failed.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(`Teste encerrado com segurança: ${error.message}`);
  process.exitCode = 1;
});
