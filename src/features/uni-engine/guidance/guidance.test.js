// Uni Engine — Guidance observacional (Parte 2, Bloco 2).
//
// O módulo calcula as quatro guidances (Question, Clarification, Style,
// Length) como se estivessem ATIVAS, mas o snapshot é SOMENTE observacional:
// legacyPreserved sempre true, nada é aplicado, nada altera a resposta,
// nada persiste e nada registra dados sensíveis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeQuestionGuidance } from './computeQuestionGuidance.js';
import { computeClarificationGuidance } from './computeClarificationGuidance.js';
import { computeStyleGuidance } from './computeStyleGuidance.js';
import { computeLengthGuidance } from './computeLengthGuidance.js';
import { buildGuidanceSnapshot } from './buildGuidanceSnapshot.js';
import {
  buildGuidanceDiagnostics,
  createGuidanceDiagnostic,
} from './buildGuidanceDiagnostics.js';
import {
  createGuidanceSnapshot,
  createEmptyGuidanceSnapshot,
  validateGuidanceSnapshot,
  isGuidanceSnapshotSerializable,
} from './guidanceContracts.js';
import {
  legacyClarification,
  EXPENSE_ACCOUNT_QUESTION,
  AMOUNT_QUESTION,
} from '../integration/testFixtures.js';

function engineResultWith({ missingFields = [], ambiguities = [], decisionType = 'ask' } = {}) {
  return {
    engineVersion: '2.0',
    revision: '10.0',
    enabled: true,
    decisionLayer: { decisionType, nextDecisionType: decisionType, risk: 'LOW', confidence: 0.9 },
    classification: { primaryIntent: 'register_expense', ambiguities, confidence: 0.9 },
    comparison: { missingFields, agreementMetrics: { divergenceCount: 0 } },
  };
}

test('B2-1: computeQuestionGuidance calcula a guidance como se estivesse ativa, mas marcada observational', () => {
  const { guidance } = computeQuestionGuidance({
    legacy: legacyClarification(),
    suggested: { fieldsStillMissing: ['amount'] },
  });
  assert.equal(guidance.observational, true);
  assert.equal(guidance.questionKey, 'amount_required');
  assert.equal(guidance.suggestedText, AMOUNT_QUESTION);
  assert.equal(guidance.applied, true);
});

test('B2-2: computeQuestionGuidance fora de esclarecimento não sugere troca', () => {
  const { guidance } = computeQuestionGuidance({
    legacy: legacyClarification({ responseType: 'query', text: 'Seu saldo atual é R$ 1.000,00.' }),
    suggested: { fieldsStillMissing: ['amount'] },
  });
  assert.equal(guidance.applied, false);
  assert.equal(guidance.questionKey, null);
  assert.equal(guidance.reason, 'NOT_A_CLARIFICATION');
});

test('B2-3: computeClarificationGuidance seleciona pergunta curta objetiva e marca observational', () => {
  const { guidance } = computeClarificationGuidance({
    legacy: legacyClarification({
      text: 'Encontrei mais de uma conta parecida. Qual delas você quer usar?',
    }),
    suggested: { ambiguityType: 'account', optionsCount: 2 },
  });
  assert.equal(guidance.observational, true);
  assert.equal(guidance.clarificationKey, 'ambiguous_account');
  assert.equal(guidance.applied, true);
});

test('B2-4: computeStyleGuidance respeita preferência persistida e marca observational', () => {
  const { guidance } = computeStyleGuidance({
    legacy: legacyClarification({ conversationStyle: 'detailed' }),
    suggested: { styleKey: 'concise', toneBand: 'neutral' },
  });
  assert.equal(guidance.observational, true);
  assert.equal(guidance.styleKey, 'detailed');
  assert.equal(guidance.respectedPreference, true);
});

test('B2-5: computeLengthGuidance calcula a banda sem encurtar texto e marca observational', () => {
  const { guidance } = computeLengthGuidance({
    legacy: legacyClarification(),
    suggested: { lengthBand: 'short' },
  });
  assert.equal(guidance.observational, true);
  assert.equal(guidance.lengthBand, 'short');
});

