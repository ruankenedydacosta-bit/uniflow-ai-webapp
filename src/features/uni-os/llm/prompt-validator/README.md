# Prompt Validator V1

Audits a structured prompt against its routing and token-budget snapshots before any
LLM adapter may consume it. The validator is deterministic, read-only, deeply freezes
its report, and never modifies or corrects the prompt.

The audit covers schema, mandatory sections, order, duplicates, priorities, token
estimates, available budget, registered capability, representational provider,
routing consistency, metadata, integrity, and deep immutability.

Findings use `INFO`, `WARNING`, `ERROR`, or `BLOCKING`. Reports are `APPROVED`,
`APPROVED_WITH_WARNINGS`, or `REJECTED`. Approval is representational only and never
permits execution.

`runPromptValidatorShadow()` remains disabled through `UNI_OS_ENABLED`. When enabled
explicitly for validation, the report is observable and then discarded. Development
logs expose aggregate counts only, with no prompt content.
