// Uni Engine — Observação da conversa (Parte 2, Bloco 3).
//
// A camada observacional consolida os snapshots da integração, do guidance e
// da activation em UM estado TÉCNICO serializável e congelado. Nunca altera
// resposta, nunca aplica, nunca persiste e nunca registra dados sensíveis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGuidanceSnapshot } from '../guidance/buildGuidanceSnapshot.js';
import { runUniEngineIntegration } from '../integration/runUniEngineIntegration.js';
import {
  legacyClarification,
  buildEngineResult,
  buildActiveDecision,
  buildShadowDecision,
  buildIntegrationConfig,
  EXPENSE_ACCOUNT_QUESTION,
  AMOUNT_QUESTION,
} from '../integration/testFixtures.js';
import { buildObservationSnapshot } from './buildObservationSnapshot.js';
import {
  createObservationSnapshot,
  createEmptyObservationSnapshot,
  isObservationSnapshotSerializable,
  sanitizeActivationSnapshot,
  sanitizeGuidanceSnapshot,
  sanitizeIntegrationSnapshot,
  OBSERVATION_VERSION,
} from './observationContracts.js';
import {
  validateObservationSnapshot,
  validateObservationInput,
  isSafeEmbeddableSnapshot,
} from './observationValidators.js';
import {
  buildObservationDiagnostics,
  createObservationDiagnostic,
} from './observationDiagnostics.js';

const FIXED_TIMESTAMP = '2026-08-02T12:00:00.000Z';

function engineWith({ missingFields = ['amount'], decisions = [] } = {}) {
  return buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    comparison: { missingFields, agreementMetrics: { divergenceCount: 0 } },
    activation: { enabled: true, shadowMode: false, environment: 'development', decisions },
  });
}

function buildIntegrationSnapshot(decisions) {
  return runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: engineWith({ decisions }),
    context: { isDev: true, confidence: 0.9, risk: 'LOW', dataSufficient: true },
  });
}

function buildGuidanceSnapshotFixture() {
  return buildGuidanceSnapshot({
    legacy: legacyClarification(),
    engineResult: engineWith(),
    context: { isDev: true },
  });
}

function buildActivationSnapshotFixture() {
  return {
    enabled: true,
    shadowMode: false,
    environment: 'development',
    decisions: [
      buildActiveDecision('QUESTION_GUIDANCE'),
      buildActiveDecision('CLARIFICATION_GUIDANCE'),
      buildShadowDecision('RESPONSE_STYLE_GUIDANCE'),
    ],
  };
}

function buildObservationFixture() {
  return buildObservationSnapshot({
    integrationSnapshot: buildIntegrationSnapshot([
      buildActiveDecision('QUESTION_GUIDANCE'),
      buildActiveDecision('CLARIFICATION_GUIDANCE'),
    ]),
    guidanceSnapshot: buildGuidanceSnapshotFixture(),
    activationSnapshot: buildActivationSnapshotFixture(),
    context: { isDev: true, environment: 'development', timestamp: FIXED_TIMESTAMP },
  });
}

test('B3-1: buildObservationSnapshot consolida os 3 sub-snapshots em um estado técnico válido', () => {
  const snapshot = buildObservationFixture();
  assert.equal(snapshot.version, OBSERVATION_VERSION);
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.shadowMode, false);
  assert.equal(snapshot.serializable, true);
  assert.notEqual(snapshot.integrationSnapshot, null);
  assert.notEqual(snapshot.guidanceSnapshot, null);
  assert.notEqual(snapshot.activationSnapshot, null);
  assert.equal(snapshot.integrationSnapshot.applied, true);
  assert.equal(snapshot.guidanceSnapshot.capabilitiesComputed.length, 4);
  assert.equal(snapshot.activationSnapshot.decisionsCount, 3);
  assert.ok(Array.isArray(snapshot.capabilities));
  assert.ok(snapshot.capabilities.includes('QUESTION_GUIDANCE'));
  assert.ok(snapshot.capabilities.includes('RESPONSE_STYLE_GUIDANCE'));
  const validation = validateObservationSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
  assert.equal(isObservationSnapshotSerializable(snapshot), true);
});

test('B3-2: todo objeto do snapshot está congelado (Object.freeze) em profundidade', () => {
  const snapshot = buildObservationFixture();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.integrationSnapshot), true);
  assert.equal(Object.isFrozen(snapshot.guidanceSnapshot), true);
  assert.equal(Object.isFrozen(snapshot.activationSnapshot), true);
  assert.equal(Object.isFrozen(snapshot.activationSnapshot.decisions), true);
  assert.equal(Object.isFrozen(snapshot.activationSnapshot.decisions[0]), true);
  assert.equal(Object.isFrozen(snapshot.diagnostics), true);
  assert.equal(Object.isFrozen(snapshot.diagnostics[0]), true);
  assert.equal(Object.isFrozen(snapshot.timestamps), true);
  assert.equal(Object.isFrozen(snapshot.metadata), true);
  assert.throws(() => { snapshot.capabilities.push('X'); }, TypeError);
});