test('B2-6: buildGuidanceSnapshot consolida as 4 guidances em snapshot serializável e observacional', () => {
  const snapshot = buildGuidanceSnapshot({
    legacy: legacyClarification(),
    engineResult: engineResultWith({ missingFields: ['amount'], ambiguities: [{ type: 'account' }] }),
    context: { isDev: true },
  });
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.serializable, true);
  assert.equal(snapshot.capabilitiesComputed.length, 4);
  assert.equal(snapshot.questionGuidance.observational, true);
  assert.equal(snapshot.clarificationGuidance.observational, true);
  assert.equal(snapshot.styleGuidance.observational, true);
  assert.equal(snapshot.lengthGuidance.observational, true);
  assert.ok(Array.isArray(snapshot.diagnostics));
  const validation = validateGuidanceSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
  assert.equal(isGuidanceSnapshotSerializable(snapshot), true);
});

test('B2-7: o snapshot nunca contém o texto legado nem valores sensíveis', () => {
  const snapshot = buildGuidanceSnapshot({
    legacy: legacyClarification(),
    engineResult: engineResultWith({ missingFields: ['amount'] }),
    context: { isDev: true },
  });
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes(EXPENSE_ACCOUNT_QUESTION), false);
  assert.equal(serialized.includes('R$'), false);
});

test('B2-8: nenhuma guidance altera a resposta -- snapshot é a única saída e não há finalText', () => {
  const snapshot = buildGuidanceSnapshot({
    legacy: legacyClarification(),
    engineResult: engineResultWith({ missingFields: ['amount'] }),
  });
  assert.equal('finalText' in snapshot, false);
  assert.equal('text' in snapshot, false);
});

test('B2-9: falha interna retorna snapshot vazio seguro (modo observacional, legacyPreserved)', () => {
  const snapshot = buildGuidanceSnapshot({
    legacy: legacyClarification(),
    engineResult: { decisionLayer: { get decisionType() { throw new Error('boom'); } } },
  });
  assert.equal(snapshot.version, '1.0');
  assert.equal(snapshot.mode, 'observational');
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.capabilitiesComputed.length, 0);
});

test('B2-10: buildGuidanceDiagnostics gera diagnóstico redigido por capacidade', () => {
  const question = computeQuestionGuidance({
    legacy: legacyClarification(),
    suggested: { fieldsStillMissing: ['amount'] },
  }).guidance;
  const diagnostics = buildGuidanceDiagnostics({
    guidances: { QUESTION_GUIDANCE: question },
  });
  assert.ok(diagnostics.length > 0);
  const first = diagnostics.find((item) => item.capability === 'QUESTION_GUIDANCE');
  assert.ok(first);
  assert.equal(first.module, 'guidance');
  assert.equal(first.observational, true);
  assert.equal(first.metadata.observational, true);
  assert.equal(JSON.stringify(first).includes(EXPENSE_ACCOUNT_QUESTION), false);
});

test('B2-11: createGuidanceDiagnostic valida código/severidade e limita metadados', () => {
  const diagnostic = createGuidanceDiagnostic({
    code: 'GUIDANCE_COMPUTED',
    severity: 'INFO',
    capability: 'STYLE',
    reason: 'computed',
    metadata: { styleKey: 'simple', applied: true, texto: EXPENSE_ACCOUNT_QUESTION },
  });
  assert.equal(diagnostic.module, 'guidance');
  assert.equal(diagnostic.styleKey, undefined);
  assert.equal(JSON.stringify(diagnostic).includes(EXPENSE_ACCOUNT_QUESTION), false);
});

test('B2-12: createEmptyGuidanceSnapshot é válido e nunca quebra contrato', () => {
  const snapshot = createEmptyGuidanceSnapshot({});
  const validation = validateGuidanceSnapshot(snapshot);
  assert.equal(validation.valid, true, validation.errors?.join(','));
  assert.equal(snapshot.legacyPreserved, true);
  assert.equal(snapshot.mode, 'observational');
});

test('B2-13: createGuidanceSnapshot normaliza e descarta valores não serializáveis', () => {
  const snapshot = createGuidanceSnapshot({
    questionGuidance: { questionKey: 'amount_required', applied: true, fn: () => {}, circular: {} },
    lengthGuidance: { lengthBand: 'short', applied: false },
  });
  assert.equal(snapshot.questionGuidance.questionKey, 'amount_required');
  assert.equal('fn' in snapshot.questionGuidance, false);
  assert.equal(snapshot.lengthGuidance.lengthBand, 'short');
  assert.equal(isGuidanceSnapshotSerializable(snapshot), true);
});
