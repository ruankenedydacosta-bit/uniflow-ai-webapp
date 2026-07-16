import { getLastEvent } from './audioHistory.js';

export function isAudioInCooldown(clip, history, now, policy = {}) {
  const cooldownMs = Math.max(clip.cooldownMs ?? 0, policy.cooldownMs ?? 0);
  if (cooldownMs <= 0) return false;
  const last = getLastEvent(history, (event) => event.context === clip.context);
  return Boolean(last && now - last.playedAt < cooldownMs);
}
