function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;

  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const inspectorPipelineStages = deepFreeze([
  { id: 'parser', label: 'Parser', status: 'completed', code: 'P' },
  { id: 'context', label: 'Context', status: 'completed', code: 'C' },
  { id: 'memory', label: 'Memory', status: 'completed', code: 'M' },
  { id: 'planning', label: 'Planning', status: 'completed', code: 'PL' },
  { id: 'reflection', label: 'Reflection', status: 'completed', code: 'R' },
  { id: 'security', label: 'Security', status: 'completed', code: 'S' },
  { id: 'permissions', label: 'Permissions', status: 'completed', code: 'PE' },
  { id: 'cognitive', label: 'Cognitive', status: 'completed', code: 'CG' },
  { id: 'response', label: 'Structured Response', status: 'completed', code: 'SR' },
  { id: 'communication', label: 'Communication', status: 'completed', code: 'CO' },
]);

export const inspectorRuntimeMock = deepFreeze({
  runtimeId: 'runtime-mock-v1',
  timestamp: '2026-07-12T20:18:42.000Z',
  version: '1.0.0',
  build: '2026.07.12-dev',
  pipeline: 'completed',
  shadowMode: true,
  executionAllowed: false,
  deepFreeze: true,
  adaptersExecuted: 9,
  executionTimeMs: 18.7,
  featureFlag: false,
  validationResult: 'Mock fallback',
  source: 'mock',
  parsedIntent: {
    id: 'intent-mock-01',
    source: 'text',
    language: 'pt-BR',
    intent: 'register_expense',
    confidence: 0.94,
    requiresConfirmation: true,
    entities: {
      accounts: [{ normalized: 'conta-principal', display: 'Conta principal' }],
      categories: [{ normalized: 'alimentacao', display: 'Alimentacao' }],
      values: [86.4],
      dates: ['2026-07-12'],
    },
  },
  context: {
    session: { authenticated: true, sessionId: 'session-mock' },
    user: { id: 'user-mock', profileCompleted: true },
    workspace: { id: 'workspace-mock', role: 'owner' },
    conversation: { channel: 'text', language: 'pt-BR', timezone: 'America/Sao_Paulo' },
    personality: { mode: 'balanced' },
    featureFlags: { uniOS: false, premiumVoice: false },
  },
  memory: {
    explicit: { count: 2 },
    conversation: { activeWindow: 4 },
    financial: { accounts: 2, categories: 8, merchants: 3, goals: 2 },
    preferences: { account: true, category: true, conversation: true },
    metadata: { providers: ['conversation', 'financial', 'preferences'] },
  },
  planning: {
    planId: 'plan-mock-01',
    intent: 'financial_action',
    confidence: 0.94,
    requiresConfirmation: true,
    executionAllowed: false,
    steps: [
      { id: 'step-1', type: 'identify_account', status: 'planned' },
      { id: 'step-2', type: 'identify_category', status: 'planned' },
      { id: 'step-3', type: 'ask_confirmation', status: 'planned' },
    ],
  },
  reflection: {
    reflectionId: 'reflection-mock-01',
    overallRisk: 'LOW',
    confidence: 0.92,
    confirmationRequired: true,
    ambiguityDetected: false,
    inconsistencies: [],
    recommendations: ['ASK_CONFIRMATION', 'PROCEED_AFTER_CONFIRMATION'],
    executionAllowed: false,
  },
  security: {
    securityId: 'security-mock-01',
    status: 'ALLOW_WITH_CONFIRMATION',
    blocked: false,
    confirmationRequired: true,
    reasons: ['CONFIRMATION_REQUIRED'],
    warnings: [],
    executionAllowed: false,
  },
  permissions: {
    permissionsId: 'permissions-mock-01',
    status: 'AUTHORIZED_WITH_CONFIRMATION',
    scopes: ['READ_CONTEXT', 'READ_MEMORY', 'PROPOSE_FINANCIAL_ACTION'],
    grants: ['REQUEST_CONFIRMATION'],
    restrictions: ['CONFIRMATION_REQUIRED'],
    executionAllowed: false,
  },
  gateway: {
    gatewayId: 'gateway-mock-01',
    provider: null,
    route: 'NOT_IMPLEMENTED',
    shouldInvokeModel: false,
    modelCapability: 'FINANCIAL_REASONING',
    promptTemplate: null,
  },
  response: {
    responseId: 'response-mock-01',
    version: '1.0.0',
    sections: ['facts', 'planning', 'reflection', 'security', 'permissions', 'cognition'],
    communication: { emotion: null, personality: null, outputType: null },
    executionAllowed: false,
    metadata: { schemaVersion: '1.0.0', generatedInShadowMode: true },
  },
  communication: {
    communicationId: 'communication-mock-01',
    emotion: 'CALM',
    personality: 'DIDACTIC',
    tone: 'calm-objective',
    verbosity: 'concise',
    communicationStyle: 'structured',
    outputChannel: null,
    voiceProfile: null,
    executionAllowed: false,
  },
});

export { deepFreeze };
