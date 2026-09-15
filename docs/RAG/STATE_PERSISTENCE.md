# Versioned Application State and Persistence

Status: canonical contract for application-state separation, local persistence, migration, recovery, and reset semantics.

## Domain separation

Greygen persists three logically and physically separate state domains:

1. **SoundState** — shareable deterministic generator state;
2. **ProfileState** — private/local playback and calibration profile records;
3. **UiState** — presentation preferences only.

The domains use different TypeScript types, serializers, storage keys, parsers, and reset APIs. Generic sound serialization never reads profile data.

## Storage backend and keys

The initial backend is browser `localStorage`, accessed only through `AppStateRepository` and `StoragePort`:

- `greygen.storage-manifest` — app storage format version;
- `greygen.sound-state` — shareable sound document;
- `greygen.profile-state` — private profile document;
- `greygen.ui-state` — presentation preferences.

DSP and AudioWorklet code never read browser storage directly.

## SoundState schema v3

`SoundState` contains:

- `schemaVersion: 3`;
- unsigned 32-bit deterministic audio-noise `seed`;
- named spectral `targetId`;
- ten user band offsets in dB;
- master digital gain in dB;
- normalized stereo width in `[0, 1]`;
- generic deterministic `animation` state.

Animation state contains its own schema version plus mode, independent unsigned 32-bit animation seed, depth, speed, and energy-preserving flag. Its semantics are defined by `SPECTRAL_ANIMATION.md`.

Sound state deliberately excludes `running`, `started`, `AudioContext` state, or any other autoplay/lifecycle intent. Reload can restore an animated sound but always returns Ready/silent until explicit Start.

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
- invalid energy-preserving flag uses the default `true`.

Malformed JSON never escapes into the app. Safe defaults plus a visible diagnostic are used instead.

## Explicit sound migrations

Compatibility checks live in state code, not React.

### Schema v2 -> v3

Schema v2 already contained stereo width but no animation. Migration preserves every v2 field and assigns animation **Off**. This preserves the previous renderer exactly rather than introducing motion to an existing saved sound.

### Schema v1 -> v3

Schema v1 was mono and had no animation. Migration assigns:

- `stereoWidth = 0`;
- animation Off.

### Schema v0 -> v3

Legacy names (`preset`, `bandsDb`, `masterDb`) are mapped into current fields, then the same mono + animation-Off compatibility policy is applied.

Successful migration is reported and, when writable, the browser rewrites the migrated sound document with the current v3 serializer.

## Future-schema behavior

A document newer than the running build is never guessed at. Greygen loads safe defaults for that domain, reports the incompatibility, and leaves the newer stored value untouched. A future storage-manifest version makes all persistent domains read-only/unknown for that boot.

## ProfileState schema v1

Private profile state stores versioned `calibration` / `playback` records with local ids, names, payload schema versions, and finite JSON-compatible payloads. It remains physically and logically separate from SoundState. Generic sound reset/share operations cannot erase or serialize profiles.

## UiState schema v1

Current UI state contains presentation-only values such as `futureFeaturesVisible`. UI state has no audio meaning and cannot start/resume sound.

## Startup sequence

On browser mount:

1. load/validate sound, profile, and UI documents;
2. create `AudioEngine` with no AudioContext;
3. preload restored audio seed, spectrum, master, stereo width, and animation state through typed engine APIs;
4. enable controls and remain Ready/silent;
5. create/resume browser audio only after explicit Start.

A corrupt document or storage exception cannot prevent a safe Ready state.

## Save and failure semantics

Accepted sound/UI changes are written through `AppStateRepository`. Storage errors:

- do not crash the app;
- do not stop current audio;
- produce a visible persistence notice;
- warn that the current-session change may not survive reload.

There is no network fallback or hidden background retry loop.

## Reset semantics

### Reset sound settings

Resets only SoundState to deterministic first-run defaults:

- default audio seed;
- Grey Practical target;
- neutral user offsets;
- conservative default master;
- Normal stereo width (`0.5`);
- animation Off with default seed/depth/speed/normalization settings.

ProfileState and UiState are preserved.

### Delete local profiles

This separate explicit action empties only ProfileState. Sound and UI settings remain intact.

## Privacy and share boundary

SoundState is generic/shareable. ProfileState is personal local data. Issue #11 share URLs must serialize generic SoundState fields — including stereo and animation — without reading private profiles.

## Validation invariants

Automated persistence coverage includes:

- clean first run;
- sound/profile/UI separation;
- malformed and out-of-range recovery;
- explicit v0/v1/v2 sound migrations;
- mono + animation-Off compatibility for pre-feature saves;
- deterministic seed/width/animation restoration;
- sound reset preserving profiles/UI;
- profile deletion preserving sound;
- browser persistence for preset/bands/master/width/animation/UI;
- reload after Running returning Ready with no autoplay;
- storage exceptions remaining non-fatal.

Persistence tests use an in-memory `StoragePort`; Playwright covers real `localStorage` integration.
