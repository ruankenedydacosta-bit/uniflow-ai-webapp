/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  getSession,
  onAuthStateChange,
  signInWithPassword as signInWithPasswordService,
  signOut as signOutService,
} from '../services/authService';
import { getProfile } from '../services/profileService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import {
  getCurrentWorkspace,
  getWorkspaceSubscription,
} from '../services/workspaceService';
import { useAccess } from './AccessContext';
import { PLANS, USER_MODES, WORKSPACE_TYPES } from './access';

const SessionContext = createContext(null);

const INITIAL_SESSION_STATE = {
  session: null,
  user: null,
  profile: null,
  workspace: null,
  subscription: null,
  profileMissing: false,
  isLoading: isSupabaseConfigured,
  error: null,
};

const VALID_USER_MODES = Object.values(USER_MODES);
const VALID_PLANS = Object.values(PLANS);
const VALID_WORKSPACE_TYPES = Object.values(WORKSPACE_TYPES);

function logAuthDevelopment(message) {
  if (import.meta.env.DEV) {
    console.info(`[Auth DEV] ${message}`);
  }
}

function getAccessFromSession(profile, workspace, subscription) {
  const currentWorkspace = VALID_WORKSPACE_TYPES.includes(
    workspace?.workspace_type,
  )
    ? workspace.workspace_type
    : WORKSPACE_TYPES.PERSONAL;
  const userMode = VALID_USER_MODES.includes(profile?.user_mode)
    ? profile.user_mode
    : currentWorkspace === WORKSPACE_TYPES.BUSINESS
      ? USER_MODES.BUSINESS
      : USER_MODES.PERSONAL;
  const fallbackPlan =
    currentWorkspace === WORKSPACE_TYPES.BUSINESS
      ? PLANS.BUSINESS
      : PLANS.FREE;
  const plan = VALID_PLANS.includes(subscription?.plan_id)
    ? subscription.plan_id
    : fallbackPlan;

  return {
    userMode,
    plan,
    currentWorkspace,
  };
}

