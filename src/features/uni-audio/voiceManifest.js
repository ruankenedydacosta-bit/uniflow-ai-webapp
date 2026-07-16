import { isLocalAudioSource } from './audioPlayer.js';
import { VOICE_CATALOG_ENTRIES } from './voiceCatalog.js';

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

export const VOICE_CATEGORIES = deepFreeze({
  CLOSING: 'closing',
  CONFIRMATION: 'confirmation',
  ERROR: 'error',
  FINANCE: 'finance',
  GREETING: 'greeting',
  LISTENING: 'listening',
  ONBOARDING: 'onboarding',
  POSITIVE: 'positive',
  PROACTIVE: 'proactive',
  PROCESSING: 'processing',
  SUPPORT: 'support',
  WELCOME: 'welcome',
});

export const VOICE_CONTEXTS = deepFreeze([
  'first_app_access',
  ...new Set(VOICE_CATALOG_ENTRIES.map((clip) => clip.context)),
]);

export const voiceManifest = deepFreeze({
  version: '2.0.0',
  locale: 'pt-BR',
  clips: VOICE_CATALOG_ENTRIES,
  categories: Object.values(VOICE_CATEGORIES),
  contexts: VOICE_CONTEXTS,
  metadata: {
    assetRoot: 'src/assets/audio/uni',
    localOnly: true,
    firstAppAccess: {
      status: 'silent_pending_exact_asset',
      requiredText: 'Seja bem-vindo à UniFlow.',
    },
  },
});

export function findVoiceClip(clipId, manifest = voiceManifest) {
  if (typeof clipId !== 'string' || !Array.isArray(manifest?.clips)) return null;
  return manifest.clips.find((clip) => clip.id === clipId) ?? null;
}

export function validateVoiceManifest(manifest = voiceManifest) {
  if (!manifest || !Array.isArray(manifest.clips)) return false;
  const ids = new Set();

  return manifest.clips.every((clip) => {
    const valid = typeof clip?.id === 'string'
      && Object.values(VOICE_CATEGORIES).includes(clip.category)
      && VOICE_CONTEXTS.includes(clip.context)
      && typeof clip.text === 'string'
      && clip.text.length > 0
      && typeof clip.emotion === 'string'
      && clip.emotion.length > 0
      && typeof clip.enabled === 'boolean'
      && (clip.enabled
        ? typeof clip.src === 'string' && clip.src.length > 0 && isLocalAudioSource(clip.src)
        : clip.src === null && typeof clip.disabledReason === 'string')
      && !ids.has(clip.id);
    ids.add(clip?.id);
    return valid;
  });
}
