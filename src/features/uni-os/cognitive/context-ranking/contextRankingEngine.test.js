import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  CONTEXT_RELEVANCE,
  createContextRankingSnapshot,
  normalizeUserMode,
  processContextRanking,
  runContextRankingShadow,
  scoreContextRelevance,
} from './index.js';

const NOW = '2026-07-13T12:00:00.000Z';
const WORKSPACE_ID = 'workspace-a';

function context(overrides = {}) {
  return {
    timestamp: NOW,
    session: { authenticated: true, state: 'authenticated' },
    user: { profileCompleted: true, mode: 'personal' },
    workspace: { id: WORKSPACE_ID, role: 'owner', type: 'personal' },
    conversation: { channel: 'text', language: 'pt-BR', timezone: 'America/Sao_Paulo' },
    personality: { mode: 'balanced' },
    featureFlags: { uniOS: false, premiumVoice: false },
    metadata: { version: '1.0' },
    ...overrides,
  };
}

function input(contextSnapshot = context(), overrides = {}) {
  return {
    parsedIntent: {
      intent: 'register_expense', source: 'text', language: 'pt-BR', entities: {},
    },
    contextSnapshot,
    goalSnapshot: { goals: [], primaryGoal: null },
    goalRankingSnapshot: { rankedGoals: [], primaryGoal: null },
    memoryRankingSnapshot: { rankedMemories: [], primaryMemory: null },
    ...overrides,
  };
}

test('schema expõe contrato e relevâncias oficiais', () => {
  const ranking = { key: 'conversation.language', value: 'pt-BR', relevance: 'HIGH', score: 70, reasons: [] };
  const snapshot = createContextRankingSnapshot({ rankedContext: [ranking], primaryContext: ranking });
  assert.deepEqual(CONTEXT_RELEVANCE, ['LOW', 'MEDIUM', 'HIGH']);
  assert.equal(snapshot.primaryContext.key, 'conversation.language');
});

test('ordena contexto pelo maior score', () => {
  const snapshot = processContextRanking(input(), { now: NOW });
  assert.equal(snapshot.rankedContext[0].key, 'workspace.type');
  assert.equal(snapshot.primaryContext.key, 'workspace.type');
});

test('score é determinístico e limitado ao contrato', () => {
  const ranking = scoreContextRelevance({
    key: 'conversation.language', value: 'pt-BR', observedAt: NOW,
  }, { parsedIntent: { intent: 'question', language: 'pt-BR' } }, { now: NOW });
  assert.equal(ranking.score, 45);
  assert.deepEqual(ranking.reasons, ['INTENT_MATCH', 'LANGUAGE_MATCH', 'RECENT_CONTEXT']);
});

test('empates preservam a ordem original', () => {
  const snapshot = processContextRanking(input({
    timestamp: NOW,
    conversation: { timezone: 'UTC' },
    personality: { mode: 'balanced' },
  }, { parsedIntent: {} }), { now: NOW });
  assert.deepEqual(snapshot.rankedContext.map((item) => item.key), [
    'conversation.timezone', 'personality.mode',
  ]);
});

test('workspace ativo recebe sinal próprio', () => {
  const snapshot = processContextRanking(input(), { now: NOW });
  const workspace = snapshot.rankedContext.find((item) => item.key === 'workspace.id');
  assert.equal(workspace.reasons.includes('ACTIVE_WORKSPACE'), true);
  assert.equal(workspace.value, WORKSPACE_ID);
});

test('elemento de outro workspace nunca participa', () => {
  const snapshot = processContextRanking(input(context({
    items: [
      { key: 'custom.allowed', value: 'ok', workspace_id: WORKSPACE_ID, observed_at: NOW },
      { key: 'custom.blocked', value: 'no', workspace_id: 'workspace-b', observed_at: NOW },
    ],
  })), { now: NOW });
  assert.equal(snapshot.rankedContext.some((item) => item.key === 'custom.allowed'), true);
  assert.equal(snapshot.rankedContext.some((item) => item.key === 'custom.blocked'), false);
});

test('sessão autenticada recebe relevância sem expor sessionId', () => {
  const snapshot = processContextRanking(input(context({
    session: { authenticated: true, state: 'authenticated', sessionId: 'private-session' },
  })), { now: NOW });
  const authenticated = snapshot.rankedContext.find((item) => item.key === 'session.authenticated');
  assert.equal(authenticated.reasons.includes('SESSION_ACTIVE'), true);
  assert.doesNotMatch(JSON.stringify(snapshot), /private-session/);
});

test('idioma compatível com intenção recebe score adicional', () => {
  const snapshot = processContextRanking(input(), { now: NOW });
  const language = snapshot.rankedContext.find((item) => item.key === 'conversation.language');
  assert.equal(language.reasons.includes('LANGUAGE_MATCH'), true);
});

test('canal de voz compatível recebe score adicional', () => {
  const snapshot = processContextRanking(input(context({
    conversation: { channel: 'voice', language: 'pt-BR', timezone: 'UTC' },
  }), { parsedIntent: { intent: 'question', source: 'voice', language: 'pt-BR' } }), { now: NOW });
  const channel = snapshot.rankedContext.find((item) => item.key === 'conversation.channel');
  assert.equal(channel.reasons.includes('CHANNEL_MATCH'), true);
  assert.equal(channel.value, 'voice');
});

