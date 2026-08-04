// Uni Engine — Cognitive Pipeline (Fase 14, Bloco 1): testes.
//
// Cobre o snapshot cognitivo consolidado do turno: as 12 camadas em ordem
// fixa, derivação de presença/execução/desabilitação/erros por camada,
// rollback derivado de flags, resumo, segurança (influenceApplied false,
// legacyPreserved true, serializável, congelado) e falha segura (nunca lança,
// nunca reexecuta camada alguma).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCognitivePipelineSnapshot,
  createEmptyCognitivePipelineSnapshot,
  createCognitivePipelineSnapshot,
  validateCognitivePipelineSnapshot,
  COGNITIVE_PIPELINE_VERSION,
  COGNITIVE_PIPELINE_LAYERS,
  COGNITIVE_ROLLBACK_STATUSES,
} from './index.js';

function baseConfig(overrides = {}) {
  return {
    enabled: true,
    shadowMode: true,
    telemetryEnabled: false,
    epistemicEnabled: true,
    epistemicShadowMode: true,
    integrationEnabled: true,
    conversationRoutingEnabled: true,
    cognitiveOrchestratorEnabled: true,
    rolloutEnabled: true,
    ...overrides,
  };
}

function baseGateway(overrides = {}) {
  return {
    accepted: true,
    fallbackUsed: false,
    diagnostics: { errorCode: null, integrationDisabled: false },
    ...overrides,
  };
}

function fullInputs(overrides = {}) {
  return {
    turnId: 'turn-1',
    messageId: 'turn-1',
    config: baseConfig(),
    gateway: baseGateway(),
    observation: { serializable: true, errorCode: null },
    epistemic: { enabled: true, errorCode: null },
    decisionReadiness: { errorCode: null },
    capabilityReadiness: { errorCode: null },
    executionReadiness: { errorCode: null },
    conversationPlan: { nextStep: 'NEXT_STEP_ANSWER' },
    conversationRoute: { selectedRoute: 'ROUTE_ANSWER' },
    orchestrator: { orchestratorStatus: 'ORCHESTRATED' },
    contextBridge: { influenceAllowed: false, errorCode: null },
    comparison: { agreementStatus: 'agreement' },
    divergences: [],
    timestamp: '2026-08-03T00:00:00.000Z',
    latencyMs: 12.345,
    ...overrides,
  };
}

test('PIPE-1: versão 1.0 com as 12 camadas em ordem fixa de execução', () => {
  assert.equal(COGNITIVE_PIPELINE_VERSION, '1.0');
  assert.deepEqual(COGNITIVE_PIPELINE_LAYERS, [
    'gateway',
    'observation',
    'epistemic',
    'decision-readiness',
    'capability-readiness',
    'execution-readiness',
    'conversation-plan',
    'conversation-route',
    'cognitive-orchestrator',
    'context-bridge',
    'cognitive-comparison',
    'divergence-diagnostics',
  ]);
});

test('PIPE-2: snapshot completo do turno — presenças, execuções, resumo e status', () => {
  const snapshot = buildCognitivePipelineSnapshot(fullInputs());
  assert.equal(snapshot.turnId, 'turn-1');
  assert.equal(snapshot.messageId, 'turn-1');
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.summary.layersPresent, 12);
  assert.equal(snapshot.summary.layersExecuted, 12);
  assert.equal(snapshot.summary.layersDisabled, 0);
  assert.equal(snapshot.summary.layersWithErrors, 0);
  assert.equal(snapshot.summary.agreementStatus, 'agreement');
  assert.equal(snapshot.rollbackStatus, 'shadow_active');
  assert.equal(snapshot.latencyMs, 12.35);
});

test('PIPE-3: influenceApplied false, applied false e legacyPreserved true em QUALQUER estado', () => {
  for (const overrides of [
    {},
    { config: baseConfig({ enabled: false }) },
    { gateway: baseGateway({ fallbackUsed: true }) },
  ]) {
    const snapshot = buildCognitivePipelineSnapshot(fullInputs(overrides));
    assert.equal(snapshot.influenceApplied, false);
    assert.equal(snapshot.applied, false);
    assert.equal(snapshot.legacyPreserved, true);
  }
});

