/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { DEFAULT_DEMO_ACCESS, WORKSPACE_TYPES, getAccessFromSession } from './access.js';
import { canAccessModule as canAccessModuleForContext, modulesForContext } from './moduleAccess.js';
import { useSession } from './SessionContext.jsx';

const AccessContext = createContext(null);

/**
 * FONTE DE VERDADE — `access` NÃO é mais estado próprio.
 *
 * Regras de arquitetura (Fase 1):
 *  1. Autenticado → `access` é DERIVADO (useMemo) do SessionContext:
 *     profile + workspace (via current_workspace_id) + subscription. O tipo PF/PJ é
 *     sempre `workspace.workspace_type`; nunca pode divergir da sessão real.
 *  2. Demo (sem Supabase) → parte de DEFAULT_DEMO_ACCESS (PF). Uma troca manual via
 *     `setAccess` fica CONTIDA a um override local do demo; jamais lê ou grava a
 *     preferência namespaced de um usuário real.
 *  3. `setAccess` é fachada de compatibilidade: no-op (com aviso em DEV) quando
 *     autenticado — o contexto real manda; ativo apenas no demo.
 *  4. `useAccess()` mantém o shape público de antes (`{ access, setAccess }`) e ganha
 *     capacidades derivadas semânticas — os ~20 consumidores existentes seguem lendo
 *     `access.currentWorkspace` / `access.userMode` / `access.plan` sem alteração.
 */
function AccessProvider({ children }) {
  const session = useSession();
  const { profile, workspace, subscription, availableWorkspaceTypes } = session;
  const isAuthenticated = Boolean(session.isAuthenticated && workspace);

  // Override APENAS do modo demo (contido; nunca toca storage de usuário real).
  const [demoOverride, setDemoOverride] = useState(null);

  const access = useMemo(() => {
    if (isAuthenticated) {
      return getAccessFromSession(profile, workspace, subscription);
    }
    return { ...DEFAULT_DEMO_ACCESS, ...(demoOverride ?? {}) };
  }, [isAuthenticated, profile, workspace, subscription, demoOverride]);

  const setAccess = useCallback(
    (updater) => {
      if (isAuthenticated) {
        if (import.meta.env.DEV) {
          console.warn(
            '[Access] setAccess ignorado: em sessao autenticada o access deriva do SessionContext (troque o workspace via switchWorkspace).',
          );
        }
        return;
      }
      setDemoOverride((previous) => {
        const base = { ...DEFAULT_DEMO_ACCESS, ...(previous ?? {}) };
        return typeof updater === 'function' ? updater(base) : updater;
      });
    },
    [isAuthenticated],
  );

  const value = useMemo(() => {
    const currentWorkspaceType = access.currentWorkspace;
    const availableTypes = availableWorkspaceTypes ?? [];
    return {
      // Compatibilidade: shape público inalterado.
      access,
      setAccess,
      // Capacidades derivadas semânticas (use estas no código novo, não comparações cruas).
      currentWorkspace: currentWorkspaceType,
      currentWorkspaceId: isAuthenticated ? workspace?.id ?? null : null,
      currentWorkspaceType,
      isPersonal: currentWorkspaceType === WORKSPACE_TYPES.PERSONAL,
      isBusiness: currentWorkspaceType === WORKSPACE_TYPES.BUSINESS,
      hasPersonalWorkspace: availableTypes.includes(WORKSPACE_TYPES.PERSONAL),
      hasBusinessWorkspace: availableTypes.includes(WORKSPACE_TYPES.BUSINESS),
      canAccessModule: (moduleId) => canAccessModuleForContext(moduleId, currentWorkspaceType),
      modulesForCurrentContext: modulesForContext(currentWorkspaceType),
    };
  }, [access, setAccess, isAuthenticated, workspace, availableWorkspaceTypes]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

function useAccess() {
  const context = useContext(AccessContext);

  if (!context) {
    throw new Error('useAccess must be used within AccessProvider');
  }

  return context;
}

export { AccessProvider, useAccess };