test('B3-3: o snapshot nunca contém texto legado nem dados sensíveis', () => {
  const snapshot = buildObservationFixture();
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes(EXPENSE_ACCOUNT_QUESTION), false);
  assert.equal(serialized.includes(AMOUNT_QUESTION), false);
  assert.equal('finalText' in snapshot.integrationSnapshot, false);
  assert.equal('legacyResult' in snapshot.integrationSnapshot, false);
  assert.equal('suggestedText' in snapshot.integrationSnapshot.questionGuidance, false);
  assert.equal('suggestedText' in snapshot.guidanceSnapshot.questionGuidance, false);
});

test('B3-4: capabilities são a união deduplicada e ordenada dos três snapshots', () => {
  const snapshot = buildObservationSnapshot({
    integrationSnapshot: buildIntegrationSnapshot([
      buildActiveDecision('QUESTION_GUIDANCE'),
      buildActiveDecision('QUESTION_GUIDANCE'),
    ]),
    guidanceSnapshot: buildGuidanceSnapshotFixture(),
    activationSnapshot: {
      decisions: [
        buildActiveDecision('QUESTION_GUIDANCE'),
        buildShadowDecision('RESPONSE_STYLE_GUIDANCE'),
      ],
    },
    context: { isDev: true },
  });
  const expected = [...snapshot.capabilities].sort();
  assert.deepEqual(snapshot.capabilities, expected);
  assert.equal(snapshot.capabilities.filter((cap) => cap === 'QUESTION_GUIDANCE').length, 1);
});

test('B3-5: determinismo — mesmas entradas produzem o mesmo JSON', () => {
  const inputs = {
    integrationSnapshot: buildIntegrationSnapshot([
      buildActiveDecision('QUESTION_GUIDANCE'),
      buildActiveDecision('CLARIFICATION_GUIDANCE'),
    ]),
    guidanceSnapshot: buildGuidanceSnapshotFixture(),
    activationSnapshot: buildActivationSnapshotFixture(),
  };
  const context = { isDev: true, environment: 'development', timestamp: FIXED_TIMESTAMP };
  const first = buildObservationSnapshot({ ...inputs, context });
  const second = buildObservationSnapshot({ ...inputs, context });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.timestamps.recordedAt, FIXED_TIMESTAMP);
  assert.equal(typeof first.timestamps.integrationLatencyMs, 'number');
});

test('B3-6: shadowMode é derivado do contexto, da integração ou da activation', () => {
  const active = buildObservationSnapshot({
    integrationSnapshot: buildIntegrationSnapshot([
      buildActiveDecision('QUESTION_GUIDANCE'),
    ]),
    guidanceSnapshot: buildGuidanceSnapshotFixture(),
    activationSnapshot: buildActivationSnapshotFixture(),
    context: { isDev: true },
  });
  assert.equal(active.shadowMode, false);

  const fromContext = buildObservationSnapshot({
    integrationSnapshot: buildIntegrationSnapshot([buildActiveDecision('QUESTION_GUIDANCE')]),
    guidanceSnapshot: buildGuidanceSnapshotFixture(),
    activationSnapshot: buildActivationSnapshotFixture(),
    context: { isDev: true, shadowMode: true },
  });
  assert.equal(fromContext.shadowMode, true);
  assert.ok(fromContext.diagnostics.some((item) => item.code === 'SHADOW_MODE'));

  const fromActivation = buildObservationSnapshot({
    guidanceSnapshot: buildGuidanceSnapshotFixture(),
    activationSnapshot: { enabled: true, shadowMode: true, decisions: [] },
    context: { isDev: true },
  });
  assert.equal(fromActivation.shadowMode, true);
});

test('B3-7: buildObservationDiagnostics produz diagnóstico redigido por fonte', () => {
  const integrationSnapshot = sanitizeIntegrationSnapshot(
    buildIntegrationSnapshot([buildActiveDecision('QUESTION_GUIDANCE')]),
  );
  const diagnostics = buildObservationDiagnostics({
    integrationSnapshot,
    guidanceSnapshot: sanitizeGuidanceSnapshot(buildGuidanceSnapshotFixture()),
    activationSnapshot: sanitizeActivationSnapshot(buildActivationSnapshotFixture()),
    shadowMode: false,
    legacyPreserved: true,
  });
  assert.ok(diagnostics.length > 0);
  assert.equal(diagnostics[0].module, 'observation');
  assert.equal(diagnostics[0].observational, true);
  assert.ok(diagnostics.some((item) => item.code === 'INTEGRATION_APPLIED'));
  assert.ok(diagnostics.some((item) => item.code === 'GUIDANCE_COMPUTED'));
  assert.ok(diagnostics.some((item) => item.code === 'ACTIVATION_ACTIVE'));
  assert.ok(diagnostics.some((item) => item.code === 'LEGACY_PRESERVED'));
  assert.equal(JSON.stringify(diagnostics).includes(EXPENSE_ACCOUNT_QUESTION), false);
});

