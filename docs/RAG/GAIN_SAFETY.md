# Gain Safety, Smoothing, and Digital Metering

Status: canonical contract for issue #6 gain staging, deterministic headroom, smoothing, final guard, and output telemetry.

## Signal order

Greygen's pure `GreygenDspEngine` owns the complete level path. The current mono path is:

1. seeded bipolar source normalization (`1.0` linear);
2. nominal preset / target realization;
3. user band offsets from `SpectrumState`;
4. bounded animation-offset layer placeholder;
5. bounded calibration-correction layer placeholder;
6. deterministic safety pre-gain;
7. master gain;
8. final emergency full-scale guard;
9. post-guard peak/RMS metering.

The main thread does not apply a second gain stage and does not process audio blocks. `AudioEngine` sends typed state to the worklet and receives bounded telemetry only.

Nominal requested shaping and safety attenuation remain separate values. A preset or user correction never mutates the reported safety pre-gain.

## Gain-state schema and bounds

`GainStageState` schema version `1` contains:

- `masterGainDb` in `[-60, 0] dB`;
- ten animation offsets, each in `[-12, +12] dB`;
- ten calibration offsets, each in `[-24, +24] dB`.

Animation and calibration are explicit zero-default placeholders in issue #6. Their owning later issues can change how those values are generated/applied, but must preserve bounded deterministic state and the same safety accounting boundary.

User band offsets remain owned by `SpectrumState` and are currently bounded to `[-24, +24] dB` by the spectral-target contract.

The default master value is `20*log10(0.05)`, approximately `-26.0206 dB`. This preserves the conservative digital startup level introduced by issue #5 while moving it into the pure/worklet engine where it can be smoothed, tested, metered, and later controlled by the primary UI.

Digital gain values are not acoustic level measurements.

## Deterministic safety pre-gain

Safety pre-gain is derived from requested state, not from recent stochastic peaks. Greygen deliberately does **not** implement a fast automatic-gain-control loop.

For each accepted state, `gainSafety.ts` evaluates the actual complementary ten-band digital transfer function at 512 deterministic frequencies from DC through Nyquist using the runtime sample rate and current requested component gains. The maximum sampled magnitude is the shaped-signal spectral peak estimate.

Headroom calculation then applies:

- `+0.5 dB` response-estimation margin;
- a target shaped peak of `-0.5 dBFS`;
- safety pre-gain `min(1, target / (estimate * margin))`.

For neutral White reconstruction the estimated transfer magnitude is exactly unity to numerical precision, producing approximately `-1 dB` safety pre-gain from the target plus margin. Positive user/calibration/animation layers automatically produce more attenuation.

This response estimate is deterministic and sample-rate-aware, but is not claimed to be an absolute time-domain bound for every possible transient. The final sample-domain guard below remains the last invariant that output cannot escape legal digital range.

## Smoothing

Audible control changes are never written directly into the sample path.

Current smoothing constants:

- band/component gains: `40 ms` one-pole time constant;
- master gain: `40 ms` one-pole time constant;
- safety attenuation attack: `5 ms`;
- safety attenuation release: `150 ms`.

The shorter safety attack reduces exposure to a newly demanding state while remaining continuous. The final guard covers the short attack interval. Slower release avoids a sudden level rise when requested boosts are removed.

Startup is also smoothed: spectral/safety state is initialized deterministically, while master gain rises from silence toward the saved/default master target through the same 40 ms follower.

All time constants use runtime sample rate through `OnePoleSmoother`; no hard-coded samples-per-transition assumption is allowed.

## Final guard

The final guard is intentionally simple and emergency-only:

- finite samples are clamped to `[-0.999, +0.999]`;
- a non-finite sample is converted to zero;
- every intervention is counted in the current telemetry window.

This is not a loudness maximizer, compressor, or normal tone-shaping stage. Ordinary White/Pink/Brown/Grey deterministic reference fixtures at `0 dB` master must produce zero guard interventions in validation. If a normal preset begins relying on the guard materially, gain staging must be redesigned rather than treating clipping as normal behavior.

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

## Protocol v2

Issue #6 advances the worklet protocol and processor identity to version `2`.

`initialize` now carries both serialized spectral state and gain-stage state. `set-gain-stage` updates master/placeholder layers through the same validated contract. The processor additionally emits unsolicited validated `telemetry` messages at the bounded cadence above.

Telemetry messages are not request/response traffic and therefore do not consume `requestId`s. Control acknowledgements remain request-scoped.

## Real-time constraints

The per-sample render path performs:

- seeded source generation;
- existing complementary filter-bank component processing;
- preallocated smoother updates;
- scalar gain multiplication;
- final clamp/finite check;
- primitive peak/sum-of-squares accumulation.

It performs no logging, DOM/network access, Promise work, MessagePort traffic, or deliberate per-sample allocation. Frequency-response headroom estimation occurs only when accepted state changes, outside the per-sample loop.

## Validation invariants

Issue #6 deterministic validation covers:

- neutral White response estimate at 44.1, 48, and 96 kHz;
- all user bands at maximum accepted offset;
- maximum animation and calibration placeholder offsets;
- master at maximum `0 dB`;
- pathological-state output finite and inside the final guard at 44.1, 48, and 96 kHz;
- rapid alternating extreme controls;
- same-seed first-sample transition regression for smoothing;
- applied safety pre-gain matching reported telemetry;
- known-vector peak/RMS math;
- ordinary White/Pink/Brown/Grey long fixtures producing zero final-guard interventions at `0 dB` master;
- real Chromium receiving post-worklet dBFS telemetry before clean Stop/close.

Thresholds are part of the repository validation contract and must not be weakened merely to make a regression pass.
