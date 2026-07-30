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

async function getAuthenticatedUserId() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user?.id) {
    return {
      data: null,
      error: {
        code: error?.code ?? 'AUTH_REQUIRED',
        message: 'Entre novamente para alterar seus espaços.',
      },
    };
  }

  return { data: data.user.id, error: null };
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

/**
 * ETAPA 4 -- Seu plano: getWorkspaceSubscription() acima só busca status
 * 'trialing'/'active'/'past_due' (usado por SessionContext para o resto do
 * app). Isso significa que uma assinatura 'canceled'/'expired' nunca é
 * retornada por ali -- fica indistinguível de "nunca assinou". A tela de
 * plano precisa mostrar o estado real mesmo quando cancelado/expirado, por
 * isso busca a assinatura mais recente sem filtrar por status. Mesma
 * tabela, mesmas colunas reais, nenhuma escrita.
 */
export async function getWorkspaceSubscriptionAny(workspaceId) {
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
} = {}) {
  if (!supabase) {
    return createWorkspaceSchemaPendingResult(null);
  }

  if (!name || !workspaceType) {
    return {
      data: null,
      error: {
        code: 'INVALID_WORKSPACE_PAYLOAD',
        message: 'Dados insuficientes para criar o workspace.',
      },
      isConfigured: true,
    };
  }

  const userResult = await getAuthenticatedUserId();

  if (userResult.error) {
    return {
      data: null,
      error: userResult.error,
      isConfigured: true,
    };
  }

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name,
      workspace_type: workspaceType,
      owner_user_id: userResult.data,
    })
    .select('id, name, workspace_type, owner_user_id, created_at, updated_at')
    .single();

  return {
    data,
    error,
    isConfigured: true,
  };
}

export async function deleteOwnedWorkspace(workspaceId) {
  if (!supabase) {
    return createWorkspaceSchemaPendingResult(null);
  }

  if (!workspaceId) {
    return {
      data: null,
      error: {
        code: 'INVALID_WORKSPACE_ROLLBACK',
        message: 'Nao foi possivel validar o workspace para desfazer a criacao.',
      },
      isConfigured: true,
    };
  }

  const userResult = await getAuthenticatedUserId();

  if (userResult.error) {
    return {
      data: null,
      error: userResult.error,
      isConfigured: true,
    };
  }

  const { data, error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)
    .eq('owner_user_id', userResult.data)
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

export async function createPersonalWorkspace({ name } = {}) {
  return createWorkspace({
    name,
    workspaceType: 'personal',
  });
}

export async function createBusinessWorkspace({ name } = {}) {
  return createWorkspace({
    name,
    workspaceType: 'business',
  });
}
