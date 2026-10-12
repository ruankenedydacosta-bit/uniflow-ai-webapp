import { isSupabaseConfigured, supabase } from '../../services/supabaseClient.js';

const GOAL_FIELDS = 'id, user_id, workspace_id, name, description, category, target_amount, initial_amount, current_amount, planned_monthly_amount, start_date, target_date, priority, status, linked_account_id, reminder_day, completed_at, archived_at, created_at, updated_at';
const CONTRIBUTION_FIELDS = 'id, user_id, workspace_id, goal_id, amount, contribution_date, note, linked_account_id, client_operation_id, transaction_id, created_at';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createResult(data, error = null) {
  return { data, error, isConfigured: isSupabaseConfigured };
}

function createUnavailableResult(data) {
  return createResult(data, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'Supabase ainda nao esta configurado. Modo demo continua disponivel.',
  });
}

function createValidationResult(message) {
  return createResult(null, { code: 'INVALID_REQUEST', message });
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function normalizeSingleResult(data, error, notFoundMessage) {
  if (!error && !data) {
    return createResult(null, { code: 'NOT_FOUND', message: notFoundMessage });
  }
  return createResult(data, error);
}

function checkRequiredGoalFields(goal) {
  const normalizedTarget = Number(goal.target_amount);
  return Boolean(
    typeof goal.name === 'string' && goal.name.trim()
      && goal.target_amount !== undefined && Number.isFinite(normalizedTarget) && normalizedTarget > 0
  );
}

// Data de hoje no fuso do aparelho. toISOString() devolve a data em UTC: um
// aporte às 21h30 do dia 31 em São Paulo saía com a data do dia 1 seguinte.
function dataLocalDeHoje() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

function pickDefined(source, fields) {
  return Object.fromEntries(
    fields.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]),
  );
}

// —————— GOALS ——————

export async function listGoals(workspaceId, { status, comUltimoAporte = false, aportesDesde = null } = {}) {
  if (!supabase) return createUnavailableResult([]);
  if (!isValidUuid(workspaceId)) return createValidationResult('Workspace invalido.');

  const campos = [GOAL_FIELDS];
  if (comUltimoAporte) campos.push('ultimo_aporte:goal_contributions(contribution_date)');
  if (aportesDesde) campos.push('aportes_do_periodo:goal_contributions(amount, contribution_date)');

  let query = supabase
    .from('financial_goals')
    .select(campos.join(', '))
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  // Data do último aporte de cada meta, para a lista avisar "Sem aporte há
  // N meses" (#154). Só a tela de Metas pede; vem limitada a uma linha.
  // Retirada (valor negativo, #158) não conta como aporte.
  if (comUltimoAporte) {
    query = query
      .gt('ultimo_aporte.amount', 0)
      .order('contribution_date', { referencedTable: 'ultimo_aporte', ascending: false })
      .limit(1, { referencedTable: 'ultimo_aporte' });
  }

  // Aportes e retiradas desde uma data (AAAA-MM-DD): a Leitura do mês usa os
  // do mês para saber se a meta passou de 50% ou 100% agora (#162).
  if (aportesDesde) {
    query = query.gte('aportes_do_periodo.contribution_date', aportesDesde);
  }

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (!comUltimoAporte) return createResult(data ?? [], error);
  const goals = (data ?? []).map(({ ultimo_aporte: ultimoAporte, ...goal }) => ({
    ...goal,
    last_contribution_date: ultimoAporte?.[0]?.contribution_date ?? null,
  }));
  return createResult(goals, error);
}

export async function getGoal(workspaceId, goalId) {
  if (!supabase) return createUnavailableResult(null);
  if (!isValidUuid(workspaceId) || !isValidUuid(goalId)) return createValidationResult('Workspace ou meta invalida.');

  const { data, error } = await supabase
    .from('financial_goals')
    .select(GOAL_FIELDS)
    .eq('workspace_id', workspaceId)
    .eq('id', goalId)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Meta nao encontrada.');
}

export async function createGoal(workspaceId, goal = {}) {
  if (!supabase) return createUnavailableResult(null);
  if (!isValidUuid(workspaceId)) return createValidationResult('Workspace invalido.');

  if (!checkRequiredGoalFields(goal)) {
    return createValidationResult('Nome e valor-alvo positivo sao obrigatorios.');
  }

  const payload = {
    workspace_id: workspaceId,
    ...pickDefined(goal, [
      'name', 'description', 'category', 'target_amount',
      'initial_amount', 'current_amount', 'planned_monthly_amount',
      'start_date', 'target_date', 'priority', 'status', 'linked_account_id',
      'reminder_day',
    ]),
    name: goal.name.trim(),
  };

  if (!payload.current_amount && payload.initial_amount) {
    payload.current_amount = payload.initial_amount;
  }

  const { data, error } = await supabase
    .from('financial_goals')
    .insert(payload)
    .select(GOAL_FIELDS)
    .single();

  return createResult(data, error);
}

