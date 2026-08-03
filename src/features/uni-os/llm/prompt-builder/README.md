# Prompt Builder V1

Builds an immutable, deterministic structured prompt from the Conversation Window,
Token Budget, Model Router result, and compiled cognitive context.

The builder always emits the eleven mandatory sections in a fixed order. It does
not truncate input, generate natural-language responses, invoke adapters or models,
perform network calls, persist data, or consume real tokens. Token estimates remain
approximate and reproducible.

`runPromptBuilderShadow()` is disabled by `UNI_OS_ENABLED` by default. When explicitly
enabled for validation, it exposes the snapshot only to an optional observer and
discards it from the application result. Development logs contain aggregate metadata
only and never section content.

The local validator checks schema, section order, uniqueness, estimates, invariants,
and deep immutability. A future Prompt Validator may add semantic and safety audits
before any concrete LLM adapter is allowed to consume the structure.
