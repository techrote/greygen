# Versioned Application State and Persistence

Status: canonical contract for application-state separation, local persistence, migration, recovery, presets, and reset semantics.

## Domain separation

Greygen persists four logically separate documents:

1. **SoundState** — the currently requested shareable deterministic generator state;
2. **UserPresetLibraryState** — local named snapshots of generic SoundState;
3. **ProfileState** — private/local playback and calibration profile records;
4. **UiState** — presentation preferences only.

The documents use different TypeScript types, serializers, storage keys, parsers, and mutation APIs. Generic sound/share serialization never reads ProfileState, the user-preset library, or UiState.

A user preset is sound-library metadata, not personal calibration data. Its snapshot may contain only canonical SoundState fields; its local display name is not shareable sound state.

## Storage backend and keys

The initial backend is browser `localStorage`, accessed only through `AppStateRepository` and `StoragePort`:

- `greygen.storage-manifest` — app storage format version;
- `greygen.sound-state` — current shareable sound document;
- `greygen.user-presets` — local named sound-preset library;
- `greygen.profile-state` — private profile document;
- `greygen.ui-state` — presentation preferences.

DSP and AudioWorklet code never read browser storage directly.

The overall manifest remains v1 for issue #11: the new preset library is an independently versioned optional document that older builds can safely ignore. Its own schema controls compatibility and write protection.

## SoundState schema v3

`SoundState` contains:

- `schemaVersion: 3`;
- unsigned 32-bit deterministic audio-noise `seed`;
- named spectral `targetId`;
- ten user band offsets in dB;
- master digital gain in dB;
- normalized stereo width in `[0,1]`;
- generic deterministic `animation` state.

Animation state contains its own schema version plus mode, independent unsigned 32-bit animation seed, depth, speed, and energy-preserving flag. Its semantics are defined by `SPECTRAL_ANIMATION.md`.

Sound state deliberately excludes `running`, `started`, `AudioContext` state, or any other autoplay/lifecycle intent. Reload, saved-preset load, or share import can restore a sound but never restore Running.

### Validation and recovery

Current parsing is defensive:

- invalid preset -> Grey Practical;
- wrong-shape/non-finite band offsets -> neutral values; finite offsets clamp to `[-24,+24] dB`;
- invalid audio seed -> deterministic default;
- master clamps to `[-60,0] dB`;
- stereo width clamps to `[0,1]`;
- invalid animation mode/seed use animation defaults;
- animation depth clamps to `[0,12] dB`;
- animation speed clamps to `[0.25,4]`;
- invalid energy-preserving flag uses default `true`.

Malformed JSON never escapes into the app. Safe defaults plus a visible diagnostic are used instead.

## Explicit sound migrations

Compatibility checks live in state code, not React.

### Schema v2 -> v3

Schema v2 already contained stereo width but no animation. Migration preserves every v2 field and assigns animation **Off**.

### Schema v1 -> v3

Schema v1 was mono and had no animation. Migration assigns `stereoWidth = 0` and animation Off.

### Schema v0 -> v3

Legacy names (`preset`, `bandsDb`, `masterDb`) map into current fields, then the same mono + animation-Off compatibility policy is applied.

Successful migration is reported and, when writable, the browser rewrites the migrated current-sound document using the v3 serializer.

## UserPresetLibraryState schema v1

The local sound-preset library is a separate optional document. Each record contains:

- record schema version;
- stable deterministic local id (`user-0001`, `user-0002`, ...);
- sanitized local display name;
- canonical complete SoundState snapshot.

The initial library is bounded to 64 records. Duplicate ids, invalid records, and unusable names are rejected/skipped defensively. Sound values inside readable records pass through the same canonical SoundState parser and bounds.

An unknown future preset-library schema loads an empty in-memory library for that boot, reports the incompatibility, leaves the stored document untouched, and write-protects only the preset-library domain. Current sound/profile/UI documents remain independently usable.

User-preset semantics, name sanitation, and sharing boundaries are canonicalized in `PRESETS_SHARING.md`.

## Future-schema behavior

A document newer than the running build is never guessed at. Greygen loads safe defaults for that document, reports the incompatibility, leaves the newer value untouched, and prevents that older build from overwriting it during the boot.

A future storage-manifest version makes **all** persisted documents, including the user-preset library, read-only/unknown for that boot.

## ProfileState schema v1

Private profile state stores versioned `calibration` / `playback` records with local ids, names, payload schema versions, and finite JSON-compatible payloads. It remains physically and logically separate from SoundState and UserPresetLibraryState. Generic sound reset, saved-preset operations, and normal sharing cannot erase or serialize profiles.

## UiState schema v1

Current UI state contains presentation-only values such as `futureFeaturesVisible`. UI state has no audio meaning and cannot start/resume sound.

## Startup and share-import sequence

On browser mount:

1. load/validate current sound, user-preset library, profile, and UI documents;
2. inspect a normal share fragment if present;
3. if valid, use imported SoundState as current sound for this boot and consume the share fragment; if malformed/future, preserve local current sound and report the error;
4. create `AudioEngine` with no AudioContext;
5. preload requested audio seed, spectrum, master, stereo width, and animation through typed engine APIs;
6. persist accepted migrated/imported current sound when writable;
7. enable controls and remain Ready/silent;
8. create/resume browser audio only after explicit Start.

A corrupt document, malformed share link, or storage exception cannot prevent a safe Ready state.

## Save and failure semantics

Accepted current-sound, user-preset-library, profile, and UI changes are written through `AppStateRepository`. Storage errors:

- do not crash the app;
- do not stop current audio;
- produce a visible persistence notice;
- warn that the current-session change may not survive reload.

There is no network fallback or hidden background retry loop.

## Reset and deletion semantics

### Reset sound settings

Resets **only current SoundState** to deterministic first-run defaults:

- default audio seed;
- Grey Practical target;
- neutral user offsets;
- conservative default master;
- Normal stereo width (`0.5`);
- animation Off with default seed/depth/speed/normalization settings.

UserPresetLibraryState, ProfileState, and UiState are preserved.

### Delete saved user preset

Deletes only the selected local sound-preset record. It does not change current sound, profiles, or UI state.

### Delete local profiles

This explicit separate action empties only ProfileState. Current sound, saved user presets, and UI settings remain intact.

## Privacy and share boundary

SoundState is generic/shareable. UserPresetLibraryState is local sound-library metadata. ProfileState is personal local calibration/playback data. UiState is local presentation state.

Normal share URLs serialize **SoundState only**, including stereo and animation. They never read or serialize:

- ProfileState records, calibration curves, profile ids, profile/device names or notes;
- user-preset display names or the local preset library;
- UI preferences.

The versioned share format and import bounds live in `PRESETS_SHARING.md`.

## Validation invariants

Automated persistence coverage includes:

- clean first run;
- current sound / user preset / profile / UI separation;
- malformed and out-of-range recovery;
- explicit v0/v1/v2 sound migrations;
- mono + animation-Off compatibility for pre-feature saves;
- deterministic seed/width/animation restoration;
- user preset library round trip and future-schema write protection;
- sound reset preserving user presets/profiles/UI;
- profile deletion preserving current sound and user presets;
- browser persistence for preset/bands/master/width/animation/UI;
- shared-URL import remaining Ready/silent;
- reload after Running returning Ready with no autoplay;
- storage exceptions remaining non-fatal.

Persistence tests use an in-memory `StoragePort`; Playwright covers real localStorage and share-navigation integration.
