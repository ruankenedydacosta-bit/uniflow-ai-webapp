import { isSupabaseConfigured, supabase } from './supabaseClient';

const BASE_PROFILE_FIELDS =
  'id, full_name, avatar_url, phone, user_mode, current_workspace_id, onboarding_completed, onboarding_data, onboarding_completed_at, created_at, updated_at';
const PROFILE_FIELDS = `${BASE_PROFILE_FIELDS}, conversation_style`;

export function isConversationStyleColumnMissing(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();

  return (
    code === '42703'
    || code === 'PGRST204'
    || (
      message.includes('conversation_style')
      && (
        message.includes('does not exist')
        || message.includes('schema cache')
        || message.includes('could not find')
      )
    )
  );
}

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

  const profileResult = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', userId)
    .maybeSingle();

  if (isConversationStyleColumnMissing(profileResult.error)) {
    const { data, error } = await supabase
      .from('profiles')
      .select(BASE_PROFILE_FIELDS)
      .eq('id', userId)
      .maybeSingle();

    return {
      data,
      error,
      isConfigured: true,
    };
  }

  return {
    data: profileResult.data,
    error: profileResult.error,
    isConfigured: true,
  };
}

export async function ensureOwnProfile() {
  if (!supabase) {
    return createUnavailableResult();
  }

  const { data, error } = await supabase.rpc('ensure_own_profile');

  if (error || !data?.id) {
    return {
      data: null,
      error: {
        code: 'PROFILE_ENSURE_FAILED',
        message:
          'Não foi possível preparar seu perfil. Entre novamente e tente de novo.',
      },
      isConfigured: true,
    };
  }

  return {
    data,
    error: null,
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
    onboarding_data: changes.onboarding_data,
    onboarding_completed_at: changes.onboarding_completed_at,
    conversation_style: changes.conversation_style,
  };
  const updatePayload = Object.fromEntries(
    Object.entries(allowedChanges).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(updatePayload).length === 0) {
    return getProfile(userId);
  }

  const updatesConversationStyle = updatePayload.conversation_style !== undefined;
  const { data, error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', userId)
    .select(updatesConversationStyle ? PROFILE_FIELDS : BASE_PROFILE_FIELDS)
    .maybeSingle();

  if (updatesConversationStyle && isConversationStyleColumnMissing(error)) {
    return {
      data: null,
      error: {
        code: 'CONVERSATION_STYLE_UNAVAILABLE',
        message: 'A preferência de conversa ainda não está disponível neste ambiente.',
      },
      isConfigured: true,
    };
  }

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
