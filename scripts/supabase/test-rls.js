import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const REQUIRED_ENVIRONMENT_VARIABLES = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_TEST_EMAIL',
  'SUPABASE_TEST_PASSWORD',
];

const EXPECTED_PLAN_IDS = ['free', 'pro', 'business', 'enterprise'];

function getJwtRole(key) {
  const parts = key.split('.');

  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    );

    return payload.role ?? null;
  } catch {
    return null;
  }
}

function isServerOnlyKey(key) {
  return key.startsWith('sb_secret_') || getJwtRole(key) === 'service_role';
}

function isPermissionDenied(error) {
  if (!error) {
    return false;
  }

  const message = String(error.message ?? '').toLowerCase();

  return (
    error.code === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('not allowed')
  );
}

function getSafeErrorCode(error) {
  return error?.code ?? error?.name ?? 'erro_sem_codigo';
}

function addResult(results, name, passed, detail) {
  results.push({ name, passed });
  console.log(`${passed ? '[PASS]' : '[FAIL]'} ${name}: ${detail}`);
}

function readConfiguration() {
  const missingVariables = REQUIRED_ENVIRONMENT_VARIABLES.filter(
    (name) => !process.env[name],
  );

  if (missingVariables.length > 0) {
    console.error(
      `Configuracao ausente: ${missingVariables.join(', ')}. ` +
        'Nenhuma conexao foi iniciada. Consulte SUPABASE_RLS_TESTING.md.',
    );
    return null;
  }

  const configuration = {
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseKey: process.env.VITE_SUPABASE_ANON_KEY,
    testEmail: process.env.SUPABASE_TEST_EMAIL,
    testPassword: process.env.SUPABASE_TEST_PASSWORD,
  };

  if (isServerOnlyKey(configuration.supabaseKey)) {
    console.error(
      'Chave de servidor detectada. Use somente anon key ou publishable key do UniFlow DEV.',
    );
    return null;
  }

  try {
    const parsedUrl = new URL(configuration.supabaseUrl);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('unsupported_protocol');
    }
  } catch {
    console.error('VITE_SUPABASE_URL invalida. Nenhuma conexao foi iniciada.');
    return null;
  }

  return configuration;
}

