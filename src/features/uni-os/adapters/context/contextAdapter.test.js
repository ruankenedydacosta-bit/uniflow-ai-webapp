import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adaptContextSources,
  createUniOSContext,
  normalizeContextChannel,
  normalizeContextLanguage,
  normalizeContextRole,
  normalizeContextTimezone,
  normalizeFeatureFlags,
  runContextAdapterShadow,
  UNI_OS_CONTEXT_SCHEMA_VERSION,
} from './index.js';
import { UNI_OS_ENABLED } from '../featureFlags.js';

const FIXED_NOW = () => '2026-07-12T20:00:00.000Z';

test('schema retorna contrato completo e profundamente imutável', () => {
  const result = createUniOSContext({
    timestamp: 'now',
    session: { authenticated: true, sessionId: 's1', state: 'authenticated' },
    user: { id: 'u1', profileCompleted: true },
    workspace: { id: 'w1', role: 'owner' },
    conversation: { channel: 'voice', language: 'pt-BR', timezone: 'America/Sao_Paulo' },
    personality: { mode: 'warm' },
    featureFlags: { uniOS: true, premiumVoice: false },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.session), true);
  assert.equal(Object.isFrozen(result.featureFlags), true);
  assert.equal(result.metadata.version, UNI_OS_CONTEXT_SCHEMA_VERSION);
});

test('normaliza idioma sem alterar seu significado', () => {
  assert.equal(normalizeContextLanguage('pt_br'), 'pt-BR');
  assert.equal(normalizeContextLanguage('EN-us'), 'en-US');
  assert.equal(normalizeContextLanguage('pt'), 'pt');
  assert.equal(normalizeContextLanguage('invalid-language-value'), 'pt-BR');
});

test('normaliza timezone válido e usa UTC para valor inválido', () => {
  assert.equal(normalizeContextTimezone('America/Sao_Paulo'), 'America/Sao_Paulo');
  assert.equal(normalizeContextTimezone('invalid/timezone'), 'UTC');
  assert.equal(normalizeContextTimezone(null), 'UTC');
});

test('normaliza canais text e voice', () => {
  assert.equal(normalizeContextChannel('VOICE'), 'voice');
  assert.equal(normalizeContextChannel('text'), 'text');
  assert.equal(normalizeContextChannel('other'), 'text');
});

test('normaliza somente roles conhecidas', () => {
  assert.equal(normalizeContextRole('OWNER'), 'owner');
  assert.equal(normalizeContextRole('member'), 'member');
  assert.equal(normalizeContextRole('superuser'), null);
});

test('feature flags aceitam somente boolean true explícito', () => {
  assert.deepEqual(normalizeFeatureFlags({ uniOS: true, premiumVoice: 'true' }), {
    uniOS: true, premiumVoice: false,
  });
});

test('adapter consolida sessão, profile e workspace sem mutar fontes', () => {
  const sources = {
    sessionContext: {
      isAuthenticated: true,
      isLoading: false,
      session: { id: 'session-1', access_token: 'never-copy' },
      user: { id: 'user-1', email: 'private@example.com' },
    },
    profile: { id: 'user-1', onboarding_completed: true, phone: 'private' },
    workspace: { id: 'workspace-1', name: 'Private Finance' },
    workspaceRole: 'admin',
    channel: 'voice',
    language: 'pt_br',
    timezone: 'America/Sao_Paulo',
    personalityMode: 'strategic',
    featureFlags: { uniOS: true, premiumVoice: true },
  };
  const snapshot = structuredClone(sources);
  const result = adaptContextSources(sources, { now: FIXED_NOW });
  assert.equal(result.session.authenticated, true);
  assert.equal(result.session.state, 'authenticated');
  assert.equal(result.user.profileCompleted, true);
  assert.equal(result.workspace.role, 'admin');
  assert.equal(result.conversation.channel, 'voice');
  assert.equal(result.personality.mode, 'strategic');
  assert.deepEqual(sources, snapshot);
  assert.doesNotMatch(JSON.stringify(result), /never-copy|private@example|Private Finance|phone/i);
});

test('estado de sessão preserva loading e error', () => {
  const loading = adaptContextSources({ sessionContext: { isLoading: true } }, { now: FIXED_NOW });
  const error = adaptContextSources({ sessionContext: { error: { code: 'x' } } }, { now: FIXED_NOW });
  assert.equal(loading.session.state, 'loading');
  assert.equal(error.session.state, 'error');
});

test('objetos vazios produzem defaults seguros', () => {
  const result = adaptContextSources({}, { now: FIXED_NOW });
  assert.equal(result.session.authenticated, false);
  assert.equal(result.user.id, null);
  assert.equal(result.workspace.id, null);
  assert.equal(result.conversation.channel, 'text');
  assert.equal(result.conversation.language, 'pt-BR');
  assert.equal(result.conversation.timezone, 'UTC');
  assert.equal(result.personality.mode, 'balanced');
});

test('feature flag compartilhada permanece desligada e bloqueia modo sombra', async () => {
  let calls = 0;
  const result = await runContextAdapterShadow({}, { processor: () => { calls += 1; } });
  assert.equal(UNI_OS_ENABLED, false);
  assert.equal(result.status, 'DISABLED');
  assert.equal(calls, 0);
});

test('modo sombra envia contexto e descarta resultado', async () => {
  let received = null;
  const result = await runContextAdapterShadow({
    sessionContext: { isAuthenticated: true, user: { id: 'u1' } },
    channel: 'text',
  }, {
    enabled: true,
    adapterOptions: { now: FIXED_NOW },
    processor: async (input) => { received = input; return { ignored: true }; },
  });
  assert.equal(result.status, 'OBSERVED');
  assert.equal(received.context.featureFlags.uniOS, true);
  assert.equal(result.result, null);
});

test('logs DEV omitem IDs e dados privados', async () => {
  const logs = [];
  await runContextAdapterShadow({
    sessionContext: {
      isAuthenticated: true,
      session: { id: 'session-secret', access_token: 'jwt-secret' },
      user: { id: 'user-secret', email: 'private@example.com' },
    },
    workspace: { id: 'workspace-secret' },
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
  }, {
    enabled: true,
    isDevelopment: true,
    adapterOptions: { now: FIXED_NOW },
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
    processor: async () => ({}),
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /\[UNI OS\] Context/);
  assert.match(serialized, /America\/Sao_Paulo/);
  assert.doesNotMatch(serialized, /session-secret|jwt-secret|user-secret|workspace-secret|private@example/);
});

test('falha no modo sombra é contida', async () => {
  const result = await runContextAdapterShadow({}, {
    enabled: true,
    processor: async () => { throw new Error('internal'); },
  });
  assert.equal(result.status, 'FAILED_SAFE');
  assert.equal(result.context, null);
});
