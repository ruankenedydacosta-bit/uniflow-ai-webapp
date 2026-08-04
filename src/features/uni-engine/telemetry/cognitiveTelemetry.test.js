// Uni Engine — Cognitive Telemetry (Fase 14, Bloco 4): testes.
//
// Cobre a telemetria técnica em memória: buffer limitado (ring buffer),
// sanitização estrita (allowlist — nunca texto completo, nomes, tokens,
// payloads brutos), gates por flags, reset controlado e snapshot de
// diagnóstico serializável. Nenhuma escrita em disco, nenhuma rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCognitiveTelemetryStore,
  recordIntoTelemetry,
  sanitizeCognitiveTelemetryEntry,
  getTelemetrySnapshot,
  resetTelemetryStore,
  COGNITIVE_TELEMETRY_VERSION,
  COGNITIVE_TELEMETRY_DEFAULT_MAX_ENTRIES,
  COGNITIVE_TELEMETRY_MAX_ENTRIES_LIMIT,
} from './cognitiveTelemetry.js';

function sampleEntry(overrides = {}) {
  return {
    turnId: 'turn-1',
    messageId: 'turn-1',
    agreementStatus: 'agreement',
    agreement: true,
    divergenceType: null,
    divergenceSeverity: null,
    reasonCodes: ['INTENT_MATCH', 'NO_INFLUENCE'],
    engineSkipped: false,
    engineErrorCode: null,
    fallbackUsed: false,
    rollbackStatus: 'shadow_active',
    flags: { enabled: true, telemetryEnabled: true, cognitiveOrchestratorEnabled: true },
    layers: {
      summary: { layersPresent: 12, layersExecuted: 12, layersDisabled: 0, layersWithErrors: 0 },
      latencyMs: 12.345,
      layers: { gateway: { errorCode: 'X' } },
    },
    safety: {
      influenceApplied: false,
      persistenceWritten: false,
      ttsTriggered: false,
      financialExecution: false,
    },
    latencyMs: 12.345,
    timestamp: '2026-08-03T00:00:00.000Z',
    ...overrides,
  };
}

test('TEL-1: buffer limitado — descarta o registro mais antigo além do máximo', () => {
  const store = createCognitiveTelemetryStore({ maxEntries: 3 });
  for (let i = 0; i < 10; i += 1) {
    recordIntoTelemetry(store, sampleEntry({ turnId: `turn-${i}`, messageId: `turn-${i}` }));
  }
  assert.equal(store.entries.length, 3);
  assert.equal(store.entries[0].turnId, 'turn-7', 'mais antigo descartado');
  assert.equal(store.entries[2].turnId, 'turn-9');
  assert.equal(store.created, 10);
});

test('TEL-2: limite default de 32 registros e teto de 256', () => {
  assert.equal(COGNITIVE_TELEMETRY_DEFAULT_MAX_ENTRIES, 32);
  assert.equal(COGNITIVE_TELEMETRY_MAX_ENTRIES_LIMIT, 256);
  const tiny = createCognitiveTelemetryStore({ maxEntries: 1 });
  assert.equal(tiny.maxEntries, 1);
  const huge = createCognitiveTelemetryStore({ maxEntries: 9999 });
  assert.equal(huge.maxEntries, COGNITIVE_TELEMETRY_MAX_ENTRIES_LIMIT);
  const invalid = createCognitiveTelemetryStore({ maxEntries: 'x' });
  assert.equal(invalid.maxEntries, COGNITIVE_TELEMETRY_DEFAULT_MAX_ENTRIES);
});

