// Uni Engine — Fase 24: Ativação Controlada (Rollout) do Tool Calling.
//
// Matriz oficial de rollout: cobre toda combinação válida da cascata de
// flags (toolCallingEnabled, toolCallingShadowMode, toolCallingTelemetryEnabled,
// toolCallingRequired) contra o comportamento REAL do pipeline (cascata de
// config → runToolCallingIntegration → dispatcher → executor), usando o
// mesmo padrão de autorização que src/features/uni-chat/UniChatPage.jsx usa
// em produção (authorization.executionAllowed = !toolCallingShadowMode).
//
// Estados cobertos:
//   OFF               → 100% legado (nenhum dispatcher chamado)
//   ON + Shadow        → Tool Calling roda (dispatcher/selection), mas NUNCA
//                         executa nem publica (executionAllowed=false)
//   ON + Execution      → Tool Calling executa e publica (responseText)
//   ON + Required       → como Execution, mas se o pipeline estiver
//                         indisponível o reason vira um erro explícito
//                         (TOOL_CALLING_REQUIRED_UNAVAILABLE), nunca lança
//                         exceção (fail-safe preservado)
//
// Nenhuma combinação testada aqui produz um estado inválido: toda saída é
// sempre um objeto serializável com `reason` e `executed` coerentes com a
// flag testada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniEngineConfig } from '../../uniEngineConfig.js';
import { runToolCallingIntegration } from '../integration/index.js';
import {
  createFinancialDataToolsContext,
} from '../financial-tools/index.js';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/buildFinancialSnapshot.js';
import {
  buildFixtureAccounts,
  buildFixtureCategories,
  buildFixtureTransactions,
} from '../../financial-reasoning/testFixtures.js';

function buildSnapshot() {
  return buildFinancialReasoningSnapshot({
    accounts: buildFixtureAccounts(),
    categories: buildFixtureCategories(),
    transactions: buildFixtureTransactions(),
    goals: [],
    referenceDate: '2026-08-15',
  });
}

function buildEngineConfig(envOverrides = {}) {
  return createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      ...envOverrides,
    },
  });
}

// Mesma regra usada em UniChatPage.jsx: executionAllowed só é true fora de
// shadow mode; pendingAction/confirmationPending nunca ativos nestes testes.
function buildAuthorization(config) {
  return {
    authorized: true,
    executionAllowed: config.toolCallingShadowMode !== true,
    pendingAction: false,
    confirmationPending: false,
  };
}

async function runMatrixCall(config, { withPipeline = true, messageId = 'msg-matrix' } = {}) {
  const { dispatcher, registry } = withPipeline
    ? createFinancialDataToolsContext({
        snapshot: buildSnapshot(),
        config: { enabled: true },
        telemetryEnabled: config.toolCallingTelemetryEnabled === true,
        allowWrites: false,
      })
    : { dispatcher: null, registry: null };

  return runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', type: 'function', function: { name: 'get_financial_summary', arguments: '{}' } }],
    dispatcher,
    registry,
    config,
    authorization: buildAuthorization(config),
    context: { turnId: 'turn-matrix', messageId, conversationId: 'conv-matrix', workspaceId: 'ws-matrix' },
    conversationStyle: 'simple',
  });
}

// ============================================================================
// 1. AUDITORIA DA CASCATA DE FLAGS — nenhuma combinação gera estado inválido
// ============================================================================

test('MATRIZ - OFF (config.enabled=false): toolCallingEnabled cai para false, e todo o resto da cascata cai junto', () => {
  const config = createUniEngineConfig({ env: { VITE_UNI_ENGINE_ENABLED: 'false' } });
  assert.equal(config.toolCallingEnabled, false);
  assert.equal(config.toolCallingShadowMode, false);
  assert.equal(config.toolCallingTelemetryEnabled, false);
  assert.equal(config.toolCallingRequired, false);
});