test('PIPE-4: motor desligado → rollback engine_disabled e gateway desabilitado', () => {
  const snapshot = buildCognitivePipelineSnapshot(
    fullInputs({
      config: baseConfig({ enabled: false }),
      gateway: baseGateway({ accepted: false, fallbackUsed: true }),
    }),
  );
  assert.equal(snapshot.rollbackStatus, 'engine_disabled');
  assert.equal(snapshot.layers.gateway.disabled, true);
  assert.equal(snapshot.layers.gateway.executed, false);
});

test('PIPE-5: fallback do gateway → rollback gateway_fallback', () => {
  const snapshot = buildCognitivePipelineSnapshot(
    fullInputs({ gateway: baseGateway({ fallbackUsed: true }) }),
  );
  assert.equal(snapshot.rollbackStatus, 'gateway_fallback');
});

test('PIPE-6: orquestrador desligado → rollback orchestrator_skipped e camada desabilitada', () => {
  const snapshot = buildCognitivePipelineSnapshot(
    fullInputs({ config: baseConfig({ cognitiveOrchestratorEnabled: false }) }),
  );
  assert.equal(snapshot.rollbackStatus, 'orchestrator_skipped');
  assert.equal(snapshot.layers['cognitive-orchestrator'].disabled, true);
});

test('PIPE-7: routing desligado → rollback routing_skipped e camada desabilitada', () => {
  const snapshot = buildCognitivePipelineSnapshot(
    fullInputs({ config: baseConfig({ conversationRoutingEnabled: false }) }),
  );
  assert.equal(snapshot.rollbackStatus, 'routing_skipped');
  assert.equal(snapshot.layers['conversation-route'].disabled, true);
});

test('PIPE-8: comparação skipped → rollback engine_active (sombra permanece ativa)', () => {
  const snapshot = buildCognitivePipelineSnapshot(
    fullInputs({ comparison: { agreementStatus: 'skipped' } }),
  );
  assert.equal(snapshot.rollbackStatus, 'engine_active');
});

test('PIPE-9: integração desligada no gateway → rollback integration_fallback', () => {
  const snapshot = buildCognitivePipelineSnapshot(
    fullInputs({ gateway: baseGateway({ diagnostics: { integrationDisabled: true } }) }),
  );
  assert.equal(snapshot.rollbackStatus, 'integration_fallback');
});

test('PIPE-10: divergências alimentam o resumo', () => {
  const snapshot = buildCognitivePipelineSnapshot(
    fullInputs({
      divergences: [
        { type: 'intent_mismatch', severity: 'high', reason: 'INTENT_MISMATCH' },
      ],
    }),
  );
  assert.equal(snapshot.summary.divergenceCount, 1);
  assert.equal(snapshot.layers['divergence-diagnostics'].present, true);
  assert.equal(snapshot.layers['divergence-diagnostics'].executed, true);
});

test('PIPE-11: erros de camada são capturados no resumo (gateway sem accepted)', () => {
  const snapshot = buildCognitivePipelineSnapshot(
    fullInputs({ gateway: baseGateway({ accepted: false }) }),
  );
  assert.equal(snapshot.layers.gateway.executed, false);
  assert.equal(snapshot.layers.gateway.present, true);
});

test('PIPE-12: camada epistêmica deriva de flag e modelo observado', () => {
  const on = buildCognitivePipelineSnapshot(fullInputs());
  assert.equal(on.layers.epistemic.present, true);
  assert.equal(on.layers.epistemic.executed, true);
  const off = buildCognitivePipelineSnapshot(
    fullInputs({ config: baseConfig({ epistemicEnabled: false }), epistemic: null }),
  );
  assert.equal(off.layers.epistemic.disabled, true);
  assert.equal(off.layers.epistemic.present, false);
});

test('PIPE-13: snapshot é serializável (JSON round-trip) e congelado em profundidade', () => {
  const snapshot = buildCognitivePipelineSnapshot(fullInputs());
  const clone = JSON.parse(JSON.stringify(snapshot));
  assert.deepEqual(clone, snapshot);
  assert.equal(validateCognitivePipelineSnapshot(snapshot).valid, true);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.layers));
  assert.ok(Object.isFrozen(snapshot.layers.gateway));
});

