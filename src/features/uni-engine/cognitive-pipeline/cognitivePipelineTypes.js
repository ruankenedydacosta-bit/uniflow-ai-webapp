// Uni Engine — Cognitive Pipeline (Fase 14, Bloco 1).
//
// Snapshot cognitivo CONSOLIDADO do turno: reúne, em um único objeto
// serializável, os 12 componentes do pipeline observacional quando
// habilitados em shadow mode:
//   1. Gateway Result;
//   2. Observation Snapshot;
//   3. Epistemic State/Snapshot;
//   4. Decision Readiness Snapshot;
//   5. Capability Readiness Snapshot;
//   6. Execution Readiness Snapshot;
//   7. Conversation Plan Snapshot;
//   8. Conversation Route;
//   9. Cognitive Orchestrator Snapshot;
//   10. Context Bridge Result;
//   11. Shadow Comparison;
//   12. Divergence Diagnostics.
//
// O snapshot NUNCA executa camada alguma: consome apenas resultados JÁ
// produzidos no MESMO turno, é totalmente serializável (sem funções,
// Promises, elementos React, objetos DOM ou referências circulares) e
// registra explicitamente que nenhuma influência foi aplicada.
export const COGNITIVE_PIPELINE_VERSION = '1.0';

// Camadas do pipeline observacional (ordem fixa de execução).
export const COGNITIVE_PIPELINE_LAYERS = Object.freeze([
  'gateway',
  'observation',
  'epistemic',
  'decision-readiness',
  'capability-readiness',
  'execution-readiness',
  'conversation-plan',
  'conversation-route',
  'cognitive-orchestrator',
  'context-bridge',
  'cognitive-comparison',
  'divergence-diagnostics',
]);

// Status de rollback derivado das flags e resultados observados.
export const COGNITIVE_ROLLBACK_STATUSES = Object.freeze([
  'engine_disabled',
  'engine_active',
  'gateway_fallback',
  'integration_fallback',
  'orchestrator_skipped',
  'routing_skipped',
  'shadow_active',
]);

export function isCognitivePipelineLayer(value) {
  return COGNITIVE_PIPELINE_LAYERS.includes(value);
}

export function isCognitiveRollbackStatus(value) {
  return COGNITIVE_ROLLBACK_STATUSES.includes(value);
}