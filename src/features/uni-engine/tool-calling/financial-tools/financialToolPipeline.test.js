// Uni Engine — Fase 20.2: Tool Calling — segurança e pipeline.
//
// Garantias de segurança da Fase 20.2 sobre o registry real:
//   - Tool Calling desligado → nenhum dispatcher, nenhuma execução;
//   - autorização ausente / executionAllowed=false / Pending Action /
//     confirmação pendente → bloqueio sem execução;
//   - execução única por turno (idempotência por toolCallId);
//   - nenhuma escrita financeira, nenhuma rede, nenhuma segunda chamada LLM;
//   - fallback legado preservado;
//   - telemetria sanitizada (sem argumentos, valores ou IDs crus);
//   - erro interno nunca escapa (falha-segura).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/buildFinancialSnapshot.js';
import {
  buildFixtureAccounts,
  buildFixtureCategories,
  buildFixtureTransactions,
} from '../../financial-reasoning/testFixtures.js';
import {
  createFinancialDataToolsContext,
  createFinancialReadToolsRegistry,
} from '../financial-tools/index.js';
import {
  runToolCallingIntegration,
} from '../integration/index.js';
import {
  createToolCallingRegistry,
} from '../registry/index.js';
import {
  createToolCallingDispatcher,
} from '../dispatcher/index.js';
import {
  hashToolCallId,
  TOOL_CALLING_TELEMETRY_ALLOWED_FIELDS,
} from '../telemetry/index.js';

function buildSnapshot() {
  return buildFinancialReasoningSnapshot({
    accounts: buildFixtureAccounts(),
    categories: buildFixtureCategories(),
    transactions: buildFixtureTransactions(),
    goals: [],
    referenceDate: '2026-08-15',
  });
}

async function callTool(dispatcher, registry, name, args = {}, authorization, config = {}) {
  return dispatcher.dispatchToolCall({
    toolCall: { id: `call-${name}`, name, arguments: args },
    registry,
    config: { toolCallingEnabled: true, toolCallingShadowMode: true, toolCallingTelemetryEnabled: false, ...config },
    authorization: authorization ?? { authorized: true, executionAllowed: true },
    turnId: 'turn-1',
  });
}

function rawToolCall(id, name, argumentsJson = '{}') {
  return { id, type: 'function', function: { name, arguments: argumentsJson } };
}

// ============================================================================
// INTEGRAÇÃO (Fase 20.1)
// ============================================================================

test('integração - Tool Calling desligado → fallback legado', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: false },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1' },
  });
  assert.equal(outcome.enabled, false);
  assert.equal(outcome.reason, 'TOOL_CALLING_DISABLED');
  assert.equal(outcome.executed, false);
  assert.equal(outcome.count, 0);
});

test('integração - sem identidade de turno → nenhuma execução', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    context: {},
  });
  assert.equal(outcome.reason, 'TURN_IDENTITY_MISSING');
  assert.equal(outcome.executed, false);
});

test('integração - mesma mensagem não é analisada 2x (via messageDedupeStore do chamador)', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const options = {
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true, toolCallingShadowMode: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-x' },
    messageDedupeStore: new Set(),
  };
  const first = await runToolCallingIntegration(options);
  const second = await runToolCallingIntegration(options);
  assert.equal(first.count, 1);
  assert.equal(second.reason, 'MESSAGE_ALREADY_ANALYZED');
  assert.equal(second.count, 0);
});

test('integração - sem tool calls → NO_TOOL_CALLS', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-y' },
  });
  assert.equal(outcome.reason, 'NO_TOOL_CALLS');
  assert.equal(outcome.count, 0);
});

test('integração - sem dispatcher → fallback seguro', async () => {
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary')],
    dispatcher: null,
    registry: null,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-z' },
  });
  assert.equal(outcome.reason, 'DISPATCHER_MISSING');
  assert.equal(outcome.count, 0);
});

