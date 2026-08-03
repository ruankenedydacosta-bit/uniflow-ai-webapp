import {
  PROMPT_VALIDATION_LEVELS,
  PROMPT_VALIDATION_STATUSES,
} from './promptRules.js';

export const PROMPT_VALIDATION_VERSION = '1.0';

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]),
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function countLevel(issues, level) {
  return issues.filter((issue) => issue.level === level).length;
}

export function createPromptValidationSchema(input = {}) {
  const issues = cloneValue(Array.isArray(input.issues) ? input.issues : []);
  const warnings = issues.filter((issue) => issue.level === 'WARNING');
  const status = PROMPT_VALIDATION_STATUSES.includes(input.status)
    ? input.status
    : 'REJECTED';

  return deepFreeze({
    validationReport: {
      status,
      issues,
      warnings,
      statistics: {
        checksRun: Number.isInteger(input.checksRun) ? input.checksRun : 0,
        sectionsAudited: Number.isInteger(input.sectionsAudited) ? input.sectionsAudited : 0,
        issuesCount: issues.length,
        byLevel: Object.fromEntries(
          PROMPT_VALIDATION_LEVELS.map((level) => [level, countLevel(issues, level)]),
        ),
      },
      approved: input.approved === true,
      metadata: {
        version: PROMPT_VALIDATION_VERSION,
        policy: input.policy ?? 'UNI_OS_PROMPT_AUDIT_V1',
        auditOnly: true,
        promptModified: false,
      },
    },
    version: PROMPT_VALIDATION_VERSION,
    metadata: {
      immutable: true,
      deterministic: true,
      auditOnly: true,
      promptModified: false,
      promptCorrected: false,
      sectionsRemoved: false,
      sectionsReordered: false,
      adapterInvoked: false,
      modelInvoked: false,
      externalCallsMade: false,
      tokensConsumed: 0,
      persisted: false,
      executionAllowed: false,
      shadowMode: true,
    },
  });
}

export { cloneValue, deepFreeze };
