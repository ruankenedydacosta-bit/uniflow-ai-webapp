import assert from 'node:assert/strict';
import test from 'node:test';
import { createUniOSOrchestrator, uniOS } from './index.js';

test('orchestrator percorre o fluxo obrigatório na ordem', async () => {
  const calls = [];
  const step = (name, result) => async () => { calls.push(name); return result; };
  const orchestrator = createUniOSOrchestrator({
    identity: step('identity', { basePersonality: [] }),
    state: step('state', { state: 'thinking' }),
    attention: step('attention', { type: 'casual' }),
    context: step('context', {}),
    memory: step('memory', { entries: [] }),
    planning: step('planning', { steps: [] }),
    reflection: step('reflection', {}),
    security: step('security', {}),
    permissions: step('permissions', {}),
    cognitive: step('cognitive', { status: 'NOT_IMPLEMENTED' }),
    emotion: step('emotion', { tone: 'calm' }),
    response: async (value) => { calls.push('response'); return value; },
  });

  await orchestrator.process({ parsedIntent: { intent: 'question' } });
  assert.deepEqual(calls, [
    'identity', 'state', 'attention', 'context', 'memory', 'planning',
    'reflection', 'security', 'permissions', 'cognitive', 'emotion', 'response',
  ]);
});

test('uniOS retorna resposta estruturada sem texto, voz ou execução', async () => {
  const parsedIntent = Object.freeze({ intent: 'register_expense', amount: 80 });
  const result = await uniOS.process({ parsedIntent });
  assert.equal(result.facts.attention.type, 'financial_action');
  assert.equal(result.facts.cognitive.status, 'NOT_IMPLEMENTED');
  assert.equal(result.plan.requiresConfirmation, true);
  assert.deepEqual(result.output, {
    status: 'NOT_IMPLEMENTED', text: null, voice: null, executesAction: false,
  });
  assert.deepEqual(parsedIntent, { intent: 'register_expense', amount: 80 });
});

test('orchestrator apenas lê providers de memória recebidos', async () => {
  let reads = 0;
  const result = await uniOS.process({
    parsedIntent: { intent: 'question' },
    memoryProviders: [{ providerName: 'existing', read: () => { reads += 1; return []; } }],
  });
  assert.equal(reads, 1);
  assert.equal(result.facts.memory.createdMemory, false);
});