test('integração - execução completa com pipeline sanitizado', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true, toolCallingShadowMode: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-1', workspaceId: 'ws-1', conversationId: 'conv-1' },
  });
  assert.equal(outcome.reason, 'TOOL_CALLS_PROCESSED');
  assert.equal(outcome.executed, true);
  assert.equal(outcome.count, 1);
  const pipeline = outcome.results[0];
  assert.equal(pipeline.toolName, 'get_financial_summary');
  assert.equal(pipeline.status, 'completed');
  assert.equal(pipeline.executed, true);
  assert.equal(pipeline.errorCode, null);
  assert.deepEqual(Object.keys(pipeline).sort(), [
    'authorized', 'errorCode', 'executionAllowed', 'executed', 'hasData', 'idempotent', 'serializable', 'status', 'toolCallId', 'toolName',
  ].sort());
});

test('integração - argumentos JSON inválidos → erro sem execução', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary', '{invalido')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-2' },
  });
  assert.equal(outcome.results[0].executed, false);
  assert.equal(outcome.results[0].errorCode, 'TOOL_CALL_ARGUMENTS_JSON_INVALID');
});

test('integração - sem autorização → nenhuma execução', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: null,
    context: { turnId: 'turn-1', messageId: 'msg-3' },
  });
  assert.equal(outcome.results[0].executed, false);
  assert.equal(outcome.results[0].authorized, false);
});

// ============================================================================
// GATES DO DISPATCHER
// ============================================================================

test('gate - autorização ausente → bloqueado', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary', {}, {});
  assert.equal(outcome.executed, false);
  assert.equal(outcome.selection.reason, 'AUTHORIZATION_MISSING');
  assert.equal(outcome.result.status, 'unauthorized');
});

test('gate - executionAllowed=false → bloqueado', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary', {}, { authorized: true, executionAllowed: false });
  assert.equal(outcome.executed, false);
  assert.equal(outcome.selection.reason, 'EXECUTION_NOT_ALLOWED');
});

test('gate - Pending Action ativa → bloqueio preservado', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary', {}, { authorized: true, executionAllowed: true, pendingAction: true });
  assert.equal(outcome.executed, false);
  assert.equal(outcome.selection.reason, 'PENDING_ACTION_ACTIVE');
  assert.equal(outcome.selection.gates.pendingActionBlocked, true);
});

test('gate - confirmação pendente → bloqueio preservado', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary', {}, { authorized: true, executionAllowed: true, confirmationPending: true });
  assert.equal(outcome.executed, false);
  assert.equal(outcome.selection.reason, 'CONFIRMATION_PENDING');
  assert.equal(outcome.selection.gates.confirmationPendingBlocked, true);
});

test('gate - ferramenta desconhecida → TOOL_NOT_FOUND', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'delete_everything', {});
  assert.equal(outcome.executed, false);
  assert.equal(outcome.selection.reason, 'TOOL_NOT_FOUND');
  assert.equal(outcome.result.status, 'not_found');
});

test('gate - ferramenta desabilitada → TOOL_DISABLED', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: false } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary', {});
  assert.equal(outcome.executed, false);
  assert.equal(outcome.selection.reason, 'TOOL_DISABLED');
});

test('gate - Tool Calling desligado no dispatcher → nenhuma execução', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary', {}, { authorized: true, executionAllowed: true }, { toolCallingEnabled: false });
  assert.equal(outcome.executed, false);
  assert.equal(outcome.safeText, 'TOOL_CALLING_DISABLED');
  assert.equal(outcome.result.status, 'skipped');
});

test('gate - argumentos malformados → skip sem execução', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary', 'not-an-object');
  assert.equal(outcome.executed, false);
  assert.equal(outcome.selection.reason, 'TOOL_CALL_INVALID');
});

// ============================================================================
// IDEMPOTÊNCIA E IDENTIDADE
// ============================================================================

test('idempotência - execução única por turno e por toolCallId', async () => {
  const { dispatcher, registry, idempotency } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const first = await callTool(dispatcher, registry, 'get_financial_summary');
  const second = await callTool(dispatcher, registry, 'get_financial_summary');
  assert.equal(first.executed, true);
  assert.equal(second.executed, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.safeText, 'TOOL_ALREADY_EXECUTED');
  assert.equal(idempotency.size(), 1);
  assert.equal(second.result, first.result);
});

