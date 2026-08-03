// Uni Engine — Decision Readiness (Parte 3).
//
// A camada de readiness consome o Observation Snapshot da Parte 2 (mais os
// resultados já existentes da Decision Layer e da Activation Engine) e
// responde tecnicamente se o sistema ESTARIA pronto para uma aplicação
// futura — sem nunca aplicar nada, sem alterar a resposta, sem persistir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDecisionReadinessSnapshot } from './buildDecisionReadinessSnapshot.js';
import {
  createEmptyReadinessSnapshot,
  createReadinessSnapshot,
  validateReadinessSnapshot,
  isReadinessSnapshotSerializable,
} from './readinessContracts.js';
import { buildReadinessDiagnostics, createReadinessDiagnostic } from './buildReadinessDiagnostics.js';
import {
  READINESS_VERSION,
  FORBIDDEN_CAPABILITIES,
  OBSERVATIONAL_CAPABILITIES,
  isObservationalCapability,
  isForbiddenCapability,
} from './readinessTypes.js';
import { deriveActivationReadiness, mapDecisionToNextStep, clamp01 } from './readinessPolicy.js';
import { buildObservationSnapshot } from '../observation/buildObservationSnapshot.js';
import { runUniEngineIntegration } from '../integration/runUniEngineIntegration.js';
import { buildGuidanceSnapshot } from '../guidance/buildGuidanceSnapshot.js';
import {
  buildEngineResult,
  buildActiveDecision,
  buildShadowDecision,
  legacyClarification,
  buildIntegrationConfig,
  EXPENSE_ACCOUNT_QUESTION,
} from '../integration/testFixtures.js';
import { findFunctionsInValue } from '../uniEngineContracts.js';
import { resetCircuitBreaker, recordCircuitFailure } from '../activation/circuitBreaker.js';

function engineWith({ decisions = [], shadow = true } = {}) {
  return buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
    activation: { enabled: true, shadowMode: shadow, environment: 'development', decisions },
  });
}

function buildObservation({ decisions = [buildActiveDecision('QUESTION_GUIDANCE')], shadow = true } = {}) {
  const legacy = legacyClarification();
  const engine = engineWith({ decisions, shadow });
  const integrationSnapshot = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy,
    engineResult: engine,
    context: { isDev: true, confidence: 0.9, risk: 'LOW', dataSufficient: true },
  });
  const guidanceSnapshot = buildGuidanceSnapshot({
    legacy,
    engineResult: engine,
    context: { isDev: true },
  });
  return buildObservationSnapshot({
    integrationSnapshot,
    guidanceSnapshot,
    activationSnapshot: engine.activation,
    context: { isDev: true, environment: 'development' },
  });
}

function decisionFixture() {
  return {
    decisionType: 'ASK',
    enabled: true,
    confidence: 0.9,
    risk: 'LOW',
    missingInformation: ['amount'],
  };
}

function buildReadiness({ observation = buildObservation(), decision = decisionFixture(), activationDecisions, context } = {}) {
  return buildDecisionReadinessSnapshot({
    observationSnapshot: observation,
    decisionSnapshot: decision,
    activationDecisions,
    context: context ?? { isDev: true, environment: 'development' },
  });
}

function readSource(file) {
  return readFileSync(
    fileURLToPath(new URL(`../${file}`, import.meta.url)),
    'utf8',
  );
}

test('R-1: readiness é construído a partir do observation snapshot com decisão válida', () => {
  const snapshot = buildReadiness();
  assert.equal(snapshot.version, READINESS_VERSION);
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.applied, false);
  assert.equal(snapshot.decisionAvailable, true);
  assert.equal(snapshot.decisionStatus, 'ASK');
  assert.equal(snapshot.recommendedNextStep, 'ASK_FOR_MISSING_INFORMATION');
  assert.deepEqual(snapshot.missingInformation, ['amount']);
  assert.ok(snapshot.recommendedCapabilities.includes('QUESTION_GUIDANCE'));
  assert.ok(snapshot.recommendedCapabilities.includes('CLARIFICATION_GUIDANCE'));
  const validation = validateReadinessSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
});

