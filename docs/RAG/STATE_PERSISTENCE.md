# Versioned Application State and Persistence

Status: canonical contract for issue #8 application-state separation, local persistence, migration, recovery, and reset semantics.

## Domain separation

Greygen persists three logically and physically separate state domains:

1. **SoundState** — shareable generator state that affects deterministic sound identity;
2. **ProfileState** — private/local playback and calibration profile records;
3. **UiState** — presentation preferences only.

The domains use different TypeScript types, serializers, storage keys, parsers, and reset APIs. `serializeSoundState()` accepts only `SoundState`; there is no profile field or profile serializer hook in the sound schema. This separation is the privacy boundary future share/export work must preserve.

A small storage manifest carries the current overall app-storage format version. Each domain also has its own schema version so later migrations can be targeted rather than coupling unrelated data.

## Storage backend and keys

The initial backend is browser `localStorage`, accessed only through `AppStateRepository` and a small `StoragePort` abstraction. DSP, AudioWorklet code, and feature modules do not read browser storage directly.

Current keys:

- `greygen.storage-manifest` — app storage format version;
- `greygen.sound-state` — shareable sound document;
- `greygen.profile-state` — private profile document;
- `greygen.ui-state` — presentation preferences.

IndexedDB is intentionally not used yet: current state is compact, synchronous, and does not require transactions or binary payloads. The repository abstraction keeps a later backend change possible without moving persistence logic into UI components.

## SoundState schema v1

`SoundState` contains:

- `schemaVersion: 1`;
- unsigned 32-bit deterministic `seed`;
- named spectral `targetId`;
- ten user band offsets in dB;
- master digital gain in dB.

The current schema does **not** contain `running`, `started`, `muted`, `AudioContext` state, or any other autoplay/lifecycle intent. Consequently a reload can restore the requested sound but cannot restore Running. Browser audio still requires the explicit Start action defined by `AUDIO_LIFECYCLE.md`.

Modified-preset state is not stored as a redundant boolean. It is derived deterministically from restored non-zero user band offsets, so an edited named preset returns as `Modified` after reload without a second source of truth.

### Sound validation and recovery

Current-state parsing is defensive:

- invalid/unknown preset identifiers fall back to Grey Practical;
- a missing/wrong-shape band array falls back to ten neutral offsets;
- non-finite band values reset to `0 dB`;
- finite band values outside the accepted range clamp to `[-24, +24] dB`;
- invalid seed values fall back to the deterministic default seed rather than silently changing integer identity;
- finite master values clamp to `[-60, 0] dB`;
- invalid master values use the conservative default master level.

Malformed JSON never escapes into the app. It produces safe defaults plus a user-visible recovery diagnostic.

## Explicit sound migration

Issue #8 defines a concrete legacy `SoundState` schema-v0 fixture so migration behavior is executable rather than hypothetical.

Legacy v0 fields:

- `schemaVersion: 0`;
- `seed`;
- `preset`;
- `bandsDb`;
- `masterDb`.

`migrateSoundStateV0()` maps those fields into v1 and then applies the same canonical validation/recovery rules as a current document. Successful migration is reported explicitly and the browser app rewrites the migrated sound document using the current serializer when storage is writable.

Compatibility checks live in state/migration code, not React components.

## Future-schema behavior

A document with a schema version newer than the current build is never guessed at.

For a future **domain** version, Greygen loads a safe default for that domain, reports the incompatibility, and leaves the stored document untouched.

For a future **storage manifest** version, Greygen treats the whole persisted set as read-only/unknown for that boot: all three domains use safe defaults and existing storage is left untouched. This prevents an older build from rewriting state created by a newer build.

## ProfileState schema v1

`ProfileState` is private/local and begins as an empty-capable container. It stores versioned `LocalProfileRecord` envelopes with:

- record schema version;
- stable local id;
- user-facing name;
- `calibration` or `playback` kind;
- payload schema version;
- finite JSON-compatible private payload object.

Issue #8 validates the envelope and JSON safety but deliberately does not invent calibration mathematics before issues #13–#15. Those issues own the payload schemas and domain-specific numeric bounds.

If any private profile record is structurally invalid or from an unknown future profile-state version, no profiles are loaded for that boot and the original localStorage value is left untouched. Greygen does not silently rewrite or discard personal profile data during recovery.

Normal sound serialization never includes profile names, notes, payloads, or identifiers.

## UiState schema v1

`UiState` contains presentation-only values. The initial concrete preference is:

- `futureFeaturesVisible` — whether the disabled roadmap/placeholder controls are expanded on the primary surface.

This preference has no audio meaning and cannot start/resume sound.

## Startup sequence

On browser mount:

1. create the state repository;
2. synchronously load and validate the three local documents;
3. render recovered sound/profile/UI state with controls still gated;
4. create `AudioEngine`;
5. preload restored seed, spectrum, and master into the engine while it owns no AudioContext/worklet node;
6. enable controls and remain `Ready`/silent;
7. create/resume browser audio only after the user explicitly presses Start.

A persistence error or corrupt document cannot block the app from reaching a safe default Ready state.

## Save and failure semantics

Accepted sound/UI changes are written through `AppStateRepository`. Storage reads/writes are wrapped in `try/catch` because browsers can deny localStorage or throw quota/security errors.

A write failure:

- does not crash the app;
- does not stop currently running audio;
- produces a visible local-state notice;
- warns that the current-session change may not survive reload.

There is no background retry loop and no network fallback.

## Reset semantics

Reset operations are intentionally non-equivalent:

### Reset sound settings

Resets only SoundState to deterministic defaults:

- default seed;
- Grey Practical target;
- neutral user offsets;
- conservative default master.

It updates the running/ready engine through the normal smoothed control path and writes only the sound document. ProfileState and UiState are preserved.

### Delete local profiles

This is a separate explicit action. It replaces only ProfileState with an empty v1 container. Sound and UI settings are preserved.

The primary UI keeps the two actions visually/textually distinct so a user cannot reasonably interpret a sound reset as permission to erase personal profiles.

A future factory reset may deliberately combine domains, but issue #8 does not add one.

## Privacy and share boundary

ProfileState is personal local data. It is not part of SoundState and is not consumed by generic sound serializers.

Issue #11 share URLs must serialize SoundState (plus later generic sound fields) without reading ProfileState. Any future export that includes profiles requires a separate explicit private-profile export path and user action.

## Validation invariants

Issue #8 automated coverage includes:

- clean first run;
- independent three-domain save/reload round trip;
- malformed JSON recovery;
- wrong types and bounded numeric recovery;
- explicit sound-v0 migration;
- future domain and future manifest behavior;
- deterministic seed and Modified-state restoration;
- sound reset preserving profile/UI state;
- explicit profile deletion preserving sound;
- read/write/quota-style storage exceptions;
- browser reload persistence for preset, modified band, master, and UI preference;
- browser reload after Running returning Ready with no autoplay;
- browser malformed-localStorage recovery to usable Ready defaults.

Persistence tests use an in-memory `StoragePort` rather than depending on browser globals; Playwright covers the real localStorage integration.
