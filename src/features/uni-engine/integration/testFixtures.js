// Fixtures e helpers compartilhados dos testes de Integração (Parte 1).
import { createUniEngineConfig } from '../uniEngineConfig.js';

const ALL_GATES = [
  'ENGINE_ENABLED',
  'ACTIVATION_ENABLED',
  'CAPABILITY_ENABLED',
  'ENVIRONMENT_ALLOWED',
  'CONFIDENCE_THRESHOLD',
  'RISK_THRESHOLD',
  'WORKSPACE_COMPATIBLE',
  'DATA_SUFFICIENCY',
  'CAPABILITY_POLICY',
  'CIRCUIT_BREAKER',
];

export function buildPassedGates(extra = []) {
  return [
    ...ALL_GATES.map((name) => ({
      name,
      passed: true,
      reasonCode: `${name}_OK`,
      severity: 'none',
      metadata: {},
    })),
    ...extra,
  ];
}

// Decisão de Activation válida e ATIVA (ACTIVE_TEST) para uma capacidade.
export function buildActiveDecision(capability, overrides = {}) {
  const safe = overrides ?? {};
  return {
    version: '1.0',
    enabled: true,
    shadowMode: false,
    environment: 'development',
    capability,
    requested: true,
    eligible: true,
    activationStatus: 'ACTIVE_TEST',
    rolloutMode: 'TEST_USERS',
    rolloutBucket: 1,
    confidence: 0.9,
    confidenceThreshold: 0.6,
    risk: 'LOW',
    workspaceType: 'personal',
    dataSufficient: true,
    gates: buildPassedGates(),
    applied: true,
    appliedEffect: {
      applied: true,
      effect: 'guidance',
      fields: ['questionKey', 'fieldsStillMissing'],
      blockedBy: null,
    },
    fallbackUsed: false,
    fallbackReason: null,
    comparison: null,
    diagnostics: [],
    telemetry: null,
    shadow: {
      shadowMode: false,
      appliedToDecision: false,
      appliedToResponse: true,
      executed: false,
      persisted: false,
      changedBehavior: false,
      memoryModified: false,
      databaseCalled: false,
      voiceTouched: false,
    },
    latencyMs: 1.2,
    ...safe,
  };
}

// Decisão SHADOW_ONLY (avalia, mas não aplica).
export function buildShadowDecision(capability, overrides = {}) {
  return buildActiveDecision(capability, {
    shadowMode: true,
    activationStatus: 'SHADOW_ONLY',
    applied: false,
    ...overrides,
  });
}

// Resultado da Uni Engine (Shadow Mode) com decisions de activation.
export function buildEngineResult(overrides = {}) {
  const safe = overrides ?? {};
  return {
    engineVersion: '2.0',
    revision: '10.0',
    enabled: true,
    skipped: false,
    correlationId: 'ue_test',
    decisionLayer: {
      decisionType: 'ask',
      nextDecisionType: 'ask',
      risk: 'LOW',
      confidence: 0.9,
    },
    classification: {
      primaryIntent: 'register_expense',
      ambiguities: [],
      confidence: 0.9,
    },
    comparison: {
      missingFields: [],
      agreementMetrics: { divergenceCount: 0 },
    },
    activation: {
      enabled: true,
      shadowMode: false,
      environment: 'development',
      decisions: [],
    },
    ...safe,
  };
}

// Config da integração LIGADA em ambiente de teste (engine + activation +
// integração + capacidades da Parte 1).
export function buildIntegrationConfig(env = {}) {
  return createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_METADATA_ONLY: 'true',
      VITE_UNI_ENGINE_CAP_DIAGNOSTICS_ONLY: 'true',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_CAP_CLARIFICATION_GUIDANCE: 'true',
      VITE_UNI_ENGINE_CAP_RESPONSE_STYLE_GUIDANCE: 'true',
      VITE_UNI_ENGINE_CAP_RESPONSE_LENGTH_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_INTEGRATION_TELEMETRY: 'false',
      ...env,
    },
  });
}

export const EXPENSE_ACCOUNT_QUESTION = 'Em qual conta você fez esse pagamento?';
export const INCOME_ACCOUNT_QUESTION = 'Em qual conta você recebeu esse valor?';
export const AMOUNT_QUESTION = 'Qual foi o valor dessa movimentação?';
export const TRANSFER_ORIGIN_QUESTION = 'De qual conta o valor foi transferido?';
export const TRANSFER_DESTINATION_QUESTION = 'Para qual conta o valor foi transferido?';
export const ADJUSTMENT_ACCOUNT_QUESTION = 'Em qual conta você quer ajustar o saldo?';
export const BALANCE_VS_INCOME_QUESTION = 'Você quer registrar esse valor como receita ou ajustar o saldo?';

export function legacyClarification(overrides = {}) {
  const safe = overrides ?? {};
  return {
    text: safe.text ?? EXPENSE_ACCOUNT_QUESTION,
    responseType: safe.responseType ?? 'clarification',
    issueField: safe.issueField ?? 'account',
    transactionType: safe.transactionType ?? 'expense',
    conversationStyle: safe.conversationStyle ?? null,
    hasConfirmationCard: false,
    status: safe.status ?? 'needs_clarification',
    ...safe,
  };
}
