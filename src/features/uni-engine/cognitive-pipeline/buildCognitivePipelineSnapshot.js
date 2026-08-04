// Uni Engine — Cognitive Pipeline (Fase 14, Bloco 1).
//
// buildCognitivePipelineSnapshot(): consolida os 12 componentes JÁ
// produzidos no MESMO turno em um snapshot serializável. Nunca reexecuta
// nenhuma camada — apenas lê resultados existentes + config e deriva, por
// camada, presença/execução/disponibilidade/código de erro, além do status
// de rollback e do resumo. Falha interna → snapshot vazio falho-safe
// (pipeline legado sempre intocado).
import {
  createCognitivePipelineSnapshot,
  createEmptyCognitivePipelineSnapshot,
} from './cognitivePipelineContracts.js';
import { COGNITIVE_PIPELINE_LAYERS } from './cognitivePipelineTypes.js';

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function nowIso() {
  return new Date().toISOString();
}

// Deriva presença/execução/disponibilidade/código de cada camada a partir
// dos resultados JÁ produzidos e das flags de config (ordem fixa).
function deriveLayers({
  config,
  gateway,
  observation,
  epistemic,
  decisionReadiness,
  capabilityReadiness,
  executionReadiness,
  conversationPlan,
  conversationRoute,
  orchestrator,
  contextBridge,
  comparison,
  divergences,
}) {
  const layers = {};

  layers.gateway = {
    present: Boolean(gateway),
    executed: Boolean(gateway) && gateway.accepted === true,
    disabled: !config.enabled || !config.integrationEnabled,
    errorCode: safeObject(gateway).diagnostics?.errorCode ?? null,
  };

  layers.observation = {
    present: Boolean(observation),
    executed: Boolean(observation),
    disabled: false,
    errorCode: safeObject(observation).errorCode ?? null,
  };

  // A camada epistêmica é representada pelo snapshot observacional do motor
  // (fonte: runUniEngineShadow → epistemicModel) consolidado no turno.
  layers.epistemic = {
    present: Boolean(epistemic),
    executed: Boolean(epistemic?.enabled),
    disabled: !config.epistemicEnabled,
    errorCode: safeObject(epistemic).errorCode ?? null,
  };

  layers['decision-readiness'] = {
    present: Boolean(decisionReadiness),
    executed: Boolean(decisionReadiness),
    disabled: false,
    errorCode: safeObject(decisionReadiness).errorCode ?? null,
  };

  layers['capability-readiness'] = {
    present: Boolean(capabilityReadiness),
    executed: Boolean(capabilityReadiness),
    disabled: false,
    errorCode: safeObject(capabilityReadiness).errorCode ?? null,
  };

  layers['execution-readiness'] = {
    present: Boolean(executionReadiness),
    executed: Boolean(executionReadiness),
    disabled: false,
    errorCode: safeObject(executionReadiness).errorCode ?? null,
  };

  layers['conversation-plan'] = {
    present: Boolean(conversationPlan),
    executed: Boolean(conversationPlan?.nextStep),
    disabled: false,
    errorCode: safeObject(conversationPlan).errorCode ?? null,
  };

  layers['conversation-route'] = {
    present: Boolean(conversationRoute),
    executed: Boolean(conversationRoute?.selectedRoute),
    disabled: !config.conversationRoutingEnabled,
    errorCode: safeObject(conversationRoute).fallbackReason ?? null,
  };

  layers['cognitive-orchestrator'] = {
    present: Boolean(orchestrator),
    executed: Boolean(orchestrator?.orchestratorStatus),
    disabled: !config.cognitiveOrchestratorEnabled,
    errorCode: safeObject(orchestrator).errorCode ?? null,
  };

  layers['context-bridge'] = {
    present: Boolean(contextBridge),
    executed: Boolean(contextBridge),
    disabled: false,
    errorCode: safeObject(contextBridge).errorCode ?? null,
  };

  layers['cognitive-comparison'] = {
    present: Boolean(comparison),
    executed: Boolean(comparison?.agreementStatus),
    disabled: false,
    errorCode: comparison?.engineErrorCode ?? null,
  };

  layers['divergence-diagnostics'] = {
    present: Array.isArray(divergences),
    executed: Array.isArray(divergences),
    disabled: false,
    errorCode: null,
  };

  return layers;
}

