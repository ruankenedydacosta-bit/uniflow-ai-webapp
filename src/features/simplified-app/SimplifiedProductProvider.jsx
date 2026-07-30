import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Loader from '../../components/ui/Loader/Loader.jsx';
import { useSession } from '../../app/SessionContext.jsx';
import { SimplifiedProductContext } from './SimplifiedProductContext.js';
import {
  findPersonalWorkspace,
  resolveSimplifiedContextStatus,
  SIMPLIFIED_CONTEXT_STATUS,
  SIMPLIFIED_PRODUCT_CONFIG,
} from './simplifiedProductConfig.js';

function SimplifiedContextUnavailable({ status, error, onRetry }) {
  if (status === SIMPLIFIED_CONTEXT_STATUS.ACTIVATING) {
    return <Loader fullScreen label="Preparando seu espaço pessoal" />;
  }

  return (
    <main role={status === SIMPLIFIED_CONTEXT_STATUS.ERROR ? 'alert' : 'status'}>
      <h1>Espaço Pessoal indisponível</h1>
      <p>
        {status === SIMPLIFIED_CONTEXT_STATUS.ERROR
          ? 'Não foi possível abrir seu espaço pessoal agora. Nenhum dado de outro espaço foi carregado.'
          : 'Seu espaço pessoal ainda não está disponível. Nenhum outro espaço será usado como alternativa.'}
      </p>
      {status === SIMPLIFIED_CONTEXT_STATUS.ERROR ? (
        <button type="button" onClick={onRetry}>
          Tentar novamente
        </button>
      ) : null}
      {error?.message ? <span className="sr-only">{error.message}</span> : null}
    </main>
  );
}

export default function SimplifiedProductProvider({ children }) {
  const {
    availableWorkspaces,
    isSupabaseConfigured,
    isSwitchingWorkspace,
    switchWorkspace,
    workspace: currentWorkspace,
  } = useSession();
  const [activationError, setActivationError] = useState(null);
  const attemptedWorkspaceRef = useRef(null);
  const personalWorkspace = useMemo(
    () => findPersonalWorkspace(availableWorkspaces),
    [availableWorkspaces],
  );

  const activatePersonalWorkspace = useCallback(() => {
    if (!personalWorkspace?.id || isSwitchingWorkspace) return;
    attemptedWorkspaceRef.current = personalWorkspace.id;
    void switchWorkspace(SIMPLIFIED_PRODUCT_CONFIG.workspaceType).then((result) => {
      if (result?.error) setActivationError(result.error);
    });
  }, [isSwitchingWorkspace, personalWorkspace, switchWorkspace]);

  useEffect(() => {
    if (
      !isSupabaseConfigured
      || !personalWorkspace?.id
      || currentWorkspace?.id === personalWorkspace.id
      || attemptedWorkspaceRef.current === personalWorkspace.id
      || isSwitchingWorkspace
    ) {
      return;
    }
    activatePersonalWorkspace();
  }, [
    currentWorkspace?.id,
    activatePersonalWorkspace,
    isSupabaseConfigured,
    isSwitchingWorkspace,
    personalWorkspace?.id,
  ]);

  const status = resolveSimplifiedContextStatus({
    currentWorkspace,
    personalWorkspace,
    isSupabaseConfigured,
    activationError,
  });
  const value = useMemo(() => Object.freeze({
    ...SIMPLIFIED_PRODUCT_CONFIG,
    workspace: isSupabaseConfigured ? personalWorkspace : currentWorkspace,
    workspaceId: isSupabaseConfigured
      ? personalWorkspace?.id ?? null
      : currentWorkspace?.id ?? null,
    status,
  }), [currentWorkspace, isSupabaseConfigured, personalWorkspace, status]);

  if (status !== SIMPLIFIED_CONTEXT_STATUS.READY) {
    return (
      <SimplifiedContextUnavailable
        status={status}
        error={activationError}
        onRetry={() => {
          attemptedWorkspaceRef.current = null;
          setActivationError(null);
          activatePersonalWorkspace();
        }}
      />
    );
  }

  return (
    <SimplifiedProductContext.Provider value={value}>
      {children}
    </SimplifiedProductContext.Provider>
  );
}
