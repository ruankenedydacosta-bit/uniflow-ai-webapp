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

export async function createWorkspace({
  name,
  workspaceType,
  ownerUserId,
} = {}) {
  if (!supabase) {
    return createWorkspaceSchemaPendingResult(null);
  }

  if (!name || !workspaceType || !ownerUserId) {
    return {
      data: null,
      error: {
        code: 'INVALID_WORKSPACE_PAYLOAD',
        message: 'Dados insuficientes para criar o workspace.',
      },
      isConfigured: true,
    };
  }

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name,
      workspace_type: workspaceType,
      owner_user_id: ownerUserId,
    })
    .select('id, name, workspace_type, owner_user_id, created_at, updated_at')
    .single();

  return {
    data,
    error,
    isConfigured: true,
  };
}

export async function deleteOwnedWorkspace(workspaceId, ownerUserId) {
  if (!supabase) {
    return createWorkspaceSchemaPendingResult(null);
  }

  if (!workspaceId || !ownerUserId) {
    return {
      data: null,
      error: {
        code: 'INVALID_WORKSPACE_ROLLBACK',
        message: 'Nao foi possivel validar o workspace para desfazer a criacao.',
      },
      isConfigured: true,
    };
  }

  const { data, error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)
    .eq('owner_user_id', ownerUserId)
    .select('id')
    .maybeSingle();

  if (!error && !data) {
    return {
      data: null,
      error: {
        code: 'WORKSPACE_ROLLBACK_NO_ROWS',
        message: 'O workspace criado nao estava mais disponivel para limpeza.',
      },
      isConfigured: true,
    };
  }

  return {
    data,
    error,
    isConfigured: true,
  };
}

export async function createPersonalWorkspace({ name, ownerUserId } = {}) {
  return createWorkspace({
    name,
    workspaceType: 'personal',
    ownerUserId,
  });
}

export async function createBusinessWorkspace({ name, ownerUserId } = {}) {
  return createWorkspace({
    name,
    workspaceType: 'business',
    ownerUserId,
  });
}