test('B3-8: createObservationDiagnostic valida código/severidade e limita metadados', () => {
  const diagnostic = createObservationDiagnostic({
    code: 'INTEGRATION_APPLIED',
    severity: 'INFO',
    capability: 'STYLE',
    reason: 'guidance_applied',
    metadata: { applied: ['QUESTION_GUIDANCE'], texto: EXPENSE_ACCOUNT_QUESTION },
  });
  assert.equal(diagnostic.module, 'observation');
  assert.equal('texto' in diagnostic.metadata, false);
  assert.equal(JSON.stringify(diagnostic).includes(EXPENSE_ACCOUNT_QUESTION), false);

  const unknown = createObservationDiagnostic({ code: 'NAO_EXISTE', severity: 'LOUD' });
  assert.equal(unknown.code, 'UNKNOWN');
  assert.equal(unknown.severity, 'INFO');
});

test('B3-9: sanitizeActivationSnapshot normaliza decisões em agregados técnicos', () => {
  const sanitized = sanitizeActivationSnapshot([
    buildActiveDecision('QUESTION_GUIDANCE'),
    buildShadowDecision('RESPONSE_STYLE_GUIDANCE'),
    buildActiveDecision('RESPONSE_LENGTH_GUIDANCE', { activationStatus: 'BLOCKED_BY_FLAG', applied: false }),
  ]);
  assert.equal(sanitized.decisionsCount, 3);
  assert.equal(sanitized.activeCount, 1);
  assert.equal(sanitized.shadowCount, 1);
  assert.equal(sanitized.blockedCount, 1);
  assert.deepEqual(sanitized.capabilities, [
    'QUESTION_GUIDANCE',
    'RESPONSE_LENGTH_GUIDANCE',
    'RESPONSE_STYLE_GUIDANCE',
  ]);
  assert.equal('rolloutBucket' in sanitized.decisions[0], false);
  assert.equal('appliedEffect' in sanitized.decisions[0], false);
});

test('B3-10: referências circulares e funções são neutralizadas sem quebrar o contrato', () => {
  const circular = { status: 'active' };
  circular.self = circular;
  const snapshot = createObservationSnapshot({
    integrationSnapshot: circular,
    guidanceSnapshot: { capabilitiesComputed: [], fn: () => {} },
  });
  assert.equal(snapshot.integrationSnapshot.status, 'active');
  assert.equal('self' in snapshot.integrationSnapshot, false);
  assert.equal('fn' in snapshot.guidanceSnapshot, false);
  const validation = validateObservationSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test('B3-11: entrada inválida retorna snapshot vazio seguro (falha segura)', () => {
  const empty = buildObservationSnapshot({
    integrationSnapshot: 42,
    guidanceSnapshot: 'not-an-object',
    context: { isDev: true },
  });
  assert.equal(empty.version, OBSERVATION_VERSION);
  assert.equal(empty.mode, 'observational');
  assert.equal(empty.legacyPreserved, true);
  assert.equal(empty.integrationSnapshot, null);
  assert.equal(empty.guidanceSnapshot, null);
  assert.equal(empty.capabilities.length, 0);
  const validation = validateObservationSnapshot(empty);
  assert.equal(validation.valid, true, validation.errors?.join(','));
});

test('B3-12: sub-snapshot com função é rejeitado como inseguro antes de embedar', () => {
  const unsafe = { status: 'active', fn: () => {} };
  assert.equal(isSafeEmbeddableSnapshot(unsafe), false);
  const inputValidation = validateObservationInput({ integrationSnapshot: unsafe });
  assert.equal(inputValidation.valid, false);
  assert.ok(inputValidation.errors.includes('INTEGRATION_SNAPSHOT_UNSAFE'));
});

test('B3-13: createEmptyObservationSnapshot é válido e nunca quebra contrato', () => {
  const snapshot = createEmptyObservationSnapshot({ shadowMode: true });
  const validation = validateObservationSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.shadowMode, true);
  assert.equal(isObservationSnapshotSerializable(snapshot), true);
});

test('B3-14: o snapshot nunca altera a resposta — nenhuma função, nenhum texto final', () => {
  const snapshot = buildObservationFixture();
  assert.equal('finalText' in snapshot, false);
  assert.equal('text' in snapshot, false);
  assert.equal(findFunctionsInValue(snapshot).length, 0);
});

function findFunctionsInValue(value, path = '', found = []) {
  if (value === null || typeof value !== 'object') return found;
  if (typeof value === 'function') {
    found.push(path || '(root)');
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findFunctionsInValue(item, `${path}[${index}]`, found));
  } else {
    Object.entries(value).forEach(([key, item]) => {
      findFunctionsInValue(item, path ? `${path}.${key}` : key, found);
    });
  }
  return found;
}
