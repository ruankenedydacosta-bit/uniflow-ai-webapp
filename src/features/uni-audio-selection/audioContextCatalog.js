export const AUDIO_SELECTION_STORAGE_VERSION = 1;
export const AUDIO_SELECTION_STORAGE_PREFIX = 'uniflow.uni-audio.selection.v1';
export const MAX_AUDIO_HISTORY = 100;

export const VOICE_PREFERENCES_DEFAULTS = Object.freeze({
  voiceEnabled: true,
  proactiveVoiceEnabled: true,
  volume: 1,
  reducedVoiceFrequency: false,
});
export const AUDIO_CONTEXT_POLICIES = Object.freeze({
  first_app_access: Object.freeze({ oncePerUser: true }),
  returning_user: Object.freeze({ cooldownMs: 12 * 60 * 60 * 1000 }),
  greeting_morning: Object.freeze({ cooldownMs: 6 * 60 * 60 * 1000, hours: [5, 12] }),
  greeting_afternoon: Object.freeze({ cooldownMs: 6 * 60 * 60 * 1000, hours: [12, 18] }),
  greeting_evening: Object.freeze({ cooldownMs: 6 * 60 * 60 * 1000, hours: [18, 5] }),
  greeting_general: Object.freeze({ cooldownMs: 6 * 60 * 60 * 1000 }),
  listening: Object.freeze({ cooldownMs: 60 * 1000, oncePerOperation: true }),
  waiting_for_user: Object.freeze({ cooldownMs: 5 * 60 * 1000, oncePerOperation: true }),
  processing: Object.freeze({ cooldownMs: 30 * 1000, oncePerOperation: true }),
  listening_to_processing: Object.freeze({ cooldownMs: 30 * 1000, oncePerOperation: true }),
  confirmation_general: Object.freeze({ oncePerOperation: true }),
  confirmation_save: Object.freeze({ oncePerOperation: true }),
  confirmation_sensitive: Object.freeze({ oncePerOperation: true, sensitiveOnly: true }),
  error_understanding: Object.freeze({ cooldownMs: 10 * 1000 }),
  error_temporary: Object.freeze({ cooldownMs: 60 * 1000 }),
  finance_attention: Object.freeze({ cooldownMs: 30 * 60 * 1000, requiresEvidence: true }),
  finance_insight: Object.freeze({ cooldownMs: 30 * 60 * 1000, requiresEvidence: true }),
  finance_suggestion: Object.freeze({ cooldownMs: 30 * 60 * 1000, requiresEvidence: true }),
  finance_progress: Object.freeze({ cooldownMs: 30 * 60 * 1000, requiresEvidence: true }),
  positive_progress: Object.freeze({ cooldownMs: 30 * 60 * 1000, requiresEvidence: true }),
  positive_achievement: Object.freeze({ cooldownMs: 30 * 60 * 1000, requiresEvidence: true }),
  support_emotional: Object.freeze({ cooldownMs: 10 * 60 * 1000 }),
  proactive_attention: Object.freeze({ cooldownMs: 20 * 60 * 1000, proactive: true, requiresEvidence: true }),
  proactive_opportunity: Object.freeze({ cooldownMs: 20 * 60 * 1000, proactive: true, requiresEvidence: true }),
  proactive_pattern: Object.freeze({ cooldownMs: 20 * 60 * 1000, proactive: true, requiresEvidence: true }),
  proactive_suggestion: Object.freeze({ cooldownMs: 20 * 60 * 1000, proactive: true, requiresEvidence: true }),
  closing_general: Object.freeze({ cooldownMs: 30 * 60 * 1000, oncePerSession: true }),
});
