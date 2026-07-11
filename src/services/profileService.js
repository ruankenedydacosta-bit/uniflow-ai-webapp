import { isSupabaseConfigured, supabase } from './supabaseClient';

const PROFILE_FIELDS =
  'id, full_name, avatar_url, phone, user_mode, current_workspace_id, onboarding_completed, created_at, updated_at';

function createUnavailableResult() {
  return {
    data: null,
    error: {
      code: 'SUPABASE_NOT_CONFIGURED',
      message:
        'Supabase ainda nao esta configurado. O modo demo continua disponivel.',
    },
    isConfigured: false,
  };
}

function createMissingUserResult() {
  return {
    data: null,
    error: {
      code: 'USER_REQUIRED',
      message: 'Usuario autenticado ausente para atualizar o profile.',
    },
    isConfigured: isSupabaseConfigured,
  };
}

export async function getProfile(userId) {
  if (!supabase) {
    return createUnavailableResult();
  }

  if (!userId) {
    return createMissingUserResult();
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', userId)
    .maybeSingle();

  return {
    data,
    error,
    isConfigured: true,
  };
}

export async function updateProfile(userId, changes = {}) {
  if (!supabase) {
    return createUnavailableResult();
  }

  if (!userId) {
    return createMissingUserResult();
  }

  const allowedChanges = {
    full_name: changes.full_name,
    avatar_url: changes.avatar_url,
    phone: changes.phone,
    user_mode: changes.user_mode,
    current_workspace_id: changes.current_workspace_id,
    onboarding_completed: changes.onboarding_completed,
  };
  const updatePayload = Object.fromEntries(
    Object.entries(allowedChanges).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(updatePayload).length === 0) {
    return getProfile(userId);
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', userId)
    .select(PROFILE_FIELDS)
    .maybeSingle();

  if (!error && !data) {
    return {
      data: null,
      error: {
        code: 'PROFILE_UPDATE_NO_ROWS',
        message:
          'O profile mudou durante a atualizacao. Entre novamente e tente de novo.',
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
