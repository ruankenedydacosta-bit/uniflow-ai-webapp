// Fixtures e helpers compartilhados dos testes do Reflection & Learning
// Engine (Fase 8).
import { createUniEngineConfig } from '../uniEngineConfig.js';

export const REFLECTION_TEST_CONFIG = createUniEngineConfig({
  env: {
    VITE_UNI_ENGINE_ENABLED: 'true',
    VITE_UNI_ENGINE_SHADOW_MODE: 'true',
    VITE_UNI_ENGINE_REFLECTION_ENABLED: 'true',
    VITE_UNI_ENGINE_REFLECTION_SHADOW: 'true',
    VITE_UNI_ENGINE_REFLECTION_TELEMETRY: 'false',
    VITE_UNI_ENGINE_LEARNING_CANDIDATES_ENABLED: 'true',
  },
});

export const REFLECTION_NO_CANDIDATES_CONFIG = createUniEngineConfig({
  env: {
    VITE_UNI_ENGINE_ENABLED: 'true',
    VITE_UNI_ENGINE_SHADOW_MODE: 'true',
    VITE_UNI_ENGINE_REFLECTION_ENABLED: 'true',
    VITE_UNI_ENGINE_REFLECTION_SHADOW: 'true',
    VITE_UNI_ENGINE_REFLECTION_TELEMETRY: 'false',
  },
});

export function buildReflectionEngineInput(overrides = {}) {
  const safe = overrides ?? {};
  return {
    messageText: safe.messageText ?? 'Gastei 50 reais no mercado',
    history: safe.history ?? [],
    classification: safe.classification ?? {
      messageType: 'action',
      primaryIntent: 'register_expense',
      confidence: 0.9,
      ambiguities: [],
    },
    comparison: safe.comparison ?? { status: 'agreement' },
    divergenceDiagnostics: safe.divergenceDiagnostics ?? [],
    epistemicModel: safe.epistemicModel ?? null,
    epistemicState: safe.epistemicState ?? null,
    decisionLayer: safe.decisionLayer ?? null,
    planning: safe.planning ?? null,
    goals: safe.goals ?? null,
    persistentMemory: safe.persistentMemory ?? null,
    operationalMemory: safe.operationalMemory ?? null,
    pipeline: safe.pipeline ?? { responseEmitted: true },
    systemError: safe.systemError ?? false,
    providerError: safe.providerError ?? false,
    voiceFailed: safe.voiceFailed ?? false,
    now: safe.now ?? Date.parse('2026-08-01T00:00:00.000Z'),
    featureFlags: safe.featureFlags ?? {
      reflectionShadowMode: true,
      reflectionTelemetryEnabled: false,
      learningCandidatesEnabled: true,
    },
    isDev: false,
  };
}

export function buildReview(overrides = {}) {
  const safe = overrides ?? {};
  return {
    targetLayer: safe.targetLayer ?? 'decision',
    status: safe.status ?? 'ALIGNED',
    confidence: safe.confidence ?? 0.9,
    expected: safe.expected ?? [],
    observed: safe.observed ?? [],
    divergence: safe.divergence ?? [],
    blockers: safe.blockers ?? [],
    diagnostics: safe.diagnostics ?? [],
  };
}
