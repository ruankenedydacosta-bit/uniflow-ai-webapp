// Uni Engine — Execution Readiness (Parte 4, Bloco 2).
//
// A camada avalia, de forma observacional, se uma FUTURA execução seria
// segura — sem nunca executar nada. Como FINANCIAL_EXECUTION é proibida
// nesta fase, executionAvailable permanece false sempre (fail-safe absoluto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildExecutionReadinessSnapshot } from './buildExecutionReadinessSnapshot.js';
import {
  createEmptyExecutionReadinessSnapshot,
  createExecutionReadinessSnapshot,
  validateExecutionReadinessSnapshot,
  isExecutionReadinessSnapshotSerializable,
} from './executionReadinessContracts.js';
import {
  buildExecutionReadinessDiagnostics,
  createExecutionReadinessDiagnostic,
} from './buildExecutionReadinessDiagnostics.js';
import {
  EXECUTION_READINESS_VERSION,
  EXECUTION_CAPABILITY,
  EXECUTION_RECOMMENDATIONS,
  isExecutionCapabilityAllowed,
} from './executionReadinessTypes.js';
import {
  getRequiredCapabilities,
  deriveExecutionRecommendation,
  EXECUTION_READINESS_POLICY,
} from './executionReadinessPolicy.js';
import { findFunctionsInValue } from '../uniEngineContracts.js';

function readinessFixture() {
  return {
    version: '1.0',
    mode: 'observational',
    enabled: true,
    shadowMode: true,
    decisionAvailable: true,
    decisionStatus: 'ANSWER',
    confidence: 0.9,
    confidenceBand: 'high',
    risk: 'LOW',
    missingInformation: [],
    circuitBreakerStatus: { open: false, openCapabilities: [] },
    metadata: { dataSufficient: true },
  };
}

function capabilityReadinessFixture() {
  return {
    version: '1.0',
    mode: 'observational',
    enabled: true,
    shadowMode: true,
    eligibleCapabilities: ['QUESTION_GUIDANCE'],
    blockedCapabilities: [],
    nextRecommendedCapability: 'QUESTION_GUIDANCE',
    metadata: {},
  };
}

function observationFixture() {
  return {
    version: '1.0',
    mode: 'observational',
    enabled: true,
    serializable: true,
    shadowMode: true,
    metadata: { dataSufficient: true },
    integrationSnapshot: { dataSufficient: true },
    activationSnapshot: { circuitOpen: false },
  };
}

function buildExecutionReadiness({
  observation = observationFixture(),
  decisionReadiness = readinessFixture(),
  capabilityReadiness = capabilityReadinessFixture(),
  context,
} = {}) {
  return buildExecutionReadinessSnapshot({
    observationSnapshot: observation,
    decisionReadinessSnapshot: decisionReadiness,
    capabilityReadinessSnapshot: capabilityReadiness,
    context: context ?? { isDev: true, environment: 'development' },
  });
}

function readSource(file) {
  return readFileSync(
    fileURLToPath(new URL(`../${file}`, import.meta.url)),
    'utf8',
  );
}

test('ER-1: snapshot é construído com o contrato completo de execução', () => {
  const snapshot = buildExecutionReadiness();
  assert.equal(snapshot.version, EXECUTION_READINESS_VERSION);
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.applied, false);
  assert.equal(typeof snapshot.executionAvailable, 'boolean');
  assert.ok(Array.isArray(snapshot.executionBlockedReasons));
  assert.equal(typeof snapshot.executionConfidence, 'number');
  assert.ok(Array.isArray(snapshot.requiredCapabilities));
  assert.ok(Array.isArray(snapshot.missingRequirements));
  assert.equal(typeof snapshot.executionRisk, 'string');
  assert.ok(EXECUTION_RECOMMENDATIONS.includes(snapshot.executionRecommendation));
  const validation = validateExecutionReadinessSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
});

test('ER-2: FINANCIAL_EXECUTION é proibida nesta fase — executionAvailable é sempre false', () => {
  assert.equal(isExecutionCapabilityAllowed(), false);
  const snapshot = buildExecutionReadiness();
  assert.equal(snapshot.executionAvailable, false);
  assert.ok(snapshot.executionBlockedReasons.includes('FORBIDDEN_CAPABILITY'));
  assert.ok(snapshot.requiredCapabilities.includes(EXECUTION_CAPABILITY));
  assert.deepEqual(snapshot.requiredCapabilities, getRequiredCapabilities());
});

