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

async function getWorkspace(client, user, label, results) {
  const profile = await client.from('profiles')
    .select('current_workspace_id').eq('id', user.id).maybeSingle();
  const workspaceId = profile.data?.current_workspace_id;
  record(results, `Workspace atual do usuário ${label}`, !profile.error && Boolean(workspaceId),
    profile.error ? `erro ${safeCode(profile.error)}` : workspaceId ? 'workspace encontrado' : 'workspace ausente');
  return workspaceId ?? null;
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

async function createAccount(client, workspaceId, name, isActive = true) {
  return client.from('accounts').insert({
    workspace_id: workspaceId,
    name,
    account_type: 'digital_wallet',
    institution_name: name,
    initial_balance: 0,
    current_balance: 0,
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

    const workspaceA = await getWorkspace(clientA, userA, 'A', results);
    const workspaceB = await getWorkspace(clientB, userB, 'B', results);
    if (!workspaceA || !workspaceB || workspaceA === workspaceB) {
      throw new Error('Os usuários precisam possuir workspaces de teste distintos.');
    }

    const expenseCategory = await clientA.from('categories')
      .select('id').eq('is_system', true).eq('category_type', 'expense').limit(1).single();
    const transferCategory = await clientA.from('categories')
      .select('id').eq('is_system', true).eq('category_type', 'transfer').limit(1).single();
    if (expenseCategory.error || transferCategory.error) {
      throw new Error('Categorias globais de teste não foram encontradas.');
    }

    const suffix = randomUUID().slice(0, 8);
    const existing = await createAccount(clientA, workspaceA, `Atomic Existing ${suffix}`);
    const otherWorkspaceAccount = await createAccount(clientB, workspaceB, `Atomic Other ${suffix}`);
    if (existing.error || otherWorkspaceAccount.error) throw new Error('Falha ao preparar contas de teste.');
    fixturesA.accountIds.push(existing.data.id);
    fixturesB.accountIds.push(otherWorkspaceAccount.data.id);

    const existingResult = await callAtomic(clientA, rpcPayload({
      p_account_id: existing.data.id,
      p_category_id: expenseCategory.data.id,
    }));
    record(results, 'Conta ativa existente gera transação', !existingResult.error,
      existingResult.error ? `erro ${safeCode(existingResult.error)}` : 'transação criada');
    if (existingResult.data?.transaction_id) fixturesA.transactionIds.push(existingResult.data.transaction_id);

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

    const replay = await callAtomic(clientA, createPayload);
    record(results, 'Retry idempotente não duplica transação',
      !replay.error && replay.data?.transaction_id === created.data?.transaction_id
        && replay.data?.idempotent_replay === true,
      replay.error ? `erro ${safeCode(replay.error)}` : 'mesmo resultado retornado');

    const archived = await createAccount(clientA, workspaceA, `Atomic Archived ${suffix}`, false);
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
    record(results, 'Falha posterior faz rollback da conta criada',
      Boolean(rollbackCreate.error) && rolledBackAccount.data?.length === 0,
      rollbackCreate.error ? 'nenhum registro parcial' : 'operação indevida aceita');

    const rollbackArchived = await createAccount(clientA, workspaceA, `Atomic Rollback Reactivate ${suffix}`, false);
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
