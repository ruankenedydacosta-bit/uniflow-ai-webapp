const STORAGE_KEY = 'uniflow.uni-chat.history.v1';
const ACTIVE_KEY = 'uniflow.uni-chat.active';

let convIdCounter = Date.now();

export function nextConvId() {
  convIdCounter += 1;
  return `conv-${convIdCounter}`;
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

export function createConversation(mode) {
  const now = new Date().toISOString();
  return {
    id: nextConvId(),
    title: '',
    mode,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function deriveTitle(messages) {
  const first = messages.find((m) => m.from === 'user');
  if (!first) return '';
  const t = first.text;
  return t.length > 55 ? t.slice(0, 55) + '…' : t;
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