test('TEL-3: sanitização — allowlist estrita, nunca texto completo nem tokens', () => {
  const sanitized = sanitizeCognitiveTelemetryEntry({
    turnId: 'turn-1',
    messageId: 'turn-1',
    agreementStatus: 'divergence',
    agreement: false,
    divergenceType: 'intent_mismatch',
    divergenceSeverity: 'high',
    reasonCodes: ['INTENT_MISMATCH', 'NO_INFLUENCE', 'INVENTADO'],
    userText: 'recebi 5000 reais do João joao@email.com senha=abc123',
    fullResponse: 'texto completo da resposta',
    token: 'supabase_token_secreto',
    audio: 'base64-audio',
    engineSkipped: false,
    engineErrorCode: 'ENGINE_CRASHED',
    fallbackUsed: false,
    rollbackStatus: 'shadow_active',
    flags: { enabled: true, telemetryEnabled: true, cognitiveOrchestratorEnabled: true },
    layers: {
      summary: { layersPresent: 12, layersExecuted: 12, layersDisabled: 0, layersWithErrors: 0 },
      latencyMs: 12.345,
      layers: { gateway: { errorCode: 'X' } },
    },
    safety: { influenceApplied: false },
    latencyMs: 12.345,
    timestamp: '2026-08-03T00:00:00.000Z',
  });
  assert.equal(sanitized.userText, undefined, 'texto do usuário nunca entra');
  assert.equal(sanitized.fullResponse, undefined, 'texto completo nunca entra');
  assert.equal(sanitized.token, undefined, 'token nunca entra');
  assert.equal(sanitized.audio, undefined, 'áudio nunca entra');
  assert.deepEqual(sanitized.reasonCodes, ['INTENT_MISMATCH', 'NO_INFLUENCE'], 'vocabulário fechado');
  assert.equal(sanitized.divergenceType, 'intent_mismatch');
  assert.equal(sanitized.engineErrorCode, 'ENGINE_CRASHED');
});

test('TEL-4: flags sanitizadas — só o subconjunto fechado sobrevive', () => {
  const sanitized = sanitizeCognitiveTelemetryEntry(
    sampleEntry({ flags: { enabled: true, telemetryEnabled: false, chaveSecreta: true } }),
  );
  assert.deepEqual(sanitized.flags, {
    enabled: true,
    shadowMode: false,
    telemetryEnabled: false,
    epistemicEnabled: false,
    epistemicShadowMode: false,
    integrationEnabled: false,
    conversationRoutingEnabled: false,
    cognitiveOrchestratorEnabled: false,
    rolloutEnabled: false,
  });
});

test('TEL-5: safety sanitizada — somente os 11 interruptores permitidos', () => {
  const sanitized = sanitizeCognitiveTelemetryEntry(
    sampleEntry({ safety: { influenceApplied: false, persistenceWritten: true, databaseCalled: true, token: 'x' } }),
  );
  assert.equal(sanitized.safety.persistenceWritten, true);
  assert.equal(sanitized.safety.databaseCalled, true);
  assert.equal(sanitized.safety.token, undefined);
  assert.equal(sanitized.safety.influenceApplied, false);
});

test('TEL-6: resumo do snapshot — contagens por status e zero efeitos colaterais', () => {
  const store = createCognitiveTelemetryStore({ maxEntries: 32 });
  recordIntoTelemetry(store, sampleEntry({ agreementStatus: 'agreement', safety: { influenceApplied: true, ttsTriggered: true, financialExecution: true } }));
  recordIntoTelemetry(store, sampleEntry({ agreementStatus: 'divergence', fallbackUsed: true, turnId: 'turn-2' }));
  recordIntoTelemetry(store, sampleEntry({ agreementStatus: 'skipped', engineSkipped: true, turnId: 'turn-3', rollbackStatus: 'engine_active' }));
  const snapshot = getTelemetrySnapshot(store);
  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.count, 3);
  assert.equal(snapshot.summary.agreements, 1);
  assert.equal(snapshot.summary.divergences, 1);
  assert.equal(snapshot.summary.skipped, 1);
  assert.equal(snapshot.summary.fallbacks, 1);
  assert.equal(snapshot.summary.financialExecutions, 1);
  assert.equal(snapshot.summary.ttsTriggered, true, 'flag de tts deve ser observada');
  assert.equal(snapshot.summary.persistenceWritten, false);
  assert.equal(snapshot.summary.rollbackStatus, 'engine_active', 'status do último registro');
});

test('TEL-7: snapshot é serializável e nunca contém texto/payload', () => {
  const store = createCognitiveTelemetryStore({ maxEntries: 4 });
  recordIntoTelemetry(store, sampleEntry());
  const snapshot = getTelemetrySnapshot(store);
  const clone = JSON.parse(JSON.stringify(snapshot));
  assert.deepEqual(clone, snapshot);
  assert.equal(snapshot.serializable, true);
  assert.equal(JSON.stringify(snapshot).includes('senha'), false);
  assert.equal(JSON.stringify(snapshot).includes('base64'), false);
});

