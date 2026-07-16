import {
  AUDIO_SELECTION_STORAGE_PREFIX,
  AUDIO_SELECTION_STORAGE_VERSION,
} from './audioContextCatalog.js';
import { appendAudioHistory, sanitizeAudioHistory } from './audioHistory.js';

const memoryFallback = new Map();
const identityKey = (userId) => `${AUDIO_SELECTION_STORAGE_PREFIX}:${userId || 'anonymous'}`;

function getBrowserStorage() {
  if (typeof window === 'undefined') return undefined;
  try { return window.localStorage; } catch { return undefined; }
}

function parse(raw) {
  try {
    const value = JSON.parse(raw);
    if (value?.version !== AUDIO_SELECTION_STORAGE_VERSION) return [];
    return sanitizeAudioHistory(value.history);
  } catch {
    return [];
  }
}

export function createAudioSelectionStorage(storage = getBrowserStorage()) {
  const read = (userId) => {
    const key = identityKey(userId);
    try {
      const raw = storage?.getItem(key);
      if (raw) return parse(raw);
    } catch {
      // The in-memory fallback keeps selection functional in restricted browsers.
    }
    return sanitizeAudioHistory(memoryFallback.get(key));
  };

  const write = (userId, history) => {
    const key = identityKey(userId);
    const sanitized = sanitizeAudioHistory(history);
    memoryFallback.set(key, sanitized);
    try {
      storage?.setItem(key, JSON.stringify({
        version: AUDIO_SELECTION_STORAGE_VERSION,
        history: sanitized,
      }));
    } catch {
      // Persistence is optional; audio must never break the interface.
    }
    return sanitized;
  };

  return Object.freeze({
    read,
    record(userId, event) {
      return write(userId, appendAudioHistory(read(userId), event));
    },
    clear(userId) {
      const key = identityKey(userId);
      memoryFallback.delete(key);
      try { storage?.removeItem(key); } catch { /* noop */ }
    },
  });
}
