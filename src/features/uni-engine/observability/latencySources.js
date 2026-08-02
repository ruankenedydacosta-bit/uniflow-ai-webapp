// Observability — fontes de latência por módulo (Fase 10).
//
// Documenta de onde cada módulo expõe sua latência no resultado público do
// Shadow Mode. Usado pela observability e pelo health check — a fonte única
// evita que cada consumidor invente sua própria leitura.
//
//   core       → result.diagnostics.latencyMs
//   memory     → result.persistentMemory.diagnostics.latencyMs
//   epistemic  → result.epistemicModel.latencyMs
//   decision   → result.decisionLayer.latencyMs (fallback: latency.totalMs)
//   planning   → result.planning.latencyMs (fallback: latency.totalMs)
//   goals      → result.goals.latencyMs
//   reflection → result.reflection.latencyMs
//   activation → max(decision.latencyMs) entre as decisões
//   telemetry  → (sem latência própria — agregada no total do motor)
export const UNI_ENGINE_MODULE_LATENCY_KEYS = Object.freeze({
  core: 'diagnostics.latencyMs',
  memory: 'persistentMemory.diagnostics.latencyMs',
  epistemic: 'epistemicModel.latencyMs',
  decision: 'decisionLayer.latencyMs (fallback decisionLayer.latency.totalMs)',
  planning: 'planning.latencyMs (fallback planning.latency.totalMs)',
  goals: 'goals.latencyMs',
  reflection: 'reflection.latencyMs',
  activation: 'max(decisions[].latencyMs)',
  telemetry: null,
});
