# Primary Generator UI Contract

Status: canonical contract for the friendly ten-band generator surface, reconciled through issue #10 deterministic spectral animation.

## Purpose

The primary Greygen screen is the usable product core, not a DSP-debug panel. It exposes lifecycle, spectral shape, digital level, spatial width, deterministic movement, and an immediate Stop path without leaking filter/worklet internals.

All sound changes go through typed `AudioEngine` / SoundState APIs. UI code does not own browser audio nodes or generate DSP trajectories.

## Primary surface

The default screen contains:

- explicit Start / Stop / Resume / Retry transport;
- White, Pink, Brown / Red, and Grey (Practical) target selection;
- ten bounded user band-offset controls with visible numeric dB readouts and neutral reset;
- master digital level;
- active power-preserving stereo width with Mono/Narrow/Normal/Wide, percentage, and target correlation;
- active deterministic spectral animation with mode, depth, speed, and mean-band-power normalization controls;
- Peak/RMS/safety/master telemetry and guard indication;
- explicit runtime high-band degradation disclosure;
- disabled playback-calibration/profile entry point with non-medical wording;
- local-state controls that distinguish sound reset from private-profile deletion.

Audio never starts from page load, preset/band/master/width/animation edits, reload, persistence restore, or migration. Start remains explicit.

## Spectrum and preset ownership

Named colour presets own the base `SpectralPresetId`. Selecting a preset clears only user band offsets to neutral. Preset selection does **not** reset master, stereo width, animation, lifecycle, or future profile domains.

Any non-zero user band offset makes the visible preset state Modified. The accepted per-band range remains `[-24,+24] dB`.

## Master level

The master control exposes `[-60,0] dB` and calls `AudioEngine.setMasterGainDb()`. It is explicitly digital level, never acoustic SPL.

## Stereo width

Stereo width remains the native `[0,1]` range defined by `STEREO_WIDTH.md`, including friendly labels, target correlation, and applied correlation telemetry while Running. It is not a pan control and has no user-facing anti-phase range.

## Spectral animation

Animation semantics are defined by `SPECTRAL_ANIMATION.md`. The primary surface exposes native semantic controls:

- Mode select: **Off, Drift, Breathe, Wander, Orbit**;
- Depth range: `0 .. 12 dB`, UI step `0.5 dB`;
- Speed range: `0.25 .. 4.0×`, UI step `0.25×`;
- checkbox: **Preserve mean band power**.

Mode/depth/speed/normalization changes are generic SoundState, persist across reload, and can be changed before or during playback. Editing them while Ready must not create an AudioContext.

The UI describes animation as seeded and bounded. It does not imply a random walk or claim exact perceived-loudness constancy. Energy normalization is visible/optional rather than a hidden AGC.

Selecting Off preserves configured seed/depth/speed for later reuse while making the requested animation target neutral. The DSP smoothing path controls audible return to the base spectrum.

## Runtime 16 kHz semantics

Before Start, runtime sample rate/high-band mode are unknown. After worklet initialization, `degraded-high-shelf` marks the 16k control textually as a stable high shelf above approximately 11.3 kHz; `bounded-bandpass` needs no warning.

## Metering

Peak/RMS are final post-master/post-guard digital telemetry. Stereo RMS represents average channel power and Peak the larger channel peak. Safety pre-gain and guard interventions remain visible independently from requested spectrum/animation so users can distinguish desired sound from protective attenuation.

No meter uses SPL, phon, sone, or medical/hearing-threshold units.

## Accessibility and input

Primary controls are native HTML inputs/selects/buttons with explicit labels, visible values, keyboard operation, and focus indication.

Animation depth/speed provide `aria-valuetext` matching visible numeric outputs. Mode uses a labelled native select. Energy normalization is a labelled native checkbox. State is not communicated by colour alone.

## Lifecycle and errors

Lifecycle presentation remains derived from `AudioEngine`:

- Ready -> Start audio;
- Starting -> disabled Starting…;
- Running -> Stop audio;
- Suspended/interrupted -> Resume + independent Stop;
- recoverable Error -> Retry + actionable message;
- Unsupported -> capability explanation + disabled Start.

Control-message failures and persistence failures are visible and separate. Neither silently changes lifecycle state.

## Future-feature area

Stereo width and spectral animation are implemented and no longer placeholders. Playback calibration remains disabled until its owning issues implement real behaviour.

The `futureFeaturesVisible` UI preference still collapses/expands the movement/calibration area. It has no audio meaning.

## Persistence boundary

The primary generator restores:

- audio seed;
- named target and ten user offsets;
- master;
- stereo width;
- animation mode/seed/depth/speed/normalization;
- presentation-only roadmap-panel visibility.

Sound schema v3 migration is defined by `STATE_PERSISTENCE.md`. Pre-animation saved sounds migrate to animation Off. Reload after Running always returns Ready and silent.

Sound reset returns generic sound fields, including animation, to first-run defaults. Private profiles survive sound reset and require their own explicit deletion action.

## Validation

Automated UI/browser coverage includes:

- Ready/no autoplay, including reload;
- preset/band/master/stereo behaviour retained;
- native animation mode selection;
- keyboard depth/speed adjustment and pointer/range updates;
- normalization toggle;
- animation persistence across reload without autoplay;
- real worklet animation changes while Running with meters/lifecycle intact;
- malformed persisted sound recovery;
- suspend/resume/error/unsupported paths;
- semantic controls and visible numeric state.

The dedicated accessibility/responsive audit remains issue #18; obvious semantic, keyboard, focus, and hit-target requirements are not deferred.
