export const COMPILER_POLICY_IDS = Object.freeze([
  'STANDARD',
  'COMPACT',
  'DEBUG',
  'VERBOSE',
]);

export const COMPILER_POLICIES = Object.freeze({
  STANDARD: Object.freeze({
    id: 'STANDARD',
    titlePrefix: '## ',
    titleSuffix: '',
    separator: '---',
    sectionGap: '\n\n',
    jsonIndent: 2,
    includeCompilerMetadata: false,
  }),
  COMPACT: Object.freeze({
    id: 'COMPACT',
    titlePrefix: '[',
    titleSuffix: ']',
    separator: '-',
    sectionGap: '\n',
    jsonIndent: 0,
    includeCompilerMetadata: false,
  }),
  DEBUG: Object.freeze({
    id: 'DEBUG',
    titlePrefix: '## DEBUG ',
    titleSuffix: '',
    separator: '--- DEBUG ---',
    sectionGap: '\n\n',
    jsonIndent: 2,
    includeCompilerMetadata: true,
  }),
  VERBOSE: Object.freeze({
    id: 'VERBOSE',
    titlePrefix: '### UNI OS SECTION ',
    titleSuffix: '',
    separator: '==========',
    sectionGap: '\n\n\n',
    jsonIndent: 4,
    includeCompilerMetadata: true,
  }),
});

export function resolveCompilerPolicy(policyId = 'STANDARD') {
  const normalized = typeof policyId === 'string' ? policyId.trim().toUpperCase() : 'STANDARD';
  return COMPILER_POLICIES[normalized] ?? COMPILER_POLICIES.STANDARD;
}
