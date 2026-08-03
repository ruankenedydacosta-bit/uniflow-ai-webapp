const CHANNELS = new Set(['text', 'voice']);
const ROLES = new Set(['owner', 'admin', 'member', 'viewer']);
const SESSION_STATES = new Set(['anonymous', 'authenticated', 'loading', 'error']);
const PERSONALITY_MODES = new Set(['balanced', 'direct', 'warm', 'strategic']);

export function normalizeContextLanguage(value) {
  if (typeof value !== 'string') return 'pt-BR';
  const match = value.trim().replace('_', '-').match(/^([a-z]{2,3})(?:-([a-z]{2}|\d{3}))?$/i);
  if (!match) return 'pt-BR';
  return match[2] ? `${match[1].toLowerCase()}-${match[2].toUpperCase()}` : match[1].toLowerCase();
}

export function normalizeContextTimezone(value) {
  if (typeof value !== 'string' || !value.trim()) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function normalizeContextChannel(value) {
  const channel = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return CHANNELS.has(channel) ? channel : 'text';
}

export function normalizeContextRole(value) {
  const role = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ROLES.has(role) ? role : null;
}

export function normalizeSessionState(value, authenticated = false) {
  const state = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (SESSION_STATES.has(state)) return state;
  return authenticated ? 'authenticated' : 'anonymous';
}

export function normalizePersonalityMode(value) {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return PERSONALITY_MODES.has(mode) ? mode : 'balanced';
}

export function normalizeFeatureFlags(value = {}) {
  return Object.freeze({
    uniOS: value?.uniOS === true,
    premiumVoice: value?.premiumVoice === true,
  });
}
