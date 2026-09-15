# Primary Generator UI Contract

Status: canonical contract for the friendly ten-band generator surface, reconciled through issue #9 stereo width.

## Purpose

The primary Greygen screen is the usable product core, not a DSP-debug panel. It must make the current audio lifecycle, spectral shape, digital output level, spatial width, and immediate stop path obvious without exposing implementation details such as crossover coefficients or render quanta.

The UI depends on `AudioEngine` and typed sound-state APIs. It does not import or manipulate filter-bank instances or browser audio nodes.

## Primary surface

The default screen contains:

- explicit Start / Stop / Resume / Retry transport derived from `AudioEngine` lifecycle state;
- White, Pink, Brown / Red, and Grey (Practical) named preset selection;
- ten user band-offset controls labelled `31`, `62`, `125`, `250`, `500`, `1k`, `2k`, `4k`, `8k`, `16k`;
- numeric dB readout and per-band neutral reset for every band;
- master digital-level control;
- active power-preserving stereo-width control with Mono/Narrow/Normal/Wide text, percent, and target correlation;
- compact Peak, RMS, safety pre-gain, and master meters/readouts;
- emergency guard indicator only when interventions are non-zero;
- explicit runtime high-band mode disclosure when the nominal 16 kHz region degrades to the documented high shelf;
- disabled deterministic-animation placeholder until issue #10 implements that engine;
- disabled playback-calibration/profile entry point with non-medical wording until the calibration issues own that workflow;
- a local-state surface that distinguishes sound reset from private-profile deletion.

Audio still never starts from page load, preset selection, band edits, master edits, width edits, reload, persistence restore, or future-state import.

## Spectrum and preset ownership

The named colour presets own the base `SpectralPresetId`. Selecting a named preset also returns user band offsets to neutral `0 dB`, producing an untouched named-preset state.

A user band offset is a bounded adjustment relative to the current named target. The accepted range remains the spectral contract's `[-24, +24] dB` per band. Any non-zero user band offset makes the visible preset state `Modified`.

Resetting one band to `0 dB` removes that band's modification. Resetting all band offsets returns the current target to an untouched named-preset state.

Preset changes do **not** reset master level, stereo width, lifecycle state, safety state, or later animation/profile domains. The worklet's smoothing remains authoritative for audible transitions.

## Master level

The primary master control exposes the gain-safety contract's `[-60, 0] dB` range and current value. It calls `AudioEngine.setMasterGainDb()`; the UI does not create an independent downstream gain node.

The screen explicitly describes this as digital level. It does not claim the value is acoustic dB SPL or listening exposure.

## Stereo width

The primary stereo control exposes normalized width `[0,1]` as a native range with a 0.01 user step. Detailed DSP semantics live in `STEREO_WIDTH.md`.

The friendly presentation includes:

- **Mono** at width `0`;
- **Narrow** below one third;
- **Normal** from one third through below two thirds;
- **Wide** from two thirds through width `1`;
- percentage readout;
- target Pearson-correlation value `rho` derived from the deterministic model.

When audio is Running, the surface may additionally show currently applied correlation from smoothed worklet telemetry. This makes control smoothing observable without changing the requested persisted value.

The control is not a pan slider and does not expose negative-correlation/anti-phase modes in issue #9. Its explanatory copy states that widening changes statistical correlation while preserving expected per-channel power.

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

For stereo, RMS represents average channel power and Peak represents the larger channel peak for each frame as specified by `STEREO_WIDTH.md`. No meter uses SPL, phon, sone, or medical/hearing-threshold units.

## Accessibility and input

Primary controls use native semantic form controls and buttons.

Every band provides a visible frequency label, native keyboard adjustment, an accessible name including frequency/current dB offset, `aria-valuetext`, visible numeric dB readout, and a keyboard-operable neutral reset button.

Master and stereo width follow the same keyboard/readout principles. Width `aria-valuetext` includes the friendly width label, percentage, and target correlation. Focus indication is explicit. State is communicated with text as well as decorative colour/status dots.

The ten-band bank keeps comfortable control dimensions. On moderately narrow screens it may scroll horizontally rather than shrinking sliders and hit targets to microscopic sizes.

## Lifecycle and errors

Lifecycle presentation remains derived from `AudioEngine`:

- Ready -> `Start audio`;
- Starting -> disabled `Starting…`;
- Running -> prominent `Stop audio`;
- Suspended/interrupted -> `Resume audio` plus an independent `Stop audio` escape path;
- recoverable Error -> `Retry audio` plus the engine's actionable message;
- Unsupported -> capability explanation and disabled start.

Control-message failures are surfaced as visible UI errors rather than becoming unhandled rejected promises. Persistence recovery/storage failures are surfaced separately as local-state notices. A storage failure does not change the audio lifecycle state or stop the current session.

## Future-feature placeholders

Stereo width is implemented and therefore no longer appears as a disabled roadmap placeholder.

Deterministic spectral animation remains disabled and states that issue #10 owns it. Playback calibration remains disabled and explicitly describes future output as relative listener + playback-chain correction, not a medical hearing test.

The presentation-only `futureFeaturesVisible` preference collapses/expands only this remaining roadmap placeholder area. It has no audio meaning and is stored only in `UiState`.

## Persistence boundary

The primary generator restores:

- seed;
- named target;
- ten user band offsets;
- master digital level;
- stereo width;
- presentation-only roadmap-panel visibility.

Modified state is derived from restored band offsets. Audio lifecycle is intentionally not persisted; a reload after Running returns Ready and silent.

Sound, private profile, and UI state use separate schemas and localStorage documents defined by `STATE_PERSISTENCE.md`. Sound schema v2 adds stereo width. Pre-stereo sound schemas migrate to Mono so an existing saved sound does not change spatial meaning merely because the application was upgraded.

The sound-reset action resets only sound fields, including width to the current first-run Normal default. Personal profile deletion is an explicit separate action and cannot be triggered by reset sound.

All restored/edited sound values still reach audio only through the typed `AudioEngine` facade. Persistence never writes directly into filter/worklet internals.

## Validation

Primary-generator automated coverage includes:

- Ready + no autoplay, including reload;
- named preset selection;
- keyboard band adjustment and Modified transition;
- per-band reset and named-preset reset behavior;
- keyboard master adjustment;
- keyboard and pointer/range stereo-width adjustment;
- width labels, percentage, and correlation presentation;
- stereo-width persistence across reload without autoplay;
- real two-channel worklet Start, meter/correlation telemetry, high-band degradation disclosure, and clean Stop;
- deterministic presentation fixture for Peak/RMS/safety/master/stereo values;
- suspended -> explicit Resume UI and immediate Stop path;
- recoverable processor failure -> actionable Error/Retry UI;
- unsupported AudioWorklet capability;
- presence of all ten labelled controls plus the active stereo control and honest animation/calibration placeholders;
- malformed local sound storage recovering to usable Ready defaults;
- visually/textually distinct sound reset and private-profile deletion controls.

The dedicated accessibility/responsive audit remains issue #18, but obvious semantic, keyboard, focus, and hit-target requirements are not deferred to it.
