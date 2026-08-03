import { PROMPT_PRIORITIES, PROMPT_SECTION_IDS } from './promptPolicy.js';
import { STRUCTURED_PROMPT_VERSION } from './promptSchema.js';

function isRecord(value) {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function isValidCost(value) {
  return value === null
    || (Number.isFinite(value) && value >= 0)
    || ['LOW', 'MEDIUM', 'HIGH'].includes(value);
}

export function validateStructuredPrompt(snapshot) {
  const errors = [];
  if (!isRecord(snapshot)) {
    return Object.freeze({ valid: false, errors: Object.freeze(['STRUCTURED_PROMPT_REQUIRED']) });
  }

  const prompt = snapshot.structuredPrompt;
  const sections = Array.isArray(prompt?.sections) ? prompt.sections : [];
  const ids = sections.map((section) => section?.id);
  if (!isRecord(prompt)) errors.push('STRUCTURED_PROMPT_BODY_REQUIRED');
  if (sections.length !== PROMPT_SECTION_IDS.length) errors.push('INVALID_SECTION_COUNT');
  if (new Set(ids).size !== ids.length) errors.push('DUPLICATE_PROMPT_SECTION');
  if (!PROMPT_SECTION_IDS.every((id, index) => ids[index] === id)) {
    errors.push('INVALID_PROMPT_SECTION_ORDER');
  }

  sections.forEach((section, index) => {
    if (!isRecord(section)) {
      errors.push(`INVALID_SECTION_${index + 1}`);
      return;
    }
    if (typeof section.title !== 'string' || section.title.trim() === '') {
      errors.push(`INVALID_${section.id ?? index}_TITLE`);
    }
    if (!PROMPT_PRIORITIES.includes(section.priority)) {
      errors.push(`INVALID_${section.id ?? index}_PRIORITY`);
    }
    if (!Number.isInteger(section.estimatedTokens) || section.estimatedTokens < 0) {
      errors.push(`INVALID_${section.id ?? index}_ESTIMATE`);
    }
    if (!Object.hasOwn(section, 'content')) errors.push(`MISSING_${section.id ?? index}_CONTENT`);
    if (!isRecord(section.metadata)
      || section.metadata.order !== index + 1
      || section.metadata.mandatory !== true
      || !Number.isInteger(section.metadata.allocatedBudget)
      || section.metadata.allocatedBudget < 0
      || typeof section.metadata.withinAllocatedBudget !== 'boolean') {
      errors.push(`INVALID_${section.id ?? index}_METADATA`);
    }
  });

  const estimatedTokens = sections.reduce(
    (total, section) => total + (Number.isInteger(section?.estimatedTokens)
      ? section.estimatedTokens
      : 0),
    0,
  );
  if (prompt?.estimatedTokens !== estimatedTokens) errors.push('ESTIMATED_TOKENS_MISMATCH');
  if (!isValidCost(prompt?.estimatedCost)) errors.push('INVALID_ESTIMATED_COST');
  if (!isRecord(prompt?.routing)) errors.push('PROMPT_ROUTING_REQUIRED');
  if (!isRecord(prompt?.statistics)) errors.push('PROMPT_STATISTICS_REQUIRED');
  if (prompt?.statistics?.sectionsCount !== PROMPT_SECTION_IDS.length
    || prompt?.statistics?.mandatorySections !== PROMPT_SECTION_IDS.length) {
    errors.push('INVALID_PROMPT_STATISTICS');
  }
  if (snapshot.version !== STRUCTURED_PROMPT_VERSION
    || prompt?.metadata?.version !== STRUCTURED_PROMPT_VERSION) {
    errors.push('INVALID_STRUCTURED_PROMPT_VERSION');
  }
  if (prompt?.metadata?.structuredOnly !== true
    || prompt?.metadata?.responseGenerated !== false
    || prompt?.metadata?.adapterInvoked !== false
    || snapshot.metadata?.representationalOnly !== true
    || snapshot.metadata?.conversationWindowModified !== false
    || snapshot.metadata?.tokenBudgetModified !== false
    || snapshot.metadata?.compiledContextModified !== false
    || snapshot.metadata?.responseGenerated !== false
    || snapshot.metadata?.modelInvoked !== false
    || snapshot.metadata?.adapterInvoked !== false
    || snapshot.metadata?.externalCallsMade !== false
    || snapshot.metadata?.tokensConsumed !== 0
    || snapshot.metadata?.executionAllowed !== false) {
    errors.push('INVALID_STRUCTURED_PROMPT_INVARIANTS');
  }
  if (!isDeepFrozen(snapshot)) errors.push('STRUCTURED_PROMPT_NOT_IMMUTABLE');

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