test('R-2: resultado serializável — round-trip JSON e validação de serializabilidade', () => {
  const snapshot = buildReadiness();
  const json = JSON.stringify(snapshot);
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(isReadinessSnapshotSerializable(snapshot), true);
  assert.equal(findFunctionsInValue(snapshot).length, 0);
});

test('R-3: resultado imutável — Object.freeze em profundidade', () => {
  const snapshot = buildReadiness();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.recommendedCapabilities), true);
  assert.equal(Object.isFrozen(snapshot.eligibleCapabilities), true);
  assert.equal(Object.isFrozen(snapshot.blockedCapabilities), true);
  assert.equal(Object.isFrozen(snapshot.activationReadiness), true);
  assert.equal(Object.isFrozen(snapshot.circuitBreakerStatus), true);
  assert.equal(Object.isFrozen(snapshot.diagnostics), true);
  assert.equal(Object.isFrozen(snapshot.metadata), true);
  if (snapshot.blockedCapabilities.length > 0) {
    assert.equal(Object.isFrozen(snapshot.blockedCapabilities[0]), true);
  }
  assert.throws(() => { snapshot.recommendedCapabilities.push('X'); }, TypeError);
});

test('R-4: decisão ausente gera snapshot seguro — decisionAvailable false, nada recomendado', () => {
  const snapshot = buildDecisionReadinessSnapshot({
    observationSnapshot: buildObservation({ decisions: [] }),
    context: { isDev: true },
  });
  assert.equal(snapshot.decisionAvailable, false);
  assert.equal(snapshot.decisionStatus, 'UNKNOWN');
  assert.equal(snapshot.recommendedNextStep, 'OBSERVE_ONLY');
  assert.equal(snapshot.confidence, 0);
  assert.equal(snapshot.risk, 'NONE');
  assert.deepEqual(snapshot.missingInformation, []);
  const validation = validateReadinessSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
});

test('R-5: erro interno gera fallback seguro — snapshot vazio válido e sem exceção', () => {
  const poison = {
    decisionType: 'ASK',
    get confidence() { throw new Error('boom'); },
  };
  const snapshot = buildDecisionReadinessSnapshot({
    observationSnapshot: buildObservation(),
    decisionSnapshot: poison,
    context: { isDev: true },
  });
  assert.equal(snapshot.enabled, false);
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.applied, false);
  assert.equal(snapshot.decisionAvailable, false);
  const validation = validateReadinessSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
});

test('R-6: capabilities proibidas permanecem sempre bloqueadas — jamais recomendadas ou elegíveis', () => {
  const decisions = [
    buildActiveDecision('FINANCIAL_EXECUTION'),
    buildActiveDecision('MEMORY_WRITE'),
    buildActiveDecision('LEARNING_APPLICATION'),
    buildActiveDecision('RESPONSE_CONTENT_INFLUENCE'),
    buildActiveDecision('QUESTION_GUIDANCE'),
  ];
  const observation = buildObservation({ decisions });
  const snapshot = buildReadiness({ observation, activationDecisions: decisions });
  for (const capability of FORBIDDEN_CAPABILITIES) {
    assert.ok(isForbiddenCapability(capability), `${capability} deve estar na lista de proibidas`);
    assert.equal(snapshot.recommendedCapabilities.includes(capability), false);
    assert.equal(snapshot.eligibleCapabilities.includes(capability), false);
    assert.ok(
      snapshot.blockedCapabilities.some((entry) => entry.capability === capability),
      `${capability} deve estar em blockedCapabilities`,
    );
    const reason = snapshot.blockedCapabilities.find((entry) => entry.capability === capability)?.reason;
    assert.equal(reason, 'FORBIDDEN_CAPABILITY');
  }
  assert.equal(snapshot.recommendedCapabilities.includes('QUESTION_GUIDANCE'), true);
});

