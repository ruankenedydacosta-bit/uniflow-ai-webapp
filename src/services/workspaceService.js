import { isSupabaseConfigured, supabase } from './supabaseClient';

function createWorkspaceSchemaPendingResult(data = null) {
  return {
    data,
    error: {
      message:
        'Operacoes reais de workspace exigem Supabase configurado. O demo continua disponivel.',
    },
    isConfigured: isSupabaseConfigured,
  };
}

export async function listWorkspaces() {
  if (!supabase) {
    return createWorkspaceSchemaPendingResult([]);
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, workspace_type, owner_user_id, created_at, updated_at')
    .order('created_at');

  return {
    data: data ?? [],
    error,
    isConfigured: true,
  };
}

export async function getCurrentWorkspace(workspaceId) {
  if (!supabase) {
    return createWorkspaceSchemaPendingResult(null);
  }

  const workspaceFields =
    'id, name, workspace_type, owner_user_id, created_at, updated_at';

  if (workspaceId) {
    const workspaceResult = await supabase
      .from('workspaces')
      .select(workspaceFields)
      .eq('id', workspaceId)
      .maybeSingle();

    if (workspaceResult.error || workspaceResult.data) {
      return {
        data: workspaceResult.data,
        error: workspaceResult.error,
        isConfigured: true,
      };
    }
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select(workspaceFields)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  return {
    data,
    error,
    isConfigured: true,
  };
}

export async function getWorkspaceSubscription(workspaceId) {
  if (!supabase) {
    return createWorkspaceSchemaPendingResult(null);
  }

  if (!workspaceId) {
    return {
      data: null,
      error: null,
      isConfigured: true,
    };
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      'id, workspace_id, plan_id, status, trial_ends_at, current_period_ends_at, created_at, updated_at',
    )
    .eq('workspace_id', workspaceId)
    .in('status', ['trialing', 'active', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data,
    error,
    isConfigured: true,
  };
}

export async function createPersonalWorkspace() {
  return createWorkspaceSchemaPendingResult(null);
}

export async function createBusinessWorkspace() {
  return createWorkspaceSchemaPendingResult(null);
}
