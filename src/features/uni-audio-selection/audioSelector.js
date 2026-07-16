import { VOICE_PREFERENCES_DEFAULTS } from './audioContextCatalog.js';
import { getLastEvent, sanitizeAudioHistory } from './audioHistory.js';
import { isAudioEligible } from './audioEligibility.js';

export const SILENT_AUDIO_SELECTION = Object.freeze({ status: 'silent', clip: null, reason: 'NO_ELIGIBLE_AUDIO' });

function selectWeighted(clips, random) {
  const total = clips.reduce((sum, clip) => sum + Math.max(1, clip.weight ?? 1), 0);
  let cursor = Math.min(0.999999, Math.max(0, random())) * total;
  for (const clip of clips) {
    cursor -= Math.max(1, clip.weight ?? 1);
    if (cursor < 0) return clip;
  }
  return clips.at(-1);
}
export function selectAudio({
  context,
  manifest,
  history = [],
  sessionPlayed = new Set(),
  preferences = {},
  now = Date.now(),
  random = Math.random,
  ...runtime
} = {}) {
  if (typeof context !== 'string' || !Array.isArray(manifest?.clips)) return SILENT_AUDIO_SELECTION;
  const safeHistory = sanitizeAudioHistory(history);
  const selection = {
    ...runtime,
    context,
    now,
    hour: Number.isInteger(runtime.hour) ? runtime.hour : new Date(now).getHours(),
    preferences: { ...VOICE_PREFERENCES_DEFAULTS, ...preferences },
  };
  let eligible = manifest.clips.filter((clip) => isAudioEligible(clip, selection, safeHistory, sessionPlayed));
  if (!eligible.length) return SILENT_AUDIO_SELECTION;

  const lastCategoryClip = getLastEvent(safeHistory, (event) => event.category === eligible[0].category)?.clipId;
  const withoutLast = eligible.filter((clip) => clip.id !== lastCategoryClip);
  if (withoutLast.length) eligible = withoutLast;

  const recentIds = new Set(safeHistory.slice(-3).map((event) => event.clipId));
  const withoutRecent = eligible.filter((clip) => !recentIds.has(clip.id));
  if (withoutRecent.length) eligible = withoutRecent;

  return Object.freeze({ status: 'selected', clip: selectWeighted(eligible, random), reason: null });
}

export function createAudioHistoryEvent(clip, { now = Date.now(), operationId = null } = {}) {
  return Object.freeze({
    clipId: clip.id,
    category: clip.category,
    context: clip.context,
    playedAt: now,
    operationId,
  });
}