test('ER-3: resultado serializável — round-trip JSON, sem funções', () => {
  const snapshot = buildExecutionReadiness();
  const json = JSON.stringify(snapshot);
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(isExecutionReadinessSnapshotSerializable(snapshot), true);
  assert.equal(findFunctionsInValue(snapshot).length, 0);
});

test('ER-4: resultado imutável — Object.freeze em profundidade', () => {
  const snapshot = buildExecutionReadiness();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.executionBlockedReasons), true);
  assert.equal(Object.isFrozen(snapshot.requiredCapabilities), true);
  assert.equal(Object.isFrozen(snapshot.missingRequirements), true);
  assert.equal(Object.isFrozen(snapshot.diagnostics), true);
  assert.equal(Object.isFrozen(snapshot.metadata), true);
  assert.throws(() => { snapshot.executionBlockedReasons.push('X'); }, TypeError);
});

test('ER-5: erro interno gera fallback seguro — snapshot vazio válido', () => {
  const poison = {
    get decisionStatus() { throw new Error('boom'); },
  };
  const snapshot = buildExecutionReadinessSnapshot({
    observationSnapshot: observationFixture(),
    decisionReadinessSnapshot: poison,
    capabilityReadinessSnapshot: capabilityReadinessFixture(),
    context: { isDev: true },
  });
  assert.equal(snapshot.enabled, false);
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.executionAvailable, false);
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.applied, false);
  assert.deepEqual(snapshot.executionBlockedReasons, []);
  const validation = validateExecutionReadinessSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
});

test('ER-6: confiança normalizada — clamp 0..1 e reflete a decisão', () => {
  const snapshot = buildExecutionReadiness({
    decisionReadiness: { ...readinessFixture(), confidence: 5 },
  });
  assert.equal(snapshot.executionConfidence, 1);
  const low = buildExecutionReadiness({
    decisionReadiness: { ...readinessFixture(), confidence: -2, decisionAvailable: true },
  });
  assert.equal(low.executionConfidence, 0);
  const none = buildExecutionReadiness({
    decisionReadiness: { ...readinessFixture(), decisionAvailable: false },
  });
  assert.equal(none.executionConfidence, 0);
});

test('ER-7: requisitos faltantes aparecem em missingRequirements e bloqueiam', () => {
  const snapshot = buildExecutionReadiness({
    decisionReadiness: {
      ...readinessFixture(),
      missingInformation: ['account', 'amount', 'amount'],
    },
  });
  assert.ok(snapshot.missingRequirements.includes('account'));
  assert.ok(snapshot.missingRequirements.includes('amount'));
  assert.ok(snapshot.executionBlockedReasons.includes('MISSING_REQUIREMENTS'));
});

test('ER-8: risco alto/baixo refletido e bloqueio HIGH_RISK', () => {
  const high = buildExecutionReadiness({
    decisionReadiness: { ...readinessFixture(), risk: 'CRITICAL' },
  });
  assert.equal(high.executionRisk, 'CRITICAL');
  assert.ok(high.executionBlockedReasons.includes('HIGH_RISK'));
  const low = buildExecutionReadiness();
  assert.equal(low.executionRisk, 'LOW');
  assert.equal(low.executionBlockedReasons.includes('HIGH_RISK'), false);
});

test('ER-9: circuit breaker aberto bloqueia execução', () => {
  const snapshot = buildExecutionReadiness({
    decisionReadiness: {
      ...readinessFixture(),
      circuitBreakerStatus: { open: true, openCapabilities: ['FINANCIAL_EXECUTION'] },
    },
  });
  assert.ok(snapshot.executionBlockedReasons.includes('CIRCUIT_BREAKER_OPEN'));
});

test('ER-10: decisão não executável bloqueia com DECISION_NOT_EXECUTABLE', () => {
  const snapshot = buildExecutionReadiness({
    decisionReadiness: { ...readinessFixture(), decisionStatus: 'ASK' },
  });
  assert.ok(snapshot.executionBlockedReasons.includes('DECISION_NOT_EXECUTABLE'));
});

