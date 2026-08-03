# UNI OS Cognitive Orchestrator V1

## Objective

The Cognitive Orchestrator coordinates the existing cognitive pipeline without adding reasoning,
decisions, execution, persistence, model access, or user-visible output.

## Pipeline

1. Compiled Context
2. Reasoning Planner
3. Decision Engine
4. Confidence Engine
5. Cognitive Execution Plan
6. Prompt Builder
7. Prompt Compiler
8. Shadow discard

No stage can be skipped. Each returned snapshot is validated before it is passed forward. The
orchestrator does not change the contracts or implementation of any participating module.

## Prompt prerequisites

The Prompt Builder and Prompt Compiler retain their current contracts. Conversation Window, Token
Budget, Routing Result, and an immutable approved Validation Report remain read-only prerequisites
when supplied in the input package. The orchestrator never creates or assumes prompt approval.

## Safety invariants

- `executionAllowed` and `safeToExecute` are always `false`.
- Every public result is defensively cloned and deeply frozen.
- Errors expose only structural codes, failed stage, and validation codes.
- No prompt is interpreted and no response is delivered.
- No model, provider, HTTP client, SDK, database, or external API is called.
- `UNI_OS_ENABLED` remains unchanged and the result is discarded in Shadow Mode.

## Traceability and metrics

The result records the mandatory stage order, completed validations, aggregate validation errors,
executed module count, and local pipeline duration. Telemetry contains no user content.

## Limits

V1 is not connected to the runtime or legacy flow. It is an isolated coordinator for tests and
future shadow integration. Activation and delivery remain outside this module.
