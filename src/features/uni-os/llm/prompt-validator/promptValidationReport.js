import { createPromptValidationSchema } from './promptValidationSchema.js';
import { PROMPT_AUDIT_POLICY } from './promptRules.js';

export function resolvePromptValidationStatus(issues = []) {
  const blocked = issues.some((issue) => (
    PROMPT_AUDIT_POLICY.blockingLevels.includes(issue.level)
  ));
  if (blocked) return 'REJECTED';
  if (issues.some((issue) => issue.level === 'WARNING')) return 'APPROVED_WITH_WARNINGS';
  return 'APPROVED';
}

export function createPromptValidationReport(audit = {}) {
  const issues = Array.isArray(audit.issues) ? audit.issues : [];
  const status = resolvePromptValidationStatus(issues);
  return createPromptValidationSchema({
    status,
    issues,
    checksRun: audit.checksRun,
    sectionsAudited: audit.sectionsAudited,
    approved: status !== 'REJECTED',
    policy: PROMPT_AUDIT_POLICY.id,
  });
}
