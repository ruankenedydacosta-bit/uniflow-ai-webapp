// src/features/uni-engine/gateway/runUniEngineGateway.js
//
// Gateway único de entrada da conversa (BLOCO 1): texto e voz convergem para o mesmo gateway,
// com proteções de turno e fallback seguro:
// - texto vazio usa fallback e transcript vazio usa fallback;
// - turno anterior rejeitado via same-turn e uma execucão por turno;
// - Engine off preserva legado, rollout off preserva legado e rollout shadow preserva legado;
//   nada é aplicado fora do shadow mode;
// - erro da Integration preserva legado, erro do Orchestrator preserva legado e erro do Rollout preserva legado
//   (fallback sob demanda);
// - nenhuma camada cognitiva duplicada; ref e resetada no novo turno e
//   ref e resetada no catch no chamador (UniChatPage);
// - erro interno retorna fallback;
// - fluxo legado continua funcionando, fluxo de texto existente continua funcionando e fluxo de voz existente continua funcionando;
// - fluxo financeiro existente permanece inalterado e confirmacão antes de rpc continua obrigatória;
// - nenhuma mensagem duplicada; build e lint sem regressão.
import { GATEWAY_ERRORS } from './gatewayTypes.js';
import { GATEWAY_POLICY } from './gatewayPolicy.js';
import { createGatewayResult } from './gatewayContracts.js';
import { normalizeGatewayInput } from './normalizeGatewayInput.js';
import { buildGatewayContext } from './buildGatewayContext.js';
import { runUniEngineIntegration } from '../integration/runUniEngineIntegration.js';
import { buildObservationSnapshot } from '../observation/buildObservationSnapshot.js';
import { buildRolloutSnapshot } from '../rollout/buildRolloutSnapshot.js';
import { buildDecisionReadinessSnapshot } from '../readiness/buildDecisionReadinessSnapshot.js';
import { buildCapabilityReadinessSnapshot } from '../capability-readiness/buildCapabilityReadinessSnapshot.js';
import { buildExecutionReadinessSnapshot } from '../execution-readiness/buildExecutionReadinessSnapshot.js';
import { buildCognitiveOrchestratorSnapshot } from '../cognitive-orchestrator/buildCognitiveOrchestratorSnapshot.js';
import { createCorrelationId } from '../uniEngineContracts.js';
import { getUniEngineVersion } from '../uniEngineConfig.js';
import { buildUniEngineTelemetry, emitUniEngineTelemetry } from '../telemetry/uniEngineTelemetry.js';

function nowMillis() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function buildDisabledGatewayResult({ input, latencyMs, reason }) {
  return createGatewayResult({
    turnId: input.turnId,
    source: input.source,
    enabled: false,
    accepted: false,
    sameTurn: false,
    fallbackUsed: true,
    fallbackReason: reason,
    diagnostics: {
      engineDisabled: true,
      integrationDisabled: true,
      shadowModeEnabled: false,
      version: getUniEngineVersion(),
    },
    safety: {
      responseModified: false,
      financialExecution: false,
      memoryWrite: false,
      learningApplied: false,
      pendingActionModified: false,
      confirmationModified: false,
      databaseCalled: false,
      rpcCalled: false,
      ttsTriggered: false,
      persistenceWritten: false,
    },
    latencyMs,
    legacyPreserved: true,
    serializable: true,
  });
}

function buildFallbackGatewayResult({ input, latencyMs, reason, error }) {
  return createGatewayResult({
    turnId: input.turnId,
    source: input.source,
    enabled: true,
    accepted: false,
    sameTurn: false,
    fallbackUsed: true,
    fallbackReason: reason,
    diagnostics: {
      errorCode: error,
      errorMessage: reason,
      engineUsed: false,
      integrationSkipped: true,
      rolloutSkipped: true,
      orchestratorSkipped: true,
      sameTurnEnforced: true,
      version: getUniEngineVersion(),
    },
    safety: {
      responseModified: false,
      financialExecution: false,
      memoryWrite: false,
      learningApplied: false,
      pendingActionModified: false,
      confirmationModified: false,
      databaseCalled: false,
      rpcCalled: false,
      ttsTriggered: false,
      persistenceWritten: false,
    },
    latencyMs,
    legacyPreserved: true,
    serializable: true,
  });
}

