// Uni Engine — Capability Activation Readiness (Parte 4, Bloco 1).
//
// A camada determina, de forma observacional, quais capabilities poderiam
// ser ativadas no futuro a partir das decisões de Activation JÁ produzidas —
// sem nunca ativar nada, sem alterar resposta, sem persistir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCapabilityReadinessSnapshot } from './buildCapabilityReadinessSnapshot.js';
import {
  createEmptyCapabilityReadinessSnapshot,
  createCapabilityReadinessSnapshot,
  validateCapabilityReadinessSnapshot,
  isCapabilityReadinessSnapshotSerializable,
} from './capabilityReadinessContracts.js';
import {
  buildCapabilityReadinessDiagnostics,
  createCapabilityReadinessDiagnostic,
} from './buildCapabilityReadinessDiagnostics.js';
import {
  CAPABILITY_READINESS_VERSION,
  FORBIDDEN_CAPABILITIES,
  isForbiddenCapability,
  isActivationCandidate,
} from './capabilityReadinessTypes.js';
import {
  CAPABILITY_DEPENDENCIES,
  selectNextRecommendedCapability,
  getCapabilityDependencies,
  getKnownCapabilities,
} from './capabilityReadinessPolicy.js';
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

function buildCapabilityReadiness({ observation = buildObservation(), decisionReadinessSnapshot, activationDecisions, context } = {}) {
  return buildCapabilityReadinessSnapshot({
    observationSnapshot: observation,
    decisionReadinessSnapshot: decisionReadinessSnapshot ?? { version: '1.0', mode: 'observational' },
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

test('CR-1: prontidão é construída a partir do observation com decisão de Activation existente', () => {
  const snapshot = buildCapabilityReadiness();
  assert.equal(snapshot.version, CAPABILITY_READINESS_VERSION);
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.applied, false);
  assert.equal(snapshot.enabled, true);
  assert.ok(snapshot.eligibleCapabilities.includes('QUESTION_GUIDANCE'));
  assert.ok(snapshot.blockedCapabilities.some((entry) => entry.capability === 'CLARIFICATION_GUIDANCE'));
  const validation = validateCapabilityReadinessSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
});

test('CR-2: resultado serializável — round-trip JSON, sem funções, sem Map/Set', () => {
  const snapshot = buildCapabilityReadiness();
  const json = JSON.stringify(snapshot);
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(isCapabilityReadinessSnapshotSerializable(snapshot), true);
  assert.equal(findFunctionsInValue(snapshot).length, 0);
});

test('CR-3: resultado imutável — Object.freeze em profundidade', () => {
  const snapshot = buildCapabilityReadiness();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.eligibleCapabilities), true);
  assert.equal(Object.isFrozen(snapshot.blockedCapabilities), true);
  assert.equal(Object.isFrozen(snapshot.missingDependencies), true);
  assert.equal(Object.isFrozen(snapshot.summary), true);
  assert.equal(Object.isFrozen(snapshot.metadata), true);
  assert.throws(() => { snapshot.eligibleCapabilities.push('X'); }, TypeError);
});

test('CR-4: decision readiness ausente não quebra — observation é a fonte principal', () => {
  const snapshot = buildCapabilityReadinessSnapshot({
    observationSnapshot: buildObservation(),
    context: { isDev: true, environment: 'development' },
  });
  assert.equal(snapshot.enabled, true);
  assert.ok(snapshot.evaluatedCapabilities.length > 0);
  const validation = validateCapabilityReadinessSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
});

test('CR-5: erro interno gera fallback seguro — snapshot vazio válido e sem exceção', () => {
  const poison = {
    get activationSnapshot() { throw new Error('boom'); },
  };
  const snapshot = buildCapabilityReadinessSnapshot({
    observationSnapshot: poison,
    decisionReadinessSnapshot: { version: '1.0' },
    context: { isDev: true },
  });
  assert.equal(snapshot.enabled, false);
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.applied, false);
  assert.deepEqual(snapshot.eligibleCapabilities, []);
  const validation = validateCapabilityReadinessSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
});

