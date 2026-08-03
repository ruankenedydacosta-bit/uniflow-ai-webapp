// Uni Engine — Estabilização da Parte 2 (Bloco 5).
//
// Testes de AUDITORIA do pipeline observacional como uma CADEIA única:
// integration (Parte 1) → guidance (Bloco 2) → observation (Blocos 3/4).
// Não adicionam funcionalidades — apenas validam contratos, refs,
// serialização, deepFreeze, determinismo, deduplicação, fail-safe e shadow
// mode através das três camadas, com o mesmo fluxo usado por UniChatPage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineIntegration } from '../integration/runUniEngineIntegration.js';
import { validateIntegrationResult } from '../integration/integrationContracts.js';
import {
  legacyClarification,
  buildEngineResult,
  buildActiveDecision,
  buildIntegrationConfig,
  EXPENSE_ACCOUNT_QUESTION,
  AMOUNT_QUESTION,
} from '../integration/testFixtures.js';
import { buildGuidanceSnapshot } from '../guidance/buildGuidanceSnapshot.js';
import { validateGuidanceSnapshot } from '../guidance/guidanceContracts.js';
import { buildObservationSnapshot } from './buildObservationSnapshot.js';
import {
  validateObservationSnapshot,
  validateObservationInput,
} from './observationValidators.js';
import { OBSERVATION_VERSION } from './observationContracts.js';
import { isSerializableValue, findFunctionsInValue } from '../uniEngineContracts.js';

const FIXED_TIMESTAMP = '2026-08-02T12:00:00.000Z';

function engineWith({ missingFields = ['amount'], decisions = [], shadow = false } = {}) {
  return buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    comparison: { missingFields, agreementMetrics: { divergenceCount: 0 } },
    activation: { enabled: true, shadowMode: shadow, environment: 'development', decisions },
  });
}

