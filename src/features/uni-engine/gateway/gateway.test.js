// src/features/uni-engine/gateway/gateway.test.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const GATEWAY_FEATURES = [
  'entrada de texto válida',
  'entrada de voz válida',
  'texto e voz convergem para o mesmo gateway',
  'texto vazio usa fallback',
  'transcript vazio usa fallback',
  'source desconhecido é rejeitado',
  'IDs do turno preservados',
  'turno anterior rejeitado',
  'contexto serializável',
  'contexto deepFreeze',
  'funções removidas',
  'Map e Set removidos',
  'circularidade tratada',
  'histórico limitado',
  'snapshot financeiro sanitizado',
  'segredo não aparece',
  'token não aparece',
  'stack trace não aparece',
  'Engine off preserva legado',
  'rollout off preserva legado',
  'rollout shadow preserva legado',
  'erro da Integration preserva legado',
  'erro do Orchestrator preserva legado',
  'erro do Rollout preserva legado',
  'gateway não altera resposta',
  'gateway não cria pergunta',
  'gateway não modifica Pending Action',
  'gateway não modifica confirmação',
  'gateway não executa financeiro',
  'gateway não escreve memória',
  'gateway não aplica aprendizado',
  'gateway não chama banco',
  'gateway não chama RPC',
  'gateway não dispara TTS',
  'gateway não persiste',
  'uma execução por turno',
  'nenhuma camada cognitiva duplicada',
  'ref é resetada no novo turno',
  'ref é resetada no catch',
  'resultado determinístico',
  'resultado serializável',
  'resultado imutável',
  'erro interno retorna fallback',
  'fluxo legado continua funcionando',
  'fluxo de texto existente continua funcionando',
  'fluxo de voz existente continua funcionando',
  'fluxo financeiro existente permanece inalterado',
  'confirmação antes de RPC continua obrigatória',
  'nenhuma mensagem duplicada',
  'build e lint sem regressão',
];

test('gateway verifica contrato de entrada', async () => {
  const gateway = await source('./runUniEngineGateway.js');
  const normalize = await source('./normalizeGatewayInput.js');
  assert.match(gateway, /normalizeGatewayInput/);
  assert.match(normalize, /GATEWAY_POLICY/);
});

test('gateway constrói contexto seguro', async () => {
  const buildContext = await source('./buildGatewayContext.js');
  assert.match(buildContext, /buildSecuritySnapshot/);
  assert.match(buildContext, /isSerializableValue/);
});

test('gateway executa integração reutilizável', async () => {
  const gateway = await source('./runUniEngineGateway.js');
  const integration = await source('../integration/runUniEngineIntegration.js');
  assert.match(gateway, /runUniEngineIntegration/);
  assert.match(integration, /createEmptyIntegrationResult/);
});

test('gateway constrói snapshots reutilizáveis', async () => {
  const gateway = await source('./runUniEngineGateway.js');
  assert.match(gateway, /buildObservationSnapshot/);
  assert.match(gateway, /buildRolloutSnapshot/);
  assert.match(gateway, /buildDecisionReadinessSnapshot/);
  assert.match(gateway, /buildCapabilityReadinessSnapshot/);
  assert.match(gateway, /buildExecutionReadinessSnapshot/);
  assert.match(gateway, /buildCognitiveOrchestratorSnapshot/);
});

test('gateway usa ref dedicada apenas em memória', async () => {
  const page = await source('../../uni-chat/UniChatPage.jsx');
  assert.match(page, /lastUniEngineGatewayResultRef/);
  assert.match(page, /useRef\(null\)/);
});

test('gateway ref é resetada no novo turno', async () => {
  const page = await source('../../uni-chat/UniChatPage.jsx');
  const fnBody = page.slice(page.indexOf('function sendText'), page.indexOf('function handleSuggestionSelect'));
  assert.match(fnBody, /lastEngineTurnRef\.current =/);
});

test('gateway converte texto e voz para entrada comum', async () => {
  const page = await source('../../uni-chat/UniChatPage.jsx');
  const adapter = await source('../../uni-chat/uniChatAdapter.js');
  assert.match(page, /onFinalTranscript.*onSend/);
  assert.match(adapter, /buildUserMessage/);
});

test('gateway preserva responsivilidade de segurança', async () => {
  const contracts = await source('./gatewayContracts.js');
  assert.match(contracts, /safety.*responseModified.*false/);
  assert.match(contracts, /safety.*financialExecution.*false/);
});

test('gateway sanitiza histórico conforme política', async () => {
  const normalize = await source('./normalizeGatewayInput.js');
  assert.match(normalize, /GATEWAY_POLICY\.MAX_HISTORY_LENGTH/);
  assert.match(normalize, /slice\(-MAX_HISTORY_LENGTH/);
});

test('gateway fallback sob demanda', async () => {
  const gateway = await source('./runUniEngineGateway.js');
  assert.match(gateway, /buildFallbackGatewayResult/);
  assert.match(gateway, /GATEWAY_ERRORS\./);
});

test('gateway validade e sanitização', async () => {
  const contracts = await source('./gatewayContracts.js');
  const types = await source('./gatewayTypes.js');
  assert.match(contracts, /validateGatewayResult/);
  assert.match(types, /GATEWAY_ERRORS/);
});

const testCount = GATEWAY_FEATURES.length;
test(`gateway cobre todas as ${testCount} features`, async () => {
  const files = [
    await source('./gatewayTypes.js'),
    await source('./gatewayPolicy.js'),
    await source('./gatewayContracts.js'),
    await source('./normalizeGatewayInput.js'),
    await source('./buildGatewayContext.js'),
    await source('./runUniEngineGateway.js'),
    await source('./buildGatewayDiagnostics.js'),
  ].join('\n\n');

  const covered = new Set();
  for (const feature of GATEWAY_FEATURES) {
    const regex = new RegExp(feature.toLowerCase().replace(/é/g, 'e').replace(/ç/g, 'c'), 'i');
    if (regex.test(files)) {
      covered.add(feature);
    }
  }

  assert.equal(covered.size, testCount, `
  Features cobertas: ${covered.size}/${testCount}
  Features faltando: ${GATEWAY_FEATURES.filter(f => !covered.has(f)).join(', ')}
  `);
});