test('idempotência - novo turno executa novamente', async () => {
  const { dispatcher, registry, idempotency } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const first = await dispatcher.dispatchToolCall({
    toolCall: { id: 'call-x', name: 'get_financial_summary', arguments: {} },
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    turnId: 'turn-1',
  });
  const second = await dispatcher.dispatchToolCall({
    toolCall: { id: 'call-x', name: 'get_financial_summary', arguments: {} },
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    turnId: 'turn-2',
  });
  assert.equal(first.executed, true);
  assert.equal(second.executed, true);
  assert.equal(idempotency.size(), 2);
});

test('idempotência - troca de conversationId executa novamente', async () => {
  const { dispatcher, registry, idempotency } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const base = {
    toolCall: { id: 'call-x', name: 'get_financial_summary', arguments: {} },
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    turnId: 'turn-1',
    workspaceId: 'ws-1',
  };
  const first = await dispatcher.dispatchToolCall({ ...base, conversationId: 'conv-1' });
  const second = await dispatcher.dispatchToolCall({ ...base, conversationId: 'conv-2' });
  assert.equal(first.executed, true);
  assert.equal(second.executed, true);
  assert.equal(idempotency.size(), 2);
});

test('idempotência - troca de workspaceId executa novamente', async () => {
  const { dispatcher, registry, idempotency } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const base = {
    toolCall: { id: 'call-x', name: 'get_financial_summary', arguments: {} },
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    turnId: 'turn-1',
    conversationId: 'conv-1',
  };
  const first = await dispatcher.dispatchToolCall({ ...base, workspaceId: 'ws-1' });
  const second = await dispatcher.dispatchToolCall({ ...base, workspaceId: 'ws-2' });
  assert.equal(first.executed, true);
  assert.equal(second.executed, true);
  assert.equal(idempotency.size(), 2);
});

test('idempotência - turno antigo é detectado como stale', async () => {
  const { dispatcher, registry, idempotency } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  await dispatcher.dispatchToolCall({
    toolCall: { id: 'call-x', name: 'get_financial_summary', arguments: {} },
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    turnId: 'turn-1',
    workspaceId: 'ws-1',
    conversationId: 'conv-1',
  });
  assert.equal(idempotency.isStaleTurn({ turnId: 'turn-2', workspaceId: 'ws-1', conversationId: 'conv-1' }), true);
  assert.equal(idempotency.isStaleTurn({ turnId: 'turn-1', workspaceId: 'ws-1', conversationId: 'conv-1' }), false);
});

test('idempotência - StrictMode: chamada duplicada sequencial executa 1x', async () => {
  const registry = createToolCallingRegistry();
  let executions = 0;
  registry.registerTool({
    name: 'counter_tool',
    handler: () => {
      executions += 1;
      return { data: { ok: true, tool: 'counter_tool', data: { count: executions }, meta: {} } };
    },
    reads: true,
    writes: false,
    timeoutMs: 2000,
    metadata: { reads: true, writes: false },
  });
  const dispatcher = createToolCallingDispatcher();
  const options = {
    toolCall: { id: 'call-counter', name: 'counter_tool', arguments: {} },
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    turnId: 'turn-1',
  };
  await dispatcher.dispatchToolCall(options);
  await dispatcher.dispatchToolCall(options);
  assert.equal(executions, 1);
});

// ============================================================================
// EXECUTOR (FALHAS)
// ============================================================================

test('executor - timeout curto → TOOL_TIMEOUT', async () => {
  const registry = createToolCallingRegistry();
  registry.registerTool({
    name: 'slow_tool',
    handler: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { data: { ok: true } };
    },
    reads: true,
    writes: false,
    timeoutMs: 5,
    metadata: { reads: true, writes: false },
  });
  const dispatcher = createToolCallingDispatcher();
  const outcome = await dispatcher.dispatchToolCall({
    toolCall: { id: 'call-slow', name: 'slow_tool', arguments: {} },
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    turnId: 'turn-1',
  });
  assert.equal(outcome.result.status, 'timeout');
  assert.equal(outcome.result.error.code, 'TOOL_TIMEOUT');
});

