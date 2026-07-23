import { WORKSPACE_TYPES } from './access.js';

// Chave ANTIGA (sem namespacing por usuário) — mantida só para migração/limpeza.
export const WORKSPACE_SELECTION_STORAGE_KEY = 'uniflow.financial-workspace-type';

// Prefixo da chave NOVA, isolada por usuário: `uniflow:active-workspace:<user_id>`.
// Nunca usa e-mail; nunca persiste token ou dado sensível — apenas o tipo do workspace.
export const WORKSPACE_SELECTION_KEY_PREFIX = 'uniflow:active-workspace:';

const VALID_WORKSPACE_TYPES = Object.freeze(Object.values(WORKSPACE_TYPES));

export function buildWorkspaceSelectionKey(userId) {
  return userId ? `${WORKSPACE_SELECTION_KEY_PREFIX}${userId}` : null;
}

// ── API legada (chave global, sem namespacing) ──────────────────────────────
// Preservada para compatibilidade e para a migração. Não é mais a autoridade.
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

// ── API namespaced por usuário (autoridade de PREFERÊNCIA local) ─────────────

/**
 * Lê a preferência de contexto do usuário atual.
 *
 * Ordem: (1) chave namespaced do usuário; (2) se ausente, tenta MIGRAR o valor
 * da chave antiga global (só se for um tipo válido), gravando na chave namespaced
 * e removendo a antiga. Se `allowedTypes` for informado, um valor que não pertença
 * aos workspaces do usuário é ignorado com segurança (retorna null) — impede herança
 * indevida entre usuários e valores obsoletos.
 */
export function readWorkspaceSelectionForUser(
  userId,
  { allowedTypes, storage = globalThis.localStorage } = {},
) {
  const key = buildWorkspaceSelectionKey(userId);
  if (!key) return null;

  const validate = (value) => {
    if (!VALID_WORKSPACE_TYPES.includes(value)) return null;
    if (Array.isArray(allowedTypes) && !allowedTypes.includes(value)) return null;
    return value;
  };

  try {
    const namespaced = validate(storage?.getItem(key));
    if (namespaced) return namespaced;

    // Migração da chave antiga → namespaced (uma vez).
    const legacyRaw = storage?.getItem(WORKSPACE_SELECTION_STORAGE_KEY);
    if (VALID_WORKSPACE_TYPES.includes(legacyRaw)) {
      const migrated = validate(legacyRaw);
      if (migrated) storage?.setItem(key, migrated);
      // A chave antiga é sempre removida ao ser detectada, para não vazar entre usuários.
      storage?.removeItem?.(WORKSPACE_SELECTION_STORAGE_KEY);
      return migrated;
    }

    return null;
  } catch {
    return null;
  }
}

export function writeWorkspaceSelectionForUser(
  userId,
  workspaceType,
  storage = globalThis.localStorage,
) {
  const key = buildWorkspaceSelectionKey(userId);
  if (!key || !VALID_WORKSPACE_TYPES.includes(workspaceType)) return false;

  try {
    storage?.setItem(key, workspaceType);
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

/**
 * Resolve o workspace ATIVO de forma segura e previsível.
 *
 * Regra exata:
 *  1. Se `currentWorkspaceId` corresponde a um workspace da lista → usa esse.
 *  2. Senão (id inválido, ausente ou de outro usuário) → fallback para o primeiro
 *     workspace válido da lista, PREFERINDO o do tipo `preferType` (default: personal).
 *  3. Lista vazia → null.
 *
 * Observação: o backend (`workspaceService.getCurrentWorkspace`) já devolve o
 * workspace mais antigo quando o id é inválido; este helper documenta e reforça a
 * mesma intenção no cliente, agora priorizando o contexto pessoal.
 */
export function resolveActiveWorkspace(
  currentWorkspaceId,
  workspaces,
  preferType = WORKSPACE_TYPES.PERSONAL,
) {
  if (!Array.isArray(workspaces) || workspaces.length === 0) return null;

  const direct = workspaces.find((workspace) => workspace.id === currentWorkspaceId);
  if (direct) return direct;

  return (
    workspaces.find((workspace) => workspace.workspace_type === preferType) ??
    workspaces[0]
  );
}

export function getAvailableWorkspaceTypes(workspaces) {
  if (!Array.isArray(workspaces)) return [];
  return [...new Set(workspaces.map((workspace) => workspace.workspace_type))];
}

export function getWorkspaceProfileName(workspaceType) {
  return workspaceType === WORKSPACE_TYPES.BUSINESS ? 'Perfil PJ' : 'Perfil PF';
}
