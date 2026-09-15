# Presets and Privacy-Safe Sharing

Status: canonical contract for built-in preset ownership, local user sound presets, and backend-free share URLs.

## Purpose

Greygen has two different preset concepts and they deliberately own different fields:

1. **Built-in colour presets** (`White`, `Pink`, `Brown / Red`, `Grey (Practical)`) describe only the spectral target layer.
2. **User sound presets** are explicit local snapshots of the complete generic/shareable `SoundState`.

This distinction prevents selecting a noise colour from unexpectedly resetting master level, stereo width, animation, deterministic source identity, calibration/profile state, or UI preferences.

## Built-in colour preset ownership

Built-in colour presets own exactly:

- `targetId`;
- the ten `userBandOffsetsDb` values.

Selecting a built-in colour preset sets its target and returns those ten user offsets to neutral `0 dB` through the existing smoothed engine path. It preserves:

- audio-noise seed;
- master digital level;
- stereo width;
- animation mode/seed/depth/speed/normalization;
- all private profiles;
- local user-preset library;
- all UI preferences.

A built-in preset is displayed as `Modified` when one or more of its owned band offsets is non-zero. Unrelated master/stereo/animation changes do not make a colour preset Modified because those fields are not owned by the colour preset.

## User sound presets

A user sound preset snapshots the complete generic `SoundState`:

- audio-noise seed;
- target id;
- ten user band offsets;
- master digital level;
- stereo width;
- generic deterministic animation state.

User presets do **not** contain `ProfileState`, profile identifiers, calibration curves, device names/notes, or `UiState`.

The local library uses its own versioned document at `greygen.user-presets` with schema v1. It is logically part of the sound domain but is separate from the current `greygen.sound-state` document, so resetting current sound does not delete saved presets.

The initial implementation is bounded to 64 saved presets. Stable ids are generated monotonically (`user-0001`, `user-0002`, ...), avoiding random identity requirements in this local library.

### Name handling

Preset names are local display metadata. Before storage/display Greygen:

- applies Unicode NFKC normalization;
- removes ASCII control characters and angle brackets;
- collapses whitespace;
- trims leading/trailing whitespace;
- limits the result to 80 characters;
- rejects names with no visible text after sanitization.

React renders names as text, never injected HTML. The sanitized name is never part of ordinary share payloads.

## Matching and visible state

If current `SoundState` exactly equals a saved user preset snapshot, the primary surface shows that saved preset name and `Saved preset`.

Otherwise the surface falls back to the built-in colour target and its spectral-only Modified semantics. Saving the current modified sound therefore creates a named local baseline and removes the transient `Modified` presentation while the complete sound still matches that saved snapshot.

## Share format v1

Normal sharing is backend-free. The current sound is encoded into a compact versioned payload stored in the URL fragment:

```text
#s=<base64url payload>
```

A fragment is used rather than a query parameter so normal HTTP requests do not transmit the sound payload to the static host.

The decoded v1 payload is a fixed-order JSON tuple containing only:

1. share-format version;
2. `SoundState` schema version;
3. audio-noise seed;
4. compact built-in target code;
5. ten band offsets;
6. master digital level;
7. stereo width;
8. compact animation-mode code;
9. animation seed;
10. animation depth;
11. animation speed;
12. energy-preserving flag.

No user-preset name or library metadata is included.

The tuple ordering is canonical, so equal canonical `SoundState` values serialize deterministically to the same payload.

## Privacy boundary

The normal share API accepts `SoundState` only. It never accepts or reads `ProfileState`, `UserPresetLibraryState`, or `UiState`.

Consequently normal share links exclude by construction:

- calibration/playback curves;
- profile ids;
- profile names;
- profile/device notes;
- saved user-preset names;
- local library contents;
- local presentation preferences.

An intentional private-profile export, if later implemented, must use a separate user action and format. It must not extend normal sound sharing implicitly.

## Defensive import

Share import is bounded and versioned:

- encoded payloads over 2048 characters are rejected before decoding;
- invalid base64url, JSON, tuple shape, field types, or unsupported old format are rejected;
- unknown future share-format versions are rejected clearly;
- unknown future sound-state schemas are rejected clearly;
- finite numeric values outside current SoundState ranges pass through the canonical SoundState parser and are clamped/recovered with diagnostics;
- no malformed share payload can reach DSP objects directly.

Share v1 explicitly records the SoundState schema version so a later share-format migration can make an explicit compatibility decision rather than guessing.

## Import lifecycle and URL behavior

Opening a valid share URL:

1. loads normal local documents;
2. validates the share fragment;
3. uses the imported SoundState as the requested current sound for that boot;
4. preloads it into `AudioEngine` while no AudioContext/worklet exists;
5. persists the accepted current sound locally;
6. consumes/removes the `s` fragment from the visible URL;
7. remains `Ready` and silent until the user explicitly selects **Start audio**.

A malformed/future share leaves the local sound untouched and shows an actionable notice.

The primary surface also exposes a manual `Load shared sound URL` control. Loading while Ready does not start audio. Loading while audio is already running is an explicit user action that updates the existing engine; it does not create a new autoplay path.

## Share/copy UI

The primary surface always exposes the current sound's share link in a selectable read-only input.

`Copy share link` uses the Clipboard API when allowed. If browser permissions block clipboard writes, the visible URL remains selectable and the UI explains the fallback rather than failing silently.

## Reset and deletion semantics

- **Reset sound settings** resets only current SoundState. Saved user presets remain available.
- **Delete local profiles** deletes only private ProfileState. User presets and current sound remain available.
- **Delete saved preset** deletes only that local sound-preset record.

These operations are deliberately separate.

## Validation invariants

Automated coverage includes:

- explicit built-in owned-field definitions;
- built-in selection preserving seed/master/stereo/animation;
- built-in Modified detection;
- user preset save/load/delete and deterministic ids;
- display-name sanitization/no HTML element injection;
- local preset-library round trip and domain isolation;
- sound reset/profile deletion preserving saved presets;
- future preset-library schema write protection;
- deterministic share round trip;
- malformed, truncated, oversized, and future share rejection;
- bounded recovery/clamping for finite imported numeric values;
- private profile fixture strings absent from normal share payloads/URLs;
- manual shared-URL load remaining Ready;
- startup shared-URL navigation overriding local sound while remaining Ready/silent;
- future share versions failing visibly without replacing local sound;
- all pre-existing lifecycle, stereo, animation, and persistence tests remaining green.
