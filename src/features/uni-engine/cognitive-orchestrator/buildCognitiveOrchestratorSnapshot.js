// Uni Engine — Cognitive Orchestrator: builder principal (Parte 9, Bloco Único).
//
// Constrói o snapshot consolidado do turno a partir das camadas já
// produzidas. NÃO reexecuta nenhuma camada. NÃO toma decisões. NÃO
// gera respostas. NÃO executa ações. Somente consolida, valida e
// entrega o resultado cognitivo consolidado.
//
// Gates: flag explícita + cascata (motor + Activation + Integration +
// Application). Qualquer falha → snapshot vazio fail-safe (FALLBACK).
import { isCognitiveOrchestratorEnabledByConfig, isEnvironmentAllowedByOrchestratorPolicy } from './cognitiveOrchestratorPolicy.js';
import {
  createEmptyCognitiveOrchestratorSnapshot,
  createCognitiveOrchestratorSnapshot,
  validateCognitiveOrchestratorSnapshot,
  deepFreeze,
} from './cognitiveOrchestratorContracts.js';
import { buildCognitiveOrchestratorDiagnostics } from './buildCognitiveOrchestratorDiagnostics.js';
import { ORCHESTRATOR_LAYERS } from './cognitiveOrchestratorTypes.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function warn(isDev, message) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] cognitive-orchestrator ${message}`);
  }
}

function validateLayer(key, value) {
  if (!isPlainObject(value)) return { valid: false, reason: 'NOT_OBJECT' };
  if (value.serializable === false) return { valid: false, reason: 'NOT_SERIALIZABLE' };
  if (key !== 'application' && key !== 'conversationRoute' && value.applied === true) {
    return { valid: false, reason: 'APPLIED_NOT_ALLOWED' };
  }
  return { valid: true, reason: null };
}

export function buildCognitiveOrchestratorSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const isDev = Boolean(safe.isDev);

  try {
    const config = safe.config ?? null;
    const environment = typeof safe.environment === 'string' ? safe.environment : null;

    const enabled = isCognitiveOrchestratorEnabledByConfig(config);
    const envAllowed = isEnvironmentAllowedByOrchestratorPolicy(environment);

    if (!enabled || !envAllowed) {
      const fallbackReason = !enabled ? 'ORCHESTRATOR_DISABLED' : 'ENVIRONMENT_NOT_ALLOWED';
      const base = createEmptyCognitiveOrchestratorSnapshot({
        orchestratorStatus: 'EMPTY',
        diagnostics: buildCognitiveOrchestratorDiagnostics({ orchestratorStatus: 'EMPTY' }),
        sameTurn: false,
      });
      return deepFreeze({
        ...base,
        enabled: false,
        metadata: {
          ...base.metadata,
          status: 'EMPTY',
          environment: environment ?? null,
        },
      });
    }

    const layers = {
      observation: safe.observation ?? null,
      guidance: safe.guidance ?? null,
      decision: safe.decision ?? null,
      capabilityReadiness: safe.capabilityReadiness ?? null,
      executionReadiness: safe.executionReadiness ?? null,
      application: safe.application ?? null,
      conversationPlan: safe.conversationPlan ?? null,
      conversationRoute: safe.conversationRoute ?? null,
    };

    const validLayers = [];
    const missingLayers = [];
    const invalidLayers = [];

    for (const layerName of ORCHESTRATOR_LAYERS) {
      const layerValue = layers[layerName];
      if (layerValue === null || layerValue === undefined) {
        missingLayers.push(layerName);
      } else {
        const validation = validateLayer(layerName, layerValue);
        if (validation.valid) {
          validLayers.push(layerName);
        } else {
          invalidLayers.push(layerName);
        }
      }
    }

    const route = layers.conversationRoute;
    const sameTurn = isPlainObject(route) && route.sameTurn === true;
    const sameTurnViolated = isPlainObject(route) && route.sameTurn !== true;

    // Camadas obrigatórias para ORCHESTRATED: as seis cognitivas essenciais.
    // conversationPlan/conversationRoute são opcionais — quando ausentes não
    // rebaixam o status (consolidação observacional das camadas produzidas).
    const REQUIRED_ORCHESTRATOR_LAYERS = [
      'observation',
      'guidance',
      'decision',
      'capabilityReadiness',
      'executionReadiness',
      'application',
    ];

    const missingRequired = REQUIRED_ORCHESTRATOR_LAYERS.filter((layerName) => missingLayers.includes(layerName));
    const invalidRequired = REQUIRED_ORCHESTRATOR_LAYERS.filter((layerName) => invalidLayers.includes(layerName));

    let orchestratorStatus;
    if (validLayers.length === 0) {
      orchestratorStatus = 'EMPTY';
    } else if (invalidRequired.length > 0 || missingRequired.length > 0 || sameTurnViolated) {
      orchestratorStatus = 'PARTIAL';
    } else {
      orchestratorStatus = 'ORCHESTRATED';
    }

    const diagnostics = buildCognitiveOrchestratorDiagnostics({
      orchestratorStatus,
      validLayers,
      missingLayers,
      invalidLayers,
      sameTurnViolated,
      shadowMode: true,
      legacyPreserved: true,
    });

    const snapshot = createCognitiveOrchestratorSnapshot({
      orchestratorStatus,
      layers,
      diagnostics,
      metadata: { environment: environment ?? null },
      sameTurn,
    });

    const validation = validateCognitiveOrchestratorSnapshot(snapshot);
    if (!validation.valid) {
      warn(isDev, `contract invalid: ${validation.errors.join(',')}`);
      const fallback = createEmptyCognitiveOrchestratorSnapshot({
        orchestratorStatus: 'FALLBACK',
        diagnostics: buildCognitiveOrchestratorDiagnostics({ orchestratorStatus: 'FALLBACK' }),
        sameTurn: false,
      });
      return deepFreeze({
        ...fallback,
        enabled: true,
        metadata: { ...fallback.metadata, status: 'FALLBACK' },
      });
    }

    return deepFreeze({
      ...snapshot,
      enabled: true,
      metadata: {
        ...snapshot.metadata,
        status: orchestratorStatus,
        environment: environment ?? null,
      },
    });
  } catch (error) {
    warn(isDev, `error: ${error?.code ?? 'COGNITIVE_ORCHESTRATOR_INTERNAL_ERROR'} :: ${error?.message ?? ''}`);
    const fallback = createEmptyCognitiveOrchestratorSnapshot({
      orchestratorStatus: 'FALLBACK',
      diagnostics: buildCognitiveOrchestratorDiagnostics({ orchestratorStatus: 'FALLBACK' }),
      sameTurn: false,
    });
    return deepFreeze({
      ...fallback,
      enabled: false,
      metadata: { ...fallback.metadata, status: 'FALLBACK' },
    });
  }
}