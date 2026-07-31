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
  requestPasswordReset as requestPasswordResetService,
  signInWithGoogle as signInWithGoogleService,
  signInWithPassword as signInWithPasswordService,
  signUpWithEmail as signUpWithEmailService,
  signOut as signOutService,
  updatePassword as updatePasswordService,
} from '../services/authService';
import { getProfile, updateProfile } from '../services/profileService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import {
  createWorkspace,
  deleteOwnedWorkspace,
  getCurrentWorkspace,
  getWorkspaceSubscription,
  listWorkspaces,
} from '../services/workspaceService';
import { WORKSPACE_TYPES } from './access';
import { buildOAuthCallbackUrl, resolveAppUrl } from './oauthRedirect.js';
import { isSilentAuthEvent } from './sessionSyncUtils.js';
import {
  isValidConversationStyle,
  resolveConversationStyle,
} from '../features/uni-llm/conversationStyle.js';
import {
  findWorkspaceByType,
  getAvailableWorkspaceTypes,
  getWorkspaceContextLabel,
  getWorkspaceProfileName,
  readWorkspaceSelectionForUser,
  writeWorkspaceSelectionForUser,
} from './workspaceSelection.js';
import { resetAutoSpokenMessages } from '../features/uni-voice-tts/spokenMessageSession.js';
import { resetNarratedTexts } from '../features/uni-voice-tts/narratedTextSession.js';

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

const VALID_WORKSPACE_TYPES = Object.values(WORKSPACE_TYPES);

function logAuthDevelopment(message) {
  if (import.meta.env.DEV) {
    console.info(`[Auth DEV] ${message}`);
  }
}

// NOTA DE ARQUITETURA (Fase 1): a derivação sessão → `access` vive agora em
// `access.js` (getAccessFromSession), consumida pelo AccessContext via useMemo.
// O SessionContext deixou de empurrar estado para o AccessContext (não há mais
// setAccess): existe uma única fonte de verdade, sem representação paralela.

