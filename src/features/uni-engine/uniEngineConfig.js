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
  };

  // Segurança: shadowMode só faz sentido com o motor ligado; o motor nunca
  // roda com enabled=false, independentemente do restante.
  if (!config.enabled) {
    config.shadowMode = false;
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
