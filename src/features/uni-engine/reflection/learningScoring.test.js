// Testes de confiança, prioridade e risco de candidatos (Fase 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLearningConfidence } from './computeLearningConfidence.js';
import { computeLearningPriority } from './computeLearningPriority.js';
import {
  detectLearningRisk,
  isLearningBlockedByRisk,
  normalizeRepetitionCount,
  hasEnoughEvidence,
} from './detectLearningRisk.js';

test('confiança: base é 0.3', () => {
  assert.equal(computeLearningConfidence({}), 0.3);
});

test('confiança: correção explícita sobe para 0.65', () => {
  assert.equal(computeLearningConfidence({ explicitCorrection: true }), 0.65);
});

test('confiança: correção + confirmação sobe para 0.85', () => {
  assert.equal(computeLearningConfidence({ explicitCorrection: true, userConfirmation: true }), 0.85);
});

test('confiança: repetição consistente (>=2) adiciona', () => {
  assert.equal(computeLearningConfidence({ repetitionCount: 2 }), 0.42);
});

test('confiança: repetição abaixo do threshold não adiciona', () => {
  assert.equal(computeLearningConfidence({ repetitionCount: 1 }), 0.3);
});

test('confiança: consistência limitada a 3 evidências', () => {
  assert.equal(computeLearningConfidence({ evidence: [{}, {}, {}] }), 0.48);
  assert.equal(computeLearningConfidence({ evidence: [{}, {}, {}, {}, {}] }), 0.48);
});

test('confiança: conflito reduz', () => {
  assert.equal(computeLearningConfidence({ conflictCount: 1 }), 0.05);
});

test('confiança: falha de provider zera', () => {
  assert.equal(computeLearningConfidence({ providerFailure: true }), 0);
});

test('confiança: outro workspace zera', () => {
  assert.equal(computeLearningConfidence({ otherWorkspace: true }), 0);
});

test('confiança: evidência fraca reduz', () => {
  assert.equal(computeLearningConfidence({ weakEvidence: true }), 0.2);
});

test('confiança: stale reduz', () => {
  assert.equal(computeLearningConfidence({ stale: true }), 0.15);
});

test('confiança: epistemic confirmado sobe, inferred_low desce', () => {
  assert.equal(computeLearningConfidence({ epistemicStatus: 'confirmed_database' }), 0.4);
  assert.equal(computeLearningConfidence({ epistemicStatus: 'inferred_low' }), 0.2);
});

test('confiança: resultado determinístico', () => {
  const a = computeLearningConfidence({ explicitCorrection: true, repetitionCount: 2, evidence: [{}] });
  const b = computeLearningConfidence({ explicitCorrection: true, repetitionCount: 2, evidence: [{}] });
  assert.equal(a, b);
  assert.equal(a, 0.83);
});

test('confiança: entrada inválida é tratada como vazia', () => {
  assert.equal(computeLearningConfidence(null), 0.3);
  assert.equal(computeLearningConfidence('x'), 0.3);
});

test('prioridade: IGNORE para sensível/provider/outro workspace', () => {
  assert.equal(computeLearningPriority({ sensitive: true }), 'IGNORE');
  assert.equal(computeLearningPriority({ providerFailure: true }), 'IGNORE');
  assert.equal(computeLearningPriority({ otherWorkspace: true }), 'IGNORE');
  assert.equal(computeLearningPriority({ isGreeting: true }), 'IGNORE');
});

test('prioridade: CRITICAL para risco CRITICAL', () => {
  assert.equal(computeLearningPriority({ risk: 'CRITICAL' }), 'CRITICAL');
});

test('prioridade: risco HIGH + repetição vira CRITICAL', () => {
  assert.equal(computeLearningPriority({ risk: 'HIGH', repetitionCount: 2 }), 'CRITICAL');
});

test('prioridade: HIGH para correção repetida', () => {
  assert.equal(computeLearningPriority({ explicitCorrection: true, repetitionCount: 2 }), 'HIGH');
});

test('prioridade: HIGH para pergunta desnecessária recorrente', () => {
  assert.equal(computeLearningPriority({ type: 'QUESTION_STRATEGY', repetitionCount: 2 }), 'HIGH');
});

test('prioridade: MEDIUM para correção com evidência', () => {
  assert.equal(computeLearningPriority({ explicitCorrection: true, evidence: [{}] }), 'MEDIUM');
});

test('prioridade: MEDIUM para duas evidências', () => {
  assert.equal(computeLearningPriority({ evidence: [{}, {}] }), 'MEDIUM');
});