function deriveSummary(layers, comparison, divergences) {
  let present = 0;
  let executed = 0;
  let disabled = 0;
  let withErrors = 0;
  for (const layer of COGNITIVE_PIPELINE_LAYERS) {
    const entry = layers[layer];
    if (entry.present) present += 1;
    if (entry.executed) executed += 1;
    if (entry.disabled) disabled += 1;
    if (entry.errorCode) withErrors += 1;
  }
  return {
    layersPresent: present,
    layersExecuted: executed,
    layersDisabled: disabled,
    layersWithErrors: withErrors,
    divergenceCount: Array.isArray(divergences) ? divergences.length : 0,
    agreementStatus: comparison?.agreementStatus ?? null,
  };
}

function deriveFlags(config) {
  return {
    enabled: Boolean(config.enabled),
    shadowMode: Boolean(config.shadowMode),
    telemetryEnabled: Boolean(config.telemetryEnabled),
    epistemicEnabled: Boolean(config.epistemicEnabled),
    epistemicShadowMode: Boolean(config.epistemicShadowMode),
    integrationEnabled: Boolean(config.integrationEnabled),
    conversationRoutingEnabled: Boolean(config.conversationRoutingEnabled),
    cognitiveOrchestratorEnabled: Boolean(config.cognitiveOrchestratorEnabled),
    rolloutEnabled: Boolean(config.rolloutEnabled),
  };
}

// Rollback lógico derivado exclusivamente das flags e dos resultados
// observados — nunca depende de rebuild de arquitetura.
function deriveRollbackStatus(config, gateway, comparison) {
  if (!config.enabled) return 'engine_disabled';
  if (gateway && gateway.fallbackUsed === true) return 'gateway_fallback';
  if (Boolean(gateway) && gateway.diagnostics?.integrationDisabled === true) {
    return 'integration_fallback';
  }
  if (!config.cognitiveOrchestratorEnabled) return 'orchestrator_skipped';
  if (!config.conversationRoutingEnabled) return 'routing_skipped';
  if (comparison?.agreementStatus === 'skipped' || comparison?.agreementStatus === 'engine_error') {
    return 'engine_active';
  }
  return 'shadow_active';
}

export function buildCognitivePipelineSnapshot(options = {}) {
  const safe = safeObject(options);
  const config = safeObject(safe.config);
  const turnId = typeof safe.turnId === 'string' ? safe.turnId : null;
  const messageId = typeof safe.messageId === 'string' ? safe.messageId : null;

  try {
    const divergences = Array.isArray(safe.divergences) ? safe.divergences : [];
    const layers = deriveLayers({
      config,
      gateway: safe.gateway ?? null,
      observation: safe.observation ?? null,
      epistemic: safe.epistemic ?? null,
      decisionReadiness: safe.decisionReadiness ?? null,
      capabilityReadiness: safe.capabilityReadiness ?? null,
      executionReadiness: safe.executionReadiness ?? null,
      conversationPlan: safe.conversationPlan ?? null,
      conversationRoute: safe.conversationRoute ?? null,
      orchestrator: safe.orchestrator ?? null,
      contextBridge: safe.contextBridge ?? null,
      comparison: safe.comparison ?? null,
      divergences,
    });

    return createCognitivePipelineSnapshot({
      turnId,
      messageId,
      layers,
      summary: deriveSummary(layers, safe.comparison ?? null, divergences),
      flags: deriveFlags(config),
      rollbackStatus: deriveRollbackStatus(config, safe.gateway ?? null, safe.comparison ?? null),
      latencyMs:
        typeof safe.latencyMs === 'number' && Number.isFinite(safe.latencyMs)
          ? safe.latencyMs
          : null,
      timestamp: typeof safe.timestamp === 'string' ? safe.timestamp : nowIso(),
    });
  } catch {
    return createEmptyCognitivePipelineSnapshot({ turnId, messageId });
  }
}