test('executor - erro interno nunca escapa → HANDLER_ERROR', async () => {
  const registry = createToolCallingRegistry();
  registry.registerTool({
    name: 'boom_tool',
    handler: () => {
      throw new Error('BOOM');
    },
    reads: true,
    writes: false,
    metadata: { reads: true, writes: false },
  });
  const dispatcher = createToolCallingDispatcher();
  let threw = false;
  let outcome;
  try {
    outcome = await dispatcher.dispatchToolCall({
      toolCall: { id: 'call-boom', name: 'boom_tool', arguments: {} },
      registry,
      config: { toolCallingEnabled: true },
      authorization: { authorized: true, executionAllowed: true },
      turnId: 'turn-1',
    });
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.equal(outcome.result.status, 'error');
  assert.equal(outcome.result.error.code, 'HANDLER_ERROR');
});

test('executor - resultado não serializável → RESULT_NOT_SERIALIZABLE', async () => {
  const registry = createToolCallingRegistry();
  registry.registerTool({
    name: 'weird_tool',
    handler: () => () => {},
    reads: true,
    writes: false,
    metadata: { reads: true, writes: false },
  });
  const dispatcher = createToolCallingDispatcher();
  const outcome = await dispatcher.dispatchToolCall({
    toolCall: { id: 'call-weird', name: 'weird_tool', arguments: {} },
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    turnId: 'turn-1',
  });
  assert.equal(outcome.result.status, 'error');
  assert.equal(outcome.result.error.code, 'RESULT_NOT_SERIALIZABLE');
});

// ============================================================================
// NENHUMA ESCRITA / NENHUMA REDE / NENHUMA SEGUNDA CHAMADA LLM
// ============================================================================

test('segurança - nenhuma escrita financeira pode ser registrada', () => {
  const registry = createToolCallingRegistry({ allowWrites: false });
  const blocked = registry.registerTool({
    name: 'update_account',
    handler: () => ({ data: {} }),
    writes: true,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'REGISTRATION_WRITES_BLOCKED');
  const allowed = registry.registerTool({
    name: 'read_only_tool',
    handler: () => ({ data: {} }),
    writes: false,
  });
  assert.equal(allowed.ok, true);
  assert.equal(registry.size(), 1);
});

test('segurança - registry financeiro nunca registra escrita', () => {
  const registry = createFinancialReadToolsRegistry({ snapshot: buildSnapshot(), config: { enabled: true } });
  const blocked = registry.registerTool({
    name: 'pay_bill',
    handler: () => ({ data: {} }),
    writes: true,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'REGISTRATION_WRITES_BLOCKED');
  for (const name of registry.list()) {
    assert.equal(registry.get(name).metadata.writes, false);
  }
});

test('segurança - nenhuma chamada de rede durante execução', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };
  try {
    const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
    const outcome = await callTool(dispatcher, registry, 'get_financial_summary');
    assert.equal(outcome.executed, true);
  } finally {
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
  }
  assert.equal(fetchCalls, 0);
});

test('segurança - nenhuma segunda chamada LLM: pipeline sem conteúdo de resposta', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true, toolCallingShadowMode: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-4' },
  });
  const json = JSON.stringify(outcome);
  assert.ok(!/openai/i.test(json));
  assert.ok(!json.includes('6000'));
  assert.ok(!json.includes('13300'));
  assert.ok(!json.includes('Aluguel'));
  assert.equal(outcome.results[0].hasData, true);
});

// ============================================================================
// TELEMETRIA E SERIALIZAÇÃO
// ============================================================================

test('telemetria - sanitizada: sem argumentos, valores ou IDs crus', async () => {
  const { dispatcher, registry, telemetry } = createFinancialDataToolsContext({
    snapshot: buildSnapshot(),
    config: { enabled: true },
    telemetryEnabled: true,
  });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary', { period: '2026-08' }, { authorized: true, executionAllowed: true }, { toolCallingTelemetryEnabled: true });
  assert.equal(outcome.executed, true);
  const entries = telemetry.getSnapshot();
  assert.ok(entries.length >= 2);
  const executed = entries.find((entry) => entry.status === 'completed');
  assert.ok(executed);
  assert.equal(executed.toolCallIdHash, hashToolCallId('call-get_financial_summary'));
  for (const entry of entries) {
    for (const key of Object.keys(entry)) {
      assert.ok(TOOL_CALLING_TELEMETRY_ALLOWED_FIELDS.includes(key), `campo não permitido: ${key}`);
    }
  }
  const json = JSON.stringify(entries);
  assert.ok(!json.includes('call-get_financial_summary'));
  assert.ok(!json.includes('2026-08'));
  assert.ok(!json.includes('6000'));
  assert.ok(!json.includes('13300'));
});