export async function updateGoal(workspaceId, goalId, changes = {}) {
  if (!supabase) return createUnavailableResult(null);
  if (!isValidUuid(workspaceId) || !isValidUuid(goalId)) return createValidationResult('Workspace ou meta invalida.');

  if (changes.name !== undefined && (!changes.name || !changes.name.trim())) {
    return createValidationResult('Nome da meta nao pode ser vazio.');
  }

  if (changes.target_amount !== undefined) {
    const normalized = Number(changes.target_amount);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return createValidationResult('Valor-alvo deve ser positivo.');
    }
  }

  const payload = pickDefined(changes, [
    'name', 'description', 'category', 'target_amount',
    'current_amount', 'planned_monthly_amount',
    'start_date', 'target_date', 'priority', 'status',
    'linked_account_id', 'reminder_day', 'completed_at', 'archived_at',
  ]);

  if (typeof payload.name === 'string') payload.name = payload.name.trim();

  if (Object.keys(payload).length === 0) {
    return createValidationResult('Nenhuma alteracao informada.');
  }

  const { data, error } = await supabase
    .from('financial_goals')
    .update(payload)
    .eq('workspace_id', workspaceId)
    .eq('id', goalId)
    .select(GOAL_FIELDS)
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Meta nao encontrada para atualizacao.');
}

export async function deleteGoal(workspaceId, goalId) {
  if (!supabase) return createUnavailableResult(null);
  if (!isValidUuid(workspaceId) || !isValidUuid(goalId)) return createValidationResult('Workspace ou meta invalida.');

  const { data, error } = await supabase
    .from('financial_goals')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', goalId)
    .select('id')
    .maybeSingle();

  return normalizeSingleResult(data, error, 'Meta nao encontrada para exclusao.');
}

// —————— CONTRIBUTIONS ——————

export async function listContributions(goalId) {
  if (!supabase) return createUnavailableResult([]);
  if (!isValidUuid(goalId)) return createValidationResult('Meta invalida.');

  const { data, error } = await supabase
    .from('goal_contributions')
    .select(CONTRIBUTION_FIELDS)
    .eq('goal_id', goalId)
    .order('contribution_date', { ascending: false })
    .order('created_at', { ascending: false });

  return createResult(data ?? [], error);
}

// Aporte (valor positivo) ou retirada (negativo), pela função do banco
// (#158): grava o aporte, atualiza o valor guardado e, com
// `registrar_no_financeiro`, cria a transferência entre a conta escolhida e
// a conta vinculada da meta, tudo na mesma transação. Devolve
// `{ meta, aporte }`; o erro traz em `message` o código da função
// (`retirada_maior_que_guardado`, `meta_concluida`...).
export async function addContribution(workspaceId, goalId, contribution = {}) {
  if (!supabase) return createUnavailableResult(null);
  if (!isValidUuid(workspaceId) || !isValidUuid(goalId)) return createValidationResult('Workspace ou meta invalida.');

  const normalizedAmount = Number(contribution.amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
    return createValidationResult('Valor da contribuicao deve ser diferente de zero.');
  }
  if (contribution.linked_account_id && !isValidUuid(contribution.linked_account_id)) {
    return createValidationResult('Conta invalida.');
  }

  const { data, error } = await supabase.rpc('registrar_movimento_da_meta', {
    p_goal_id: goalId,
    p_valor: normalizedAmount,
    p_data: contribution.contribution_date || dataLocalDeHoje(),
    p_observacao: contribution.note || null,
    p_conta_id: contribution.linked_account_id || null,
    p_registrar_no_financeiro: Boolean(contribution.registrar_no_financeiro),
    p_client_operation_id: contribution.client_operation_id || null,
  });

  return createResult(error ? null : data, error);
}

// Desfaz um aporte ou uma retirada, com a transferência criada junto.
// Devolve `{ meta }` com o valor guardado já recalculado.
export async function removeContribution(workspaceId, contributionId) {
  if (!supabase) return createUnavailableResult(null);
  if (!isValidUuid(workspaceId) || !isValidUuid(contributionId)) return createValidationResult('Workspace ou contribuicao invalida.');

  const { data, error } = await supabase.rpc('excluir_movimento_da_meta', {
    p_contribution_id: contributionId,
  });

  return createResult(error ? null : data, error);
}
