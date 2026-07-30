const attemptedWelcomeKeys = new Set();

export function buildWelcomeSessionKey(user, session) {
  const userId = typeof user?.id === 'string' ? user.id : '';
  if (!userId) return null;
  const sessionMarker = session?.expires_at ?? session?.user?.last_sign_in_at ?? 'current';
  return `${userId}:${sessionMarker}`;
}

export function claimWelcomeVoice(key) {
  if (!key || attemptedWelcomeKeys.has(key)) return false;
  attemptedWelcomeKeys.add(key);
  return true;
}

export function releaseWelcomeVoice(key) {
  if (key) attemptedWelcomeKeys.delete(key);
}

export function resetWelcomeVoiceSessions() {
  attemptedWelcomeKeys.clear();
}

