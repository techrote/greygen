# Presets and Privacy-Safe Sharing

Status: canonical contract for built-in preset ownership, local user sound presets, backend-free normal share URLs, and their separation from personal calibration portability.

## Purpose

Greygen has two sound-preset concepts with deliberately different ownership:

1. **Built-in colour presets** (`White`, `Pink`, `Brown / Red`, `Grey (Practical)`) describe only the spectral target layer.
2. **User sound presets** are explicit local snapshots of complete generic/shareable `SoundState`.

This prevents selecting a colour from unexpectedly resetting master, stereo, animation, deterministic source identity, private calibration/profile state, or UI preferences.

## Built-in colour preset ownership

Built-in colour presets own exactly:

- `targetId`;
- ten `userBandOffsetsDb` values.

Selecting one sets its target and returns those ten user offsets to neutral 0 dB through the existing smoothed path. It preserves seed, master, stereo width, animation, all private profiles, local user-preset library, and UI preferences.

A built-in preset is `Modified` only when its owned spectral offsets are non-zero.

## User sound presets

A user sound preset snapshots complete generic `SoundState`:

- audio-noise seed;
- target id;
- ten user band offsets;
- master digital level;
- stereo width;
- deterministic animation state.

User sound presets do **not** contain ProfileState, calibration curves, channel-calibration mode, guided evidence, profile ids/names/notes, or UiState.

The local library is versioned separately at `greygen.user-presets`. Resetting current sound does not delete saved user presets. The current library bound is 64 presets with monotonic local ids (`user-0001`, ...).

### Name handling

Preset names are local display metadata. Before storage/display Greygen applies NFKC normalization, strips control characters/angle brackets, collapses whitespace, trims, limits to 80 characters, and rejects empty results. React renders names as text; names never enter normal share payloads.

## Matching and visible state

If current SoundState exactly equals a saved user preset snapshot, the UI shows its saved name. Otherwise it falls back to built-in target plus spectral-only Modified semantics.

## Normal share format v1

Normal sharing is backend-free. Current sound is encoded into the URL fragment:

```text
#s=<base64url payload>
```

The decoded fixed-order v1 tuple contains only:

1. share-format version;
2. SoundState schema version;
3. audio-noise seed;
4. compact target code;
5. ten user offsets;
6. master level;
7. stereo width;
8. compact animation mode;
9. animation seed;
10. animation depth;
11. animation speed;
12. energy-preserving flag.

Equal canonical SoundState values serialize deterministically to equal payloads.

## Normal-share privacy boundary

The normal share API accepts **SoundState only**. It never accepts/reads ProfileState, UserPresetLibraryState, or UiState.

Normal share links therefore exclude by construction:

- linked or independent calibration curves;
- calibration channel mode;
- guided measurement evidence;
- profile ids;
- profile names;
- device/headphone/speaker notes;
- personal calibration export metadata;
- saved user-preset names/library;
- UI preferences.

Issue #15 deliberately does **not** extend this format.

## Personal calibration export is a separate product surface

Private playback profiles can now be exported intentionally, but only through the explicit **Personal profile export / import** calibration UI and a different envelope.

That envelope identifies itself as:

- kind `greygen-personal-calibration-profile`;
- data class `personal-playback-calibration`;
- its own export schema version.

It may contain the profile name, optional device note, linked/independent correction data, and guided evidence because those are the data the user explicitly chose to export. Local record ids are omitted.

This serializer is not callable through normal SoundState sharing and its output is never inserted into the `#s=` fragment.

Personal profile import validates envelope/payload schema and bounds, creates a new local profile identity, then leaves it **unselected and unapplied**. It never creates/resumes an AudioContext. Selection remains an explicit later user action.

## Defensive normal-share import

Normal sound-share import remains bounded/versioned:

- encoded payloads over 2048 characters rejected before decode;
- invalid base64url/JSON/tuple/type rejected;
- future share-format or SoundState schema rejected clearly;
- finite out-of-range SoundState numbers pass canonical validation/clamping;
- malformed share data never reaches DSP objects directly.

## Normal-share lifecycle and URL behavior

Opening a valid normal share URL:

1. loads local documents;
2. validates the share fragment;
3. uses imported SoundState for current sound;
4. preloads it into `AudioEngine` while no AudioContext/worklet exists;
5. persists accepted current sound;
6. removes the consumed fragment;
7. remains `Ready`/silent until explicit **Start audio**.

Malformed/future normal shares leave local sound untouched and show a notice. Manual shared-URL load while Ready likewise remains silent.

## Share/copy UI

The primary surface exposes the normal sound share link in a read-only input. Clipboard failure leaves the link selectable and shows a fallback message.

Personal calibration export text appears only inside the calibration/privacy surface and is labelled as personal playback/calibration data.

## Reset and deletion semantics

- **Reset sound settings:** current SoundState only.
- **Delete local profiles:** private ProfileState only, including calibration profiles.
- **Delete saved preset:** one local sound-preset record.
- **Delete calibration profile:** one private profile, using deliberate confirmation; active-profile deletion bypasses correction safely.
- Import/duplicate never implicitly replace or select the active profile.

These actions remain separate by design.

## Validation invariants

Coverage includes:

- built-in ownership and Modified semantics;
- user preset save/load/delete/domain isolation;
- name sanitization/no HTML injection;
- deterministic normal share round trip;
- malformed/oversized/future normal-share rejection;
- private profile names/notes/ids/evidence/corrections absent from normal share payloads;
- normal share navigation/import remaining Ready when stopped;
- explicit personal calibration export carrying only canonical personal-profile data and omitting local id;
- personal import roundtrip plus malformed/future rejection;
- personal import remaining unselected and non-autoplaying;
- sound/profile/preset resets remaining independently scoped;
- lifecycle, stereo, animation, analyzer, and calibration regressions remaining green.
