import {
  ensureOwnProfile,
  getProfile,
  updateProfile,
} from './profileService';
import { isSupabaseConfigured } from './supabaseClient';
import {
  createWorkspace,
  deleteOwnedWorkspace,
  listWorkspaces,
} from './workspaceService';

const USER_MODES = ['personal', 'business', 'both'];
const WORKSPACE_TYPES = ['personal', 'business'];

function logOnboardingDevelopment(message) {
  if (import.meta.env.DEV) {
    console.info(`[Onboarding DEV] ${message}`);
  }
}

function logOnboardingFailure(operation, error) {
  if (!import.meta.env.DEV) {
    return;
  }

  const safeCode = error?.code ?? error?.name ?? 'UNKNOWN_ERROR';
  console.error(
    `[Onboarding DEV] operation=${operation} code=${safeCode}`,
  );
}

function createError(code, message) {
  return {
    code,
    message,
  };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getNameFromEmail(email = '') {
  const localPart = email.split('@')[0] ?? '';
  const words = localPart
    .split(/[._-]+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`);

  return words.join(' ') || 'UniFlow';
}

function resolveFullName(user, profile, suppliedFullName) {
  return (
    normalizeText(suppliedFullName) ||
    normalizeText(profile.full_name) ||
    normalizeText(user.user_metadata?.full_name) ||
    normalizeText(user.user_metadata?.name) ||
    getNameFromEmail(user.email)
  );
}

function resolvePhone(user, profile, suppliedPhone) {
  return (
    normalizeText(suppliedPhone) ||
    normalizeText(profile.phone) ||
    normalizeText(user.phone) ||
    normalizeText(user.user_metadata?.phone) ||
    null
  );
}

function getWorkspaceName(fullName, workspaceType) {
  return workspaceType === 'business'
    ? `${fullName} - Empresa`
    : `${fullName} - Pessoal`;
}

function findReusableWorkspace(workspaces, profile, workspaceType, userId) {
  const selectedCurrentWorkspace = workspaces.find(
    (workspace) =>
      workspace.id === profile.current_workspace_id &&
      workspace.workspace_type === workspaceType,
  );

  if (selectedCurrentWorkspace) {
    return selectedCurrentWorkspace;
  }

  return (
    workspaces.find(
      (workspace) =>
        workspace.workspace_type === workspaceType &&
        workspace.owner_user_id === userId,
    ) ??
    workspaces.find(
      (workspace) => workspace.workspace_type === workspaceType,
    )
  );
}

async function rollbackCreatedWorkspace(workspace, originalError) {
  const rollbackResult = await deleteOwnedWorkspace(workspace.id);

  if (rollbackResult.error) {
    logOnboardingFailure('rollback_created_workspace', rollbackResult.error);
    logOnboardingDevelopment('Falha ao limpar workspace da tentativa incompleta.');

    return {
      data: null,
      error: createError(
        'ONBOARDING_ROLLBACK_FAILED',
        'O onboarding nao foi concluido e a limpeza automatica falhou. Tente novamente antes de continuar.',
      ),
      cause: originalError,
      rollbackError: rollbackResult.error,
      isConfigured: true,
    };
  }

  logOnboardingDevelopment('Workspace da tentativa incompleta removido.');

  return {
    data: null,
    error: originalError,
    isConfigured: true,
    rolledBack: true,
  };
}

export async function completeOnboarding({
  user,
  fullName,
  phone,
  userMode,
  currentWorkspace,
} = {}) {
  if (!isSupabaseConfigured) {
    return {
      data: null,
      error: null,
      isConfigured: false,
      isDemoMode: true,
    };
  }

  if (!user?.id) {
    return {
      data: null,
      error: createError(
        'AUTH_REQUIRED',
        'Entre novamente para concluir seu onboarding.',
      ),
      isConfigured: true,
    };
  }

  if (!USER_MODES.includes(userMode)) {
    return {
      data: null,
      error: createError('INVALID_USER_MODE', 'Modo de uso invalido.'),
      isConfigured: true,
    };
  }

  if (!WORKSPACE_TYPES.includes(currentWorkspace)) {
    return {
      data: null,
      error: createError('INVALID_WORKSPACE_TYPE', 'Tipo de workspace invalido.'),
      isConfigured: true,
    };
  }

  let profileResult = await getProfile(user.id);

  if (profileResult.error) {
    logOnboardingFailure('get_profile', profileResult.error);
    return profileResult;
  }

  if (!profileResult.data) {
    logOnboardingDevelopment('Profile ausente; tentando garantir o profile autenticado.');
    profileResult = await ensureOwnProfile();

    if (profileResult.error || !profileResult.data) {
      logOnboardingFailure(
        'ensure_own_profile',
        profileResult.error ?? createError('PROFILE_ENSURE_NO_DATA', ''),
      );
      return {
        data: null,
        error:
          profileResult.error ??
          createError(
            'PROFILE_NOT_FOUND',
            'Seu perfil ainda não está disponível. Entre novamente e tente de novo.',
          ),
        isConfigured: true,
      };
    }
  }

  const resolvedFullName = resolveFullName(
    user,
    profileResult.data,
    fullName,
  );
  const resolvedPhone = resolvePhone(user, profileResult.data, phone);
  const initialProfileResult = await updateProfile(user.id, {
    full_name: resolvedFullName,
    phone: resolvedPhone,
    user_mode: userMode,
  });

  if (initialProfileResult.error) {
    logOnboardingFailure('update_profile_identity', initialProfileResult.error);
    return initialProfileResult;
  }

  if (!initialProfileResult.data) {
    logOnboardingFailure(
      'update_profile_identity',
      createError('PROFILE_UPDATE_NOT_FOUND', ''),
    );
    return {
      data: null,
      error: createError(
        'PROFILE_UPDATE_NOT_FOUND',
        'Seu profile mudou durante o onboarding. Entre novamente e tente de novo.',
      ),
      isConfigured: true,
    };
  }

  const workspacesResult = await listWorkspaces();

  if (workspacesResult.error) {
    logOnboardingFailure('list_workspaces', workspacesResult.error);
    return workspacesResult;
  }

  let workspace = findReusableWorkspace(
    workspacesResult.data,
    initialProfileResult.data,
    currentWorkspace,
    user.id,
  );
  let reusedWorkspace = Boolean(workspace);
  let createdWorkspace = false;

  if (!workspace) {
    const workspaceResult = await createWorkspace({
      name: getWorkspaceName(resolvedFullName, currentWorkspace),
      workspaceType: currentWorkspace,
    });

    if (workspaceResult.error) {
      logOnboardingFailure('create_workspace', workspaceResult.error);
      return workspaceResult;
    }

    workspace = workspaceResult.data;

    if (!workspace) {
      logOnboardingFailure(
        'create_workspace',
        createError('WORKSPACE_NOT_CREATED', ''),
      );
      return {
        data: null,
        error: createError(
          'WORKSPACE_NOT_CREATED',
          'Nao foi possivel preparar seu workspace. Tente novamente.',
        ),
        isConfigured: true,
      };
    }

    reusedWorkspace = false;
    createdWorkspace = true;
    logOnboardingDevelopment('Workspace padrao criado.');
  } else {
    logOnboardingDevelopment('Workspace existente reutilizado.');
  }

  const completedProfileResult = await updateProfile(user.id, {
    current_workspace_id: workspace.id,
    onboarding_completed: true,
  });

  if (completedProfileResult.error) {
    logOnboardingFailure(
      'complete_profile',
      completedProfileResult.error,
    );
    if (createdWorkspace) {
      return rollbackCreatedWorkspace(
        workspace,
        completedProfileResult.error,
      );
    }

    return completedProfileResult;
  }

  if (!completedProfileResult.data) {
    const completionError = createError(
      'ONBOARDING_PROFILE_NOT_FOUND',
      'Nao foi possivel concluir seu profile. Entre novamente e tente de novo.',
    );
    logOnboardingFailure('complete_profile', completionError);

    if (createdWorkspace) {
      return rollbackCreatedWorkspace(workspace, completionError);
    }

    return {
      data: null,
      error: completionError,
      isConfigured: true,
    };
  }

  logOnboardingDevelopment('Profile e onboarding concluidos.');

  return {
    data: {
      profile: completedProfileResult.data,
      workspace,
      reusedWorkspace,
    },
    error: null,
    isConfigured: true,
    isDemoMode: false,
  };
}