test('modo do usuário normaliza PF, Empresa e Ambos', () => {
  assert.equal(normalizeUserMode('Pessoal'), 'personal');
  assert.equal(normalizeUserMode('Empresarial'), 'business');
  assert.equal(normalizeUserMode('Pessoal + Empresa'), 'both');
  assert.equal(normalizeUserMode('invalid'), null);
});

test('modo do usuário participa do contexto financeiro', () => {
  const snapshot = processContextRanking(input(), { now: NOW });
  const mode = snapshot.rankedContext.find((item) => item.key === 'user.mode');
  assert.equal(mode.reasons.includes('USER_MODE_MATCH'), true);
  assert.equal(mode.reasons.includes('INTENT_MATCH'), true);
});

test('objetivo principal aumenta contexto de workspace e modo', () => {
  const snapshot = processContextRanking(input(context(), {
    goalSnapshot: { primaryGoal: { id: 'goal-1' } },
    goalRankingSnapshot: { primaryGoal: { goalId: 'goal-1' } },
  }), { now: NOW });
  const workspace = snapshot.rankedContext.find((item) => item.key === 'workspace.id');
  assert.equal(workspace.reasons.includes('PRIMARY_GOAL_SIGNAL'), true);
});

test('memória financeira relevante aumenta contexto de workspace', () => {
  const snapshot = processContextRanking(input(context(), {
    memoryRankingSnapshot: { primaryMemory: { type: 'recurring_expense' } },
  }), { now: NOW });
  const workspace = snapshot.rankedContext.find((item) => item.key === 'workspace.id');
  assert.equal(workspace.reasons.includes('RELEVANT_MEMORY_SIGNAL'), true);
});

test('preferência conversacional relevante aumenta personalidade e conversa', () => {
  const snapshot = processContextRanking(input(context(), {
    memoryRankingSnapshot: { primaryMemory: { type: 'conversation_preference' } },
  }), { now: NOW });
  const personality = snapshot.rankedContext.find((item) => item.key === 'personality.mode');
  assert.equal(personality.reasons.includes('RELEVANT_MEMORY_SIGNAL'), true);
});

test('contexto expirado nunca participa', () => {
  const snapshot = processContextRanking(input(context({
    items: [{
      key: 'custom.expired', value: 'old', workspace_id: WORKSPACE_ID,
      observed_at: '2026-07-10T12:00:00.000Z', expires_at: '2026-07-12T12:00:00.000Z',
    }],
  })), { now: NOW });
  assert.equal(snapshot.rankedContext.some((item) => item.key === 'custom.expired'), false);
});

test('contextos inválidos nunca participam', () => {
  const snapshot = processContextRanking(input({
    timestamp: 'invalid',
    session: { state: 'unknown' },
    workspace: { id: WORKSPACE_ID, role: 'superuser' },
    conversation: { channel: 'video', language: 'invalid', timezone: '' },
    items: [{ key: '', value: 'invalid', workspace_id: WORKSPACE_ID, observed_at: NOW }],
  }), { now: NOW });
  assert.deepEqual(snapshot.rankedContext, []);
});

test('snapshot aplica deep freeze obrigatório', () => {
  const snapshot = processContextRanking(input(), { now: NOW });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.rankedContext), true);
  assert.equal(Object.isFrozen(snapshot.rankedContext[0]), true);
  assert.equal(Object.isFrozen(snapshot.rankedContext[0].reasons), true);
  assert.equal(Object.isFrozen(snapshot.metadata), true);
});

test('engine não altera SessionContext ou qualquer snapshot', () => {
  const source = input();
  const before = JSON.stringify(source);
  processContextRanking(source, { now: NOW });
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(source.contextSnapshot), false);
});

test('metadados proíbem criação, mutação, persistência e execução', () => {
  const snapshot = processContextRanking(input(), { now: NOW });
  assert.equal(snapshot.metadata.createdContext, false);
  assert.equal(snapshot.metadata.mutatedContext, false);
  assert.equal(snapshot.metadata.persisted, false);
  assert.equal(snapshot.metadata.executionAllowed, false);
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runContextRankingShadow(), { status: 'DISABLED', ranking: null });
});

test('modo sombra observa snapshot e descarta resultado', async () => {
  let observed;
  const result = await runContextRankingShadow(input(), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
    engineOptions: { now: NOW },
  });
  assert.equal(observed.rankedContext.length > 0, true);
  assert.deepEqual(result, { status: 'OBSERVED', ranking: null });
});

test('falhas do modo sombra são controladas', async () => {
  const result = await runContextRankingShadow(input(), {
    enabled: true,
    observer: () => { throw new Error('observer failure'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', ranking: null });
});

test('entradas vazias retornam snapshot seguro', () => {
  const snapshot = processContextRanking();
  assert.deepEqual(snapshot.rankedContext, []);
  assert.equal(snapshot.primaryContext, null);
});

test('módulo não chama APIs, Supabase ou modelos externos', async () => {
  const sources = await Promise.all([
    'contextRankingEngine.js', 'contextRankingPolicy.js', 'contextRankingSchema.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const source = sources.join('\n');
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /supabase|openai|elevenlabs/i);
});
