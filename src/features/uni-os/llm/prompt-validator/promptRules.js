import {
  PROMPT_PRIORITIES,
  PROMPT_SECTION_IDS,
} from '../prompt-builder/promptPolicy.js';

export const PROMPT_VALIDATION_LEVELS = Object.freeze([
  'INFO',
  'WARNING',
  'ERROR',
  'BLOCKING',
]);

export const PROMPT_VALIDATION_STATUSES = Object.freeze([
  'APPROVED',
  'APPROVED_WITH_WARNINGS',
  'REJECTED',
]);

export const PROMPT_VALIDATION_RULES = Object.freeze({
  PROMPT_REQUIRED: 'BLOCKING',
  PROMPT_SCHEMA_INVALID: 'BLOCKING',
  MISSING_SECTION: 'BLOCKING',
  DUPLICATE_SECTION: 'BLOCKING',
  SECTION_ORDER_INVALID: 'BLOCKING',
  SECTION_SCHEMA_INVALID: 'ERROR',
  PRIORITY_INVALID: 'ERROR',
  ESTIMATE_INVALID: 'ERROR',
  ESTIMATED_TOTAL_MISMATCH: 'BLOCKING',
  BUDGET_REQUIRED: 'BLOCKING',
  BUDGET_INCONSISTENT: 'BLOCKING',
  SECTION_BUDGET_EXCEEDED: 'BLOCKING',
  CAPABILITY_REQUIRED: 'BLOCKING',
  CAPABILITY_NOT_REGISTERED: 'BLOCKING',
  CAPABILITY_MISMATCH: 'BLOCKING',
  ROUTING_REQUIRED: 'BLOCKING',
  ROUTING_MISMATCH: 'BLOCKING',
  PROVIDER_REQUIRED: 'BLOCKING',
  PROVIDER_NOT_REGISTERED: 'BLOCKING',
  PROVIDER_CAPABILITY_MISMATCH: 'BLOCKING',
  ESTIMATED_COST_UNAVAILABLE: 'WARNING',
  METADATA_INVALID: 'BLOCKING',
  PROMPT_NOT_IMMUTABLE: 'BLOCKING',
  ROUTING_NOT_IMMUTABLE: 'BLOCKING',
  TOKEN_BUDGET_NOT_IMMUTABLE: 'BLOCKING',
});

export const PROMPT_AUDIT_POLICY = Object.freeze({
  id: 'UNI_OS_PROMPT_AUDIT_V1',
  mandatorySections: PROMPT_SECTION_IDS,
  priorities: PROMPT_PRIORITIES,
  blockingLevels: Object.freeze(['ERROR', 'BLOCKING']),
});

export function createPromptIssue(code, details = {}) {
  const level = PROMPT_VALIDATION_RULES[code];
  if (!level) throw new TypeError(`Unknown prompt validation rule: ${code}`);
  return Object.freeze({
    code,
    level,
    section: details.section ?? null,
    field: details.field ?? null,
    expected: details.expected ?? null,
    actual: details.actual ?? null,
  });
}