function buildChain({ shadow = false, decisions = ['QUESTION_GUIDANCE', 'CLARIFICATION_GUIDANCE'] } = {}) {
  const legacy = legacyClarification();
  const config = buildIntegrationConfig(shadow
    ? { VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'true' }
    : { VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false' });
  const engineResult = engineWith({ shadow, decisions: decisions.map((cap) => buildActiveDecision(cap)) });
  const integrationSnapshot = runUniEngineIntegration({
    config,
    legacy,
    engineResult,
    context: { isDev: true, confidence: 0.9, risk: 'LOW', dataSufficient: true },
  });
  const guidanceSnapshot = buildGuidanceSnapshot({
    legacy,
    engineResult,
    context: { isDev: true },
  });
  const observationSnapshot = buildObservationSnapshot({
    integrationSnapshot,
    guidanceSnapshot,
    activationSnapshot: engineResult.activation,
    context: { isDev: true, environment: 'development', timestamp: FIXED_TIMESTAMP },
  });
  return { legacy, integrationSnapshot, guidanceSnapshot, observationSnapshot };
}

test('B5-1: cadeia de contratos — integration/guidance/observation são todos válidos e coerentes entre si', () => {
  const { integrationSnapshot, guidanceSnapshot, observationSnapshot } = buildChain();
  const integrationValidation = validateIntegrationResult(integrationSnapshot);
  assert.equal(integrationValidation.valid, true, integrationValidation.errors?.join(','));
  const guidanceValidation = validateGuidanceSnapshot(guidanceSnapshot);
  assert.equal(guidanceValidation.valid, true, guidanceValidation.errors?.join(','));
  const observationValidation = validateObservationSnapshot(observationSnapshot);
  assert.equal(observationValidation.valid, true, observationValidation.errors?.join(','));

  assert.equal(observationSnapshot.version, OBSERVATION_VERSION);
  assert.equal(observationSnapshot.mode, 'observational');
  assert.equal(observationSnapshot.legacyPreserved, true);
  assert.equal(observationSnapshot.integrationSnapshot.status, integrationSnapshot.status);
  assert.deepEqual(
    observationSnapshot.guidanceSnapshot.capabilitiesComputed,
    guidanceSnapshot.capabilitiesComputed,
  );
  assert.ok(observationSnapshot.capabilities.includes('QUESTION_GUIDANCE'));
  assert.ok(observationSnapshot.capabilities.includes('CLARIFICATION_GUIDANCE'));
  assert.ok(observationSnapshot.metadata.sources.includes('integration'));
  assert.ok(observationSnapshot.metadata.sources.includes('guidance'));
  assert.ok(observationSnapshot.metadata.sources.includes('activation'));
});

test('B5-2: shadow mode na cadeia — integração em shadow não aplica e o consolidado reflete shadowMode', () => {
  const { integrationSnapshot, observationSnapshot } = buildChain({ shadow: true });
  assert.equal(integrationSnapshot.applied, false);
  assert.equal(integrationSnapshot.legacyPreserved, true);
  assert.equal(observationSnapshot.shadowMode, true);
  assert.ok(observationSnapshot.diagnostics.some((item) => item.code === 'SHADOW_MODE'));
  assert.ok(observationSnapshot.diagnostics.some((item) => item.code === 'INTEGRATION_SHADOW'));
});

test('B5-3: modo ativo na cadeia — integração aplica somente orientações autorizadas e coerentes', () => {
  const { integrationSnapshot, observationSnapshot } = buildChain({ shadow: false });
  assert.equal(integrationSnapshot.applied, true);
  assert.ok(integrationSnapshot.capabilitiesRequested.includes('QUESTION_GUIDANCE'));
  assert.ok(integrationSnapshot.capabilitiesRequested.includes('CLARIFICATION_GUIDANCE'));
  assert.ok(integrationSnapshot.capabilitiesApplied.includes('QUESTION_GUIDANCE'));
  // CLARIFICATION_GUIDANCE é requisitada mas NÃO aplicada: o fixture não tem
  // ambiguidade no legado (clarificationKey null) — coerente com a política.
  assert.ok(!integrationSnapshot.capabilitiesApplied.includes('CLARIFICATION_GUIDANCE'));
  assert.equal(observationSnapshot.shadowMode, false);
  assert.ok(observationSnapshot.diagnostics.some((item) => item.code === 'INTEGRATION_APPLIED'));
});

test('B5-4: determinismo na cadeia — guidance e observation são idênticos para a mesma integração', () => {
  // A integração mede latencyMs via performance.now() — é intrinsecamente
  // não determinística. As camadas observacionais (guidance e observation),
  // que são a garantia de determinismo da Parte 2, devem ser byte-idênticas
  // ao receberem a MESMA integração + mesmas entradas.
  const legacy = legacyClarification();
  const engineResult = engineWith({
    decisions: [buildActiveDecision('QUESTION_GUIDANCE')],
  });
  const integrationSnapshot = runUniEngineIntegration({
    config: buildIntegrationConfig({ VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'true' }),
    legacy,
    engineResult,
    context: { isDev: true, confidence: 0.9, risk: 'LOW', dataSufficient: true },
  });
  const context = { isDev: true, environment: 'development', timestamp: FIXED_TIMESTAMP };
  const buildPair = () => ({
    guidance: buildGuidanceSnapshot({ legacy, engineResult, context: { isDev: true } }),
    observation: buildObservationSnapshot({
      integrationSnapshot,
      guidanceSnapshot: buildGuidanceSnapshot({ legacy, engineResult, context: { isDev: true } }),
      activationSnapshot: engineResult.activation,
      context,
    }),
  });
  const first = buildPair();
  const second = buildPair();
  assert.equal(JSON.stringify(first.guidance), JSON.stringify(second.guidance));
  assert.equal(JSON.stringify(first.observation), JSON.stringify(second.observation));
  assert.equal(first.observation.timestamps.recordedAt, FIXED_TIMESTAMP);
});

test('B5-5: nenhum texto legado vaza na cadeia — sem finalText/suggestedText/text em nenhuma camada', () => {
  const { legacy, integrationSnapshot, guidanceSnapshot, observationSnapshot } = buildChain();
  assert.equal(JSON.stringify(integrationSnapshot).includes(legacy.text), false);
  assert.equal(JSON.stringify(guidanceSnapshot).includes(legacy.text), false);
  assert.equal(JSON.stringify(observationSnapshot).includes(legacy.text), false);
  assert.equal(JSON.stringify(observationSnapshot).includes(EXPENSE_ACCOUNT_QUESTION), false);
  assert.equal(JSON.stringify(observationSnapshot).includes(AMOUNT_QUESTION), false);
  assert.equal('finalText' in observationSnapshot.integrationSnapshot, false);
  assert.equal('legacyResult' in observationSnapshot.integrationSnapshot, false);
  assert.equal('suggestedText' in observationSnapshot.guidanceSnapshot.questionGuidance, false);
  assert.equal(JSON.stringify(observationSnapshot).includes('R$'), false);
});

test('B5-6: serialização e deepFreeze na cadeia — consolidado é 100% serializável e congelado', () => {
  const { observationSnapshot } = buildChain();
  assert.equal(isSerializableValue(observationSnapshot), true);
  assert.equal(findFunctionsInValue(observationSnapshot).length, 0);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(observationSnapshot)));
  assert.equal(Object.isFrozen(observationSnapshot), true);
  assert.equal(Object.isFrozen(observationSnapshot.integrationSnapshot), true);
  assert.equal(Object.isFrozen(observationSnapshot.guidanceSnapshot), true);
  assert.equal(Object.isFrozen(observationSnapshot.activationSnapshot), true);
  assert.equal(Object.isFrozen(observationSnapshot.diagnostics), true);
  assert.equal(Object.isFrozen(observationSnapshot.metadata), true);
  assert.equal(Object.isFrozen(observationSnapshot.timestamps), true);
  assert.throws(() => { observationSnapshot.capabilities.push('X'); }, TypeError);
});

