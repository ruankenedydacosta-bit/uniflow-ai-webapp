import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const DEV_PROJECT_HOST = 'ikulazofzufeblzrhtif.supabase.co';
const REQUIRED_ENV = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_MEMORY_USER_A_EMAIL',
  'SUPABASE_MEMORY_USER_A_PASSWORD',
  'SUPABASE_MEMORY_USER_B_EMAIL',
  'SUPABASE_MEMORY_USER_B_PASSWORD',
];
const MEMORY_FIELDS = [
  'id', 'workspace_id', 'user_id', 'memory_type', 'memory_key',
  'memory_value', 'confidence', 'status', 'source', 'user_confirmed',
  'requires_confirmation', 'first_observed_at', 'last_observed_at',
  'expires_at', 'superseded_by_id', 'created_at', 'updated_at',
].join(',');
const INFERRED_TYPE_BLOCK_MESSAGE =
  'Frontend may only create its own explicit memory candidates';

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
    throw new Error(`Variaveis ausentes: ${missing.join(', ')}. Nenhuma conexao foi iniciada.`);
  }
  const url = new URL(process.env.VITE_SUPABASE_URL);
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (url.protocol !== 'https:' || url.hostname !== DEV_PROJECT_HOST) {
    throw new Error('Execucao bloqueada: o endpoint nao corresponde ao UniFlow DEV autorizado.');
  }
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    throw new Error('Execucao bloqueada: use somente anon/publishable key do UniFlow DEV.');
  }
  if (process.env.SUPABASE_MEMORY_USER_A_EMAIL === process.env.SUPABASE_MEMORY_USER_B_EMAIL) {
    throw new Error('Os usuarios A e B precisam ser contas de teste diferentes.');
  }
  return {
    url: url.toString(),
    key,
    userA: {
      email: process.env.SUPABASE_MEMORY_USER_A_EMAIL,
      password: process.env.SUPABASE_MEMORY_USER_A_PASSWORD,
    },
    userB: {
      email: process.env.SUPABASE_MEMORY_USER_B_EMAIL,
      password: process.env.SUPABASE_MEMORY_USER_B_PASSWORD,
    },
  };
}

