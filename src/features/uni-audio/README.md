# Uni Audio Infrastructure

Local, inactive infrastructure for future prerecorded Uni MP3 clips. Assets are
organized under `src/assets/audio/uni`, registered explicitly in
`voiceManifest.js`, and played through the persistent `VoiceManager`.

The V2 manifest keeps the spoken text, emotion, original source path, checksum, final context and eligibility
metadata for every audited clip. Contextual selection and anti-repetition live in `uni-audio-selection`; no
runtime behavior depends on the original long filenames. `first_app_access` intentionally remains silent until
the exact recording “Seja bem-vindo à UniFlow.” is supplied.

The feature is not mounted in the application. It performs no HTTP requests,
does not call voice or AI providers, and has no backend dependency. When an MP3
is added, import its bundled URL in the manifest and register a unique id,
category, and source.
