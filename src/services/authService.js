import { getSupabaseConfigStatus, supabase } from './supabaseClient';

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
  if (!supabase) {
    return {
      data: {
        user: null,
      },
      error: null,
      isConfigured: getSupabaseConfigStatus().isConfigured,
    };
  }

  const { data, error } = await supabase.auth.getUser();

  return {
    data,
    error,
    isConfigured: true,
  };
}

export async function signInWithEmail({ email, password } = {}) {
  if (!supabase) {
    return createServiceUnavailableResult();
  }

  const { data, error } = await supabase.auth.signInWithPassword({
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
  if (!supabase) {
    return createServiceUnavailableResult();
  }

  const { data, error } = await supabase.auth.signUp({
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
  if (!supabase) {
    return createServiceUnavailableResult();
  }

  const { error } = await supabase.auth.signOut();

  return {
    data: null,
    error,
    isConfigured: true,
  };
}
