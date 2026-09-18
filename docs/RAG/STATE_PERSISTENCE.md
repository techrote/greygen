# Versioned Application State and Persistence

Status: canonical contract for application-state separation, local persistence, migration, recovery, presets, calibration profiles, and reset semantics; reconciled for v0.1 in issue #20.

## Domain separation

Greygen persists four logically separate documents:

1. **SoundState** — the currently requested shareable deterministic generator state;
2. **UserPresetLibraryState** — local named snapshots of generic SoundState;
3. **ProfileState** — private/local playback and calibration profile records plus selection/application mode;
4. **UiState** — presentation preferences only.

The documents use different TypeScript types, serializers, storage keys, parsers, and mutation APIs. Generic sound/share serialization never reads ProfileState, the user-preset library, or UiState.

A user preset is sound-library metadata, not personal calibration data. Its snapshot may contain only canonical SoundState fields; its local display name is not shareable sound state.

## Storage backend and keys

The backend is browser `localStorage`, accessed only through `AppStateRepository` and `StoragePort`:

- `greygen.storage-manifest` — app storage format version;
- `greygen.sound-state` — current shareable sound document;
- `greygen.user-presets` — local named sound-preset library;
- `greygen.profile-state` — private profile document;
- `greygen.ui-state` — presentation preferences.

DSP and AudioWorklet code never read browser storage directly.

The overall storage manifest remains v1. The sound, user-preset, profile, and UI documents are independently versioned so a change in one domain does not force reinterpretation of unrelated data.

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

Sound state deliberately excludes `running`, `started`, `AudioContext` state, or any other autoplay/lifecycle intent. Reload, saved-preset load, normal share import, private profile import, or service-worker update can restore state but never restore Running.

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

User-preset semantics, name sanitation, persistence, and limits are canonicalized in `PRESETS_SHARING.md`.

## ProfileState schema v2

The private profile envelope is **schema v2** in the v0.1 implementation. It contains:

- versioned local `calibration` / `playback` profile records;
- `activeProfileId`, or `null`;
- calibration application mode `off | balanced | full`.

Each generic record keeps an independently versioned payload. Current calibration payloads are schema v3 and contain explicit linked/independent channel mode, left/right raw curves, optional sanitized playback-device note, and optional guided evidence. Historical calibration payload v1/v2 remains readable and is canonicalized to linked v3 semantics in memory. Unsupported future payloads are rejected rather than guessed.

ProfileState remains physically and logically separate from SoundState and UserPresetLibraryState. Generic sound reset, saved-preset operations, built-in preset selection, and normal sound sharing cannot erase or serialize private profiles.

Explicit personal profile export/import uses a different envelope and is not ProfileState persistence. Import validates, allocates a new local identity, stores the record unselected/unapplied, and never creates/resumes audio. See `CALIBRATION_PROFILES.md` and `PRESETS_SHARING.md`.

## UiState schema v2

UiState is presentation-only and currently contains:

- `futureFeaturesVisible`;
- `analyzerVisible`.

UiState v1 predates persisted analyzer visibility and migrates deterministically with the analyzer closed. UI state has no audio meaning and cannot start/resume sound or change deterministic audio samples.

## Future-schema behavior

A document newer than the running build is never guessed at. Greygen loads safe defaults for that document, reports the incompatibility, leaves the newer value untouched, and prevents that older build from overwriting it during the boot.

A future storage-manifest version makes **all** persisted documents, including the user-preset library, read-only/unknown for that boot.

## Startup and share-import sequence

On browser mount:

1. load/validate current sound, user-preset library, profile, and UI documents;
2. inspect a normal share fragment if present;
3. if valid, use imported SoundState as current sound for this boot and consume the share fragment; if malformed/future, preserve local current sound and report the error;
4. create `AudioEngine` with no AudioContext;
5. preload requested audio seed, spectrum, master, stereo width, animation, and any explicitly selected/applied profile correction through typed engine APIs;
6. persist accepted migrated/imported current sound when writable;
7. enable controls and remain Ready/silent;
8. create/resume browser audio only after explicit Start.

A corrupt document, malformed share link, profile record incompatibility, or storage exception cannot create autoplay intent and cannot prevent a safe Ready state.

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

### Delete local profile / profiles

Single-profile deletion uses deliberate confirmation; deleting the active profile safely bypasses correction. The separate bulk action empties only ProfileState. Current sound, saved user presets, and UI settings remain intact.

## Privacy and share boundary

SoundState is generic/shareable. UserPresetLibraryState is local sound-library metadata. ProfileState is personal local calibration/playback data. UiState is local presentation state.

Normal share URLs serialize **SoundState only**, including stereo and animation. They never read or serialize:

- ProfileState records, calibration curves, profile ids/names/notes/evidence or correction curves;
- user-preset display names or the local preset library;
- UI preferences.

The versioned normal-share format and import bounds live in `PRESETS_SHARING.md`. The separate personal calibration export is intentional private-data portability and never enters the normal `#s=` payload.

## Validation invariants

Automated persistence coverage includes:

- clean first run;
- current sound / user preset / profile / UI separation;
- malformed and out-of-range recovery;
- explicit v0/v1/v2 sound migrations;
- mono + animation-Off compatibility for pre-feature saves;
- deterministic seed/width/animation restoration;
- ProfileState schema v2 and historical calibration-payload compatibility;
- UiState v1 -> v2 analyzer-closed migration;
- user preset library round trip and future-schema write protection;
- sound reset preserving user presets/profiles/UI;
- profile deletion preserving current sound and user presets;
- personal profile import remaining unselected/unapplied and non-autoplaying;
- browser persistence for preset/bands/master/width/animation/analyzer visibility;
- shared-URL import remaining Ready/silent;
- reload after Running returning Ready with no autoplay;
- storage exceptions remaining non-fatal.

Persistence tests use an in-memory `StoragePort`; Playwright covers real localStorage and share-navigation integration.
