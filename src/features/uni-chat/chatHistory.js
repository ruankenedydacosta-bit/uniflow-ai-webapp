const STORAGE_KEY = 'uniflow.uni-chat.history.v1';
const ACTIVE_KEY = 'uniflow.uni-chat.active';
const ACTIVE_CONV_SOURCE_KEY = 'uniflow.uni-chat.active-source';
const MIGRATION_MARKER_KEY = 'uniflow.uni-chat.migration.v1';

let convIdCounter = Date.now();

export function nextConvId() {
  convIdCounter += 1;
  return `local-${convIdCounter}`;
}

function getStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadHistory() {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory(conversations) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    /* localStorage not available */
  }
}

export function loadActiveId() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(ACTIVE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveActiveId(id) {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (id) {
      storage.setItem(ACTIVE_KEY, id);
    } else {
      storage.removeItem(ACTIVE_KEY);
    }
  } catch {
    /* localStorage not available */
  }
}

export function saveActiveSource(source) {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (source) {
      storage.setItem(ACTIVE_CONV_SOURCE_KEY, source);
    } else {
      storage.removeItem(ACTIVE_CONV_SOURCE_KEY);
    }
  } catch {
    /* noop */
  }
}

export function loadActiveSource() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(ACTIVE_CONV_SOURCE_KEY) || null;
  } catch {
    return null;
  }
}

export function createConversation(mode) {
  const now = new Date().toISOString();
  return {
    id: nextConvId(),
    title: '',
    mode,
    source: 'local',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveInitialConversationState({
  conversations = [],
  activeId = null,
  defaultMode = 'pessoal',
  lockedMode = null,
} = {}) {
  const list = Array.isArray(conversations) ? conversations : [];
  const active = list.find((conversation) => conversation.id === activeId) ?? null;
  const mode = lockedMode ?? active?.mode ?? defaultMode;
  const selected = active?.mode === mode
    ? active
    : list.find((conversation) => conversation.mode === mode) ?? null;

  if (selected) {
    return {
      activeId: selected.id,
      conversations: list,
      created: false,
      messages: selected.messages ?? [],
      mode,
    };
  }

  const conversation = createConversation(mode);
  return {
    activeId: conversation.id,
    conversations: [...list, conversation],
    created: true,
    messages: [],
    mode,
  };
}

export function deriveTitle(messages) {
  const first = messages.find((m) => m.from === 'user' && typeof m.text === 'string' && m.text.trim());
  if (!first) return '';
  const t = first.text;
  return t.length > 55 ? t.slice(0, 55) + '\u2026' : t;
}

// Reconcile com o banco: o título do banco manda quando existe, mas nunca
// troca um título não vazio por vazio (conversas antigas foram gravadas com
// title ''). Sem nenhum dos dois, deriva da 1ª mensagem do usuário.
export function resolveConversationTitle({ dbTitle = '', localTitle = '', messages = [] } = {}) {
  return dbTitle || localTitle || deriveTitle(messages);
}

// Título que ainda precisa ser gravado no banco, ou null. `synced` é o mapa
// id -> último título confirmado no banco (ou já enviado).
export function titleToSync(conversation, synced = {}) {
  if (!conversation || conversation.source !== 'supabase') return null;
  const title = conversation.title;
  if (!title || synced[conversation.id] === title) return null;
  return title;
}

export function persistConversation(conversations, id, messages, mode) {
  return conversations.map((c) => {
    if (c.id !== id) return c;
    return {
      ...c,
      title: deriveTitle(messages) || c.title,
      messages,
      mode,
      updatedAt: new Date().toISOString(),
    };
  });
}

export function findConversationById(conversations, id) {
  return conversations.find((c) => c.id === id) || null;
}

export function isMigrationComplete() {
  const storage = getStorage();
  if (!storage) return true;
  try {
    return storage.getItem(MIGRATION_MARKER_KEY) === 'done';
  } catch {
    return true;
  }
}

export function markMigrationComplete() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(MIGRATION_MARKER_KEY, 'done');
  } catch {
    /* noop */
  }
}