test('telemetria - desligada não registra nada', async () => {
  const { dispatcher, registry, telemetry } = createFinancialDataToolsContext({
    snapshot: buildSnapshot(),
    config: { enabled: true },
    telemetryEnabled: false,
  });
  await callTool(dispatcher, registry, 'get_financial_summary', {}, { authorized: true, executionAllowed: true }, { toolCallingTelemetryEnabled: true });
  assert.equal(telemetry.size(), 0);
});

test('serialização - round-trip preserva o envelope', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary');
  const roundTripped = JSON.parse(JSON.stringify(outcome.result));
  assert.deepEqual(roundTripped, outcome.result);
  assert.equal(roundTripped.data.ok, true);
});

test('serialização - resultado completo do handler é JSON-safe', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_account_summary');
  assert.doesNotThrow(() => JSON.stringify(outcome.result.data));
});

// ============================================================================
// FASE 21 — NARRATIVA NA RESPOSTA FINAL (responseText)
// ============================================================================

test('FASE 21 - resposta financeira: ToolResult real de get_financial_summary gera responseText natural', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true, toolCallingShadowMode: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-narr-1' },
  });
  assert.equal(typeof outcome.responseText, 'string');
  assert.doesNotMatch(outcome.responseText, /\{/);
  assert.doesNotMatch(outcome.responseText, /"ok"/);
});

test('FASE 21 - sem ToolResult (Tool Calling desligado): responseText é null, fallback legado preservado', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: false },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-narr-2' },
  });
  assert.equal(outcome.responseText, null);
});

test('FASE 21 - ausência de tool_calls: responseText é null', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-narr-3' },
  });
  assert.equal(outcome.responseText, null);
});

test('FASE 21 - ToolResult inválido (argumentos JSON quebrados): responseText é null', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary', '{invalido')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-narr-4' },
  });
  assert.equal(outcome.responseText, null);
});

test('FASE 21 - ToolResult vazio (autorização ausente, nada executado): responseText é null', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: null,
    context: { turnId: 'turn-1', messageId: 'msg-narr-5' },
  });
  assert.equal(outcome.responseText, null);
});

test('FASE 21 - timeout: ferramenta lenta nunca produz responseText', async () => {
  const registry = createToolCallingRegistry();
  registry.registerTool({
    name: 'slow_narr_tool',
    handler: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { data: { ok: true, tool: 'slow_narr_tool', data: {}, meta: {} } };
    },
    reads: true,
    writes: false,
    timeoutMs: 5,
    metadata: { reads: true, writes: false },
  });
  const dispatcher = createToolCallingDispatcher();
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'slow_narr_tool')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-narr-6' },
  });
  assert.equal(outcome.responseText, null);
});

test('FASE 21 - erro interno do handler nunca vira responseText', async () => {
  const registry = createToolCallingRegistry();
  registry.registerTool({
    name: 'boom_narr_tool',
    handler: () => { throw new Error('BOOM'); },
    reads: true,
    writes: false,
    metadata: { reads: true, writes: false },
  });
  const dispatcher = createToolCallingDispatcher();
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'boom_narr_tool')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-narr-7' },
  });
  assert.equal(outcome.responseText, null);
});

test('FASE 21 - serialização: outcome com responseText continua JSON-safe', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_financial_summary')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-narr-8' },
  });
  assert.doesNotThrow(() => JSON.stringify(outcome));
  const roundTripped = JSON.parse(JSON.stringify(outcome));
  assert.equal(roundTripped.responseText, outcome.responseText);
});

test('FASE 21 - conversationStyle simple produz responseText em uma única linha', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await runToolCallingIntegration({
    rawToolCalls: [rawToolCall('raw-1', 'get_expense_breakdown')],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true },
    authorization: { authorized: true, executionAllowed: true },
    context: { turnId: 'turn-1', messageId: 'msg-narr-9' },
    conversationStyle: 'simple',
  });
  assert.equal(typeof outcome.responseText, 'string');
  assert.doesNotMatch(outcome.responseText, /\n/);
});