import {
  CORE_IDENTITY,
  DEFAULT_PERSONALITY_PROFILE,
  getPersonalityProfile,
  isValidPersonalityProfile,
} from './personalityProfiles.js';

const VALID_WORKSPACES = new Set(['personal', 'business']);
const VALID_SITUATIONS = new Set([
  'routine',
  'decision',
  'uncertainty',
  'emergency',
  'celebration',
]);
const VALID_KNOWLEDGE_LEVELS = new Set([
  'beginner',
  'intermediate',
  'advanced',
]);
const VALID_DECISION_STYLES = new Set(['intuitive', 'balanced', 'analytical']);
const VALID_RISK_SENSITIVITY = new Set(['low', 'medium', 'high']);
const VALID_EXPLANATION_LEVELS = new Set(['concise', 'balanced', 'detailed']);
const ARCHETYPE_SHIFT_LIMIT = 0.12;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(Math.max(value, minimum), maximum);
}

function round(value) {
  return Number(value.toFixed(3));
}

function normalizeArchetypes(archetypes) {
  const total = Object.values(archetypes).reduce((sum, value) => sum + value, 0);

  return Object.fromEntries(
    Object.entries(archetypes).map(([key, value]) => [key, round(value / total)]),
  );
}

function applyArchetypeDelta(archetypes, baseArchetypes, delta) {
  Object.entries(delta).forEach(([key, value]) => {
    const minimum = Math.max(0.05, baseArchetypes[key] - ARCHETYPE_SHIFT_LIMIT);
    const maximum = Math.min(0.9, baseArchetypes[key] + ARCHETYPE_SHIFT_LIMIT);
    archetypes[key] = clamp(archetypes[key] + value, minimum, maximum);
  });
}

function readAllowed(value, allowedValues, fallback = null) {
  return allowedValues.has(value) ? value : fallback;
}

export function resolvePersonality(options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const hasExplicitPreference = Object.hasOwn(safeOptions, 'preferredProfile');
  const preferredProfile = hasExplicitPreference
    ? safeOptions.preferredProfile
    : DEFAULT_PERSONALITY_PROFILE;
  const context =
    safeOptions.context && typeof safeOptions.context === 'object'
      ? safeOptions.context
      : {};
  const cognitiveMap =
    safeOptions.cognitiveMap && typeof safeOptions.cognitiveMap === 'object'
      ? safeOptions.cognitiveMap
      : {};
  const profileWasValid = isValidPersonalityProfile(preferredProfile);
  const baseProfile = getPersonalityProfile(preferredProfile);
  const archetypes = { ...baseProfile.archetypes };
  const communication = { ...baseProfile.communication };
  const temporaryAdjustments = [];
  const workspaceType = readAllowed(context.workspaceType, VALID_WORKSPACES);
  const situation = readAllowed(context.situation, VALID_SITUATIONS, 'routine');
  const financialKnowledge = readAllowed(
    cognitiveMap.financialKnowledge,
    VALID_KNOWLEDGE_LEVELS,
  );
  const decisionStyle = readAllowed(
    cognitiveMap.decisionStyle,
    VALID_DECISION_STYLES,
  );
  const riskSensitivity = readAllowed(
    cognitiveMap.riskSensitivity,
    VALID_RISK_SENSITIVITY,
  );
  const explanationLevel = readAllowed(
    cognitiveMap.preferredExplanation,
    VALID_EXPLANATION_LEVELS,
  );

  if (workspaceType === 'business') {
    applyArchetypeDelta(archetypes, baseProfile.archetypes, {
      elegant: 0.04,
      warm: -0.08,
      strategic: 0.08,
    });
    communication.objectivity = clamp(communication.objectivity + 0.04);
    temporaryAdjustments.push('contexto empresarial: mais executivo e estrategico');
  } else if (workspaceType === 'personal') {
    applyArchetypeDelta(archetypes, baseProfile.archetypes, {
      warm: 0.04,
      strategic: -0.03,
    });
    temporaryAdjustments.push('contexto pessoal: mais proximidade sem perder clareza');
  }

  if (situation === 'emergency') {
    communication.responseLength = 'short';
    communication.detailLevel = 'essential';
    communication.objectivity = Math.max(communication.objectivity, 0.94);
    communication.warmth = Math.max(communication.warmth, 0.58);
    temporaryAdjustments.push('emergencia: clareza, calma e proximo passo imediato');
  } else if (situation === 'uncertainty') {
    communication.detailLevel = 'guided';
    communication.warmth = clamp(communication.warmth + 0.06);
    temporaryAdjustments.push('incerteza: explicitar limites e reduzir ambiguidade');
  } else if (situation === 'celebration') {
    communication.warmth = clamp(communication.warmth + 0.08);
    temporaryAdjustments.push('conquista: reconhecer progresso sem exagero');
  }

  if (financialKnowledge === 'beginner' || explanationLevel === 'detailed') {
    communication.detailLevel = 'guided';
    communication.vocabulary = 'simples, concreto e com termos financeiros explicados';
    temporaryAdjustments.push('aprendizado: explicar conceitos sem pressupor conhecimento');
  } else if (
    financialKnowledge === 'advanced' ||
    explanationLevel === 'concise'
  ) {
    communication.responseLength = 'short';
    temporaryAdjustments.push('fluencia financeira: reduzir explicacoes basicas');
  }

  if (decisionStyle === 'analytical') {
    applyArchetypeDelta(archetypes, baseProfile.archetypes, {
      strategic: 0.06,
      warm: -0.03,
    });
    temporaryAdjustments.push('decisao analitica: evidenciar criterios e cenarios');
  }

  if (riskSensitivity === 'high') {
    communication.warmth = clamp(communication.warmth + 0.08);
    temporaryAdjustments.push('sensibilidade a risco: comunicar sem alarmismo');
  }

  return {
    profileId: baseProfile.id,
    profileLabel: baseProfile.label,
    isFallback: !profileWasValid,
    archetypes: normalizeArchetypes(archetypes),
    communication: {
      ...communication,
      warmth: round(communication.warmth),
      objectivity: round(communication.objectivity),
    },
    coreIdentity: CORE_IDENTITY,
    temporaryAdjustments,
    adaptationIsTemporary: true,
  };
}
