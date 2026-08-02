// Activation Engine — index (Fase 9).
export * from './activationTypes.js';
export * from './activationContracts.js';
export * from './activationPolicy.js';
export * from './capabilityRegistry.js';
export * from './capabilityEligibility.js';
export * from './gates.js';
export * from './rolloutEvaluation.js';
export * from './legacyFallback.js';
export * from './shadowComparison.js';
export * from './guidanceContracts.js';
export * from './safeAdapter.js';
export * from './circuitBreaker.js';
export * from './telemetry/activationTelemetry.js';
export { runActivationEngine, validateActivationEngineOutput } from './runActivationEngine.js';
