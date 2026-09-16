# Primary Generator UI Contract

Status: canonical contract for the friendly ten-band generator surface, reconciled through issue #11 preset library and privacy-safe sharing.

## Purpose

The primary Greygen screen is the usable product core, not a DSP-debug panel. It exposes lifecycle, spectral shape, digital level, spatial width, deterministic movement, local sound presets, privacy-safe sharing, and an immediate Stop path without leaking filter/worklet internals.

All sound changes go through typed `AudioEngine` / SoundState APIs. UI code does not own browser audio nodes or generate DSP trajectories.

## Primary surface

The default screen contains:

- explicit Start / Stop / Resume / Retry transport;
- White, Pink, Brown / Red, and Grey (Practical) target selection;
- ten bounded user band-offset controls with visible numeric dB readouts and neutral reset;
- local named user sound preset save/load/delete;
- current-sound share URL, copy action, and manual shared-URL import;
- master digital level;
- active power-preserving stereo width with Mono/Narrow/Normal/Wide, percentage, and target correlation;
- active deterministic spectral animation with mode, depth, speed, and mean-band-power normalization controls;
- Peak/RMS/safety/master telemetry and guard indication;
- explicit runtime high-band degradation disclosure;
- disabled playback-calibration/profile entry point with non-medical wording;
- local-state controls that distinguish current-sound reset from private-profile deletion.

Audio never starts from page load, built-in/user preset selection, band/master/width/animation edits, reload, persistence restore, share import, or migration. Start remains explicit.

## Built-in colour preset ownership

Built-in White/Pink/Brown/Grey presets own exactly the spectral target plus ten user band offsets. Selecting one changes target and clears only those offsets to neutral.

Built-in selection does **not** reset:

- audio seed;
- master level;
- stereo width;
- animation settings/seed;
- lifecycle;
- saved user presets;
- private profiles;
- UI preferences.

Any non-zero user band offset makes the visible built-in preset state `Modified`. Unrelated master/stereo/animation changes do not, because those fields are outside built-in colour ownership.

## User sound presets

Saving a user preset snapshots the complete generic SoundState, including seed, target/bands, master, stereo, and animation. A current sound that exactly matches a saved snapshot displays the sanitized saved name and `Saved preset`; otherwise the UI falls back to the built-in target + Modified/Preset presentation.

Saved-preset names are local metadata and never become HTML. Load applies the full snapshot through typed engine APIs; Delete removes only that library record. Reset sound and Delete local profiles do not delete saved presets.

Full ownership, sanitation, persistence, and limits are defined by `PRESETS_SHARING.md`.

## Sharing UI and privacy

The primary surface exposes a selectable read-only share URL for current SoundState and a **Copy share link** action. Clipboard API failure is recoverable: the visible URL remains selectable and the user receives fallback text.

The same surface accepts a shared URL for explicit manual load. Valid startup or manual share loads apply only SoundState. Malformed/future links report a visible error and do not replace usable local sound.

UI privacy wording explicitly states normal share links exclude:

- local user-preset names/library metadata;
- playback/calibration profiles and profile notes;
- UI preferences.

Normal share/import never starts audio. `PRESETS_SHARING.md` owns the encoded format and privacy proof.

## Spectrum and band behavior

The accepted per-band user range remains `[-24,+24] dB`. Every band retains native keyboard adjustment, visible/readable numeric state, accessible naming, and neutral reset.

## Master level

The master control exposes `[-60,0] dB` and calls `AudioEngine.setMasterGainDb()`. It is explicitly digital level, never acoustic SPL.

## Stereo width

Stereo width remains the native `[0,1]` range defined by `STEREO_WIDTH.md`, including friendly labels, target correlation, and applied correlation telemetry while Running. It is not a pan control and has no user-facing anti-phase range.

## Spectral animation

Animation semantics are defined by `SPECTRAL_ANIMATION.md`. The primary surface exposes native semantic controls:

- Mode: **Off, Drift, Breathe, Wander, Orbit**;
- Depth: `0..12 dB`, UI step `0.5 dB`;
- Speed: `0.25..4.0×`, UI step `0.25×`;
- **Preserve mean band power** checkbox.

Mode/depth/speed/normalization are generic SoundState and can be saved/shared. Editing them while Ready must not create an AudioContext.

Selecting Off preserves configured seed/depth/speed for later reuse while making the requested animation target neutral. DSP smoothing controls audible return to the base spectrum.

## Runtime 16 kHz semantics

Before Start, runtime sample rate/high-band mode are unknown. After worklet initialization, `degraded-high-shelf` marks the 16k control textually as a stable high shelf above approximately 11.3 kHz; `bounded-bandpass` needs no warning.

## Metering

Peak/RMS are final post-master/post-guard digital telemetry. Stereo RMS represents average channel power and Peak the larger channel peak. Safety pre-gain and guard interventions remain visible independently from requested spectrum/animation.

No meter uses SPL, phon, sone, or medical/hearing-threshold units.

## Accessibility and input

Primary controls are native HTML inputs/selects/buttons with explicit labels, visible values, keyboard operation, and focus indication. Preset names are rendered as text nodes. Share URLs are selectable text inputs; importing does not require drag/drop or pointer-only interaction.

The dedicated accessibility/responsive audit remains issue #18; obvious semantic, keyboard, focus, and hit-target requirements are not deferred.

## Lifecycle and errors

Lifecycle presentation remains derived from `AudioEngine`:

- Ready -> Start audio;
- Starting -> disabled Starting…;
- Running -> Stop audio;
- Suspended/interrupted -> Resume + independent Stop;
- recoverable Error -> Retry + actionable message;
- Unsupported -> capability explanation + disabled Start.

Control-message, persistence, clipboard, preset, and share-import failures are surfaced visibly and do not silently alter lifecycle state.

## Future-feature area

Stereo width and spectral animation are implemented. Playback calibration remains disabled until its owning issues implement real behaviour. `futureFeaturesVisible` remains presentation-only UiState.

## Persistence boundary

The app restores four local documents through `AppStateRepository`:

- current SoundState;
- local user sound-preset library;
- private ProfileState;
- UiState.

Sound schema v3 migration is defined by `STATE_PERSISTENCE.md`. Share format v1 is defined by `PRESETS_SHARING.md`.

Reload after Running always returns Ready and silent. Startup share import may replace the requested current SoundState for that boot, but it still preloads only while Ready with no AudioContext.

## Validation

Automated UI/browser coverage includes:

- Ready/no autoplay, including reload and shared-URL startup;
- built-in preset spectral-only ownership;
- band/master/stereo/animation behavior retained;
- Modified detection;
- user preset sanitized save, full-state load, and delete;
- current share-link generation;
- manual and navigation-based share import;
- malformed/future share failure without autoplay;
- private profile fixture data absent from normal share payloads;
- animation/stereo persistence and real worklet behavior;
- suspend/resume/error/unsupported paths;
- semantic controls and visible numeric state.
