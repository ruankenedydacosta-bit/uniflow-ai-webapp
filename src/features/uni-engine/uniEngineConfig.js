// Configuração e feature flags do Uni Engine (Fase 1 — Shadow Mode).
//
// Padrão de produção é SEGURO: `enabled` nasce falso e só é ativado por
// variável explícita. Nenhuma variável ausente ativa o motor acidentalmente.
//
// Variáveis de ambiente suportadas (apenas booleanas explícitas):
//   - VITE_UNI_ENGINE_ENABLED            → enabled (default: false)
//   - VITE_UNI_ENGINE_SHADOW_MODE         → shadowMode (default: true)
//   - VITE_UNI_ENGINE_TELEMETRY_ENABLED   → telemetryEnabled (default: DEV)
//
// Fase 3 — Memória Inteligente Persistente (separada do motor cognitivo):
//   - VITE_UNI_ENGINE_MEMORY_ENABLED          → memoryEnabled (default: false)
//   - VITE_UNI_ENGINE_MEMORY_READ_ENABLED     → memoryReadEnabled (default: false)
//   - VITE_UNI_ENGINE_MEMORY_WRITE_ENABLED    → memoryWriteEnabled (default: false)
//   - VITE_UNI_ENGINE_MEMORY_SHADOW_MODE      → memoryShadowMode (default: true)
//
// Fase 4 — Modelo Epistêmico (Shadow Mode puro):
//   - VITE_UNI_ENGINE_EPISTEMIC_ENABLED           → epistemicEnabled (default: false)
//   - VITE_UNI_ENGINE_EPISTEMIC_SHADOW_MODE        → epistemicShadowMode (default: true)
//   - VITE_UNI_ENGINE_EPISTEMIC_TELEMETRY_ENABLED  → epistemicTelemetryEnabled (default: DEV)
//
// Padrões seguros: leitura desligada, escrita desligada, shadow ligado.
// Nenhuma variável ausente ativa memória. A memória depende do motor ligado
// (`enabled`), e leitura/escrita dependem de `memoryEnabled` — cascata
// segura contra ativação acidental em produção. O modelo epistêmico segue a
// MESMA cascata: exige o motor ligado e o próprio `epistemicEnabled`;
// telemetria epistêmica exige o modelo ligado.
//
// Nesta fase `learningEnabled` permanece SEMPRE falso.
//
// A configuração é testável: `createUniEngineConfig({ env })` recebe um mapa
// de variáveis sem depender do ambiente global; o fallback para
// import.meta.env só acontece quando nenhum mapa é informado.
import { UNI_ENGINE_VERSION } from './uniEngineContracts.js';

export const UNI_ENGINE_DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  shadowMode: true,
  telemetryEnabled: false,
  learningEnabled: false,
  memoryEnabled: false,
  memoryReadEnabled: false,
  memoryWriteEnabled: false,
  memoryShadowMode: true,
  epistemicEnabled: false,
  epistemicShadowMode: true,
  epistemicTelemetryEnabled: false,
});

const BOOLEAN_VALUES = new Set(['true', '1', 'false', '0']);

function parseBooleanEnv(source, name, fallback) {
  const raw = source?.[name];
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string' && BOOLEAN_VALUES.has(raw.trim().toLowerCase())) {
    return raw.trim().toLowerCase() === 'true' || raw.trim() === '1';
  }
  return fallback;
}

export function resolveUniEngineEnv(source) {
  return (source && typeof source === 'object') ? source : {};
}

export function createUniEngineConfig(overrides = {}) {
  const safeOverrides = overrides && typeof overrides === 'object' ? overrides : {};
  const env =
    resolveUniEngineEnv(safeOverrides.env)
    ?? (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {});
  const isDev =
    typeof env.DEV === 'boolean'
      ? env.DEV
      : env.MODE === 'development';

  const config = {
    enabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_ENABLED', false),
    shadowMode: parseBooleanEnv(env, 'VITE_UNI_ENGINE_SHADOW_MODE', true),
    telemetryEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_TELEMETRY_ENABLED',
      isDev,
    ),
    // Fase 1: aprendizado assistido ainda não existe — nunca ativável.
    learningEnabled: false,
    // Fase 3 — Memória Inteligente Persistente. Separada do motor: leitura e
    // escrita têm flags próprias e nascem desligadas.
    memoryEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_MEMORY_ENABLED', false),
    memoryReadEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_MEMORY_READ_ENABLED',
      false,
    ),
    memoryWriteEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_MEMORY_WRITE_ENABLED',
      false,
    ),
    memoryShadowMode: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_MEMORY_SHADOW_MODE',
      true,
    ),
    // Fase 4 — Modelo Epistêmico em Shadow Mode. Nasce desligado; sombreia
    // por padrão quando ligado; telemetria apenas em desenvolvimento.
    epistemicEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_EPISTEMIC_ENABLED',
      false,
    ),
    epistemicShadowMode: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_EPISTEMIC_SHADOW_MODE',
      true,
    ),
    epistemicTelemetryEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_EPISTEMIC_TELEMETRY_ENABLED',
      isDev,
    ),
  };

  // Segurança: shadowMode só faz sentido com o motor ligado; o motor nunca
  // roda com enabled=false, independentemente do restante.
  if (!config.enabled) {
    config.shadowMode = false;
  }

  // Fase 3 — cascata de segurança da memória: memória exige motor ligado;
  // leitura/escrita exigem memória ligada; shadow de memória exige memória.
  if (!config.enabled) {
    config.memoryEnabled = false;
  }
  if (!config.memoryEnabled) {
    config.memoryReadEnabled = false;
    config.memoryWriteEnabled = false;
    config.memoryShadowMode = false;
  }

  // Fase 4 — cascata de segurança do modelo epistêmico: exige o motor
  // ligado; shadow e telemetria epistêmicos exigem o modelo ligado.
  if (!config.enabled) {
    config.epistemicEnabled = false;
  }
  if (!config.epistemicEnabled) {
    config.epistemicShadowMode = false;
    config.epistemicTelemetryEnabled = false;
  }

  return Object.freeze(config);
}

export function isUniEngineShadowEnabled(config) {
  const safeConfig = config ?? UNI_ENGINE_DEFAULT_CONFIG;
  return Boolean(safeConfig.enabled) && Boolean(safeConfig.shadowMode);
}

export function getUniEngineVersion() {
  return UNI_ENGINE_VERSION;
}
