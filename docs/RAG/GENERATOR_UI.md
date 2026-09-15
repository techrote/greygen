# Primary Generator UI Contract

Status: canonical contract for issue #7 friendly ten-band generator surface.

## Purpose

The primary Greygen screen is the usable product core, not a DSP-debug panel. It must make the current audio lifecycle, spectral shape, digital output level, and immediate stop path obvious without exposing implementation details such as crossover coefficients or render quanta.

The UI depends on `AudioEngine` and typed spectrum/gain state APIs. It does not import or manipulate filter-bank instances.

## Primary surface

The default screen contains:

- explicit Start / Stop / Resume / Retry transport derived from `AudioEngine` lifecycle state;
- White, Pink, Brown / Red, and Grey (Practical) named preset selection;
- ten user band-offset controls labelled `31`, `62`, `125`, `250`, `500`, `1k`, `2k`, `4k`, `8k`, `16k`;
- numeric dB readout and per-band neutral reset for every band;
- master digital-level control;
- compact Peak, RMS, safety pre-gain, and master meters/readouts;
- emergency guard indicator only when interventions are non-zero;
- explicit runtime high-band mode disclosure when the nominal 16 kHz region degrades to the documented high shelf;
- disabled, honestly labelled placeholders for stereo width and deterministic animation until issues #9 and #10 implement those engines;
- disabled playback-calibration/profile entry point with non-medical wording until the calibration issues own that workflow.

Audio still never starts from page load, preset selection, band edits, master edits, reload, or future-state import.

## Spectrum and preset ownership

The named colour presets own the base `SpectralPresetId`. Selecting a named preset also returns user band offsets to neutral `0 dB`, producing an untouched named-preset state.

A user band offset is a bounded adjustment relative to the current named target. The accepted range remains the spectral contract's `[-24, +24] dB` per band. Any non-zero user band offset makes the visible preset state `Modified`.

Resetting one band to `0 dB` removes that band's modification. Resetting all band offsets returns the current target to an untouched named-preset state.

Preset changes do **not** reset master level, lifecycle state, safety state, or later width/animation/profile domains. The worklet's existing smoothing remains authoritative for audible transitions.

## Master level

The primary master control exposes the gain-safety contract's `[-60, 0] dB` range and current value. It calls `AudioEngine.setMasterGainDb()`; the UI does not create an independent downstream gain node.

The screen explicitly describes this as digital level. It does not claim the value is acoustic dB SPL or listening exposure.

## Runtime 16 kHz semantics

Before audio starts, runtime sample rate and high-band mode are unknown and the UI makes no unsupported claim.

After worklet initialization:

- `bounded-bandpass` requires no warning;
- `degraded-high-shelf` keeps the 16k control enabled because it remains a stable supported control, but marks it textually as `High shelf` and explains that it owns the residual above approximately 11.3 kHz rather than a bounded 16 kHz band.

Degradation is not communicated by colour alone.

## Metering

The meter strip is always structurally present so the output-status location does not jump when audio starts. Before telemetry it displays unavailable placeholders.

When telemetry arrives it shows the final post-master/post-guard digital stage defined by `GAIN_SAFETY.md`:

- Peak in dBFS;
- RMS in dBFS;
- applied safety pre-gain in dB;
- current master in dB;
- guard activity only when intervention count is greater than zero.

No meter uses SPL, phon, sone, or medical/hearing-threshold units.

## Accessibility and input

Primary controls use native semantic form controls and buttons.

Every band provides:

- a visible frequency label;
- native keyboard adjustment;
- an accessible name including the frequency and current dB offset;
- `aria-valuetext` matching the numeric readout;
- a visible numeric dB readout;
- a keyboard-operable neutral reset button.

The master control follows the same keyboard/readout principles. Focus indication is explicit. State is communicated with text as well as decorative colour/status dots.

The ten-band bank keeps comfortable control dimensions. On moderately narrow screens it may scroll horizontally rather than shrinking sliders and hit targets to microscopic sizes.

## Lifecycle and errors

Lifecycle presentation remains derived from `AudioEngine`:

- Ready -> `Start audio`;
- Starting -> disabled `Starting…`;
- Running -> prominent `Stop audio`;
- Suspended/interrupted -> `Resume audio` plus an independent `Stop audio` escape path;
- recoverable Error -> `Retry audio` plus the engine's actionable message;
- Unsupported -> capability explanation and disabled start.

Control-message failures are surfaced as visible UI errors rather than becoming unhandled rejected promises.

## Future-feature placeholders

Issue #7 intentionally does not simulate stereo width, animation, or calibration.

The width and animation controls are disabled and state what later issue owns them. Playback calibration remains disabled and explicitly describes future output as relative listener + playback-chain correction, not a medical hearing test.

This prevents UI affordances from implying audio behavior that does not yet exist.

## Persistence boundary

Issue #7 does not introduce persistence. Reload returns to default sound/UI state and remains silent. Versioned SoundState/ProfileState/UiState persistence and migration belong to issue #8.

The local React spectrum state is the acknowledged/requested UI sound state for this milestone; all audio mutations still pass through the typed `AudioEngine` facade. Issue #8 may replace this local holder with the versioned application-state layer without changing DSP ownership.

## Validation

Issue #7 automated coverage must include:

- Ready + no autoplay, including reload;
- named preset selection;
- keyboard band adjustment and Modified transition;
- per-band reset and named-preset reset behavior;
- keyboard master adjustment;
- real worklet Start, meter receipt, high-band degradation disclosure, and clean Stop;
- deterministic presentation fixture for Peak/RMS/safety/master values;
- suspended -> explicit Resume UI and immediate Stop path;
- recoverable processor failure -> actionable Error/Retry UI;
- unsupported AudioWorklet capability;
- presence of all ten labelled controls plus disabled width/animation/calibration placeholders.

The dedicated accessibility/responsive audit remains issue #18, but obvious semantic, keyboard, focus, and hit-target requirements are not deferred to it.
