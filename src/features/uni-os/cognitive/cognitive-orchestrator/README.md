# Cognitive Orchestrator V1

Coordinates the existing deterministic cognitive modules in their mandatory order. It does not
decide, interpret, execute, persist, call models, or deliver output.

## Public API

- `processCognitiveContext(input, options)` builds an engineering snapshot for local validation.
- `runCognitiveOrchestratorShadow(input, options)` observes that snapshot and always discards it.
- `cognitiveOrchestrator.process()` is the stable facade.

Prompt compilation requires the immutable routing and approval artifacts already required by the
Prompt Compiler. The orchestrator never manufactures approval. Missing modules, invalid snapshots,
or blocked compilation become sanitized structured errors.

All public results are defensively cloned, deeply frozen, shadow-only, and expose
`executionAllowed: false` and `safeToExecute: false`.
