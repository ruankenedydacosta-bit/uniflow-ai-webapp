export const SIMPLIFIED_PRODUCT_MODE = 'personal';
export const SIMPLIFIED_CHAT_MODE = 'pessoal';

export const SIMPLIFIED_PRODUCT_CONFIG = Object.freeze({
  id: 'personal',
  workspaceType: SIMPLIFIED_PRODUCT_MODE,
  chatMode: SIMPLIFIED_CHAT_MODE,
});

export const SIMPLIFIED_CONTEXT_STATUS = Object.freeze({
  READY: 'ready',
  ACTIVATING: 'activating',
  MISSING: 'missing',
  ERROR: 'error',
});

export function findPersonalWorkspace(workspaces = []) {
  if (!Array.isArray(workspaces)) return null;
  return workspaces.find(
    (workspace) => workspace?.workspace_type === SIMPLIFIED_PRODUCT_MODE,
  ) ?? null;
}

export function resolveSimplifiedContextStatus({
  currentWorkspace,
  personalWorkspace,
  isSupabaseConfigured,
  activationError,
} = {}) {
  if (!isSupabaseConfigured) return SIMPLIFIED_CONTEXT_STATUS.READY;
  if (!personalWorkspace) return SIMPLIFIED_CONTEXT_STATUS.MISSING;
  if (currentWorkspace?.id === personalWorkspace.id) return SIMPLIFIED_CONTEXT_STATUS.READY;
  return activationError
    ? SIMPLIFIED_CONTEXT_STATUS.ERROR
    : SIMPLIFIED_CONTEXT_STATUS.ACTIVATING;
}
