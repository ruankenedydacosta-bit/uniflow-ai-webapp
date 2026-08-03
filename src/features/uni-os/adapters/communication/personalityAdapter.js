import { isValidPersonalityProfile } from '../../../uni-personality/personalityProfiles.js';
import { resolveCommunicationPersonality } from './personalityEngine.js';

function memoryProfile(memorySnapshot) {
  const preferences = memorySnapshot?.preferences?.conversation;
  if (!Array.isArray(preferences)) return null;
  return preferences.map((preference) => preference?.mode).find(isValidPersonalityProfile) ?? null;
}

export function adaptPersonality({ contextSnapshot = {}, memorySnapshot = {} } = {}) {
  const profileId = memoryProfile(memorySnapshot) ?? contextSnapshot?.personality?.mode;
  return resolveCommunicationPersonality(profileId);
}
