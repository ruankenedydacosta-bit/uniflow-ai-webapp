import { getSupabaseConfigStatus, supabaseClient } from './supabaseClient';

function createServiceUnavailableResult() {
  return {
    data: null,
    error: {
      message:
        'Supabase ainda nao esta configurado. O demo mockado continua funcionando sem chaves.',
    },
    isConfigured: false,
  };
}

export async function getCurrentUser() {
  if (!supabaseClient) {
    return {
      data: {
        user: null,
      },
      error: null,
      isConfigured: getSupabaseConfigStatus().isConfigured,
    };
  }

  const { data, error } = await supabaseClient.auth.getUser();

  return {
    data,
    error,
    isConfigured: true,
  };
}

export async function signInWithEmail({ email, password } = {}) {
  if (!supabaseClient) {
    return createServiceUnavailableResult();
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  return {
    data,
    error,
    isConfigured: true,
  };
}

export async function signUpWithEmail({ email, password } = {}) {
  if (!supabaseClient) {
    return createServiceUnavailableResult();
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
  });

  return {
    data,
    error,
    isConfigured: true,
  };
}

export async function signOut() {
  if (!supabaseClient) {
    return createServiceUnavailableResult();
  }

  const { error } = await supabaseClient.auth.signOut();

  return {
    data: null,
    error,
    isConfigured: true,
  };
}