test('CR-6: capabilities proibidas permanecem sempre bloqueadas — jamais elegíveis', () => {
  const decisions = FORBIDDEN_CAPABILITIES.map((capability) => buildActiveDecision(capability));
  const observation = buildObservation({ decisions });
  const snapshot = buildCapabilityReadiness({ observation, activationDecisions: decisions });
  for (const capability of FORBIDDEN_CAPABILITIES) {
    assert.ok(isForbiddenCapability(capability), `${capability} deve estar na lista de proibidas`);
    assert.equal(snapshot.eligibleCapabilities.includes(capability), false);
    const entry = snapshot.blockedCapabilities.find((item) => item.capability === capability);
    assert.ok(entry, `${capability} deve estar em blockedCapabilities`);
    assert.equal(entry.reason, 'FORBIDDEN_CAPABILITY');
  }
});

test('CR-7: dependência faltante bloqueia com DEPENDENCY_MISSING e lista as dependências', () => {
  // RESPONSE_LENGTH_GUIDANCE depende de RESPONSE_STYLE_GUIDANCE, que não foi
  // avaliada → a capability fica bloqueada por dependência faltante.
  const decisions = [buildActiveDecision('RESPONSE_LENGTH_GUIDANCE')];
  const observation = buildObservation({ decisions });
  const snapshot = buildCapabilityReadiness({ observation, activationDecisions: decisions });
  const entry = snapshot.blockedCapabilities.find((item) => item.capability === 'RESPONSE_LENGTH_GUIDANCE');
  assert.ok(entry, 'RESPONSE_LENGTH_GUIDANCE deve estar bloqueada');
  assert.equal(entry.reason, 'DEPENDENCY_MISSING');
  const missing = snapshot.missingDependencies.find((item) => item.capability === 'RESPONSE_LENGTH_GUIDANCE');
  assert.ok(missing, 'deve existir entrada em missingDependencies');
  assert.ok(missing.dependencies.includes('RESPONSE_STYLE_GUIDANCE'));
});

test('CR-8: dependência satisfeita permite elegibilidade', () => {
  // RESPONSE_STYLE_GUIDANCE elegível → RESPONSE_LENGTH_GUIDANCE também.
  const decisions = [
    buildActiveDecision('RESPONSE_STYLE_GUIDANCE'),
    buildActiveDecision('RESPONSE_LENGTH_GUIDANCE'),
  ];
  const observation = buildObservation({ decisions });
  const snapshot = buildCapabilityReadiness({ observation, activationDecisions: decisions });
  assert.ok(snapshot.eligibleCapabilities.includes('RESPONSE_STYLE_GUIDANCE'));
  assert.ok(snapshot.eligibleCapabilities.includes('RESPONSE_LENGTH_GUIDANCE'));
  assert.equal(
    snapshot.blockedCapabilities.some((item) => item.capability === 'RESPONSE_LENGTH_GUIDANCE'),
    false,
  );
});

test('CR-9: próxima capability recomendada é única, determinística e de maior prioridade', () => {
  const snapshot = buildCapabilityReadiness();
  assert.equal(snapshot.nextRecommendedCapability, 'QUESTION_GUIDANCE');
  const picked = selectNextRecommendedCapability(['CLARIFICATION_GUIDANCE', 'QUESTION_GUIDANCE']);
  assert.equal(picked, 'QUESTION_GUIDANCE');
  assert.equal(selectNextRecommendedCapability([]), null);
});

test('CR-10: nada é ativado — applied false, legacyPreserved true, sem campo de aplicação', () => {
  const snapshot = buildCapabilityReadiness();
  assert.equal(snapshot.applied, false);
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal('appliedCapabilities' in snapshot, false);
  assert.equal('executed' in snapshot, false);
  assert.ok(snapshot.diagnostics.some((item) => item.code === 'NOTHING_APPLIED'));
});

