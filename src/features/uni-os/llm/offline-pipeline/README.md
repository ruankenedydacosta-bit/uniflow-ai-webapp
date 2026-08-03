# Offline Cognitive Pipeline V1

Runs the first complete local LLM orchestration chain in strict order: Model Router,
Conversation Window, Token Budget, Prompt Builder, Prompt Validator, and the Mock LLM
Adapter. Each stage receives only the immutable envelope returned by the previous
stage and appends one new snapshot.

The Mock Adapter runs only when `validationReport.approved` is true. Rejected prompts
retain every audit snapshot and stop before mock initialization. Routing providers
remain representational; the only invoked adapter is `UNI_OS_MOCK`.

`runOfflinePipelineShadow()` is disabled by `UNI_OS_ENABLED`, observes the complete
result only when explicitly enabled, and always discards it. No real provider, model,
SDK, HTTP request, token consumption, persistence, legacy flow, or external API is
involved.
