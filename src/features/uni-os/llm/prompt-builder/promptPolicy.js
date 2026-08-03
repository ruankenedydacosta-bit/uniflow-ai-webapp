export const PROMPT_SECTION_IDS = Object.freeze([
  'SYSTEM',
  'CONTEXT',
  'GOALS',
  'MEMORY',
  'INSIGHTS',
  'CONVERSATION',
  'REFLECTION',
  'SECURITY',
  'PERMISSIONS',
  'REQUEST',
  'METADATA',
]);

export const PROMPT_PRIORITIES = Object.freeze(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']);

export const PROMPT_SECTION_POLICY = Object.freeze({
  SYSTEM: Object.freeze({ title: 'System', priority: 'CRITICAL', budgetSection: null }),
  CONTEXT: Object.freeze({ title: 'Context', priority: 'HIGH', budgetSection: 'context' }),
  GOALS: Object.freeze({ title: 'Goals', priority: 'HIGH', budgetSection: 'goals' }),
  MEMORY: Object.freeze({ title: 'Memory', priority: 'HIGH', budgetSection: 'memory' }),
  INSIGHTS: Object.freeze({ title: 'Insights', priority: 'NORMAL', budgetSection: 'insights' }),
  CONVERSATION: Object.freeze({
    title: 'Conversation', priority: 'HIGH', budgetSection: 'messages',
  }),
  REFLECTION: Object.freeze({
    title: 'Reflection', priority: 'HIGH', budgetSection: 'reflection',
  }),
  SECURITY: Object.freeze({
    title: 'Security', priority: 'CRITICAL', budgetSection: 'security',
  }),
  PERMISSIONS: Object.freeze({
    title: 'Permissions', priority: 'CRITICAL', budgetSection: 'permissions',
  }),
  REQUEST: Object.freeze({ title: 'Request', priority: 'CRITICAL', budgetSection: null }),
  METADATA: Object.freeze({ title: 'Metadata', priority: 'LOW', budgetSection: null }),
});

export const SYSTEM_DIRECTIVES = Object.freeze([
  'PRESERVE_STRUCTURED_FACTS',
  'FOLLOW_SECURITY_DECISION',
  'FOLLOW_PERMISSION_DECISION',
  'REQUIRE_EXPLICIT_CONFIRMATION',
  'DO_NOT_EXECUTE_ACTIONS',
]);

export const PROMPT_POLICY_METADATA = Object.freeze({
  id: 'UNI_OS_STRUCTURED_PROMPT_V1',
  deterministic: true,
  mandatorySections: PROMPT_SECTION_IDS,
});