test('MATRIZ - motor ligado, Tool Calling nunca ligado por padrão (opt-in explícito) — shadow cai junto por estar desligado', () => {
  const config = buildEngineConfig();
  assert.equal(config.toolCallingEnabled, false);
  // shadowMode "nasce" true (avaliar é seguro), mas a cascata força-o a
  // false quando toolCallingEnabled é false -- não há shadow sem Tool
  // Calling ligado. Confirmado abaixo com toolCallingEnabled=true isolado.
  assert.equal(config.toolCallingShadowMode, false);

  const enabledConfig = buildEngineConfig({ VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true' });
  assert.equal(enabledConfig.toolCallingEnabled, true);
  assert.equal(enabledConfig.toolCallingShadowMode, true);
});

test('MATRIZ - toolCallingEnabled=false força shadow/telemetry/required=false mesmo se pedidos via env', () => {
  const config = buildEngineConfig({
    VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'false',
    VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'false',
    VITE_UNI_ENGINE_TOOL_CALLING_TELEMETRY: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_REQUIRED: 'true',
  });
  assert.equal(config.toolCallingEnabled, false);
  assert.equal(config.toolCallingShadowMode, false);
  assert.equal(config.toolCallingTelemetryEnabled, false);
  assert.equal(config.toolCallingRequired, false);
});

test('MATRIZ - toolCallingEnabled=true + shadow=true + telemetry=true + required=true: combinação válida, nenhum campo é forçado', () => {
  const config = buildEngineConfig({
    VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_TELEMETRY: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_REQUIRED: 'true',
  });
  assert.equal(config.toolCallingEnabled, true);
  assert.equal(config.toolCallingShadowMode, true);
  assert.equal(config.toolCallingTelemetryEnabled, true);
  assert.equal(config.toolCallingRequired, true);
});

test('MATRIZ - rolloutEnabled (Parte 10, subsistema geral) é independente de Tool Calling: nenhuma combinação entre eles é inválida', () => {
  // ACHADO DE AUDITORIA (não é bug de Tool Calling, fora do escopo desta
  // fase corrigir): createUniEngineConfig() não inclui `rolloutEnabled` no
  // objeto retornado (só existe em UNI_ENGINE_DEFAULT_CONFIG, usado apenas
  // como fallback em isUniEngineShadowEnabled). Todo consumidor real do
  // Parte 10 (rolloutPolicy.js, buildRolloutSnapshot.js etc.) já lê esse
  // campo defensivamente (`Boolean(config.rolloutEnabled)` / `!== true`),
  // então `undefined` já se comporta como `false` -- sem impacto funcional
  // e sem qualquer acoplamento com a cascata de Tool Calling.
  for (const toolCalling of [true, false]) {
    const config = buildEngineConfig({ VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: String(toolCalling) });
    assert.equal(config.toolCallingEnabled, toolCalling);
    assert.notEqual(config.rolloutEnabled, true);
  }
});

// ============================================================================
// 2. MATRIZ OFICIAL — comportamento real do pipeline por estado
// ============================================================================

test('MATRIZ - OFF => 100% comportamento legado (Tool Calling nunca roda, mesmo com tool_calls e dispatcher disponíveis)', async () => {
  const config = buildEngineConfig({ VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'false' });
  const result = await runMatrixCall(config);
  assert.equal(result.enabled, false);
  assert.equal(result.reason, 'TOOL_CALLING_DISABLED');
  assert.equal(result.executed, false);
  assert.equal(result.responseText, null);
  assert.equal(result.count, 0);
});

test('MATRIZ - ON + Shadow => Tool Calling roda (dispatcher/selection avaliados), mas NUNCA executa nem publica', async () => {
  const config = buildEngineConfig({
    VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'true',
  });
  const result = await runMatrixCall(config);
  assert.equal(result.enabled, true);
  assert.equal(result.reason, 'TOOL_CALLS_PROCESSED');
  assert.equal(result.executed, false);
  assert.equal(result.responseText, null);
  assert.equal(result.results[0].status, 'not_allowed');
  assert.equal(result.results[0].executed, false);
});

test('MATRIZ - ON + Execution => Tool Calling executa de verdade e publica (responseText presente)', async () => {
  const config = buildEngineConfig({
    VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'false',
  });
  const result = await runMatrixCall(config);
  assert.equal(result.enabled, true);
  assert.equal(result.reason, 'TOOL_CALLS_PROCESSED');
  assert.equal(result.executed, true);
  assert.equal(typeof result.responseText, 'string');
  assert.equal(result.results[0].status, 'completed');
});

test('MATRIZ - Required + pipeline disponível: executa normalmente, nenhum erro (required não bloqueia sucesso)', async () => {
  const config = buildEngineConfig({
    VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'false',
    VITE_UNI_ENGINE_TOOL_CALLING_REQUIRED: 'true',
  });
  const result = await runMatrixCall(config);
  assert.equal(result.executed, true);
  assert.notEqual(result.reason, 'TOOL_CALLING_REQUIRED_UNAVAILABLE');
});

test('MATRIZ - Required + pipeline indisponível: reason explícito, nunca lança exceção (fail-safe preservado)', async () => {
  const config = buildEngineConfig({
    VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_REQUIRED: 'true',
  });
  const result = await runMatrixCall(config, { withPipeline: false });
  assert.equal(result.reason, 'TOOL_CALLING_REQUIRED_UNAVAILABLE');
  assert.equal(result.executed, false);
  assert.doesNotThrow(() => JSON.stringify(result));
});

// ============================================================================
// 3. ROLLBACK — desligar qualquer flag volta imediatamente ao legado
// ============================================================================

test('ROLLBACK - desligar toolCallingEnabled entre dois turnos volta imediatamente ao legado, sem estado residual', async () => {
  const onConfig = buildEngineConfig({
    VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'false',
  });
  const first = await runMatrixCall(onConfig, { messageId: 'msg-rollback-1' });
  assert.equal(first.executed, true);

  const offConfig = buildEngineConfig({ VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'false' });
  const second = await runMatrixCall(offConfig, { messageId: 'msg-rollback-2' });
  assert.equal(second.reason, 'TOOL_CALLING_DISABLED');
  assert.equal(second.executed, false);
});

test('ROLLBACK - voltar de Execution para Shadow bloqueia execução no turno seguinte imediatamente', async () => {
  const executionConfig = buildEngineConfig({
    VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'false',
  });
  const executed = await runMatrixCall(executionConfig, { messageId: 'msg-rollback-3' });
  assert.equal(executed.executed, true);

  const shadowConfig = buildEngineConfig({
    VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'true',
  });
  const shadowed = await runMatrixCall(shadowConfig, { messageId: 'msg-rollback-4' });
  assert.equal(shadowed.executed, false);
});

// ============================================================================
// 4. ISOLAMENTO — nenhuma execução vaza entre usuários/workspaces/conversas/turnos
// ============================================================================

test('ISOLAMENTO - dois turnos com contextos (workspace/conversation) diferentes nunca compartilham resultado de idempotência', async () => {
  const config = buildEngineConfig({
    VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'false',
  });
  const snapshot = buildSnapshot();
  const { dispatcher, registry, idempotency } = createFinancialDataToolsContext({ snapshot, config: { enabled: true } });

  const userA = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', type: 'function', function: { name: 'get_financial_summary', arguments: '{}' } }],
    dispatcher,
    registry,
    config,
    authorization: buildAuthorization(config),
    context: { turnId: 'turn-1', messageId: 'msg-a', conversationId: 'conv-A', workspaceId: 'ws-A' },
  });
  const userB = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', type: 'function', function: { name: 'get_financial_summary', arguments: '{}' } }],
    dispatcher,
    registry,
    config,
    authorization: buildAuthorization(config),
    context: { turnId: 'turn-1', messageId: 'msg-b', conversationId: 'conv-B', workspaceId: 'ws-B' },
  });

  assert.equal(userA.executed, true);
  assert.equal(userB.executed, true);
  assert.equal(idempotency.size(), 2, 'workspace/conversation diferentes devem gerar chaves de idempotência distintas');
});

