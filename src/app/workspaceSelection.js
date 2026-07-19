import { WORKSPACE_TYPES } from './access.js';

export const WORKSPACE_SELECTION_STORAGE_KEY = 'uniflow.financial-workspace-type';

const VALID_WORKSPACE_TYPES = Object.freeze(Object.values(WORKSPACE_TYPES));

export function readWorkspaceSelection(storage = globalThis.localStorage) {
  try {
    const storedValue = storage?.getItem(WORKSPACE_SELECTION_STORAGE_KEY);
    return VALID_WORKSPACE_TYPES.includes(storedValue) ? storedValue : null;
  } catch {
    return null;
  }
}

export function writeWorkspaceSelection(workspaceType, storage = globalThis.localStorage) {
  if (!VALID_WORKSPACE_TYPES.includes(workspaceType)) return false;

  try {
    storage?.setItem(WORKSPACE_SELECTION_STORAGE_KEY, workspaceType);
    return true;
  } catch {
    return false;
  }
}

export function getWorkspaceTypeFromContext(context) {
  return context === 'PJ' ? WORKSPACE_TYPES.BUSINESS : WORKSPACE_TYPES.PERSONAL;
}

export function findWorkspaceByType(workspaces, workspaceType) {
  if (!Array.isArray(workspaces)) return null;
  return workspaces.find((workspace) => workspace.workspace_type === workspaceType) ?? null;
}

export function getAvailableWorkspaceTypes(workspaces) {
  if (!Array.isArray(workspaces)) return [];
  return [...new Set(workspaces.map((workspace) => workspace.workspace_type))];
}

export function getWorkspaceProfileName(workspaceType) {
  return workspaceType === WORKSPACE_TYPES.BUSINESS ? 'Perfil PJ' : 'Perfil PF';
}
