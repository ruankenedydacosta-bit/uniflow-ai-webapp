# Prompt Compiler V1

Compiles an approved Structured Prompt into deterministic provider-agnostic text.
The compiler preserves every source section as a defensive structural copy and adds
only policy-controlled titles, separators, spacing, and compiler metadata.

Supported policies are `STANDARD`, `COMPACT`, `DEBUG`, and `VERBOSE`. They never
summarize, remove, reorder, or rewrite source content.

Rejected validation reports return an immutable structured error and no compiled
text. The compiler never invokes an adapter or model, performs HTTP, consumes tokens,
persists data, or modifies its inputs. `UNI_OS_ENABLED` remains disabled and the
shadow runner always discards the result.
