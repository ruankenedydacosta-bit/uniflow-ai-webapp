// Fixtures compartilhados dos testes da Fase 10 (Production Readiness).
import { createUniEngineConfig } from '../uniEngineConfig.js';
import { buildBaseInput, TEST_SNAPSHOT } from '../testFixtures.js';

export function phase10FullConfig(extra = {}) {
  return createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'false',
      VITE_UNI_ENGINE_MEMORY_ENABLED: 'true',
      VITE_UNI_ENGINE_MEMORY_READ_ENABLED: 'true',
      VITE_UNI_ENGINE_MEMORY_WRITE_ENABLED: 'true',
      VITE_UNI_ENGINE_EPISTEMIC_ENABLED: 'true',
      VITE_UNI_ENGINE_DECISION_ENABLED: 'true',
      VITE_UNI_ENGINE_DECISION_SHADOW: 'true',
      VITE_UNI_ENGINE_PLANNING_ENABLED: 'true',
      VITE_UNI_ENGINE_PLANNING_SHADOW: 'true',
      VITE_UNI_ENGINE_GOALS_ENABLED: 'true',
      VITE_UNI_ENGINE_REFLECTION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_CAP_METADATA_ONLY: 'true',
      VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE: 'true',
      ...extra,
    },
  });
}

export function phase10CoreConfig(extra = {}) {
  return createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'false',
      ...extra,
    },
  });
}

export function phase10Input(overrides = {}) {
  return buildBaseInput({
    message: { text: 'Gastei 50 reais no mercado', ...(overrides.message ?? {}) },
    ...overrides,
  });
}

export { TEST_SNAPSHOT, buildBaseInput };