function SessionProvider({ children }) {
  const [state, setState] = useState(INITIAL_SESSION_STATE);
  const [availableWorkspaces, setAvailableWorkspaces] = useState([]);
  // Preferência local carregada por usuário (namespaced) somente após conhecer o user id.
  const [selectedWorkspaceType, setSelectedWorkspaceType] = useState(null);
  const [workspaceSwitchState, setWorkspaceSwitchState] = useState({
    error: null,
    isLoading: false,
  });
  const isMountedRef = useRef(false);
  const synchronizationIdRef = useRef(0);
  const authActionRef = useRef(false);
  // AUTH3: trava sincrona contra chamadas concorrentes de switchWorkspace
  // (duplo clique no seletor antes da primeira troca terminar) -- mesmo
  // padrao de mutationRef ja usado em useClients.js/useAgenda.js/
  // useTransactions.js e no handleSignOut de AuthenticatedLayout.jsx.
  const switchWorkspaceRef = useRef(false);
  // Guarda o user id da sessao atualmente resolvida para distinguir um
  // evento de auth genuinamente novo (login real, troca de usuario) de um
  // evento redundante que o Supabase pode reemitir para a MESMA sessao
  // (ex.: SIGNED_IN ao revalidar o token em foco de aba). So esses eventos
  // redundantes usam o caminho silencioso de synchronizeSession -- nunca
  // um login real. Resetado para null no logout (ver bloco !nextSession?.user).
  const latestUserIdRef = useRef(null);

  const synchronizeSession = useCallback(
    async (nextSession, { silent = false } = {}) => {
      // Atualizacao silenciosa: o Supabase reemitiu um evento (SIGNED_IN
      // redundante, TOKEN_REFRESHED, USER_UPDATED) para a sessao do MESMO
      // usuario ja autenticado. Profile/workspace/subscription nao mudam
      // nesses casos -- so o token/sessao. Nunca ativa isLoading (que
      // desmontaria toda a arvore autenticada em App.jsx), preservando
      // qualquer estado local (modais abertos, formularios) intacto.
      // Deliberadamente NAO consome um novo synchronizationId: fazer isso
      // invalidaria, via o guard de synchronizationId abaixo, um bootstrap
      // completo que esteja em andamento neste exato momento (a causa raiz
      // do bug AUTH2 -- um evento redundante chegando no meio do bootstrap
      // inicial cancelava-o antes de isLoading virar false).
      if (silent && nextSession?.user) {
        latestUserIdRef.current = nextSession.user.id;
        if (isMountedRef.current) {
          setState((currentState) => ({
            ...currentState,
            session: nextSession,
            user: nextSession.user,
          }));
        }
        logAuthDevelopment('Sessao atualizada silenciosamente (evento de auth redundante).');

        return {
          data: { session: nextSession },
          error: null,
          profileMissing: false,
        };
      }

      const synchronizationId = ++synchronizationIdRef.current;

      if (!nextSession?.user) {
        latestUserIdRef.current = null;
        // Logout/sessão encerrada: limpa o registro de mensagens da Uni já
        // narradas por voz (spokenMessageSession.js) e o registro de TEXTOS
        // já narrados (narratedTextSession.js) -- a deduplicação do
        // autoplay nunca vaza entre sessões/usuários.
        resetAutoSpokenMessages();
        resetNarratedTexts();
        setAvailableWorkspaces([]);
        setWorkspaceSwitchState({ error: null, isLoading: false });
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

      latestUserIdRef.current = nextSession.user.id;

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
        setAvailableWorkspaces([]);
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
        logAuthDevelopment('Profile ausente; criacao de workspace pendente.');

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
        setAvailableWorkspaces([]);
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

      const [subscriptionResult, workspacesResult] = await Promise.all([
        getWorkspaceSubscription(workspaceResult.data?.id),
        listWorkspaces(),
      ]);

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

      const resolvedWorkspaces = workspacesResult.error
        ? [workspaceResult.data].filter(Boolean)
        : workspacesResult.data ?? [];
      setAvailableWorkspaces(resolvedWorkspaces);
      // Preferência de contexto: chave namespaced do usuário (com migração da chave
      // antiga), validada contra os workspaces reais do usuário. localStorage é só
      // fallback de preferência — a autoridade é o workspace da sessão.
      const allowedTypes = getAvailableWorkspaceTypes(resolvedWorkspaces);
      const storedPreference = readWorkspaceSelectionForUser(nextSession.user.id, {
        allowedTypes,
      });
      setSelectedWorkspaceType(
        storedPreference
          ?? workspaceResult.data?.workspace_type
          ?? WORKSPACE_TYPES.PERSONAL,
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
    [],
  );

  // AUTH3 -- fonte de verdade do contexto ATIVO exibido em toda a UI
  // (Sidebar, AccountMenu, MobileHeader, menu Mais, autorização) é SEMPRE o
  // workspace CONFIRMADO pelo backend (`state.workspace.workspace_type`,
  // exposto via AccessContext), nunca `selectedWorkspaceType`. Esta função
  // ainda atualiza `selectedWorkspaceType` otimisticamente, mas isso serve
  // apenas para: (a) o texto do indicador transitório "Alterando para
  // Espaço X…" enquanto a troca está em andamento, e (b) o fluxo de "perfil
  // ainda não criado" (que precisa saber o que o usuário pediu mesmo quando
  // esse workspace não existe). Qualquer falha real de rede/persistência
  // reverte `selectedWorkspaceType` para o valor confirmado anterior --
  // nunca deixa a seleção presa num destino que não foi de fato confirmado
  // (causa raiz da divergência observada na revalidação UX6.1: uma troca
  // que falhava no meio deixava o menu mostrando o destino pretendido
  // enquanto a Sidebar, que já derivava do confirmado, continuava no
  // contexto real).
  const switchWorkspace = useCallback(async (workspaceType) => {
    if (!VALID_WORKSPACE_TYPES.includes(workspaceType)) {
      const error = { code: 'WORKSPACE_TYPE_INVALID', message: 'Contexto financeiro inválido.' };
      setWorkspaceSwitchState({ error, isLoading: false });
      return { data: null, error };
    }

    if (switchWorkspaceRef.current) {
      const error = { code: 'SWITCH_IN_PROGRESS', message: 'Já existe uma troca de espaço em andamento.' };
      return { data: null, error };
    }

    if (!state.user?.id || !state.session) {
      const error = { code: 'SESSION_REQUIRED', message: 'Entre novamente para trocar de perfil.' };
      setWorkspaceSwitchState({ error, isLoading: false });
      return { data: null, error };
    }

    switchWorkspaceRef.current = true;
    const previousWorkspaceType = state.workspace?.workspace_type ?? null;
    const previousWorkspaceLabel = getWorkspaceContextLabel(previousWorkspaceType);
    const networkErrorMessage = `Não foi possível alterar o espaço. Você continua no ${previousWorkspaceLabel}.`;

    // Reflexo otimista de UI (ver nota acima) -- a persistência namespaced só
    // acontece depois da confirmação real (mais abaixo), nunca aqui, para
    // que um refresh após uma falha de rede nunca tente restaurar um
    // destino que nunca chegou a ser confirmado pelo backend.
    setSelectedWorkspaceType(workspaceType);
    setWorkspaceSwitchState({ error: null, isLoading: true });

    const workspacesResult = availableWorkspaces.length
      ? { data: availableWorkspaces, error: null }
      : await listWorkspaces();

    if (workspacesResult.error) {
      const error = { ...workspacesResult.error, message: networkErrorMessage };
      setSelectedWorkspaceType(previousWorkspaceType);
      setWorkspaceSwitchState({ error, isLoading: false });
      switchWorkspaceRef.current = false;
      return { data: null, error };
    }

    const targetWorkspace = findWorkspaceByType(workspacesResult.data, workspaceType);

    if (!targetWorkspace) {
      const error = {
        code: 'WORKSPACE_NOT_FOUND',
        message: workspaceType === WORKSPACE_TYPES.BUSINESS
          ? 'Perfil PJ ainda não criado. Crie seu espaço empresarial em Configurações.'
          : 'Perfil PF ainda não criado.',
      };
      // Sem rollback aqui: fluxo legítimo de "perfil ainda não criado" --
      // AuthenticatedLayout precisa saber qual workspace foi pedido para
      // oferecer a ação de criá-lo.
      setWorkspaceSwitchState({ error, isLoading: false });
      switchWorkspaceRef.current = false;
      return { data: null, error };
    }

    if (targetWorkspace.id === state.workspace?.id) {
      setWorkspaceSwitchState({ error: null, isLoading: false });
      switchWorkspaceRef.current = false;
      return { data: targetWorkspace, error: null };
    }

    const updateResult = await updateProfile(state.user.id, {
      current_workspace_id: targetWorkspace.id,
    });

    if (updateResult.error) {
      const error = { ...updateResult.error, message: networkErrorMessage };
      setSelectedWorkspaceType(previousWorkspaceType);
      setWorkspaceSwitchState({ error, isLoading: false });
      switchWorkspaceRef.current = false;
      return { data: null, error };
    }

    const synchronizationResult = await synchronizeSession(state.session);

    if (synchronizationResult.error) {
      const error = { ...synchronizationResult.error, message: networkErrorMessage };
      setSelectedWorkspaceType(previousWorkspaceType);
      setWorkspaceSwitchState({ error, isLoading: false });
      switchWorkspaceRef.current = false;
      return { data: null, error };
    }

    // Só persiste a preferência local quando a troca é confirmada de
    // verdade pelo backend.
    writeWorkspaceSelectionForUser(state.user.id, workspaceType);
    setWorkspaceSwitchState({ error: null, isLoading: false });
    switchWorkspaceRef.current = false;
    return { data: targetWorkspace, error: null };
  }, [availableWorkspaces, state.session, state.user, state.workspace, synchronizeSession]);

  const createWorkspaceProfile = useCallback(async (workspaceType) => {
    if (!VALID_WORKSPACE_TYPES.includes(workspaceType)) {
      const error = { code: 'WORKSPACE_TYPE_INVALID', message: 'Contexto financeiro inválido.' };
      setWorkspaceSwitchState({ error, isLoading: false });
      return { data: null, error };
    }

    setSelectedWorkspaceType(workspaceType);

    if (!state.user?.id || !state.session) {
      const error = { code: 'SESSION_REQUIRED', message: 'Entre novamente para criar o perfil.' };
      setWorkspaceSwitchState({ error, isLoading: false });
      return { data: null, error };
    }

    writeWorkspaceSelectionForUser(state.user.id, workspaceType);

    setWorkspaceSwitchState({ error: null, isLoading: true });
    const workspacesResult = await listWorkspaces();

    if (workspacesResult.error) {
      setWorkspaceSwitchState({ error: workspacesResult.error, isLoading: false });
      return { data: null, error: workspacesResult.error };
    }

    let targetWorkspace = findWorkspaceByType(workspacesResult.data, workspaceType);
    let createdWorkspace = false;

    if (!targetWorkspace) {
      const creationResult = await createWorkspace({
        name: getWorkspaceProfileName(workspaceType),
        workspaceType,
      });

      if (creationResult.error || !creationResult.data) {
        const error = creationResult.error ?? {
          code: 'WORKSPACE_NOT_CREATED',
          message: 'Não foi possível criar este perfil agora.',
        };
        setWorkspaceSwitchState({ error, isLoading: false });
        return { data: null, error };
      }

      targetWorkspace = creationResult.data;
      createdWorkspace = true;
    }

    const updateResult = await updateProfile(state.user.id, {
      current_workspace_id: targetWorkspace.id,
    });

    if (updateResult.error) {
      if (createdWorkspace) {
        await deleteOwnedWorkspace(targetWorkspace.id);
      }
      setWorkspaceSwitchState({ error: updateResult.error, isLoading: false });
      return updateResult;
    }

    const synchronizationResult = await synchronizeSession(state.session);
    setWorkspaceSwitchState({
      error: synchronizationResult.error,
      isLoading: false,
    });

    return synchronizationResult.error
      ? synchronizationResult
      : { data: targetWorkspace, error: null };
  }, [state.session, state.user, synchronizeSession]);

  const updateConversationStyle = useCallback(async (nextStyle) => {
    if (!isValidConversationStyle(nextStyle)) {
      return {
        data: null,
        error: {
          code: 'CONVERSATION_STYLE_INVALID',
          message: 'Estilo de conversa inválido.',
        },
      };
    }

    if (!state.user?.id || !state.profile) {
      return {
        data: null,
        error: {
          code: 'PROFILE_REQUIRED',
          message: 'Perfil autenticado indisponível.',
        },
      };
    }

    const result = await updateProfile(state.user.id, {
      conversation_style: nextStyle,
    });

    if (result.error || !result.data) {
      return result;
    }

    const conversationStyle = resolveConversationStyle(
      result.data.conversation_style,
    );

    setState((currentState) => ({
      ...currentState,
      profile: {
        ...currentState.profile,
        ...result.data,
        conversation_style: conversationStyle,
      },
    }));

    return {
      ...result,
      data: {
        ...result.data,
        conversation_style: conversationStyle,
      },
    };
  }, [state.profile, state.user]);

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

  const signUpWithEmail = useCallback(
    async ({ email, password, fullName }) => {
      authActionRef.current = true;

      try {
        const signUpResult = await signUpWithEmailService({
          email,
          password,
          fullName,
        });

        if (signUpResult.error || !signUpResult.data?.session) {
          return signUpResult;
        }

        logAuthDevelopment('Cadastro Supabase concluido.');
        return synchronizeSession(signUpResult.data.session);
      } finally {
        authActionRef.current = false;
      }
    },
    [synchronizeSession],
  );

  // AUTH4: login/cadastro com Google. Diferente de signIn/signUp por senha,
  // esta função NUNCA chama synchronizeSession nem toca authActionRef --
  // por padrão o SDK redireciona o navegador inteiro para o Google
  // (signInWithOAuth sem skipBrowserRedirect), então não há sessão para
  // sincronizar AQUI; ela só existe depois que o usuário retorna para
  // `redirectTo` (rota /auth/callback), momento em que uma sessão nova
  // (evento SIGNED_IN real) passa pelo MESMO fluxo de bootstrap já usado
  // por login/cadastro por senha e por refresh de página -- nenhuma lógica
  // de sessão paralela. Não marca o usuário como autenticado antes do
  // redirect: nenhum setState aqui além do já feito dentro do próprio
  // service em caso de erro síncrono.
  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      return { data: null, error: null, isConfigured: false };
    }

    const redirectTo = buildOAuthCallbackUrl(resolveAppUrl());
    return signInWithGoogleService(redirectTo);
  }, []);

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

  // AUTH1: solicitacao de recuperacao de senha. Nao altera a sessao atual
  // (so pede ao Supabase para enviar o e-mail), entao nao precisa de
  // synchronizeSession nem de authActionRef -- mesmo raciocinio de nao
  // envolver o guard de sessao para uma operacao que nao autentica ninguem.
  const requestPasswordReset = useCallback(async (email) => {
    if (!isSupabaseConfigured) {
      return { data: null, error: null, isConfigured: false };
    }

    const redirectTo = `${window.location.origin}/redefinir-senha`;
    return requestPasswordResetService(email, redirectTo);
  }, []);

  // AUTH1: atualizacao de senha usando a sessao atual (inclusive a sessao
  // temporaria de recuperacao criada pelo link de e-mail). Nao chama
  // synchronizeSession aqui -- o chamador decide o que fazer com a sessao
  // apos o sucesso (ResetPasswordPage encerra a sessao explicitamente e
  // navega para o login).
  const updatePassword = useCallback(async (newPassword) => {
    if (!isSupabaseConfigured) {
      return { data: null, error: null, isConfigured: false };
    }

    return updatePasswordService(newPassword);
  }, []);

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

      // Ver isSilentAuthEvent (sessionSyncUtils.js) para a decisao completa:
      // TOKEN_REFRESHED/USER_UPDATED nunca representam uma nova sessao, e
      // SIGNED_IN pode ser reemitido pelo Supabase para a sessao ja ativa
      // (ex.: ao revalidar o token quando a aba volta a ficar visivel), sem
      // significar um novo login. Esses casos usam o caminho silencioso de
      // synchronizeSession, que nunca ativa o loading global (isso
      // desmontaria toda a arvore autenticada em App.jsx a cada poucos
      // segundos, interrompendo qualquer modal/formulario aberto). Um
      // SIGNED_IN para um usuario diferente (ou sem sessao previa conhecida)
      // continua disparando o bootstrap completo normalmente.
      const isSilentEvent = isSilentAuthEvent(_event, nextSession, latestUserIdRef.current);

      const timeoutId = window.setTimeout(() => {
        pendingSynchronizations.delete(timeoutId);

        if (isActive) {
          synchronizeSession(nextSession, { silent: isSilentEvent }).catch((error) => {
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
      signInWithPassword,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshSession: () => synchronizeSession(state.session),
      availableWorkspaces,
      availableWorkspaceTypes: getAvailableWorkspaceTypes(availableWorkspaces),
      selectedWorkspaceType,
      createWorkspaceProfile,
      updateConversationStyle,
      isSwitchingWorkspace: workspaceSwitchState.isLoading,
      switchWorkspace,
      workspaceSwitchError: workspaceSwitchState.error,
    }),
    [availableWorkspaces, createWorkspaceProfile, requestPasswordReset, selectedWorkspaceType, signInWithGoogle, signInWithPassword, signOut, signUpWithEmail, state, switchWorkspace, synchronizeSession, updateConversationStyle, updatePassword, workspaceSwitchState],
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