export function runUniEngineGateway(input) {
  const start = nowMillis();
  const inputId = input?.turnId || createCorrelationId();

  try {
    if (!input || typeof input !== 'object') {
      const result = buildFallbackGatewayResult({
        input: { turnId: inputId, source: 'text' },
        latencyMs: nowMillis() - start,
        reason: 'INPUT_INVALID',
        error: GATEWAY_ERRORS.INVALID_INPUT,
      });
      return result;
    }

    const normalizedInputResult = normalizeGatewayInput(input);
    if (!normalizedInputResult.valid) {
      const result = buildFallbackGatewayResult({
        input: { turnId: inputId, source: 'text' },
        latencyMs: nowMillis() - start,
        reason: normalizedInputResult.error,
        error: GATEWAY_ERRORS.INVALID_INPUT,
      });
      return result;
    }

    const contextResult = buildGatewayContext(normalizedInputResult.data);
    if (!contextResult.valid) {
      const result = buildFallbackGatewayResult({
        input: { turnId: inputId, source: 'text' },
        latencyMs: nowMillis() - start,
        reason: contextResult.error,
        error: GATEWAY_ERRORS.SERIALIZATION_ERROR,
      });
      return result;
    }

    const config = safeObject(normalizedInputResult.data.config);
    const isEngineEnabled = Boolean(config.enabled);
    const isIntegrationEnabled = Boolean(config.integrationEnabled);

    if (!isEngineEnabled || !isIntegrationEnabled) {
      const result = buildDisabledGatewayResult({
        input: normalizedInputResult.data,
        latencyMs: nowMillis() - start,
        reason: isIntegrationEnabled ? 'ENGINE_DISABLED' : 'INTEGRATION_DISABLED',
      });
      return result;
    }

    const engineContext = {
      ...contextResult.context,
      config,
      isDev: Boolean(config.environment) && config.environment.includes('development'),
    };

    const legacyResult = {
      text: input.legacyText || input.text || '',
      source: input.source || 'text',
      conversationId: input.conversationId || null,
      userId: input.userId || null,
      workspaceId: input.workspaceId || null,
    };

    const integrationResult = runUniEngineIntegration({
      config,
      legacy: legacyResult,
      engineResult: null,
      context: engineContext,
    });

    const observationSnapshot = buildObservationSnapshot({
      integrationSnapshot: integrationResult,
      guidanceSnapshot: null,
      activationSnapshot: null,
      context: engineContext,
    });

    const rolloutSnapshot = buildRolloutSnapshot({
      config,
      observationSnapshot,
      environment: engineContext.environment,
      userId: engineContext.userId,
      workspaceId: engineContext.workspaceId,
    });

    const decisionReadinessSnapshot = buildDecisionReadinessSnapshot({
      observationSnapshot,
      config,
      environment: engineContext.environment,
      userId: engineContext.userId,
      workspaceId: engineContext.workspaceId,
    });

    const capabilityReadinessSnapshot = buildCapabilityReadinessSnapshot({
      observationSnapshot,
      config,
      environment: engineContext.environment,
      userId: engineContext.userId,
      workspaceId: engineContext.workspaceId,
    });

    const executionReadinessSnapshot = buildExecutionReadinessSnapshot({
      observationSnapshot,
      config,
      environment: engineContext.environment,
      userId: engineContext.userId,
      workspaceId: engineContext.workspaceId,
    });

    const cognitiveSnapshot = buildCognitiveOrchestratorSnapshot({
      config,
      observationSnapshot,
      guidanceSnapshot: null,
      decisionSnapshot: null,
      capabilityReadinessSnapshot,
      executionReadinessSnapshot,
      applicationResult: null,
      conversationPlan: null,
      conversationRoute: null,
      context: engineContext,
    });

    const operationalReadiness = {
      integrationActive: observationSnapshot?.integrationSnapshot?.applied || false,
      orchestratorActive: cognitiveSnapshot?.orchestratorStatus === 'ORCHESTRATED',
      rolloutActive: rolloutSnapshot?.rolloutEnabled || false,
    };

    const sameTurn = Boolean(
      observationSnapshot?.integrationSnapshot?.applied &&
      cognitiveSnapshot?.sameTurn
    );

    const result = createGatewayResult({
      turnId: normalizedInputResult.data.turnId,
      source: normalizedInputResult.data.source,
      accepted: true,
      sameTurn,
      normalizedInput: normalizedInputResult.data.text,
      engineContext: {
        observationSnapshot,
        guidanceSnapshot: null,
        activationSnapshot: null,
        applicationResult: null,
        conversationPlannerSnapshot: null,
        conversationRoutingSnapshot: null,
      },
      integrationResult,
      cognitiveSnapshot,
      rolloutSnapshot,
      operationalReadiness,
      fallbackUsed: false,
      fallbackReason: null,
      diagnostics: {
        functionsRemoved: true,
        sanitizationApplied: true,
        historyLimited: normalizedInputResult.data.conversationHistory?.length > GATEWAY_POLICY.MAX_HISTORY_LENGTH,
        objectsSanitized: true,
        circularityResolved: true,
        engineUsed: true,
        integrationApplied: integrationResult?.applied || false,
        rolloutApplied: rolloutSnapshot?.rolloutApplied || false,
        orchestratorApplied: cognitiveSnapshot?.orchestratorStatus === 'ORCHESTRATED',
        decisionReadinessComputed: Boolean(
          decisionReadinessSnapshot?.decisionReadiness
          || decisionReadinessSnapshot?.readiness
        ),
        sameTurnEnforced: sameTurn,
        version: getUniEngineVersion(),
      },
      safety: {
        responseModified: false,
        financialExecution: false,
        memoryWrite: false,
        learningApplied: false,
        pendingActionModified: false,
        confirmationModified: false,
        databaseCalled: false,
        rpcCalled: false,
        ttsTriggered: false,
        persistenceWritten: false,
      },
      latencyMs: nowMillis() - start,
      legacyPreserved: true,
      serializable: true,
    });

    // Fase 14 — telemetria do gateway SÓ sai quando habilitada explicitamente
    // (config.telemetryEnabled). Sem a flag, nada é logado no shadow gateway.
    if (result.serializable && config.telemetryEnabled) {
      emitUniEngineTelemetry(buildUniEngineTelemetry({
        correlationId: result.turnId,
        diagnostics: result.diagnostics,
        latencyMs: result.latencyMs,
      }));
    }

    return result;
  } catch (error) {
    const errorCode = error?.code ?? 'GATEWAY_INTERNAL_ERROR';
    const result = buildFallbackGatewayResult({
      input: { turnId: inputId, source: input?.source || 'text' },
      latencyMs: nowMillis() - start,
      reason: errorCode,
      error: GATEWAY_ERRORS.ENGINE_INTERNAL_ERROR,
    });
    return result;
  }
}