test('R-7: capabilities desconhecidas são descartadas — não entram em nenhuma lista', () => {
  const decisions = [
    buildActiveDecision('QUESTION_GUIDANCE'),
    buildActiveDecision('CAPACIDADE_INEIXSTENTE_XYZ'),
    { capability: 'OUTRA_DESCONHECIDA', activationStatus: 'ACTIVE_TEST', eligible: true },
  ];
  const observation = buildObservation({ decisions });
  const snapshot = buildReadiness({ observation, activationDecisions: decisions });
  assert.equal(snapshot.recommendedCapabilities.includes('CAPACIDADE_INEIXSTENTE_XYZ'), false);
  assert.equal(snapshot.eligibleCapabilities.includes('CAPACIDADE_INEIXSTENTE_XYZ'), false);
  assert.equal(snapshot.blockedCapabilities.some((entry) => entry.capability === 'CAPACIDADE_INEIXSTENTE_XYZ'), false);
  assert.equal(snapshot.blockedCapabilities.some((entry) => entry.capability === 'OUTRA_DESCONHECIDA'), false);
  assert.equal(snapshot.eligibleCapabilities.includes('QUESTION_GUIDANCE'), true);
});

test('R-8: confidence e risk normalizados — clamp 0..1 e risco validado', () => {
  const snapshot = buildReadiness({
    decision: {
      decisionType: 'CONFIRM',
      enabled: true,
      confidence: 5,
      risk: 'EXCESSIVO',
      missingInformation: ['account'],
    },
  });
  assert.equal(snapshot.confidence, 1);
  assert.equal(snapshot.risk, 'NONE');
  assert.equal(snapshot.decisionStatus, 'CONFIRM');
  assert.equal(snapshot.recommendedNextStep, 'REQUEST_CONFIRMATION');

  const low = buildReadiness({
    decision: { decisionType: 'ANSWER', enabled: true, confidence: -3, risk: 'HIGH' },
  });
  assert.equal(low.confidence, 0);
  assert.equal(low.risk, 'HIGH');
  assert.equal(low.confidenceBand, 'very_low');
  assert.equal(low.recommendedNextStep, 'RESPOND');
});

test('R-9: circuit breaker refletido corretamente — fechado por padrão e aberto após falhas', () => {
  resetCircuitBreaker();
  const decision = buildActiveDecision('QUESTION_GUIDANCE');
  const observation = buildObservation({ decisions: [decision] });
  const closed = buildReadiness({ observation, activationDecisions: [decision] });
  assert.equal(closed.circuitBreakerStatus.open, false);
  assert.deepEqual(closed.circuitBreakerStatus.openCapabilities, []);

  for (let i = 0; i < 5; i += 1) {
    recordCircuitFailure('QUESTION_GUIDANCE');
  }
  const opened = buildReadiness({ observation, activationDecisions: [decision] });
  assert.equal(opened.circuitBreakerStatus.open, true);
  assert.ok(opened.circuitBreakerStatus.openCapabilities.includes('QUESTION_GUIDANCE'));
  resetCircuitBreaker();
});

test('R-10: nenhuma capability aplicada — applied sempre false e nada é aplicado ao usuário', () => {
  const snapshot = buildReadiness();
  assert.equal(snapshot.applied, false);
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal('appliedCapabilities' in snapshot, false);
  assert.equal('executed' in snapshot, false);
  assert.ok(snapshot.diagnostics.some((item) => item.code === 'NOTHING_APPLIED'));
});

test('R-11: resposta legada preservada — nenhum texto, finalText ou suggestedText no snapshot', () => {
  const observation = buildObservation();
  const snapshot = buildReadiness({ observation });
  const json = JSON.stringify(snapshot);
  assert.equal(json.includes(EXPENSE_ACCOUNT_QUESTION), false);
  assert.equal('finalText' in snapshot, false);
  assert.equal('text' in snapshot, false);
  assert.equal('suggestedText' in snapshot, false);
  assert.equal(json.includes('R$'), false);
  assert.equal(snapshot.legacyPreserved, true);
});

