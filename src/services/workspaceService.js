function createWorkspaceSchemaPendingResult(data = null) {
  return {
    data,
    error: {
      message:
        'Workspaces reais serao implementados apos schema Supabase, RLS e membership.',
    },
    isConfigured: false,
  };
}

export async function listWorkspaces() {
  return createWorkspaceSchemaPendingResult([]);
}

export async function getCurrentWorkspace() {
  return createWorkspaceSchemaPendingResult(null);
}

export async function createPersonalWorkspace() {
  return createWorkspaceSchemaPendingResult(null);
}

export async function createBusinessWorkspace() {
  return createWorkspaceSchemaPendingResult(null);
}