test('B5-7: deduplicação de capabilities na cadeia — decisões repetidas não duplicam capacidades', () => {
  const { observationSnapshot } = buildChain({ decisions: ['QUESTION_GUIDANCE', 'QUESTION_GUIDANCE'] });
  assert.equal(observationSnapshot.capabilities.filter((cap) => cap === 'QUESTION_GUIDANCE').length, 1);
  assert.deepEqual(observationSnapshot.capabilities, [...observationSnapshot.capabilities].sort());
});

test('B5-8: fail-safe em cadeia — sub-snapshot ausente/indevido não lança e o consolidado permanece válido', () => {
  const guidanceSnapshot = buildGuidanceSnapshot({
    legacy: legacyClarification(),
    engineResult: { decisionLayer: { get decisionType() { throw new Error('boom'); } } },
    context: { isDev: true },
  });
  assert.equal(guidanceSnapshot.capabilitiesComputed.length, 0);
  const observationSnapshot = buildObservationSnapshot({
    guidanceSnapshot,
    context: { isDev: true },
  });
  assert.equal(observationSnapshot.integrationSnapshot, null);
  assert.ok(observationSnapshot.diagnostics.some((item) => item.code === 'INTEGRATION_EMPTY'));
  assert.ok(observationSnapshot.diagnostics.some((item) => item.code === 'GUIDANCE_EMPTY'));
  const validation = validateObservationSnapshot(observationSnapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));

  const inputValidation = validateObservationInput({ integrationSnapshot: 42 });
  assert.equal(inputValidation.valid, false);
  assert.ok(inputValidation.errors.includes('INTEGRATION_SNAPSHOT_INVALID'));
});

test('B5-9: observação nunca executa nem altera a resposta na cadeia — apenas consolida', () => {
  const { integrationSnapshot, observationSnapshot } = buildChain({ shadow: false });
  assert.equal(integrationSnapshot.legacyPreserved, true);
  assert.equal(observationSnapshot.legacyPreserved, true);
  assert.equal('text' in observationSnapshot, false);
  assert.equal('finalText' in observationSnapshot, false);
  assert.equal('executed' in observationSnapshot, false);
  assert.equal('memoryWritten' in observationSnapshot, false);
  assert.equal('databaseCalled' in observationSnapshot, false);
});