test('R-12: Pending Action intacta — a camada não lê nem altera pendências', () => {
  const snapshot = buildReadiness();
  assert.equal('pendingAction' in snapshot, false);
  assert.equal('pendingActionModified' in snapshot, false);
  const source = readSource('readiness/buildDecisionReadinessSnapshot.js');
  assert.equal(source.includes('pendingAction'), false);
  assert.equal(source.includes('setPendingAction'), false);
  assert.equal(source.includes('savePendingAction'), false);
});

test('R-13: nenhuma escrita de memória — nenhum campo nem import de memória', () => {
  const snapshot = buildReadiness();
  assert.equal('memoryWrite' in snapshot, false);
  assert.equal('memoryWritten' in snapshot, false);
  const source = readSource('readiness/buildDecisionReadinessSnapshot.js');
  assert.equal(source.includes('memoryAdapter'), false);
  assert.equal(source.includes('operationalMemory'), false);
  assert.equal(source.includes('writeMemory'), false);
});

test('R-14: nenhuma execução financeira — nenhuma chamada a executor, banco ou RPC', () => {
  const snapshot = buildReadiness();
  assert.equal('financialExecution' in snapshot, false);
  assert.equal('execute' in snapshot, false);
  const source = readSource('readiness/buildDecisionReadinessSnapshot.js');
  assert.equal(source.includes('.rpc('), false);
  assert.equal(source.includes('supabase'), false);
  assert.equal(source.includes('executeConfirmedFinancialAction'), false);
  assert.equal(source.includes('financialExecution'), false);
});

test('R-15: nenhum TTS — nenhuma chamada de voz', () => {
  const snapshot = buildReadiness();
  assert.equal('ttsTriggered' in snapshot, false);
  assert.equal('voiceTouched' in snapshot, false);
  const source = readSource('readiness/buildDecisionReadinessSnapshot.js');
  assert.equal(source.includes('uniVoice'), false);
  assert.equal(source.includes('speak('), false);
  assert.equal(source.includes('TTS'), false);
});

test('R-16: nenhuma persistência — nada é salvo em localStorage, banco ou arquivo', () => {
  const snapshot = buildReadiness();
  assert.equal('persisted' in snapshot, false);
  const source = readSource('readiness/buildDecisionReadinessSnapshot.js');
  assert.equal(source.includes('localStorage'), false);
  assert.equal(source.includes('saveHistory'), false);
  assert.equal(source.includes('sessionStorage'), false);
  assert.equal(source.includes('writeFile'), false);
});