test('ER-11: dados insuficientes bloqueiam com DATA_INSUFFICIENT', () => {
  const observation = {
    ...observationFixture(),
    metadata: { dataSufficient: false },
    integrationSnapshot: { dataSufficient: false },
  };
  const snapshot = buildExecutionReadiness({ observation });
  assert.ok(snapshot.executionBlockedReasons.includes('DATA_INSUFFICIENT'));
});

test('ER-12: nada é executado — applied false, legacyPreserved true', () => {
  const snapshot = buildExecutionReadiness();
  assert.equal(snapshot.applied, false);
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal('executed' in snapshot, false);
  assert.equal('executionTriggered' in snapshot, false);
  assert.equal('result' in snapshot, false);
  assert.ok(snapshot.diagnostics.some((item) => item.code === 'NOTHING_APPLIED'));
});

test('ER-13: resposta legada preservada — nenhum texto no snapshot', () => {
  const snapshot = buildExecutionReadiness();
  const json = JSON.stringify(snapshot);
  assert.equal('text' in snapshot, false);
  assert.equal('finalText' in snapshot, false);
  assert.equal('suggestedText' in snapshot, false);
  assert.equal(json.includes('R$'), false);
  assert.equal(snapshot.legacyPreserved, true);
});

test('ER-14: Pending Action intacta — a camada não lê nem altera pendências', () => {
  const snapshot = buildExecutionReadiness();
  assert.equal('pendingAction' in snapshot, false);
  const source = readSource('execution-readiness/buildExecutionReadinessSnapshot.js');
  assert.equal(source.includes('pendingAction'), false);
  assert.equal(source.includes('setPendingAction'), false);
  assert.equal(source.includes('savePendingAction'), false);
});

test('ER-15: nenhuma escrita de memória — nenhum campo nem import de memória', () => {
  const snapshot = buildExecutionReadiness();
  assert.equal('memoryWrite' in snapshot, false);
  const source = readSource('execution-readiness/buildExecutionReadinessSnapshot.js');
  assert.equal(source.includes('memoryAdapter'), false);
  assert.equal(source.includes('operationalMemory'), false);
  assert.equal(source.includes('writeMemory'), false);
});

test('ER-16: nenhuma execução financeira, banco, RPC ou TTS', () => {
  const snapshot = buildExecutionReadiness();
  assert.equal('financialExecution' in snapshot, false);
  const source = readSource('execution-readiness/buildExecutionReadinessSnapshot.js');
  assert.equal(source.includes('.rpc('), false);
  assert.equal(source.includes('supabase'), false);
  assert.equal(source.includes('executeConfirmedFinancialAction'), false);
  assert.equal(source.includes('uniVoice'), false);
  assert.equal(source.includes('speak('), false);
  assert.equal(source.includes('TTS'), false);
});

test('ER-17: nenhuma persistência — nada em localStorage, banco ou arquivo', () => {
  const snapshot = buildExecutionReadiness();
  assert.equal('persisted' in snapshot, false);
  const source = readSource('execution-readiness/buildExecutionReadinessSnapshot.js');
  assert.equal(source.includes('localStorage'), false);
  assert.equal(source.includes('sessionStorage'), false);
  assert.equal(source.includes('writeFile'), false);
  assert.equal(source.includes('saveHistory'), false);
});