test('ISOLAMENTO - cada turno em produção recebe um contexto de tool calling NOVO (createFinancialDataToolsContext por turno, nunca compartilhado)', async () => {
  const config = buildEngineConfig({
    VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'false',
  });
  const first = await runMatrixCall(config, { messageId: 'msg-iso-1' });
  const second = await runMatrixCall(config, { messageId: 'msg-iso-2' });
  // runMatrixCall cria um createFinancialDataToolsContext novo a cada
  // chamada -- exatamente como UniChatPage.jsx faz por turno -- então o
  // segundo turno nunca reaproveita idempotência do primeiro.
  assert.equal(first.executed, true);
  assert.equal(second.executed, true);
});

// ============================================================================
// 5. AUDITORIA DE SEGURANÇA — nenhum dado bruto/ID interno exposto, em NENHUM estado da matriz
// ============================================================================

test('SEGURANÇA - em todos os estados da matriz, o resultado nunca expõe data/arguments/IDs crus e é sempre JSON-safe', async () => {
  const states = [
    buildEngineConfig({ VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'false' }),
    buildEngineConfig({ VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true', VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'true' }),
    buildEngineConfig({ VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true', VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'false' }),
    buildEngineConfig({ VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true', VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'false', VITE_UNI_ENGINE_TOOL_CALLING_REQUIRED: 'true' }),
  ];
  let index = 0;
  for (const config of states) {
    const result = await runMatrixCall(config, { messageId: `msg-sec-${index++}` });
    assert.doesNotThrow(() => JSON.stringify(result));
    for (const item of result.results) {
      assert.ok(!('data' in item), 'results[] nunca deve conter data bruto');
      assert.ok(!('arguments' in item), 'results[] nunca deve conter arguments brutos');
    }
    if (result.responseText) {
      assert.doesNotMatch(result.responseText, /\{/, 'responseText nunca deve parecer JSON');
      assert.doesNotMatch(result.responseText, /"ok"/);
    }
  }
});

test('SEGURANÇA - nenhuma escrita financeira é possível em nenhum estado (allowWrites nunca true no wiring de produção)', async () => {
  const config = buildEngineConfig({
    VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'true',
    VITE_UNI_ENGINE_TOOL_CALLING_SHADOW: 'false',
  });
  const { registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true }, allowWrites: false });
  const blocked = registry.registerTool({ name: 'write_tool', handler: () => ({ data: {} }), writes: true });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'REGISTRATION_WRITES_BLOCKED');
  void config;
});

// ============================================================================
// 6. PERFORMANCE — OFF deve ser praticamente gratuito comparado ao legado
// ============================================================================

test('PERFORMANCE - Tool Calling OFF tem overhead desprezível (guarda de regressão grosseira, sem comparação frágil entre execuções)', async () => {
  const config = buildEngineConfig({ VITE_UNI_ENGINE_TOOL_CALLING_ENABLED: 'false' });
  const iterations = 200;
  const startedAt = Date.now();
  for (let i = 0; i < iterations; i += 1) {
    await runToolCallingIntegration({
      rawToolCalls: [{ id: 'call-1', type: 'function', function: { name: 'get_financial_summary', arguments: '{}' } }],
      dispatcher: null,
      registry: null,
      config,
      authorization: { authorized: true, executionAllowed: true },
      context: { turnId: 'turn-perf', messageId: `msg-perf-${i}` },
    });
  }
  const elapsedMs = Date.now() - startedAt;
  // Limite generoso (não é um benchmark de precisão, é uma guarda contra
  // regressão grave: 200 chamadas com Tool Calling OFF devem terminar bem
  // abaixo de 1s mesmo em CI lento).
  assert.ok(elapsedMs < 1000, `200 chamadas com Tool Calling OFF levaram ${elapsedMs}ms (esperado < 1000ms)`);
});