function client(config) {
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function denied(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return Boolean(error) && (
    ['42501', 'PGRST204', 'PGRST301'].includes(error.code) ||
    ['permission denied', 'row-level security', 'not allowed', 'could not find'].some(
      (text) => message.includes(text),
    )
  );
}

function normalizedMessage(error) {
  return String(error?.message ?? '').trim().toLowerCase();
}

export function classifyInferredTypeBlock(error) {
  if (!error) {
    return { passed: false, kind: 'missing_error' };
  }

  const code = error.code ?? '';
  const message = normalizedMessage(error);

  if (
    ['PGRST301', 'AUTH_REQUIRED', 'INVALID_JWT'].includes(code) ||
    message.includes('jwt expired') ||
    message.includes('not authenticated')
  ) {
    return { passed: false, kind: 'authentication_failure' };
  }

  if (
    ['PGRST000', 'PGRST001', 'PGRST002', 'FETCH_ERROR'].includes(code) ||
    message.includes('failed to fetch') ||
    message.includes('connection')
  ) {
    return { passed: false, kind: 'unavailable' };
  }

  if (
    code === 'P0001' &&
    message === INFERRED_TYPE_BLOCK_MESSAGE.toLowerCase()
  ) {
    return { passed: true, kind: 'expected_memory_protection_trigger' };
  }

  if (
    code === '42501' &&
    (message.includes('permission denied') || message.includes('row-level security'))
  ) {
    return { passed: true, kind: 'expected_permission_denial' };
  }

  return { passed: false, kind: 'unexpected_error' };
}

function safeCode(error) {
  return error?.code ?? error?.name ?? 'erro_sem_codigo';
}

function record(results, name, passed, detail) {
  results.push({ name, passed });
  console.log(`${passed ? '[PASS]' : '[FAIL]'} ${name}: ${detail}`);
}

async function signIn(supabase, credentials, label, results) {
  const result = await supabase.auth.signInWithPassword(credentials);
  const passed = !result.error && Boolean(result.data.user?.id);
  record(results, `Autenticacao do Usuario ${label}`, passed,
    passed ? 'sessao autenticada' : `erro ${safeCode(result.error)}`);
  return passed ? result.data.user : null;
}

async function contextFor(supabase, user, label, results) {
  const profile = await supabase.from('profiles')
    .select('id,current_workspace_id').eq('id', user.id).maybeSingle();
  const workspaceId = profile.data?.current_workspace_id;
  record(results, `Profile e workspace do Usuario ${label}`,
    !profile.error && Boolean(workspaceId),
    profile.error ? `erro ${safeCode(profile.error)}` : workspaceId ? 'contexto encontrado' : 'workspace ausente');
  return workspaceId ? { userId: user.id, workspaceId } : null;
}

async function createExplicit(supabase, context, suffix) {
  return supabase.from('uni_financial_memories').insert({
    workspace_id: context.workspaceId,
    memory_type: 'conversation_preference',
    memory_key: `rls-test-${suffix}-${randomUUID()}`,
    memory_value: { tone: 'balanced', test_marker: suffix },
    source: 'explicit_user',
  }).select(MEMORY_FIELDS).single();
}

async function expectInsertDenied(supabase, results, name, payload) {
  const result = await supabase.from('uni_financial_memories').insert(payload);
  record(results, name, denied(result.error),
    denied(result.error) ? 'bloqueado como esperado' : result.error ? `erro inesperado ${safeCode(result.error)}` : 'escrita indevida aceita');
}

async function expectInferredTypeDenied(supabase, results, name, payload) {
  const result = await supabase.from('uni_financial_memories').insert(payload);
  const classification = classifyInferredTypeBlock(result.error);
  record(
    results,
    name,
    classification.passed,
    classification.passed
      ? `bloqueado como esperado (${classification.kind})`
      : result.error
        ? `erro inesperado ${safeCode(result.error)} (${classification.kind})`
        : 'escrita indevida aceita',
  );
}

async function testProtectedInserts(supabase, context, otherUserId, results) {
  const base = {
    workspace_id: context.workspaceId,
    memory_type: 'conversation_preference',
    memory_key: `rls-protected-${randomUUID()}`,
    memory_value: { test: true },
    source: 'explicit_user',
  };
  for (const type of ['recurring_income', 'recurring_expense', 'spending_pattern']) {
    await expectInferredTypeDenied(supabase, results, `Bloqueio do tipo inferido ${type}`, {
      ...base, memory_key: `rls-${type}-${randomUUID()}`, memory_type: type,
    });
  }
  const protectedFields = {
    user_id: otherUserId,
    status: 'confirmed',
    confidence: 0.25,
    first_observed_at: '2026-01-01T00:00:00.000Z',
  };
  for (const [field, value] of Object.entries(protectedFields)) {
    await expectInsertDenied(supabase, results, `Bloqueio do campo protegido ${field}`, {
      ...base, memory_key: `rls-${field}-${randomUUID()}`, [field]: value,
    });
  }
}

async function testEvidenceWrites(supabase, workspaceId, results) {
  const id = randomUUID();
  const insert = await supabase.from('uni_memory_evidence').insert({
    workspace_id: workspaceId, memory_id: randomUUID(), evidence_type: 'test',
    source: 'user_correction', evidence_summary: {}, observed_at: new Date().toISOString(),
  });
  const update = await supabase.from('uni_memory_evidence').update({ evidence_type: 'changed' }).eq('id', id);
  const remove = await supabase.from('uni_memory_evidence').delete().eq('id', id);
  for (const [name, result] of [['INSERT', insert], ['UPDATE', update], ['DELETE', remove]]) {
    record(results, `Evidencias bloqueiam ${name}`, denied(result.error),
      denied(result.error) ? 'bloqueado como esperado' : result.error ? `erro inesperado ${safeCode(result.error)}` : 'operacao indevida aceita');
  }
}

async function runChecks(config) {
  const results = [];
  const a = client(config);
  const b = client(config);
  let memoryA;
  let memoryB;
  let contextA;
  let contextB;
  try {
    const userA = await signIn(a, config.userA, 'A', results);
    const userB = await signIn(b, config.userB, 'B', results);
    if (!userA || !userB) return results;
    contextA = await contextFor(a, userA, 'A', results);
    contextB = await contextFor(b, userB, 'B', results);
    if (!contextA || !contextB) return results;

    const createdA = await createExplicit(a, contextA, 'user-a');
    memoryA = createdA.data;
    const defaultsSafe = memoryA?.user_id === userA.id && memoryA.status === 'candidate' &&
      Number(memoryA.confidence) === 1 && memoryA.user_confirmed === false &&
      memoryA.requires_confirmation === false && Boolean(memoryA.created_at);
    record(results, 'Criacao explicita e defaults protegidos do Usuario A',
      !createdA.error && defaultsSafe,
      createdA.error ? `erro ${safeCode(createdA.error)}` : defaultsSafe ? 'ownership e defaults definidos pelo banco' : 'defaults inesperados');

    const createdB = await createExplicit(b, contextB, 'user-b');
    memoryB = createdB.data;
    record(results, 'Fixture propria temporaria do Usuario B', !createdB.error && Boolean(memoryB?.id),
      createdB.error ? `erro ${safeCode(createdB.error)}` : 'memoria temporaria criada');
    if (!memoryA?.id || !memoryB?.id) return results;

    const ownRead = await a.from('uni_financial_memories').select('id').eq('id', memoryA.id).maybeSingle();
    record(results, 'Usuario A le a propria memoria', !ownRead.error && ownRead.data?.id === memoryA.id,
      ownRead.error ? `erro ${safeCode(ownRead.error)}` : ownRead.data ? 'memoria propria visivel' : 'memoria nao encontrada');

    await testProtectedInserts(a, contextA, userB.id, results);
    const directUpdate = await a.from('uni_financial_memories').update({ memory_value: { changed: true } }).eq('id', memoryA.id);
    record(results, 'UPDATE direto bloqueado', denied(directUpdate.error),
      denied(directUpdate.error) ? 'bloqueado como esperado' : directUpdate.error ? `erro inesperado ${safeCode(directUpdate.error)}` : 'update indevido aceito');

    const decision = await a.rpc('decide_uni_financial_memory', {
      target_workspace_id: contextA.workspaceId, target_memory_id: memoryA.id, target_decision: 'confirmed',
    });
    record(results, 'RPC decide memoria propria', !decision.error && decision.data?.status === 'confirmed',
      decision.error ? `erro ${safeCode(decision.error)}` : 'memoria confirmada');
    const crossDecision = await a.rpc('decide_uni_financial_memory', {
      target_workspace_id: contextB.workspaceId, target_memory_id: memoryB.id, target_decision: 'rejected',
    });
    record(results, 'RPC decide bloqueia memoria de terceiro', Boolean(crossDecision.error),
      crossDecision.error ? 'bloqueado como esperado' : 'decisao indevida aceita');

    const correction = await a.rpc('correct_uni_explicit_memory', {
      target_workspace_id: contextA.workspaceId, target_memory_id: memoryA.id,
      corrected_value: { tone: 'direct', test_marker: 'corrected' },
    });
    record(results, 'RPC corrige memoria explicita propria',
      !correction.error && correction.data?.memory_value?.test_marker === 'corrected',
      correction.error ? `erro ${safeCode(correction.error)}` : 'valor corrigido');
    const crossCorrection = await a.rpc('correct_uni_explicit_memory', {
      target_workspace_id: contextB.workspaceId, target_memory_id: memoryB.id,
      corrected_value: { test_marker: 'forbidden' },
    });
    record(results, 'RPC corrige bloqueia memoria de terceiro', Boolean(crossCorrection.error),
      crossCorrection.error ? 'bloqueado como esperado' : 'correcao indevida aceita');

    const bReadA = await b.from('uni_financial_memories').select('id').eq('id', memoryA.id);
    record(results, 'Usuario B nao le memoria do Usuario A', !bReadA.error && bReadA.data.length === 0,
      bReadA.error ? `erro ${safeCode(bReadA.error)}` : bReadA.data.length === 0 ? 'zero linhas visiveis' : 'memoria alheia visivel');
    const bUpdateA = await b.from('uni_financial_memories').update({ memory_value: { test: false } }).eq('id', memoryA.id);
    record(results, 'Usuario B nao altera memoria do Usuario A', denied(bUpdateA.error),
      denied(bUpdateA.error) ? 'bloqueado como esperado' : bUpdateA.error ? `erro ${safeCode(bUpdateA.error)}` : 'update indevido aceito');
    for (const [name, rpc, args] of [
      ['decide', 'decide_uni_financial_memory', { target_workspace_id: contextA.workspaceId, target_memory_id: memoryA.id, target_decision: 'rejected' }],
      ['corrige', 'correct_uni_explicit_memory', { target_workspace_id: contextA.workspaceId, target_memory_id: memoryA.id, corrected_value: { test: false } }],
    ]) {
      const result = await b.rpc(rpc, args);
      record(results, `Usuario B nao ${name} memoria do Usuario A`, Boolean(result.error),
        result.error ? 'bloqueado como esperado' : 'RPC indevida aceita');
    }
    const bDeleteA = await b.from('uni_financial_memories').delete().eq('id', memoryA.id).select('id');
    record(results, 'Usuario B nao exclui memoria do Usuario A', !bDeleteA.error && bDeleteA.data.length === 0,
      bDeleteA.error ? `erro ${safeCode(bDeleteA.error)}` : bDeleteA.data.length === 0 ? 'zero linhas afetadas' : 'exclusao indevida aceita');

    await testEvidenceWrites(a, contextA.workspaceId, results);
  } finally {
    if (memoryA?.id && contextA) {
      const cleanup = await a.from('uni_financial_memories').delete()
        .eq('workspace_id', contextA.workspaceId).eq('id', memoryA.id).select('id');
      record(results, 'Limpeza da memoria do Usuario A', !cleanup.error && cleanup.data?.length === 1,
        cleanup.error ? `erro ${safeCode(cleanup.error)}` : 'registro temporario removido');
    }
    if (memoryB?.id && contextB) {
      const cleanup = await b.from('uni_financial_memories').delete()
        .eq('workspace_id', contextB.workspaceId).eq('id', memoryB.id).select('id');
      record(results, 'Limpeza da memoria do Usuario B', !cleanup.error && cleanup.data?.length === 1,
        cleanup.error ? `erro ${safeCode(cleanup.error)}` : 'registro temporario removido');
    }
    for (const [label, supabase] of [['A', a], ['B', b]]) {
      const signOut = await supabase.auth.signOut();
      record(results, `SignOut do Usuario ${label}`, !signOut.error,
        signOut.error ? `erro ${safeCode(signOut.error)}` : 'sessao encerrada');
    }
  }
  return results;
}

async function main() {
  let config;
  try {
    config = readConfig();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  const results = await runChecks(config);
  const failed = results.filter((result) => !result.passed);
  console.log(`Resultado: ${results.length - failed.length}/${results.length} testes passaram.`);
  if (failed.length) {
    console.error('Validacao falhou. Revise os itens [FAIL] sem expor credenciais.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
