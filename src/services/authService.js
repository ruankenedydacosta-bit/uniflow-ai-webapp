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

export async function getSession() {
  if (!supabase) {
    return {
      data: {
        session: null,
      },
      error: null,
      isConfigured: false,
    };
  }

  const { data, error } = await supabase.auth.getSession();

  return {
    data,
    error,
    isConfigured: true,
  };
}

export function onAuthStateChange(callback) {
  if (!supabase) {
    return {
      unsubscribe() {},
    };
  }

  const { data } = supabase.auth.onAuthStateChange(callback);

  return data.subscription;
}

export async function signInWithPassword({ email, password } = {}) {
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

export const signInWithEmail = signInWithPassword;

export async function signUpWithEmail({ email, password, fullName } = {}) {
  if (!supabase) {
    return createServiceUnavailableResult();
  }

  const credentials = { email, password };
  const normalizedName = typeof fullName === 'string' ? fullName.trim() : '';
  if (normalizedName) {
    credentials.options = { data: { full_name: normalizedName } };
  }

  const { data, error } = await supabase.auth.signUp(credentials);

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
