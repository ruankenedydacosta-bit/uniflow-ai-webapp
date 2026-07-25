import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniSupportOrchestrator } from './uniSupportOrchestrator.js';

const silentLogger = { info() {}, warn() {}, error() {} };

test('sem provider -> resolve null (nenhuma tentativa)', async () => {
  const orchestrator = createUniSupportOrchestrator({ logger: silentLogger });
  const res = await orchestrator.generateSupportResponse({ text: 'como registro uma despesa?' });
  assert.equal(res, null);
});

test('resposta válida do provider retorna texto, usage e knowledge repassados', async () => {
  const provider = {
    generateResponse: async () => ({
      text: 'Você pode registrar uma movimentação em Financeiro.',
      usage: { promptTokens: 10, completionTokens: 5 },
      knowledge: { matched: true, usedDocumentIds: ['financial-management'], escalate: false },
      error: null,
    }),
  };
  const orchestrator = createUniSupportOrchestrator({ provider, logger: silentLogger });
  const res = await orchestrator.generateSupportResponse({ text: 'Como registro uma movimentação?' });
  assert.equal(res.text, 'Você pode registrar uma movimentação em Financeiro.');
  assert.deepEqual(res.usage, { promptTokens: 10, completionTokens: 5 });
  assert.deepEqual(res.knowledge, { matched: true, usedDocumentIds: ['financial-management'], escalate: false });
});

test('monta o payload via buildSupportRequestPayload -- provider recebe mode=support e productContext, nunca system/financialContext', async () => {
  let capturedArgs = null;
  const provider = {
    generateResponse: async (args) => {
      capturedArgs = args;
      return { text: 'ok', usage: null, knowledge: null, error: null };
    },
  };
  const orchestrator = createUniSupportOrchestrator({ provider, logger: silentLogger });
  await orchestrator.generateSupportResponse({ text: 'Como ouço uma resposta da Uni?', workspace: 'personal' });

  assert.equal(capturedArgs.mode, 'support');
  assert.ok(Array.isArray(capturedArgs.productContext));
  assert.ok(!('system' in capturedArgs));
  assert.ok(!('financialContext' in capturedArgs));
});

test('erro do provider (ex.: rede/timeout/rate limit) -> resolve null, nunca lança', async () => {
  const provider = {
    generateResponse: async () => ({ text: null, usage: null, knowledge: null, error: { code: 'TIMEOUT' } }),
  };
  const orchestrator = createUniSupportOrchestrator({ provider, logger: silentLogger });
  const res = await orchestrator.generateSupportResponse({ text: 'oi' });
  assert.equal(res, null);
});

test('exceção do provider é capturada, nunca propaga', async () => {
  const provider = { generateResponse: async () => { throw new Error('network down'); } };
  const orchestrator = createUniSupportOrchestrator({ provider, logger: silentLogger });
  const res = await orchestrator.generateSupportResponse({ text: 'oi' });
  assert.equal(res, null);
});

test('resposta que parece ação financeira estruturada é descartada pelo mesmo guard do modo financeiro (defesa em profundidade)', async () => {
  const provider = {
    generateResponse: async () => ({
      text: '{"action":"create","transaction":{"amount":50}}',
      usage: null,
      knowledge: null,
      error: null,
    }),
  };
  const orchestrator = createUniSupportOrchestrator({ provider, logger: silentLogger });
  const res = await orchestrator.generateSupportResponse({ text: 'crie uma despesa' });
  assert.equal(res, null);
});

test('mensagens vazias (payload sem histórico) -> resolve null sem chamar o provider', async () => {
  let called = false;
  const provider = { generateResponse: async () => { called = true; return { text: 'x', usage: null, knowledge: null, error: null }; } };
  const orchestrator = createUniSupportOrchestrator({ provider, logger: silentLogger });
  const res = await orchestrator.generateSupportResponse({ text: '' });
  assert.equal(res, null);
  assert.equal(called, false);
});
