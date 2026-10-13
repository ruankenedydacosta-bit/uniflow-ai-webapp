# UniFlow Uni Audio Experience V1

## Objective

The Uni audio experience selects approved local recordings by conversational context while limiting repetition,
frequency and inappropriate use. It is optional presentation: all important information remains visible, and audio
never confirms or executes an action.

## Local catalog

The manifest records a stable ID, final category and context, spoken text, emotion, technical filename, weight,
cooldown, eligibility flags, original filename/category/subcategory and SHA-256 checksum. Runtime behavior never
parses physical filenames. Embedded C2PA provenance is preserved and creates no network dependency.

The audited library contains 109 recordings. Of these, 104 are imported locally. Five remain documented but disabled
without a `src`: the annoyed comprehension error, an unsupported data-safety statement, a confusing returning-user
joke, a gender-specific listening variant without an applicable preference and a proactive alert with laughter.

## Context map

- `first_app_access`: intentionally silent until the exact “Seja bem-vindo à UniFlow.” MP3 is supplied.
- `returning_user`: rotating welcome after an eligible gesture, at most every 12 hours.
- time greetings: morning, afternoon and evening with a six-hour cooldown.
- interaction: listening, waiting, processing and listening-to-processing transition.
- confirmation: general, save and sensitive; visible UI remains mandatory.
- errors: respectful comprehension and neutral temporary failures.
- finance, positive, support and proactive: constrained by evidence and safety policies.
- onboarding and closing: ordered cues with operation/session limits.

Three misplaced closing files are cataloged as errors. Two listening files are cataloged as processing/transition.
The external source library is not renamed, moved or modified.

## Frequency and anti-repetition

Eligibility filters disabled clips, preferences, gesture requirements, sensitive use, evidence, time windows,
operation limits, per-session/per-user constraints and cooldowns. Selection avoids the last clip in the same category
and the last three global clips whenever alternatives exist, then applies weighted selection. Proactive speech is
limited to two events per day. Versioned history is isolated by user ID with an anonymous fallback and limited to
100 successful playback events.

History is recorded only after the persistent player receives the real `playing` event. Blocked autoplay, errors,
timeouts and cancellation before playback do not consume eligibility. Storage or playback failure produces silence
without breaking the interface.

## Preferences

The domain supports `voiceEnabled`, `proactiveVoiceEnabled`, `volume` and `reducedVoiceFrequency`. No settings screen
is added in V1. Disabled voice produces silence and does not record history.

## Initial integrations

- onboarding requests `first_app_access` after completion and currently receives intentional silence;
- the central Uni button no longer plays `returning_user`: since 13/10/2026 the Uni speaks only in the realtime voice conversation;
- Uni Instant requests one processing clip per mock operation;
- comprehension failures request `error_understanding`;
- mock financial confirmation requests only `confirmation_sensitive`.

The provider remains above application routes. Navigation does not destroy active playback, and the single player
interrupts an earlier clip when a new prioritized request begins.

## Safety and limitations

There is no ElevenLabs API, TTS, HTTP request, real microphone or remote model. Audio never replaces visible content
or authorizes financial action. Automatic proactive, real finance, emotional support and positive data-driven uses
remain unintegrated until explicit product rules and verified data are available.

## Next steps

Supply the exact first-access recording, pass authenticated user IDs consistently, expose prepared preferences in the
existing settings experience and validate contextual audio on physical devices.