test('TEL-8: reset controlado — esvazia o buffer e mantém o store utilizável', () => {
  const store = createCognitiveTelemetryStore({ maxEntries: 4 });
  recordIntoTelemetry(store, sampleEntry());
  assert.equal(store.entries.length, 1);
  resetTelemetryStore(store);
  assert.equal(store.entries.length, 0);
  assert.equal(getTelemetrySnapshot(store).count, 0);
  recordIntoTelemetry(store, sampleEntry());
  assert.equal(store.entries.length, 1, 'store continua utilizável após reset');
});

test('TEL-9: entradas inválidas são sanitizadas para valores nulos, nunca lançam', () => {
  const sanitized = sanitizeCognitiveTelemetryEntry({ agreementStatus: 'inventado', reasonCodes: 'nao-e-array' });
  assert.equal(sanitized.agreementStatus, null);
  assert.deepEqual(sanitized.reasonCodes, []);
  assert.equal(sanitized.turnId, null);
  const store = createCognitiveTelemetryStore();
  const fromNull = recordIntoTelemetry(store, null);
  assert.equal(fromNull.turnId, null, 'entrada vazia vira registro nulo, nunca erro');
  assert.equal(fromNull.version, COGNITIVE_TELEMETRY_VERSION);
  const fromEmpty = recordIntoTelemetry(store, {});
  assert.equal(fromEmpty.version, COGNITIVE_TELEMETRY_VERSION);
  assert.equal(store.entries.length, 2);
});

test('TEL-10: versão estável 1.0 e registro congelado (deep-freeze) após sanitização', () => {
  assert.equal(COGNITIVE_TELEMETRY_VERSION, '1.0');
  const sanitized = sanitizeCognitiveTelemetryEntry(sampleEntry());
  assert.ok(Object.isFrozen(sanitized));
  assert.throws(() => {
    sanitized.turnId = 'mutado';
  });
});

test('TEL-11: latência e contagens numéricas são arredondadas e finitas', () => {
  const sanitized = sanitizeCognitiveTelemetryEntry(
    sampleEntry({ latencyMs: 12.349999, layers: { summary: { layersPresent: 12, layersExecuted: 12, layersDisabled: 0, layersWithErrors: 1 }, latencyMs: 55.556, layers: { gateway: { errorCode: 'X' } } } }),
  );
  assert.equal(sanitized.latencyMs, 12.35);
  assert.equal(sanitized.layers.latencyMs, 55.56);
  assert.equal(sanitized.layers.present, 12);
});

test('TEL-12: erro de camada sanitizado mantém apenas código de erro por camada', () => {
  const sanitized = sanitizeCognitiveTelemetryEntry(
    sampleEntry({ layers: {
      summary: { layersPresent: 12, layersExecuted: 12, layersDisabled: 0, layersWithErrors: 1 },
      layers: { gateway: { errorCode: 'GATEWAY_INTERNAL_ERROR' }, observation: { errorCode: null } },
    } }),
  );
  assert.deepEqual(sanitized.layers.errors, { gateway: 'GATEWAY_INTERNAL_ERROR' });
});

test('TEL-13: turnId/messageId limitados em tamanho (nunca payloads longos)', () => {
  const long = 'x'.repeat(500);
  const sanitized = sanitizeCognitiveTelemetryEntry(sampleEntry({ turnId: long, messageId: long }));
  assert.equal(sanitized.turnId.length, 64);
  assert.equal(sanitized.messageId.length, 64);
});

test('TEL-14: erros por camada agregados no resumo', () => {
  const store = createCognitiveTelemetryStore({ maxEntries: 8 });
  recordIntoTelemetry(store, sampleEntry({
    layers: {
      summary: { layersPresent: 12, layersExecuted: 11, layersDisabled: 0, layersWithErrors: 1 },
      layers: { gateway: { errorCode: 'GATEWAY_INTERNAL_ERROR' } },
    },
  }));
  const snapshot = getTelemetrySnapshot(store);
  assert.equal(snapshot.summary.errorsByLayer.gateway, 'GATEWAY_INTERNAL_ERROR');
});
