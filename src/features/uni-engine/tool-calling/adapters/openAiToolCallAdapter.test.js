// Uni Engine — Fase 20.1: Tool Calling — testes do adaptador OpenAI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOpenAiToolCall,
  runOpenAiToolCallAdapter,
  toolResultToPipeline,
} from './index.js';
import { createToolCallingRegistry } from '../registry/index.js';
import { createToolCallingDispatcher } from '../dispatcher/index.js';
import { createIdempotencyStore } from '../idempotency/index.js';

function buildSafeTool() {
  const registry = createToolCallingRegistry();
  registry.registerTool({
    name: 'fixture.echo',
    handler: ({ arguments: args }) => ({ data: { echoed: args?.value ?? null } }),
    enabled: true,
    requiresAuthorization: true,
  });
  const dispatcher = createToolCallingDispatcher({ idempotency: createIdempotencyStore() });
  return { registry, dispatcher };
}

const APPROVED_AUTH = { authorized: true, executionAllowed: true };

test('adapter - parse de tool call bruta válida converte para o contrato interno', () => {
  const parsed = parseOpenAiToolCall({
    id: 'call_abc123',
    type: 'function',
    function: { name: 'fixture.lookup', arguments: '{"key":"value"}' },
  });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.toolCall, { id: 'call_abc123', name: 'fixture.lookup', arguments: { key: 'value' } });
});

test('adapter - arguments ausente vira objeto vazio', () => {
  const parsed = parseOpenAiToolCall({
    id: 'call_abc123',
    function: { name: 'fixture.lookup' },
  });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.toolCall.arguments, {});
});

test('adapter - arguments JSON inválido falha sem executar', () => {
  const parsed = parseOpenAiToolCall({
    id: 'call_abc123',
    function: { name: 'fixture.lookup', arguments: '{not-json' },
  });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'TOOL_CALL_ARGUMENTS_JSON_INVALID');
});

test('adapter - arguments JSON não-objeto é rejeitado', () => {
  const parsed = parseOpenAiToolCall({
    id: 'call_abc123',
    function: { name: 'fixture.lookup', arguments: '"string"' },
  });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'TOOL_CALL_ARGUMENTS_INVALID');
});

test('adapter - id ausente falha', () => {
  const parsed = parseOpenAiToolCall({ function: { name: 'fixture.lookup', arguments: '{}' } });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'TOOL_CALL_ID_MISSING');
});

test('adapter - nome ausente falha', () => {
  const parsed = parseOpenAiToolCall({ id: 'call_abc123', function: { arguments: '{}' } });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'TOOL_CALL_NAME_MISSING');
});

test('adapter - formato desconhecido falha fail-safe', () => {
  assert.equal(parseOpenAiToolCall(null).error, 'RAW_TOOL_CALL_INVALID');
  assert.equal(parseOpenAiToolCall('x').error, 'RAW_TOOL_CALL_INVALID');
  assert.equal(parseOpenAiToolCall(42).error, 'RAW_TOOL_CALL_INVALID');
});

test('adapter - executa via dispatcher com autorização e retorna ToolResult', async () => {
  const { registry, dispatcher } = buildSafeTool();
  const outcome = await runOpenAiToolCallAdapter({
    rawToolCall: {
      id: 'call_abc123',
      function: { name: 'fixture.echo', arguments: '{"value":7}' },
    },
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: APPROVED_AUTH,
    turnId: 'turn-1',
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.executed, true);
  assert.equal(outcome.result.status, 'completed');
  assert.equal(outcome.result.executed, true);
  assert.deepEqual(outcome.result.data, { echoed: 7 });
});

test('adapter - sem dispatcher não executa nada (falha segura)', async () => {
  const { registry } = buildSafeTool();
  const outcome = await runOpenAiToolCallAdapter({
    rawToolCall: { id: 'call_abc123', function: { name: 'fixture.echo', arguments: '{}' } },
    dispatcher: null,
    registry,
    config: { toolCallingEnabled: true },
    authorization: APPROVED_AUTH,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, 'DISPATCHER_MISSING');
});

test('adapter - erro do dispatcher nunca escapa (fail-safe)', async () => {
  const { registry } = buildSafeTool();
  const outcome = await runOpenAiToolCallAdapter({
    rawToolCall: {
      id: 'call_abc123',
      function: { name: 'fixture.echo', arguments: '{}' },
    },
    dispatcher: { dispatchToolCall: async () => { throw new Error('boom'); } },
    registry,
    config: { toolCallingEnabled: true },
    authorization: APPROVED_AUTH,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, 'ADAPTER_DISPATCH_FAILED');
});

test('adapter - ToolResult convertido para pipeline nunca expõe dados brutos', async () => {
  const { registry, dispatcher } = buildSafeTool();
  const outcome = await runOpenAiToolCallAdapter({
    rawToolCall: {
      id: 'call_abc123',
      function: { name: 'fixture.echo', arguments: '{"value":42}' },
    },
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: APPROVED_AUTH,
    turnId: 'turn-1',
  });
  const pipeline = outcome.pipeline;
  assert.ok(pipeline);
  assert.equal(pipeline.toolCallId, 'call_abc123');
  assert.equal(pipeline.toolName, 'fixture.echo');
  assert.equal(pipeline.status, 'completed');
  assert.equal(pipeline.executed, true);
  assert.ok(!('data' in pipeline));
  assert.ok(!('arguments' in pipeline));
  assert.equal(pipeline.hasData, true);
  assert.equal(pipeline.serializable, true);
  assert.doesNotThrow(() => JSON.stringify(pipeline));
});
