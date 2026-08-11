import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import { createProfileAvatarSignedUrl } from './storage.service.js';

const BASE_PROFILE_FIELDS =
  'id, full_name, avatar_url, phone, user_mode, current_workspace_id, onboarding_completed, onboarding_data, onboarding_completed_at, created_at, updated_at';
const CONVERSATION_PROFILE_FIELDS = `${BASE_PROFILE_FIELDS}, conversation_style`;
const PROFILE_PREFERENCE_FIELDS =
  'preferred_name, treatment_preference, custom_treatment, birth_date, locale, text_size, avatar_path';
const PROFILE_FIELDS = `${CONVERSATION_PROFILE_FIELDS}, ${PROFILE_PREFERENCE_FIELDS}`;
const VOICE_PROVIDER_FIELD = 'voice_provider';
const VOICE_PROFILE_FIELDS = `${PROFILE_FIELDS}, ${VOICE_PROVIDER_FIELD}`;

const PROFILE_PREFERENCE_COLUMNS = PROFILE_PREFERENCE_FIELDS.split(', ');

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

export function isProfilePreferencesColumnMissing(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  return (
    ['42703', 'PGRST204'].includes(code)
    && PROFILE_PREFERENCE_COLUMNS.some((column) => message.includes(column))
  ) || (
    PROFILE_PREFERENCE_COLUMNS.some((column) => message.includes(column))
    && ['does not exist', 'schema cache', 'could not find'].some((part) => message.includes(part))
  );
}

export function isVoiceProviderColumnMissing(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  return (
    ['42703', 'PGRST204'].includes(code)
    && message.includes(VOICE_PROVIDER_FIELD)
  ) || (
    message.includes(VOICE_PROVIDER_FIELD)
    && ['does not exist', 'schema cache', 'could not find'].some((part) => message.includes(part))
  );
}

async function hydrateProfileAvatar(profile) {
  if (!profile?.avatar_path) return profile;
  const signedUrlResult = await createProfileAvatarSignedUrl(profile.avatar_path);
  return {
    ...profile,
    avatar_url: signedUrlResult.data ?? profile.avatar_url ?? null,
  };
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

async function getProfileWithoutVoiceProvider(userId) {
  const profileResult = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', userId)
    .maybeSingle();

  if (isProfilePreferencesColumnMissing(profileResult.error)) {
    const conversationResult = await supabase
      .from('profiles')
      .select(CONVERSATION_PROFILE_FIELDS)
      .eq('id', userId)
      .maybeSingle();

    if (!isConversationStyleColumnMissing(conversationResult.error)) {
      return {
        data: conversationResult.data,
        error: conversationResult.error,
        isConfigured: true,
      };
    }

    const baseResult = await supabase
      .from('profiles')
      .select(BASE_PROFILE_FIELDS)
      .eq('id', userId)
      .maybeSingle();

    return {
      data: baseResult.data,
      error: baseResult.error,
      isConfigured: true,
    };
  }

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
    data: await hydrateProfileAvatar(profileResult.data),
    error: profileResult.error,
    isConfigured: true,
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
    .select(VOICE_PROFILE_FIELDS)
    .eq('id', userId)
    .maybeSingle();

  if (isVoiceProviderColumnMissing(profileResult.error)) {
    return getProfileWithoutVoiceProvider(userId);
  }

  if (profileResult.error && (
    isProfilePreferencesColumnMissing(profileResult.error)
    || isConversationStyleColumnMissing(profileResult.error)
  )) {
    return getProfileWithoutVoiceProvider(userId);
  }

  return {
    data: await hydrateProfileAvatar(profileResult.data),
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
    preferred_name: changes.preferred_name,
    treatment_preference: changes.treatment_preference,
    custom_treatment: changes.custom_treatment,
    birth_date: changes.birth_date,
    locale: changes.locale,
    text_size: changes.text_size,
    avatar_path: changes.avatar_path,
    voice_provider: changes.voice_provider,
  };
  const updatePayload = Object.fromEntries(
    Object.entries(allowedChanges).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(updatePayload).length === 0) {
    return getProfile(userId);
  }

  const updatesConversationStyle = updatePayload.conversation_style !== undefined;
  const updatesPreferences = PROFILE_PREFERENCE_COLUMNS.some(
    (column) => updatePayload[column] !== undefined,
  );
  const updatesVoiceProvider = updatePayload.voice_provider !== undefined;
  const { data, error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', userId)
    .select(
      updatesConversationStyle || updatesPreferences || updatesVoiceProvider
        ? VOICE_PROFILE_FIELDS
        : BASE_PROFILE_FIELDS,
    )
    .maybeSingle();

  if (updatesVoiceProvider && isVoiceProviderColumnMissing(error)) {
    return {
      data: null,
      error: {
        code: 'VOICE_PROVIDER_UNAVAILABLE',
        message: 'A preferência de voz ainda não está disponível neste ambiente.',
      },
      isConfigured: true,
    };
  }

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

  if (updatesPreferences && isProfilePreferencesColumnMissing(error)) {
    return {
      data: null,
      error: {
        code: 'PROFILE_PREFERENCES_UNAVAILABLE',
        message: 'As preferências de perfil ainda não estão disponíveis neste ambiente.',
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
    data: await hydrateProfileAvatar(data),
    error,
    isConfigured: true,
  };
}