async function runAuthenticatedChecks(supabase, userId, results) {
  const profileResult = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  addResult(
    results,
    'Leitura do proprio profile',
    !profileResult.error && profileResult.data?.id === userId,
    profileResult.error
      ? `erro ${getSafeErrorCode(profileResult.error)}`
      : profileResult.data
        ? 'profile proprio visivel'
        : 'profile proprio nao encontrado',
  );

  const workspaceResult = await supabase
    .from('workspaces')
    .select('id, workspace_type')
    .order('created_at');
  const workspaces = workspaceResult.data ?? [];

  addResult(
    results,
    'Leitura dos proprios workspaces',
    !workspaceResult.error && workspaces.length > 0,
    workspaceResult.error
      ? `erro ${getSafeErrorCode(workspaceResult.error)}`
      : `${workspaces.length} workspace(s) permitido(s)`,
  );

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.workspace_type === 'personal') ??
    workspaces[0];

  if (selectedWorkspace) {
    const membershipResult = await supabase
      .from('workspace_members')
      .select('workspace_id, user_id, role, status')
      .eq('workspace_id', selectedWorkspace.id);
    const memberships = membershipResult.data ?? [];
    const ownOwnerMembership = memberships.some(
      (membership) =>
        membership.user_id === userId &&
        membership.role === 'owner' &&
        membership.status === 'active',
    );

    addResult(
      results,
      'Leitura das memberships do workspace',
      !membershipResult.error && ownOwnerMembership,
      membershipResult.error
        ? `erro ${getSafeErrorCode(membershipResult.error)}`
        : ownOwnerMembership
          ? 'membership owner ativa encontrada'
          : 'membership owner ativa nao encontrada',
    );
  } else {
    addResult(
      results,
      'Leitura das memberships do workspace',
      false,
      'teste bloqueado porque nenhum workspace ficou visivel',
    );
  }

  const plansResult = await supabase
    .from('plans')
    .select('id, active')
    .eq('active', true);
  const planIds = new Set((plansResult.data ?? []).map((plan) => plan.id));
  const missingPlanIds = EXPECTED_PLAN_IDS.filter((id) => !planIds.has(id));

  addResult(
    results,
    'Leitura dos plans ativos',
    !plansResult.error && missingPlanIds.length === 0,
    plansResult.error
      ? `erro ${getSafeErrorCode(plansResult.error)}`
      : missingPlanIds.length === 0
        ? 'catalogo inicial completo'
        : `plans ausentes: ${missingPlanIds.join(', ')}`,
  );

  const leadsResult = await supabase.from('site_leads').select('id').limit(1);
  const leadsReadBlocked = isPermissionDenied(leadsResult.error);
  const leadsReadEmpty =
    !leadsResult.error && Array.isArray(leadsResult.data) && leadsResult.data.length === 0;

  addResult(
    results,
    'Bloqueio de leitura de site_leads',
    leadsReadBlocked || leadsReadEmpty,
    leadsReadBlocked
      ? 'acesso negado como esperado'
      : leadsReadEmpty
        ? 'nenhuma linha ficou visivel'
        : leadsResult.error
          ? `erro inesperado ${getSafeErrorCode(leadsResult.error)}`
          : 'dados de leads ficaram visiveis',
  );

  if (!selectedWorkspace || planIds.size === 0) {
    addResult(
      results,
      'Bloqueio de escrita em subscriptions',
      false,
      'teste bloqueado por falta de workspace ou plan legivel',
    );
    return;
  }

  const subscriptionTestId = randomUUID();
  const subscriptionResult = await supabase.from('subscriptions').insert({
    id: subscriptionTestId,
    workspace_id: selectedWorkspace.id,
    plan_id: planIds.has('free') ? 'free' : [...planIds][0],
    status: 'active',
  });
  const subscriptionWriteBlocked = isPermissionDenied(subscriptionResult.error);

  addResult(
    results,
    'Bloqueio de escrita em subscriptions',
    subscriptionWriteBlocked,
    subscriptionWriteBlocked
      ? 'escrita negada como esperado'
      : subscriptionResult.error
        ? `erro inesperado ${getSafeErrorCode(subscriptionResult.error)}`
        : `escrita foi aceita; remova manualmente no DEV o registro ${subscriptionTestId}`,
  );
}

async function runRlsValidation() {
  const configuration = readConfiguration();

  if (!configuration) {
    process.exitCode = 1;
    return;
  }

  console.log('Iniciando validacao autenticada. Confirme que o endpoint e do UniFlow DEV.');

  const supabase = createClient(
    configuration.supabaseUrl,
    configuration.supabaseKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const results = [];
  let signedIn = false;

  try {
    const authResult = await supabase.auth.signInWithPassword({
      email: configuration.testEmail,
      password: configuration.testPassword,
    });

    if (authResult.error || !authResult.data.user) {
      addResult(
        results,
        'Autenticacao do usuario de teste',
        false,
        `erro ${getSafeErrorCode(authResult.error)}`,
      );
    } else {
      signedIn = true;
      addResult(
        results,
        'Autenticacao do usuario de teste',
        true,
        'sessao autenticada sem expor credenciais',
      );
      await runAuthenticatedChecks(supabase, authResult.data.user.id, results);
    }
  } catch (error) {
    addResult(
      results,
      'Execucao do roteiro',
      false,
      `erro inesperado ${getSafeErrorCode(error)}`,
    );
  } finally {
    if (signedIn) {
      const signOutResult = await supabase.auth.signOut();

      addResult(
        results,
        'Encerramento da sessao',
        !signOutResult.error,
        signOutResult.error
          ? `erro ${getSafeErrorCode(signOutResult.error)}`
          : 'signOut concluido',
      );
    }
  }

  const failedTests = results.filter((result) => !result.passed);

  console.log(
    `Resultado: ${results.length - failedTests.length}/${results.length} testes passaram.`,
  );

  if (failedTests.length > 0) {
    console.error('Validacao de RLS falhou. Revise os itens [FAIL] antes de continuar.');
    process.exitCode = 1;
  }
}

await runRlsValidation();