test('ER-18: snapshot determinístico — mesmas entradas produzem o mesmo JSON', () => {
  const context = { isDev: true, environment: 'development' };
  const first = buildExecutionReadiness({ context });
  const second = buildExecutionReadiness({ context });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('ER-19: Shadow Mode permanece ativo — shadowMode true por padrão', () => {
  const snapshot = buildExecutionReadiness();
  assert.equal(snapshot.shadowMode, true);
  assert.ok(snapshot.diagnostics.some((item) => item.code === 'SHADOW_MODE'));
});

test('ER-20: Activation Engine e Decision Layer NÃO são re-executadas', () => {
  const source = readSource('execution-readiness/buildExecutionReadinessSnapshot.js');
  assert.equal(source.includes('runActivationEngine'), false);
  assert.equal(source.includes('runDecisionLayer'), false);
  assert.equal(source.includes('runUniEngineIntegration'), false);
  assert.equal(source.includes('buildGuidanceSnapshot'), false);
});

test('ER-21: diagnóstico redigido — códigos fechados e sem dados sensíveis', () => {
  const diagnostic = createExecutionReadinessDiagnostic({
    code: 'EXECUTION_AVAILABLE',
    severity: 'INFO',
    reason: 'ok',
    source: 'execution-readiness',
    metadata: { count: 1 },
  });
  assert.equal(diagnostic.module, 'execution-readiness');
  assert.equal(diagnostic.observational, true);
  const diagnostics = buildExecutionReadinessDiagnostics({ executionAvailable: false });
  assert.ok(diagnostics.every((item) => item.code !== 'UNKNOWN'));
});

test('ER-22: contratos — empty snapshot válido e createExecutionReadinessSnapshot congela tudo', () => {
  const empty = createEmptyExecutionReadinessSnapshot({ shadowMode: true });
  const validation = validateExecutionReadinessSnapshot(empty);
  assert.equal(validation.valid, true, validation.errors?.join(','));
  assert.equal(empty.executionAvailable, false);
  assert.equal(empty.executionRecommendation, 'OBSERVE_ONLY');
  const built = createExecutionReadinessSnapshot({
    executionAvailable: false,
    executionBlockedReasons: ['FORBIDDEN_CAPABILITY', 'FORBIDDEN_CAPABILITY', 'HIGH_RISK'],
    executionConfidence: 0.9,
    requiredCapabilities: ['FINANCIAL_EXECUTION'],
    missingRequirements: ['account'],
    executionRisk: 'LOW',
    executionRecommendation: 'OBSERVE_ONLY',
    metadata: { sources: ['observation'] },
  });
  assert.deepEqual(built.executionBlockedReasons, ['FORBIDDEN_CAPABILITY', 'HIGH_RISK']);
  assert.equal(Object.isFrozen(built), true);
  assert.equal(built.legacyPreserved, true);
  assert.equal(built.applied, false);
  assert.equal(built.serializable, true);
});

test('ER-23: deriveExecutionRecommendation cobre os cenários fechados', () => {
  assert.equal(deriveExecutionRecommendation({ executionAvailable: true, executionRisk: 'NONE', executionConfidence: 0.9 }), 'EXECUTE');
  assert.equal(deriveExecutionRecommendation({ executionAvailable: true, executionRisk: 'MEDIUM', executionConfidence: 0.9 }), 'REQUIRE_CONFIRMATION');
  assert.equal(deriveExecutionRecommendation({ executionAvailable: true, executionRisk: 'NONE', executionConfidence: 0.5 }), 'REQUIRE_CONFIRMATION');
  assert.equal(deriveExecutionRecommendation({ executionAvailable: true, executionRisk: 'HIGH', executionConfidence: 0.9 }), 'BLOCK_EXECUTION');
  assert.equal(deriveExecutionRecommendation({ hasBlockedReasons: true, highRisk: true }), 'BLOCK_EXECUTION');
  assert.equal(deriveExecutionRecommendation({ hasBlockedReasons: true, missingRequirements: true }), 'GATHER_INFORMATION');
  assert.equal(deriveExecutionRecommendation({ hasBlockedReasons: true, decisionNotExecutable: true }), 'DEFER');
  assert.equal(deriveExecutionRecommendation({ hasBlockedReasons: true }), 'OBSERVE_ONLY');
});

test('ER-24: safeExecutionConfidence é o limiar documentado na política', () => {
  assert.equal(EXECUTION_READINESS_POLICY.safeExecutionConfidence, 0.7);
});

test('ER-25: contagem de razões e métricas são consistentes com os campos', () => {
  const snapshot = buildExecutionReadiness();
  assert.equal(snapshot.metadata.blockedReasonCount, snapshot.executionBlockedReasons.length);
  assert.equal(snapshot.metadata.requiredCapabilityCount, snapshot.requiredCapabilities.length);
  assert.equal(snapshot.metadata.missingRequirementCount, snapshot.missingRequirements.length);
});
