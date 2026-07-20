import { getProfile, updateProfile } from '../../services/profileService';
import { isSupabaseConfigured } from '../../services/supabaseClient';
import {
  createWorkspace,
  deleteOwnedWorkspace,
  listWorkspaces,
} from '../../services/workspaceService';

function createError(code, message) {
  return { code, message };
}

function getWorkspaceName(userId, workspaceType) {
  return workspaceType === 'business'
    ? 'Meu negócio'
    : 'Minha vida financeira';
}

export async function loadOnboardingData(userId) {
  if (!isSupabaseConfigured) {
    return { data: null, error: null };
  }

  const result = await getProfile(userId);
  if (result.error) return result;

  return {
    data: result.data?.onboarding_data || null,
    error: null,
  };
}

export async function saveOnboardingProgress(userId, step, data) {
  if (!isSupabaseConfigured) {
    return { data: null, error: null };
  }

  return updateProfile(userId, {
    onboarding_data: { step, data },
  });
}

export async function completeOnboarding({ user, userMode, data } = {}) {
  if (!isSupabaseConfigured) {
    return { data: null, error: null, isDemoMode: true };
  }

  if (!user?.id) {
    return {
      data: null,
      error: createError('AUTH_REQUIRED', 'Entre novamente para concluir seu cadastro.'),
      isConfigured: true,
    };
  }

  if (!['personal', 'business', 'both'].includes(userMode)) {
    return {
      data: null,
      error: createError('INVALID_USER_MODE', 'Modo de uso inválido.'),
      isConfigured: true,
    };
  }

  const workspaceTypes = userMode === 'both'
    ? ['personal', 'business']
    : [userMode === 'personal' ? 'personal' : 'business'];

  const workspacesResult = await listWorkspaces();
  if (workspacesResult.error) return workspacesResult;

  const createdWorkspaces = [];
  let finalError = null;

  try {
    for (const workspaceType of workspaceTypes) {
      const existing = workspacesResult.data?.find(
        (w) => w.workspace_type === workspaceType
      );

      if (existing) continue;

      const wsResult = await createWorkspace({
        name: getWorkspaceName(user.id, workspaceType),
        workspaceType,
      });

      if (wsResult.error) {
        finalError = wsResult.error;
        break;
      }

      createdWorkspaces.push(wsResult.data);
    }

    if (finalError) {
      for (const ws of createdWorkspaces) {
        await deleteOwnedWorkspace(ws.id).catch(() => {});
      }
      return { data: null, error: finalError, isConfigured: true };
    }

    const allWorkspacesResult = await listWorkspaces();
    const personalWs = allWorkspacesResult.data?.find((w) => w.workspace_type === 'personal');
    const businessWs = allWorkspacesResult.data?.find((w) => w.workspace_type === 'business');
    const currentWorkspaceId = personalWs?.id || businessWs?.id;

    const profileResult = await updateProfile(user.id, {
      user_mode: userMode,
      current_workspace_id: currentWorkspaceId,
      onboarding_completed: true,
      onboarding_data: { ...data, completedAt: new Date().toISOString() },
      onboarding_completed_at: new Date().toISOString(),
    });

    if (profileResult.error) {
      for (const ws of createdWorkspaces) {
        await deleteOwnedWorkspace(ws.id).catch(() => {});
      }
      return profileResult;
    }

    return {
      data: { profile: profileResult.data },
      error: null,
      isConfigured: true,
    };
  } catch (error) {
    for (const ws of createdWorkspaces) {
      await deleteOwnedWorkspace(ws.id).catch(() => {});
    }
    return { data: null, error, isConfigured: true };
  }
}