test('prioridade: LOW para estilo de resposta', () => {
  assert.equal(computeLearningPriority({ type: 'RESPONSE_STYLE_PREFERENCE' }), 'LOW');
});

test('prioridade: UNDETERMINED sem evidência', () => {
  assert.equal(computeLearningPriority({}), 'UNDETERMINED');
});

test('risco: dado sensível é CRITICAL', () => {
  const risk = detectLearningRisk({ sensitive: true });
  assert.equal(risk.level, 'CRITICAL');
  assert.ok(risk.risks.some((r) => r.code === 'SENSITIVE_DATA'));
  assert.equal(risk.safeToLearn, false);
});

test('risco: texto com senha é CRITICAL', () => {
  const risk = detectLearningRisk({ proposedValue: 'senha abc123def456ghi789jkl0' });
  assert.equal(risk.level, 'CRITICAL');
  assert.ok(risk.risks.some((r) => r.code === 'SENSITIVE_DATA'));
});

test('risco: outro workspace é CRITICAL', () => {
  const risk = detectLearningRisk({ otherWorkspace: true });
  assert.equal(risk.level, 'CRITICAL');
  assert.ok(risk.risks.some((r) => r.code === 'OTHER_WORKSPACE'));
});

test('risco: evidência fraca única é HIGH', () => {
  const risk = detectLearningRisk({});
  assert.equal(risk.level, 'HIGH');
  assert.ok(risk.risks.some((r) => r.code === 'SINGLE_WEAK_EVIDENCE'));
  assert.equal(risk.safeToLearn, false);
});

test('risco: correção explícita sem evidência não é risco de evidência fraca', () => {
  const risk = detectLearningRisk({ explicitCorrection: true });
  assert.equal(risk.risks.some((r) => r.code === 'SINGLE_WEAK_EVIDENCE'), false);
});

test('risco: hipótese como fato é HIGH', () => {
  const risk = detectLearningRisk({ hypothesisAsFact: true });
  assert.equal(risk.level, 'HIGH');
});

test('risco: exceção como regra é HIGH', () => {
  const risk = detectLearningRisk({ exceptionAsRule: true });
  assert.equal(risk.level, 'HIGH');
});

test('risco: reforço de comportamento incorreto é HIGH', () => {
  const risk = detectLearningRisk({ reinforceIncorrect: true });
  assert.equal(risk.level, 'HIGH');
});

test('risco: substituição de fato oficial é HIGH', () => {
  const risk = detectLearningRisk({ overridesOfficialFact: true });
  assert.equal(risk.level, 'HIGH');
});

test('risco: correção de contexto sem preferência permanente é MEDIUM', () => {
  const risk = detectLearningRisk({ contextCorrection: true, explicitCorrection: true });
  assert.equal(risk.level, 'MEDIUM');
  assert.equal(risk.safeToLearn, true);
});

test('risco: correção de contexto COM preferência permanente é seguro', () => {
  const risk = detectLearningRisk({ contextCorrection: true, permanentPreference: true });
  assert.equal(risk.risks.some((r) => r.code === 'CONTEXT_CORRECTION_AS_PERMANENT'), false);
});

test('risco: falha externa como preferência é MEDIUM', () => {
  const risk = detectLearningRisk({ providerFailure: true });
  assert.ok(risk.risks.some((r) => r.code === 'EXTERNAL_FAILURE_AS_PREFERENCE'));
});

test('risco: sem riscos retorna NONE', () => {
  const risk = detectLearningRisk({ explicitCorrection: true, evidence: [{}] });
  assert.equal(risk.level, 'NONE');
  assert.deepEqual(risk.risks, [{ code: 'NONE', severity: 'NONE' }]);
  assert.equal(risk.safeToLearn, true);
});

test('risco: gateway bloqueia HIGH e CRITICAL', () => {
  assert.equal(isLearningBlockedByRisk('HIGH'), true);
  assert.equal(isLearningBlockedByRisk('CRITICAL'), true);
  assert.equal(isLearningBlockedByRisk('NONE'), false);
  assert.equal(isLearningBlockedByRisk('MEDIUM'), false);
});

test('risco: normalização de repetição', () => {
  assert.equal(normalizeRepetitionCount(3), 3);
  assert.equal(normalizeRepetitionCount(0), 0);
  assert.equal(normalizeRepetitionCount(-1), 0);
  assert.equal(normalizeRepetitionCount('x'), 0);
});

test('risco: evidência suficiente', () => {
  assert.equal(hasEnoughEvidence([{}], 0), true);
  assert.equal(hasEnoughEvidence([], 1), true);
  assert.equal(hasEnoughEvidence([], 0), false);
});