test('PIPE-14: falha interna → snapshot vazio falho-safe, nunca lança', () => {
  const poisonous = {
    get selectedRoute() {
      throw new Error('boom');
    },
  };
  let snapshot = null;
  assert.doesNotThrow(() => {
    snapshot = buildCognitivePipelineSnapshot(
      fullInputs({ conversationRoute: poisonous, comparison: null }),
    );
  });
  assert.equal(snapshot.turnId, 'turn-1');
  assert.equal(snapshot.summary.layersPresent, 0);
  assert.equal(snapshot.rollbackStatus, 'engine_disabled');
  assert.equal(snapshot.legacyPreserved, true);
});

test('PIPE-15: snapshot vazio via contrato — 12 camadas ausentes e rollback engine_disabled', () => {
  const empty = createEmptyCognitivePipelineSnapshot({ turnId: 't1', messageId: 't1' });
  assert.equal(empty.turnId, 't1');
  assert.equal(empty.summary.layersPresent, 0);
  assert.equal(empty.rollbackStatus, 'engine_disabled');
  for (const layer of COGNITIVE_PIPELINE_LAYERS) {
    assert.equal(empty.layers[layer].present, false);
    assert.equal(empty.layers[layer].errorCode, null);
  }
  assert.equal(validateCognitivePipelineSnapshot(empty).valid, true);
});

test('PIPE-16: contrato sanitiza camadas — booleans forçados e errorCode só string', () => {
  const snapshot = createCognitivePipelineSnapshot({
    turnId: 't1',
    layers: {
      gateway: { present: 'sim', executed: 1, errorCode: 42 },
      observation: { present: true, executed: true },
    },
    flags: { enabled: true },
  });
  assert.equal(snapshot.layers.gateway.present, true);
  assert.equal(snapshot.layers.gateway.executed, true);
  assert.equal(snapshot.layers.gateway.errorCode, null);
  assert.equal(snapshot.layers.observation.executed, true);
  assert.equal(snapshot.layers['conversation-plan'].present, false);
});

test('PIPE-17: validação rejeita influência aplicada e aplicação ativa', () => {
  const snapshot = buildCognitivePipelineSnapshot(fullInputs());
  assert.equal(validateCognitivePipelineSnapshot({ ...snapshot, influenceApplied: true }).valid, false);
  assert.equal(validateCognitivePipelineSnapshot({ ...snapshot, applied: true }).valid, false);
  assert.equal(validateCognitivePipelineSnapshot(null).valid, false);
});

test('PIPE-18: determinístico para a mesma entrada (timestamp fixo)', () => {
  const first = buildCognitivePipelineSnapshot(fullInputs());
  const second = buildCognitivePipelineSnapshot(fullInputs());
  assert.deepEqual(first, second);
});

test('PIPE-19: timestamp é normalizado para ISO quando numérico', () => {
  const snapshot = createCognitivePipelineSnapshot({
    turnId: 't1',
    layers: {},
    timestamp: 1722650400000,
  });
  assert.equal(snapshot.timestamp, new Date(1722650400000).toISOString());
  assert.equal(snapshot.latencyMs, null);
});

test('PIPE-20: flags do config aparecem normalizadas no snapshot', () => {
  const snapshot = buildCognitivePipelineSnapshot(fullInputs());
  assert.equal(snapshot.flags.enabled, true);
  assert.equal(snapshot.flags.shadowMode, true);
  assert.equal(snapshot.flags.telemetryEnabled, false);
  assert.equal(snapshot.flags.cognitiveOrchestratorEnabled, true);
  const allRollbackKnown = COGNITIVE_ROLLBACK_STATUSES.every(
    (status) => typeof status === 'string',
  );
  assert.equal(allRollbackKnown, true);
});

test('PIPE-21: camadas ausentes contam como não executadas, sem erros fantasma', () => {
  const snapshot = buildCognitivePipelineSnapshot(
    fullInputs({
      observation: null,
      conversationPlan: null,
      conversationRoute: null,
      orchestrator: null,
      contextBridge: null,
    }),
  );
  assert.equal(snapshot.layers.observation.present, false);
  assert.equal(snapshot.layers['conversation-plan'].executed, false);
  assert.equal(snapshot.layers['cognitive-orchestrator'].present, false);
  assert.equal(snapshot.summary.layersWithErrors, 0);
});

test('PIPE-22: flags ausentes do config são tratadas como false (nunca undefined)', () => {
  const snapshot = buildCognitivePipelineSnapshot(
    fullInputs({ config: { enabled: true } }),
  );
  assert.equal(snapshot.flags.integrationEnabled, false);
  assert.equal(snapshot.flags.rolloutEnabled, false);
});