test('CR-11: resposta legada preservada — nenhum texto no snapshot', () => {
  const observation = buildObservation();
  const snapshot = buildCapabilityReadiness({ observation });
  const json = JSON.stringify(snapshot);
  assert.equal(json.includes(EXPENSE_ACCOUNT_QUESTION), false);
  assert.equal('text' in snapshot, false);
  assert.equal('finalText' in snapshot, false);
  assert.equal('suggestedText' in snapshot, false);
  assert.equal(json.includes('R$'), false);
  assert.equal(snapshot.legacyPreserved, true);
});

test('CR-12: Pending Action intacta — a camada não lê nem altera pendências', () => {
  const snapshot = buildCapabilityReadiness();
  assert.equal('pendingAction' in snapshot, false);
  const source = readSource('capability-readiness/buildCapabilityReadinessSnapshot.js');
  assert.equal(source.includes('pendingAction'), false);
  assert.equal(source.includes('setPendingAction'), false);
  assert.equal(source.includes('savePendingAction'), false);
});

test('CR-13: nenhuma escrita de memória — nenhum campo nem import de memória', () => {
  const snapshot = buildCapabilityReadiness();
  assert.equal('memoryWrite' in snapshot, false);
  const source = readSource('capability-readiness/buildCapabilityReadinessSnapshot.js');
  assert.equal(source.includes('memoryAdapter'), false);
  assert.equal(source.includes('operationalMemory'), false);
  assert.equal(source.includes('writeMemory'), false);
});

test('CR-14: nenhuma execução financeira, banco, RPC ou TTS', () => {
  const snapshot = buildCapabilityReadiness();
  assert.equal('financialExecution' in snapshot, false);
  const source = readSource('capability-readiness/buildCapabilityReadinessSnapshot.js');
  assert.equal(source.includes('.rpc('), false);
  assert.equal(source.includes('supabase'), false);
  assert.equal(source.includes('executeConfirmedFinancialAction'), false);
  assert.equal(source.includes('uniVoice'), false);
  assert.equal(source.includes('speak('), false);
  assert.equal(source.includes('TTS'), false);
});

test('CR-15: nenhuma persistência — nada em localStorage, banco ou arquivo', () => {
  const snapshot = buildCapabilityReadiness();
  assert.equal('persisted' in snapshot, false);
  const source = readSource('capability-readiness/buildCapabilityReadinessSnapshot.js');
  assert.equal(source.includes('localStorage'), false);
  assert.equal(source.includes('sessionStorage'), false);
  assert.equal(source.includes('writeFile'), false);
  assert.equal(source.includes('saveHistory'), false);
});

