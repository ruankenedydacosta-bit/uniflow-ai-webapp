// Integration — orientação de pergunta (QUESTION_GUIDANCE, Parte 1). A troca
// só acontece entre templates fechados conhecidos, e nunca em confirmação/
// erro/sucesso ou texto fora da allowlist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineIntegration } from './runUniEngineIntegration.js';
import { applyQuestionGuidance } from './applyQuestionGuidance.js';
import {
  buildIntegrationConfig,
  buildEngineResult,
  buildActiveDecision,
  legacyClarification,
  EXPENSE_ACCOUNT_QUESTION,
  INCOME_ACCOUNT_QUESTION,
  AMOUNT_QUESTION,
  TRANSFER_ORIGIN_QUESTION,
} from './testFixtures.js';

function engineWithMissingFields(fields, extra = {}) {
  return buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    comparison: { missingFields: fields, agreementMetrics: { divergenceCount: 0 } },
    activation: { enabled: true, shadowMode: false, environment: 'development', decisions: [buildActiveDecision('QUESTION_GUIDANCE')] },
    ...extra,
  });
}

test('I-21: receita pergunta conta de recebimento quando o motor aponta account', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ issueField: 'category', transactionType: 'income', text: 'Em qual categoria essa movimentação se encaixa?' }),
    engineResult: engineWithMissingFields(['account']),
    context: { isDev: true },
  });
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.finalText, INCOME_ACCOUNT_QUESTION);
  assert.equal(result.questionGuidance.questionKey, 'account_receipt');
  assert.equal(result.capabilitiesApplied.includes('QUESTION_GUIDANCE'), true);
});

test('I-22: despesa pede valor quando o motor aponta amount ausente', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: engineWithMissingFields(['amount']),
    context: { isDev: true },
  });
  assert.equal(result.finalText, AMOUNT_QUESTION);
  assert.equal(result.questionGuidance.questionKey, 'amount_required');
});

test('I-23: transferência pergunta origem da conta quando account ausente', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ issueField: 'amount', transactionType: 'transfer', text: AMOUNT_QUESTION }),
    engineResult: engineWithMissingFields(['account']),
    context: { isDev: true },
  });
  assert.equal(result.finalText, TRANSFER_ORIGIN_QUESTION);
  assert.equal(result.questionGuidance.questionKey, 'transfer_origin');
});

test('I-24: sem campo ausente → nenhuma troca, texto legado intacto', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: engineWithMissingFields([]),
    context: { isDev: true },
  });
  assert.equal(result.finalText, EXPENSE_ACCOUNT_QUESTION);
  assert.equal(result.applied, false);
  assert.equal(result.questionGuidance.applied, false);
});

test('I-25: redundância evitada — motor repete a pergunta já feita', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ text: AMOUNT_QUESTION, issueField: 'amount' }),
    engineResult: engineWithMissingFields(['amount']),
    context: { isDev: true },
  });
  assert.equal(result.finalText, AMOUNT_QUESTION);
  assert.equal(result.applied, false);
});

test('I-26: pergunta fora da allowlist nunca é alterada', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ text: 'Qual é a sua data de nascimento?', issueField: 'account' }),
    engineResult: engineWithMissingFields(['amount']),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Qual é a sua data de nascimento?');
  assert.equal(result.questionGuidance.applied, false);
});

test('I-27: confirmação nunca tem texto alterado', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'confirmation', text: 'Recebido! Vou registrar essa movimentação.' }),
    engineResult: engineWithMissingFields(['amount']),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Recebido! Vou registrar essa movimentação.');
  assert.equal(result.applied, false);
});

test('I-28: resposta de consulta (não esclarecimento) não recebe pergunta', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ responseType: 'query', text: 'Seu saldo atual é R$ 1.000,00.' }),
    engineResult: engineWithMissingFields(['amount']),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Seu saldo atual é R$ 1.000,00.');
  assert.equal(result.applied, false);
});

test('I-29: primeiro campo ausente mapeável vence a ordem do motor', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: engineWithMissingFields(['desconhecido', 'amount', 'category']),
    context: { isDev: true },
  });
  assert.equal(result.finalText, AMOUNT_QUESTION);
  assert.equal(result.questionGuidance.fieldsStillMissing[0], 'desconhecido');
});

test('I-30: applyQuestionGuidance sem ativação não aplica e preserva texto', () => {
  const outcome = applyQuestionGuidance({
    legacy: legacyClarification(),
    suggested: { fieldsStillMissing: ['amount'] },
    active: false,
  });
  assert.equal(outcome.guidance.applied, false);
  assert.equal(outcome.finalText, EXPENSE_ACCOUNT_QUESTION);
});
