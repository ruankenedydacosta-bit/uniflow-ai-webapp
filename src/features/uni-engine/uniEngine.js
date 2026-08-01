// Uni Engine (Fase 1) — fachada do motor.
//
// Expõe o motor como uma unidade configurável. Em Shadow Mode o motor
// apenas analisa e compara — o resultado é SEMPRE descartável e nunca
// influencia o pipeline atual.
import { createUniEngineConfig } from './uniEngineConfig.js';
import { runUniEngineShadow } from './runUniEngineShadow.js';
import { UNI_ENGINE_VERSION } from './uniEngineContracts.js';

export function createUniEngine(options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const config = safeOptions.config ?? createUniEngineConfig({ env: safeOptions.env });
  const telemetryAdapter =
    typeof safeOptions.telemetryAdapter === 'function'
      ? safeOptions.telemetryAdapter
      : null;

  return {
    config,
    getConfig: () => config,
    getVersion: () => UNI_ENGINE_VERSION,
    runShadow: (input, runOptions = {}) => runUniEngineShadow(input, {
      ...runOptions,
      config,
      telemetryAdapter: telemetryAdapter ?? runOptions.telemetryAdapter ?? null,
      isDev: safeOptions.isDev ?? runOptions.isDev,
    }),
    isEnabled: () => Boolean(config.enabled),
    isShadowMode: () => Boolean(config.shadowMode),
  };
}