test('CR-16: snapshot determinístico — mesmas entradas produzem o mesmo JSON', () => {
  const observation = buildObservation();
  const context = { isDev: true, environment: 'development' };
  const first = buildCapabilityReadinessSnapshot({ observationSnapshot: observation, context });
  const second = buildCapabilityReadinessSnapshot({ observationSnapshot: observation, context });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('CR-17: Shadow Mode permanece ativo — shadowMode true por padrão', () => {
  const snapshot = buildCapabilityReadiness();
  assert.equal(snapshot.shadowMode, true);
  assert.ok(snapshot.diagnostics.some((item) => item.code === 'SHADOW_MODE'));
});

test('CR-18: Activation Engine NÃO é re-executada — somente leitura das decisões existentes', () => {
  const source = readSource('capability-readiness/buildCapabilityReadinessSnapshot.js');
  assert.equal(source.includes('runActivationEngine'), false);
  assert.equal(source.includes('runDecisionLayer'), false);
  assert.equal(source.includes('runUniEngineIntegration'), false);
  assert.equal(source.includes('buildGuidanceSnapshot'), false);
});

test('CR-19: diagnóstico redigido — códigos fechados e sem dados sensíveis', () => {
  const diagnostic = createCapabilityReadinessDiagnostic({
    code: 'CAPABILITIES_ELIGIBLE',
    severity: 'INFO',
    reason: 'ok',
    source: 'activation',
    metadata: { count: 3 },
  });
  assert.equal(diagnostic.module, 'capability-readiness');
  assert.equal(diagnostic.observational, true);
  const diagnostics = buildCapabilityReadinessDiagnostics({ eligibleCount: 2 });
  assert.ok(diagnostics.every((item) => item.code !== 'UNKNOWN'));
  assert.ok(diagnostics.every((item) => item.metadata && typeof item.metadata === 'object'));
});

test('CR-20: somente capabilities candidatas aparecem como elegíveis — nunca proibidas/desconhecidas', () => {
  const snapshot = buildCapabilityReadiness();
  for (const capability of snapshot.eligibleCapabilities) {
    assert.ok(isActivationCandidate(capability), `${capability} deve ser candidata à ativação`);
    assert.equal(isForbiddenCapability(capability), false);
  }
});

test('CR-21: todas as capabilities conhecidas são avaliadas e determinísticas', () => {
  const snapshot = buildCapabilityReadiness();
  const known = getKnownCapabilities();
  assert.ok(snapshot.evaluatedCapabilities.length >= known.length);
  assert.equal(new Set(snapshot.evaluatedCapabilities).size, snapshot.evaluatedCapabilities.length);
});

test('CR-22: contratos — empty snapshot válido e createCapabilityReadinessSnapshot congela tudo', () => {
  const empty = createEmptyCapabilityReadinessSnapshot({ shadowMode: true });
  const validation = validateCapabilityReadinessSnapshot(empty);
  assert.equal(validation.valid, true, validation.errors?.join(','));
  assert.equal(empty.nextRecommendedCapability, null);
  const built = createCapabilityReadinessSnapshot({
    eligibleCapabilities: ['QUESTION_GUIDANCE', 'CLARIFICATION_GUIDANCE', 'QUESTION_GUIDANCE'],
    blockedCapabilities: [{ capability: 'FINANCIAL_EXECUTION', reason: 'FORBIDDEN_CAPABILITY' }],
    missingDependencies: [{ capability: 'RESPONSE_LENGTH_GUIDANCE', dependencies: ['RESPONSE_STYLE_GUIDANCE'] }],
    nextRecommendedCapability: 'QUESTION_GUIDANCE',
    metadata: { sources: ['observation'], environment: 'development' },
  });
  assert.deepEqual(built.eligibleCapabilities, ['CLARIFICATION_GUIDANCE', 'QUESTION_GUIDANCE']);
  assert.equal(Object.isFrozen(built), true);
  assert.equal(built.legacyPreserved, true);
  assert.equal(built.applied, false);
  assert.equal(built.serializable, true);
  assert.equal(built.summary.eligibleCount, 2);
});

test('CR-23: getKnownCapabilities retorna lista determinística sem UNKNOWN', () => {
  const known = getKnownCapabilities();
  assert.equal(known.includes('UNKNOWN'), false);
  assert.deepEqual(known, getKnownCapabilities());
});

test('CR-24: dependências são fechadas e nunca referenciais a serviços externos', () => {
  for (const capability of Object.keys(CAPABILITY_DEPENDENCIES)) {
    const deps = getCapabilityDependencies(capability);
    for (const dep of deps) {
      assert.ok(
        getKnownCapabilities().includes(dep),
        `${capability} depende de ${dep}, que não é uma capability conhecida`,
      );
    }
  }
});

test('CR-25: shadow decision mantém a capability elegível (SHADOW_ONLY é futuro-aplicável)', () => {
  const decisions = [buildShadowDecision('RESPONSE_STYLE_GUIDANCE')];
  const observation = buildObservation({ decisions, shadow: true });
  const snapshot = buildCapabilityReadiness({ observation, activationDecisions: decisions });
  assert.ok(snapshot.eligibleCapabilities.includes('RESPONSE_STYLE_GUIDANCE'));
  assert.equal(snapshot.shadowMode, true);
});
