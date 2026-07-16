import { AUDIO_CONTEXT_POLICIES } from './audioContextCatalog.js';
import { countEventsSince, getLastEvent } from './audioHistory.js';
import { isAudioInCooldown } from './audioCooldown.js';

const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

function hourMatches([start, end], hour) {
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function isAudioEligible(clip, selection, history, sessionPlayed = new Set()) {
  const basePolicy = AUDIO_CONTEXT_POLICIES[selection.context] ?? {};
  const policy = selection.preferences.reducedVoiceFrequency
    ? { ...basePolicy, cooldownMs: (basePolicy.cooldownMs ?? clip.cooldownMs ?? 0) * 2 }
    : basePolicy;
  const preferences = selection.preferences;
  if (!clip?.enabled || !clip.src || clip.context !== selection.context) return false;
  if (!preferences.voiceEnabled) return false;
  if (policy.proactive && !preferences.proactiveVoiceEnabled) return false;
  if (clip.requiresUserGesture && !selection.userGesture) return false;
  if (selection.sensitive && !clip.sensitiveAllowed) return false;
  if (policy.sensitiveOnly && !selection.sensitive) return false;
  if (policy.requiresEvidence && !(selection.hasVerifiedData || selection.mockData)) return false;
  if (policy.hours && !hourMatches(policy.hours, selection.hour)) return false;
  if ((clip.context.startsWith('greeting_') || clip.context === 'returning_user') && selection.voiceActive) return false;
  if (selection.userSpeaking) return false;
  if (clip.context === 'waiting_for_user' && (selection.silenceDurationMs ?? 0) < 3_500) return false;
  if (clip.context === 'listening' && (selection.holdDurationMs ?? 0) < 400) return false;
  if (clip.context === 'error_understanding' && (selection.attemptNumber ?? 1) > 2) return false;
  if (selection.negativeContext && clip.category === 'positive') return false;
  if (clip.tags?.includes('laughter') && (clip.category === 'error' || clip.context === 'proactive_attention')) return false;
  if (clip.tags?.includes('laughter') && selection.sensitive) return false;
  if ((clip.oncePerSession || policy.oncePerSession) && sessionPlayed.has(clip.id)) return false;
  if ((clip.oncePerUser || policy.oncePerUser) && getLastEvent(history, (event) => event.clipId === clip.id)) return false;
  if (policy.oncePerOperation && selection.operationId
    && getLastEvent(history, (event) => event.context === clip.context && event.operationId === selection.operationId)) return false;
  if (isAudioInCooldown(clip, history, selection.now, policy)) return false;
  const text = normalize(clip.text);
  if (text.includes('quase pronto') && (selection.operationElapsedMs ?? 0) < 3_000) return false;
  if (text.includes('vou ver isso agora') && (selection.operationElapsedMs ?? 0) > 1_500) return false;
  if (['finance', 'positive'].includes(clip.category)
    && getLastEvent(history, (event) => event.clipId === clip.id && selection.now - event.playedAt < 86_400_000)) return false;
  if (policy.proactive && countEventsSince(history, selection.now - 86_400_000, (event) => event.category === 'proactive') >= 2) return false;
  return true;
}
