// Integration — regressão financeira (Parte 1). Fluxos financeiros reais
// passam intactos; a integração só troca entre templates fechados e nunca
// decide, executa ou confirma por conta própria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineIntegration } from './runUniEngineIntegration.js';
import {
  buildIntegrationConfig,
  buildEngineResult,
  buildActiveDecision,
  legacyClarification,
  AMOUNT_QUESTION,
  TRANSFER_DESTINATION_QUESTION,
} from './testFixtures.js';

function fullEngine(extra = {}) {
  return buildEngineResult({
    decisionLayer: { decisionType: 'ask', nextDecisionType: 'ask', risk: 'LOW', confidence: 0.9 },
    classification: { ambiguities: [], primaryIntent: 'register_expense' },
    comparison: { missingFields: ['amount'], agreementMetrics: { divergenceCount: 0 } },
    activation: {
      enabled: true,
      shadowMode: false,
      environment: 'development',
      decisions: [
        buildActiveDecision('QUESTION_GUIDANCE'),
        buildActiveDecision('CLARIFICATION_GUIDANCE'),
        buildActiveDecision('RESPONSE_STYLE_GUIDANCE'),
        buildActiveDecision('RESPONSE_LENGTH_GUIDANCE'),
        buildActiveDecision('METADATA_ONLY'),
        buildActiveDecision('DIAGNOSTICS_ONLY'),
      ],
    },
    ...extra,
  });
}

test('I-69: registro de despesa — confirmação com card NUNCA é alterada', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({
      responseType: 'confirmation',
      hasConfirmationCard: true,
      text: 'Recebido! Vou registrar essa despesa.',
    }),
    engineResult: fullEngine(),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Recebido! Vou registrar essa despesa.');
  assert.equal(result.applied, false);
  assert.equal(result.legacyPreserved, true);
});

test('I-70: registro de despesa — pergunta de conta segue pipeline, não vira decisão', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: fullEngine(),
    context: { isDev: true },
  });
  assert.equal(result.finalText, AMOUNT_QUESTION);
  assert.equal(result.questionGuidance.questionKey, 'amount_required');
  assert.equal(result.applied, true);
});

test('I-71: transferência — pergunta de destino guiada, origem preservada', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({
      issueField: 'account',
      transactionType: 'transfer',
      text: 'De qual conta o valor foi transferido?',
    }),
    engineResult: fullEngine({
      comparison: { missingFields: ['destinationAccount'], agreementMetrics: { divergenceCount: 0 } },
      classification: { ambiguities: [], primaryIntent: 'register_transfer' },
    }),
    context: { isDev: true },
  });
  assert.equal(result.finalText, TRANSFER_DESTINATION_QUESTION);
});

test('I-72: ajuste de saldo — pergunta de conta de ajuste guiada', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({
      issueField: 'amount',
      transactionType: 'adjustment',
      text: AMOUNT_QUESTION,
    }),
    engineResult: fullEngine({
      comparison: { missingFields: ['account'], agreementMetrics: { divergenceCount: 0 } },
      classification: { ambiguities: [], primaryIntent: 'adjust_balance' },
    }),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Em qual conta você quer ajustar o saldo?');
  assert.equal(result.questionGuidance.questionKey, 'adjustment_account');
});

test('I-73: consulta de saldo — resposta factual nunca é reescrita', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({
      responseType: 'query',
      text: 'Seu saldo atual é R$ 1.250,00.',
    }),
    engineResult: fullEngine({
      decisionLayer: { decisionType: 'respond', nextDecisionType: 'respond', risk: 'LOW', confidence: 0.9 },
    }),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Seu saldo atual é R$ 1.250,00.');
  assert.equal(result.applied, false);
});

test('I-74: erro de execução — texto de erro nunca é alterado', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({
      responseType: 'error',
      text: 'Não consegui registrar sua despesa. Tente novamente.',
    }),
    engineResult: fullEngine(),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Não consegui registrar sua despesa. Tente novamente.');
  assert.equal(result.applied, false);
});

test('I-75: sucesso — texto de sucesso nunca é alterado', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({
      responseType: 'success',
      text: 'Tudo certo! Lançamento registrado.',
    }),
    engineResult: fullEngine(),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Tudo certo! Lançamento registrado.');
});

test('I-76: confirmação de receita com card mantém voz e card intactos', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({
      responseType: 'confirmation',
      hasConfirmationCard: true,
      text: 'Receita de R$ 500,00 registrada com sucesso.',
    }),
    engineResult: fullEngine(),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Receita de R$ 500,00 registrada com sucesso.');
  assert.ok(result.diagnostics.some((d) => d.reason === 'protected_response_types'));
});

test('I-77: pergunta de categoria nunca preenche categoria sozinha', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({ issueField: 'account', text: 'Em qual conta você fez esse pagamento?' }),
    engineResult: fullEngine({
      comparison: { missingFields: ['category'], agreementMetrics: { divergenceCount: 0 } },
    }),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Em qual categoria essa movimentação se encaixa?');
  assert.equal(result.questionGuidance.applied, true);
});

test('I-78: pending action nunca é pulada pela integração', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({
      status: 'needs_clarification',
      text: 'Em qual conta você fez esse pagamento?',
    }),
    engineResult: fullEngine(),
    context: { isDev: true },
  });
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.finalText, AMOUNT_QUESTION);
  assert.equal(result.capabilitiesApplied.includes('QUESTION_GUIDANCE'), true);
});

test('I-79: pergunta genérica de conta fora do mapa não é orientável', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({
      issueField: 'conta_estranha',
      text: 'Qual conta você quer usar nesta movimentação?',
    }),
    engineResult: fullEngine(),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Qual conta você quer usar nesta movimentação?');
});

test('I-80: metadata e diagnóstico são anexados sem alterar texto', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: fullEngine(),
    context: { isDev: true },
  });
  assert.ok(result.capabilitiesApplied.includes('METADATA_ONLY'));
  assert.ok(result.capabilitiesApplied.includes('DIAGNOSTICS_ONLY'));
  assert.ok(result.diagnostics.length > 0);
});

test('I-81: múltiplas capacidades ativas aplicam somente orientações seguras', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification(),
    engineResult: fullEngine(),
    context: { isDev: true },
  });
  const applied = result.capabilitiesApplied;
  assert.ok(applied.includes('QUESTION_GUIDANCE'));
  assert.ok(applied.length <= 6);
  assert.ok(!applied.includes('FINANCIAL_EXECUTION'));
});

test('I-82: sem status de esclarecimento, pergunta legada segue intacta quando fora do curso', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig(),
    legacy: legacyClarification({
      responseType: 'clarification',
      status: 'needs_clarification',
      issueField: 'account',
      text: 'Em qual conta você fez esse pagamento?',
    }),
    engineResult: fullEngine({
      comparison: { missingFields: [], agreementMetrics: { divergenceCount: 0 } },
    }),
    context: { isDev: true },
  });
  assert.equal(result.finalText, 'Em qual conta você fez esse pagamento?');
});

test('I-83: fluxo completo — nenhum valor, nome ou conta vaza para o resultado', () => {
  const result = runUniEngineIntegration({
    config: buildIntegrationConfig({ VITE_UNI_ENGINE_INTEGRATION_TELEMETRY: 'true' }),
    legacy: legacyClarification(),
    engineResult: fullEngine(),
    context: { isDev: true },
  });
  const json = JSON.stringify(result);
  assert.equal(json.includes('R$'), false);
  assert.equal(json.includes('500'), false);
  assert.ok(result.questionGuidance.fieldsStillMissing.includes('amount'));
});