test('R-17: snapshot determinístico — mesmas entradas produzem o mesmo JSON', () => {
  const observation = buildObservation();
  const decision = decisionFixture();
  const context = { isDev: true, environment: 'development' };
  const first = buildReadiness({ observation, decision, context });
  const second = buildReadiness({ observation, decision, context });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('R-18: capabilities recomendadas/elegíveis vêm das fontes certas — recomenda union e elegível só da Activation', () => {
  const decisions = [
    buildActiveDecision('QUESTION_GUIDANCE'),
    buildActiveDecision('CLARIFICATION_GUIDANCE'),
    buildShadowDecision('RESPONSE_STYLE_GUIDANCE'),
  ];
  const observation = buildObservation({ decisions, shadow: true });
  const snapshot = buildReadiness({ observation, activationDecisions: decisions });
  assert.deepEqual(snapshot.recommendedCapabilities, [
    'CLARIFICATION_GUIDANCE',
    'QUESTION_GUIDANCE',
    'RESPONSE_LENGTH_GUIDANCE',
    'RESPONSE_STYLE_GUIDANCE',
  ]);
  assert.deepEqual(snapshot.eligibleCapabilities, [
    'CLARIFICATION_GUIDANCE',
    'QUESTION_GUIDANCE',
    'RESPONSE_STYLE_GUIDANCE',
  ]);
  assert.deepEqual(snapshot.activationReadiness.status, 'ACTIVE');
});

test('R-19: Shadow Mode permanece ativo — shadowMode true por padrão e por contexto', () => {
  const snapshot = buildReadiness();
  assert.equal(snapshot.shadowMode, true);
  const fromContext = buildReadiness({ context: { isDev: true, shadowMode: true, environment: 'development' } });
  assert.equal(fromContext.shadowMode, true);
  assert.ok(fromContext.diagnostics.some((item) => item.code === 'SHADOW_MODE'));
});

test('R-20: Activation Engine não é contornada — readiness só LÊ decisões de ativação existentes', () => {
  const source = readSource('readiness/buildDecisionReadinessSnapshot.js');
  assert.equal(source.includes('runActivationEngine'), false);
  assert.equal(source.includes('runDecisionLayer'), false);
  assert.equal(source.includes('runUniEngineIntegration'), false);

  // Capacidade bloqueada pela Activation (BLOCKED_BY_FLAG) nunca é elegível,
  // mesmo com eligible true no registro — a decisão de ativação manda.
  const blockedDecisions = [
    buildActiveDecision('QUESTION_GUIDANCE', { activationStatus: 'BLOCKED_BY_FLAG', eligible: false, applied: false }),
  ];
  const observation = buildObservation({ decisions: blockedDecisions });
  const snapshot = buildReadiness({ observation, activationDecisions: blockedDecisions });
  assert.equal(snapshot.eligibleCapabilities.includes('QUESTION_GUIDANCE'), false);
  assert.ok(snapshot.blockedCapabilities.some((entry) => entry.capability === 'QUESTION_GUIDANCE'));
  assert.equal(snapshot.activationReadiness.status, 'BLOCKED');
});

test('R-21: deriveActivationReadiness cobre todos os estados de prontidão', () => {
  assert.equal(deriveActivationReadiness([]).status, 'NOT_EVALUATED');
  assert.equal(deriveActivationReadiness([
    { activationStatus: 'ACTIVE_TEST' },
  ]).status, 'ACTIVE');
  assert.equal(deriveActivationReadiness([
    { activationStatus: 'ELIGIBLE' },
  ]).status, 'READY');
  assert.equal(deriveActivationReadiness([
    { activationStatus: 'ELIGIBLE' },
    { activationStatus: 'BLOCKED_BY_FLAG' },
  ]).status, 'PARTIAL');
  assert.equal(deriveActivationReadiness([
    { activationStatus: 'SHADOW_ONLY' },
  ]).status, 'SHADOW_ONLY');
  assert.equal(deriveActivationReadiness([
    { activationStatus: 'BLOCKED_BY_POLICY' },
  ]).status, 'BLOCKED');
});

test('R-22: mapDecisionToNextStep e clamp01 normalizam corretamente', () => {
  assert.equal(mapDecisionToNextStep('ANSWER'), 'RESPOND');
  assert.equal(mapDecisionToNextStep('ASK'), 'ASK_FOR_MISSING_INFORMATION');
  assert.equal(mapDecisionToNextStep('CONFIRM'), 'REQUEST_CONFIRMATION');
  assert.equal(mapDecisionToNextStep('UNKNOWN'), 'EVALUATE_CONTEXT');
  assert.equal(mapDecisionToNextStep('NAO_EXISTE'), 'EVALUATE_CONTEXT');
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01('x'), 0);
});

test('R-23: contratos — empty snapshot válido e createReadinessSnapshot congela tudo', () => {
  const empty = createEmptyReadinessSnapshot({ shadowMode: true });
  const emptyValidation = validateReadinessSnapshot(empty);
  assert.equal(emptyValidation.valid, true, emptyValidation.errors?.join(','));
  assert.equal(empty.legacyPreserved, true);
  assert.equal(empty.applied, false);
  assert.equal(empty.shadowMode, true);
  assert.equal(isReadinessSnapshotSerializable(empty), true);

  const built = createReadinessSnapshot({
    decisionAvailable: true,
    decisionStatus: 'ASK',
    recommendedCapabilities: ['QUESTION_GUIDANCE', 'CLARIFICATION_GUIDANCE'],
    eligibleCapabilities: ['QUESTION_GUIDANCE'],
    blockedCapabilities: [{ capability: 'FINANCIAL_EXECUTION', reason: 'FORBIDDEN_CAPABILITY' }],
    confidence: 0.9,
    confidenceBand: 'very_high',
    risk: 'LOW',
    activationReadiness: { status: 'READY', activeCount: 0, eligibleCount: 1, shadowCount: 0, blockedCount: 0, errorCount: 0, decisionsCount: 1 },
    circuitBreakerStatus: { open: false, openCapabilities: [] },
    recommendedNextStep: 'ASK_FOR_MISSING_INFORMATION',
    metadata: { sources: ['observation'] },
  });
  assert.equal(Object.isFrozen(built), true);
  assert.equal(built.applied, false);
  assert.equal(built.legacyPreserved, true);
  assert.deepEqual(built.recommendedCapabilities, ['CLARIFICATION_GUIDANCE', 'QUESTION_GUIDANCE']);
});

test('R-24: diagnóstico redigido — códigos fechados e sem dados sensíveis', () => {
  const diagnostics = buildReadinessDiagnostics({
    decisionAvailable: true,
    recommendedCount: 1,
    eligibleCount: 1,
    blockedCount: 1,
    activationReadiness: { status: 'PARTIAL' },
    circuitOpen: true,
    shadowMode: true,
    legacyPreserved: true,
    applied: false,
  });
  assert.ok(diagnostics.length > 0);
  assert.equal(diagnostics[0].module, 'readiness');
  assert.equal(diagnostics[0].observational, true);
  assert.ok(diagnostics.some((item) => item.code === 'CIRCUIT_OPEN'));
  assert.ok(diagnostics.some((item) => item.code === 'ACTIVATION_PARTIAL'));
  assert.ok(diagnostics.some((item) => item.code === 'SHADOW_MODE'));
  assert.ok(diagnostics.some((item) => item.code === 'LEGACY_PRESERVED'));
  assert.equal(JSON.stringify(diagnostics).includes(EXPENSE_ACCOUNT_QUESTION), false);

  const invalid = createReadinessDiagnostic({ code: 'NAO_EXISTE', severity: 'LOUD' });
  assert.equal(invalid.code, 'UNKNOWN');
  assert.equal(invalid.severity, 'INFO');
  assert.equal(invalid.module, 'readiness');
});

test('R-25: observacionais podem aparecer como recomendadas — e nada mais além delas', () => {
  const decisions = [
    buildActiveDecision('QUESTION_GUIDANCE'),
    buildActiveDecision('CATEGORY_SUGGESTION'),
    buildActiveDecision('GOAL_SUGGESTION'),
  ];
  const observation = buildObservation({ decisions });
  const snapshot = buildReadiness({ observation, activationDecisions: decisions });
  for (const capability of snapshot.recommendedCapabilities) {
    assert.ok(isObservationalCapability(capability), `${capability} deve ser observacional`);
  }
  for (const capability of snapshot.eligibleCapabilities) {
    assert.ok(isObservationalCapability(capability), `${capability} deve ser observacional`);
  }
  assert.equal(snapshot.eligibleCapabilities.includes('CATEGORY_SUGGESTION'), false);
  assert.equal(snapshot.eligibleCapabilities.includes('GOAL_SUGGESTION'), false);
  assert.ok(OBSERVATIONAL_CAPABILITIES.includes('QUESTION_GUIDANCE'));
});
