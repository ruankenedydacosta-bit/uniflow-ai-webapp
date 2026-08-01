// Testes de telemetria epistêmica redigida (Fase 4).
// Itens 62-66: redaction; sem texto; sem valores; sem nomes de contas;
// latência registrada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  redactEpistemicTelemetry,
  EPISTEMIC_TELEMETRY_ALLOWED_FIELDS,
  buildRedactedEpistemicTelemetryEntry,
  redactEpistemicText,
  redactEpistemicSensitiveValue,
} from './redactEpistemicTelemetry.js';
import {
  buildEpistemicTelemetry,
  emitEpistemicTelemetry,
} from './epistemicTelemetry.js';

const SENSITIVE_ENTRY = {
  correlationId: 'ue_epi_123',
  engineVersion: '2.0',
  itemCount: 12,
  conflictCount: 1,
  staleItemCount: 2,
  missingItemCount: 3,
  meanConfidence: 0.6,
  evidenceTotal: 14,
  evidenceByType: { direct_database: 4, memory_retrieval: 2 },
  recommendationCount: 5,
  recommendationTypes: { ask_user: 5 },
  latencyMs: 3.4,
  messageText: 'Gastei 50 reais no mercado',
  accountName: 'Nubank',
  userId: 'user-1',
  email: 'wagner@uniflow.ai',
  balanceValue: 950,
  rawPayload: { amount: 50, account: 'Nubank' },
};

test('epistêmico 62: redaction — apenas campos permitidos sobrevivem', () => {
  const redacted = redactEpistemicTelemetry(SENSITIVE_ENTRY);
  assert.ok(Object.keys(redacted).every((key) => EPISTEMIC_TELEMETRY_ALLOWED_FIELDS.includes(key)));
});

test('epistêmico 63: sem texto — nenhuma mensagem nem nome vaza', () => {
  const redacted = redactEpistemicTelemetry(SENSITIVE_ENTRY);
  const serialized = JSON.stringify(redacted);
  assert.equal(serialized.includes('Gastei'), false);
  assert.equal(serialized.includes('Nubank'), false);
  assert.equal(serialized.includes('user-1'), false);
  assert.equal(serialized.includes('wagner@'), false);
});

test('epistêmico 64: sem valores financeiros', () => {
  const redacted = redactEpistemicTelemetry(SENSITIVE_ENTRY);
  const serialized = JSON.stringify(redacted);
  assert.equal(serialized.includes('950'), false, 'valor financeiro não pode aparecer');
  assert.equal(serialized.includes('rawPayload'), false);
});

test('epistêmico 65: sem nomes de contas', () => {
  const entry = buildRedactedEpistemicTelemetryEntry(SENSITIVE_ENTRY);
  assert.equal(entry.accountName, undefined);
  const serialized = JSON.stringify(entry);
  assert.equal(serialized.includes('Nubank'), false);
});

test('epistêmico 66: latência é registrada como agregado', () => {
  const telemetry = buildEpistemicTelemetry({
    correlationId: 'ue_epi_1',
    enabled: true,
    shadowMode: true,
    model: { appliedToDecision: false },
    verifier: {
      items: [{ subject: 'x' }],
      conflicts: [],
      staleItems: [],
      missingItems: [],
      evidenceSummary: { totalRaw: 2, totalDeduped: 2, byType: {} },
      confidenceSummary: { mean: 0.6 },
      sufficiency: { execute: { shadowMode: true }, blocked: [] },
      recommendations: [],
      diagnostics: {},
    },
    latencyMs: 2.456,
  });
  assert.equal(telemetry.latencyMs, 2.46);
  assert.equal(telemetry.itemCount, 1);
  assert.equal(telemetry.appliedToDecision, false);
  assert.equal(telemetry.executeBlocked, true);
});

test('epistêmico: buildEpistemicTelemetry só emite campos da allowlist', () => {
  const telemetry = buildEpistemicTelemetry({
    correlationId: 'ue_epi_2',
    verifier: {
      items: [],
      conflicts: [],
      staleItems: [],
      missingItems: [],
      evidenceSummary: {},
      confidenceSummary: {},
      sufficiency: { blocked: [] },
      recommendations: [],
      diagnostics: { memoryCount: 0, memoryScopeFiltered: 0 },
    },
    model: { appliedToDecision: false },
  });
  const keys = Object.keys(telemetry);
  assert.ok(keys.every((key) => EPISTEMIC_TELEMETRY_ALLOWED_FIELDS.includes(key)));
});

test('epistêmico: adapter nunca recebe entrada sensível', () => {
  let received = null;
  const adapter = (entry) => {
    received = entry;
  };
  const redacted = emitEpistemicTelemetry(SENSITIVE_ENTRY, adapter);
  assert.ok(received, 'adapter deve receber registro redigido');
  const serialized = JSON.stringify(redacted);
  assert.equal(serialized.includes('Gastei'), false);
  assert.equal(serialized.includes('Nubank'), false);
});

test('epistêmico: redação de texto e valor sensível', () => {
  assert.equal(redactEpistemicText(), '[redacted]');
  assert.equal(redactEpistemicSensitiveValue(), '[redacted]');
});

test('epistêmico: adapter que lança exceção nunca quebra o emissor', () => {
  const throwing = () => {
    throw new Error('adapter quebrado');
  };
  const redacted = emitEpistemicTelemetry({ correlationId: 'ue_x' }, throwing);
  assert.equal(redacted.correlationId, 'ue_x');
});
