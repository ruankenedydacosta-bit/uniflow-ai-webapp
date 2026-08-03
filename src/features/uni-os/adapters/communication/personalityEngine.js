import {
  DEFAULT_PERSONALITY_PROFILE,
  isValidPersonalityProfile,
} from '../../../uni-personality/personalityProfiles.js';

export const COMMUNICATION_PERSONALITIES = Object.freeze([
  'FORMAL',
  'FRIENDLY',
  'EXECUTIVE',
  'DIDACTIC',
  'MINIMALIST',
  'CUSTOM',
]);

const PROFILE_COMMUNICATION = Object.freeze({
  balanced: Object.freeze({
    personality: 'DIDACTIC',
    verbosity: 'BALANCED',
    communicationStyle: 'BALANCED_GUIDANCE',
  }),
  direct: Object.freeze({
    personality: 'MINIMALIST',
    verbosity: 'CONCISE',
    communicationStyle: 'DIRECT_CLARITY',
  }),
  warm: Object.freeze({
    personality: 'FRIENDLY',
    verbosity: 'BALANCED',
    communicationStyle: 'WARM_GUIDANCE',
  }),
  strategic: Object.freeze({
    personality: 'EXECUTIVE',
    verbosity: 'STRUCTURED',
    communicationStyle: 'STRATEGIC_CLARITY',
  }),
});

export function resolveCommunicationPersonality(profileId) {
  const safeProfileId = isValidPersonalityProfile(profileId)
    ? profileId
    : DEFAULT_PERSONALITY_PROFILE;
  return PROFILE_COMMUNICATION[safeProfileId];
}
