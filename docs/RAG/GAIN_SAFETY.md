# Gain Safety, Smoothing, and Digital Metering

Status: canonical contract for issue #6 gain staging, deterministic headroom, smoothing, final guard, and output telemetry, updated for implemented animation and calibration layers including guided stimulus playback.

## Signal order

Greygen's pure `GreygenDspEngine` owns the complete level path. The normal requested path is:

1. seeded bipolar source normalization (`1.0` linear);
2. nominal preset / target realization;
3. user band offsets from `SpectrumState`;
4. bounded spectral-animation offsets;
5. bounded calibration correction;
6. deterministic safety pre-gain;
7. master gain;
8. final emergency full-scale guard;
9. post-guard peak/RMS metering.

The main thread does not apply a second gain stage and does not process audio blocks. `AudioEngine` sends typed state to the worklet and receives bounded telemetry only.

Nominal requested shaping and safety attenuation remain separate values. A preset, animation trajectory, calibration correction, or guided calibration probe never mutates the reported safety pre-gain; it changes the deterministic response estimate from which safety attenuation is derived.

## Gain-state schema and bounds

`GainStageState` schema version `1` contains:

- `masterGainDb` in `[-60, 0] dB`;
- ten animation offsets, each in `[-12, +12] dB`;
- ten calibration offsets, each in `[-24, +24] dB`.

The issue #6 placeholders are now owned by implemented layers. Spectral animation generates bounded deterministic animation offsets. Calibration profiles resolve Off/Balanced/Full into bounded calibration offsets; `CALIBRATION_PROFILES.md` is canonical for that transform. Both continue to use the original gain-stage accounting boundary.

User band offsets remain owned by `SpectrumState` and are bounded to `[-24, +24] dB` by the spectral-target contract.

The default master value is `20*log10(0.05)`, approximately `-26.0206 dB`. Digital gain values are not acoustic level measurements.

## Deterministic safety pre-gain

Safety pre-gain is derived from requested state, not from recent stochastic peaks. Greygen deliberately does **not** implement a fast automatic-gain-control loop.

For each accepted state, `gainSafety.ts` evaluates the actual complementary ten-band digital transfer function at 512 deterministic frequencies from DC through Nyquist using the runtime sample rate and current requested component gains. The maximum sampled magnitude is the shaped-signal spectral peak estimate.

Headroom calculation then applies:

- `+0.5 dB` response-estimation margin;
- a target shaped peak of `-0.5 dBFS`;
- safety pre-gain `min(1, target / (estimate * margin))`.

For neutral White reconstruction the estimated transfer magnitude is exactly unity to numerical precision, producing approximately `-1 dB` safety pre-gain from the target plus margin. Positive user/calibration/animation layers automatically produce more attenuation.

Calibration therefore cannot consume headroom invisibly: its resolved offsets are part of the response estimate before safety pre-gain. Full calibration remains bounded to ±24 dB and Balanced to ±12 dB even before this protective attenuation.

### Guided calibration transient

Issue #14 adds a runtime-only narrow-band `CalibrationStimulusState`. It is not persisted as `GainStageState`, SoundState, or ProfileState. The selected probe has a fixed `-18 dB` component base and a relative adjustment bounded to `[-24,+24] dB`.

While the transient owns output, safety pre-gain conservatively uses the sum of:

- the normal requested-response peak estimate; and
- the currently requested bounded stimulus gain.

The normal path and stimulus are crossfaded rather than summed at full scale, so this sum intentionally overestimates the crossfade demand. Positive probe adjustment therefore produces additional attenuation rather than silently borrowing headroom. The guided workflow never increases master gain to compensate for a difficult/inaudible band.

This response estimate is deterministic and sample-rate-aware, but is not claimed to be an absolute time-domain bound for every possible transient. The final sample-domain guard below remains the last invariant that output cannot escape legal digital range.

## Smoothing

Audible control changes are never written directly into the sample path.

Current smoothing constants:

- normal band/component gains: `40 ms` one-pole time constant;
- guided stimulus band gains: `40 ms` one-pole time constant;
- normal↔guided stimulus ownership crossfade: `40 ms` one-pole time constant;
- master gain: `40 ms` one-pole time constant;
- safety attenuation attack: `5 ms`;
- safety attenuation release: `150 ms`.