function SessionProvider({ children }) {
  const { setAccess } = useAccess();
  const [state, setState] = useState(INITIAL_SESSION_STATE);
  const isMountedRef = useRef(false);
  const synchronizationIdRef = useRef(0);
  const authActionRef = useRef(false);

  const synchronizeSession = useCallback(
    async (nextSession) => {
      const synchronizationId = ++synchronizationIdRef.current;

      if (!nextSession?.user) {
        if (isMountedRef.current) {
          setState({
            ...INITIAL_SESSION_STATE,
            isLoading: false,
          });
        }

        logAuthDevelopment('Sessao ausente ou encerrada.');
        return {
          data: null,
          error: null,
          profileMissing: false,
        };
      }

      if (isMountedRef.current) {
        setState((currentState) => ({
          ...currentState,
          session: nextSession,
          user: nextSession.user,
          isLoading: true,
          error: null,
        }));
      }

      const profileResult = await getProfile(nextSession.user.id);

      if (
        synchronizationId !== synchronizationIdRef.current ||
        !isMountedRef.current
      ) {
        return {
          data: null,
          error: null,
          profileMissing: false,
          canceled: true,
        };
      }

      if (profileResult.error) {
        setState((currentState) => ({
          ...currentState,
          session: nextSession,
          user: nextSession.user,
          profile: null,
          workspace: null,
          subscription: null,
          profileMissing: false,
          isLoading: false,
          error: profileResult.error,
        }));
        logAuthDevelopment('Falha ao carregar o profile autenticado.');

        return {
          data: null,
          error: profileResult.error,
          profileMissing: false,
        };
      }

      if (!profileResult.data) {
        setState({
          session: nextSession,
          user: nextSession.user,
          profile: null,
          workspace: null,
          subscription: null,
          profileMissing: true,
          isLoading: false,
          error: null,
        });
        logAuthDevelopment('Profile ausente; onboarding necessario.');

        return {
          data: {
            session: nextSession,
            profile: null,
            workspace: null,
          },
          error: null,
          profileMissing: true,
        };
      }

      const workspaceResult = await getCurrentWorkspace(
        profileResult.data.current_workspace_id,
      );

      if (
        synchronizationId !== synchronizationIdRef.current ||
        !isMountedRef.current
      ) {
        return {
          data: null,
          error: null,
          profileMissing: false,
          canceled: true,
        };
      }

      if (workspaceResult.error) {
        setState((currentState) => ({
          ...currentState,
          profile: profileResult.data,
          workspace: null,
          subscription: null,
          profileMissing: false,
          isLoading: false,
          error: workspaceResult.error,
        }));
        logAuthDevelopment('Falha ao carregar o workspace atual.');

        return {
          data: null,
          error: workspaceResult.error,
          profileMissing: false,
        };
      }

      const subscriptionResult = await getWorkspaceSubscription(
        workspaceResult.data?.id,
      );

      if (
        synchronizationId !== synchronizationIdRef.current ||
        !isMountedRef.current
      ) {
        return {
          data: null,
          error: null,
          profileMissing: false,
          canceled: true,
        };
      }

      if (subscriptionResult.error) {
        setState((currentState) => ({
          ...currentState,
          profile: profileResult.data,
          workspace: workspaceResult.data,
          subscription: null,
          profileMissing: false,
          isLoading: false,
          error: subscriptionResult.error,
        }));
        logAuthDevelopment('Falha ao carregar a assinatura do workspace.');

        return {
          data: null,
          error: subscriptionResult.error,
          profileMissing: false,
        };
      }

      setAccess(
        getAccessFromSession(
          profileResult.data,
          workspaceResult.data,
          subscriptionResult.data,
        ),
      );
      setState({
        session: nextSession,
        user: nextSession.user,
        profile: profileResult.data,
        workspace: workspaceResult.data,
        subscription: subscriptionResult.data,
        profileMissing: false,
        isLoading: false,
        error: null,
      });
      logAuthDevelopment('Sessao, profile e workspace recuperados.');

      return {
        data: {
          session: nextSession,
          profile: profileResult.data,
          workspace: workspaceResult.data,
          subscription: subscriptionResult.data,
        },
        error: null,
        profileMissing: false,
      };
    },
    [setAccess],
  );

  const signInWithPassword = useCallback(
    async ({ email, password }) => {
      authActionRef.current = true;

      try {
        const signInResult = await signInWithPasswordService({
          email,
          password,
        });

        if (signInResult.error || !signInResult.data?.session) {
          return signInResult;
        }

        logAuthDevelopment('Login Supabase concluido.');
        return synchronizeSession(signInResult.data.session);
      } finally {
        authActionRef.current = false;
      }
    },
    [synchronizeSession],
  );

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) {
      return {
        data: null,
        error: null,
        isConfigured: false,
      };
    }

    authActionRef.current = true;

    try {
      const result = await signOutService();

      if (!result.error) {
        await synchronizeSession(null);
        logAuthDevelopment('SignOut concluido.');
      }

      return result;
    } finally {
      authActionRef.current = false;
    }
  }, [synchronizeSession]);

  useEffect(() => {
    let isActive = true;
    isMountedRef.current = true;

    if (!isSupabaseConfigured) {
      logAuthDevelopment('Supabase ausente; modo demo mantido.');

      return () => {
        isActive = false;
        isMountedRef.current = false;
      };
    }

    const pendingSynchronizations = new Set();
    const subscription = onAuthStateChange((_event, nextSession) => {
      if (!isActive || authActionRef.current) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        pendingSynchronizations.delete(timeoutId);

        if (isActive) {
          synchronizeSession(nextSession).catch((error) => {
            if (isActive && isMountedRef.current) {
              setState((currentState) => ({
                ...currentState,
                isLoading: false,
                error,
              }));
              logAuthDevelopment('Falha inesperada ao sincronizar Auth.');
            }
          });
        }
      }, 0);

      pendingSynchronizations.add(timeoutId);
    });

    getSession().then((sessionResult) => {
      if (!isActive || !isMountedRef.current) {
        return;
      }

      if (sessionResult.error) {
        setState((currentState) => ({
          ...currentState,
          isLoading: false,
          error: sessionResult.error,
        }));
        logAuthDevelopment('Falha ao recuperar a sessao persistida.');
        return;
      }

      synchronizeSession(sessionResult.data.session).catch((error) => {
        if (isActive && isMountedRef.current) {
          setState((currentState) => ({
            ...currentState,
            isLoading: false,
            error,
          }));
          logAuthDevelopment('Falha inesperada ao restaurar o contexto.');
        }
      });
    }).catch((error) => {
      if (isActive && isMountedRef.current) {
        setState((currentState) => ({
          ...currentState,
          isLoading: false,
          error,
        }));
        logAuthDevelopment('Falha inesperada ao recuperar a sessao.');
      }
    });

    return () => {
      isActive = false;
      isMountedRef.current = false;
      synchronizationIdRef.current += 1;
      pendingSynchronizations.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      subscription.unsubscribe();
    };
  }, [synchronizeSession]);

  const contextValue = useMemo(
    () => ({
      ...state,
      isSupabaseConfigured,
      isDemoMode: !isSupabaseConfigured,
      isAuthenticated: Boolean(state.session?.user),
      needsOnboarding:
        state.profileMissing ||
        Boolean(state.profile && !state.profile.onboarding_completed),
      signInWithPassword,
      signOut,
      refreshSession: () => synchronizeSession(state.session),
    }),
    [state, signInWithPassword, signOut, synchronizeSession],
  );

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  );
}

function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }

  return context;
}

export { SessionProvider, useSession };
