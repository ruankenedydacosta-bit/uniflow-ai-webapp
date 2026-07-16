import { MAX_AUDIO_HISTORY } from './audioContextCatalog.js';

export function sanitizeAudioHistory(history) {
  if (!Array.isArray(history)) return [];
  return Object.freeze(history
    .filter((event) => event && typeof event.clipId === 'string' && Number.isFinite(event.playedAt))
    .slice(-MAX_AUDIO_HISTORY)
    .map((event) => Object.freeze({ ...event })));
}

export function appendAudioHistory(history, event) {
  return Object.freeze([...sanitizeAudioHistory(history), Object.freeze({ ...event })].slice(-MAX_AUDIO_HISTORY));
}

export function getLastEvent(history, predicate = () => true) {
  return [...sanitizeAudioHistory(history)].reverse().find(predicate) ?? null;
}

export function countEventsSince(history, since, predicate = () => true) {
  return sanitizeAudioHistory(history).filter((event) => event.playedAt >= since && predicate(event)).length;
}