User offsets, animation offsets, and calibration offsets all converge through the component-gain smoothing path. Switching profile or Off/Balanced/Full therefore does not hard-step filter gain targets. Guided reference/test/silence transitions likewise move through preallocated 40 ms smoothers, including an explicit fade to calibration silence.

The shorter safety attack reduces exposure to a newly demanding state while remaining continuous. The final guard covers the short attack interval. Slower release avoids a sudden level rise when requested boosts are removed.

Startup is also smoothed: spectral/safety state is initialized deterministically, while master gain rises from silence toward the saved/default master target through the same 40 ms follower.

All time constants use runtime sample rate through `OnePoleSmoother`; no hard-coded samples-per-transition assumption is allowed.

## Final guard

The final guard is intentionally simple and emergency-only:

- finite samples are clamped to `[-0.999, +0.999]`;
- a non-finite sample is converted to zero;
- every intervention is counted in the current telemetry window.

This is not a loudness maximizer, compressor, or normal tone-shaping stage. Ordinary White/Pink/Brown/Grey deterministic reference fixtures at `0 dB` master must produce zero guard interventions in validation. If a normal requested state begins relying on the guard materially, gain staging must be redesigned rather than treating clipping as normal behavior.

## Meter stage and units

`MeterAccumulator` measures the **final post-master, post-guard digital output**. Each telemetry window reports:

- frame count;
- peak dBFS;
- RMS dBFS;
- applied safety pre-gain dB;
- target safety pre-gain dB;
- applied master dB;
- final-guard intervention count.

The worklet emits telemetry at a bounded nominal rate of 10 updates per second. It does not post a message every render quantum. Meter accumulation uses primitive numeric state in the real-time path and allocates only when a telemetry snapshot is consumed.

`dBFS` means level relative to digital full scale. No Greygen digital meter is labelled dB SPL, phon, sone, hearing threshold, or any other acoustic/clinical unit.

## Protocol history and current control use

Issue #6 introduced worklet protocol v2 with serialized spectral/gain-stage state, `set-gain-stage`, and bounded telemetry. Later issues advanced the overall protocol for stereo, animation, and diagnostics. Issue #14 advances it to **v5** with `set-calibration-stimulus`, a request-scoped transient command carrying only validated stimulus mode/band/relative probe state.

`AudioEngine.setCalibrationBandOffsetsDb()` continues to preserve current master and animation state and sends a validated `set-gain-stage` update for saved-profile correction. Guided stimulus control is separate by design because it is transient, non-persistent playback state. Control acknowledgements remain request-scoped.

## Real-time constraints

The per-sample render path performs seeded source generation, complementary filter-bank processing, preallocated normal/stimulus smoother updates, scalar gain multiplication/crossfade, final finite/clamp checks, and primitive meter accumulation. It performs no logging, DOM/storage/URL/network access, Promise work, MessagePort traffic, or deliberate per-sample allocation.

Frequency-response/stimulus headroom estimation occurs only when accepted state changes, outside the per-sample loop.

## Validation invariants

Validation covers:

- neutral White response estimate at 44.1, 48, and 96 kHz;
- all user bands at maximum accepted offset;
- maximum animation and calibration offsets;
- positive calibration correction causing stronger safety attenuation than neutral state;
- maximum guided probe causing stronger safety attenuation than neutral state;
- guided silence converging smoothly to effectively zero output;
- guided stimulus exit returning to finite normal output;
- master at maximum `0 dB`;
- pathological-state output finite and inside the final guard at 44.1, 48, and 96 kHz;
- rapid alternating extreme controls;
- same-seed transition regression for smoothing;
- applied safety pre-gain matching reported telemetry;
- known-vector peak/RMS math;
- ordinary White/Pink/Brown/Grey long fixtures producing zero final-guard interventions at `0 dB` master;
- real Chromium receiving post-worklet dBFS telemetry before clean Stop/close;
- real Chromium guided calibration preserving explicit master level and normal Stop authority.

Thresholds are part of the repository validation contract and must not be weakened merely to make a regression pass.
