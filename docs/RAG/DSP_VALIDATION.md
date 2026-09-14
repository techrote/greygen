# DSP Validation Contract

Status: canonical acceptance philosophy and initial thresholds. Thresholds may be tightened by evidence, but must not be silently weakened to make tests pass.

## Why this exists

Noise sounds forgiving while hiding implementation errors. A generator can appear plausible yet have incorrect spectral slope, biased random streams, correlation-dependent loudness, unstable coefficients, zipper noise, or pathological headroom. Greygen therefore treats measurable DSP behavior as an API.

## Test layers

### Unit tests

Fast deterministic tests for:

- PRNG golden vectors and statistical sanity;
- biquad coefficient generation and finite-state behavior;
- dB/linear conversion;
- smoothing trajectories;
- correlation mixing math;
- state serialization/migrations;
- headroom calculations.

### Offline DSP validation

Generate sufficiently long seeded signals in Node/Vitest and calculate:

- mean and DC offset;
- RMS/variance;
- peak magnitude;
- spectral slope;
- filter response/reconstruction;
- inter-channel correlation;
- discontinuity metrics during parameter changes.

These are the primary correctness tests.

### Browser integration tests

Verify:

- AudioWorklet module loads on localhost;
- explicit Start gesture creates/resumes audio;
- controls update worklet state;
- telemetry is received;
- suspend/resume paths work where testable;
- persistence reload works;
- app has no uncaught exceptions/console errors during core flows.

Do not use CI browser output as a substitute for calibrated acoustic testing.

## Deterministic fixtures

Every stochastic validator must use fixed seeds and document sample rate and frame count. Prefer multiple fixed seeds for statistical assertions to reduce accidental seed-specific success.

Suggested common fixtures:

- 44,100 Hz, 2^19 to 2^20 frames;
- 48,000 Hz, same approximate duration;
- 96,000 Hz for stability/performance spot tests.

Keep test sizes practical for CI; slower characterization can live in an opt-in benchmark/analysis script.

## PRNG

Required:

- golden vector for first N integer states/outputs from canonical seed(s);
- output finite and within specified range;
- zero/invalid seed behavior explicit;
- mean near zero after mapping to bipolar samples over a long deterministic run;
- variance close to theoretical expectation within a statistically justified tolerance.

No test relies on `Math.random()`.

## Spectral measurement method

Use a documented PSD estimator, preferably Welch averaging with a Hann window and overlapping segments. Tests should fit a line to log-frequency/log-power data only inside a safe interior range, excluding DC, filter transition extremes, and bins too near Nyquist.

The validator must be deterministic. If an FFT library is added, pin/version it and isolate it to analysis/tests unless needed at runtime.

## Noise-colour targets

Initial target slopes:

- white: `0 dB/octave` PSD;
- pink: `-3.0103 dB/octave` PSD;
- brown/red: `-6.0206 dB/octave` PSD.

Initial acceptance tolerance for an adequately long offline render: target ±0.5 dB/octave over the documented interior fit range. Implementers should aim materially better. If finite-bank architecture cannot meet this, fix the architecture or document a narrower valid range; do not arbitrarily broaden tolerance.

Brown/red output must additionally demonstrate bounded near-DC behavior and no uncontrolled DC walk.

## Filter bank validation

For each supported sample rate:

- all coefficients finite;
- impulse response finite;
- long zero-input tail decays/bounds rather than grows;
- each nominal band produces its intended response region;
- summed nominal state has documented response ripple;
- edge-band behavior is explicitly characterized;
- a 16 kHz nominal band is never instantiated with invalid/unsafe parameters relative to Nyquist.

Initial reconstruction target for a neutral target spectrum should avoid narrow unexpected notches/peaks greater than roughly 1.5 dB across the validated interior range. This is a design target, not permission to ignore broader intended spectral tilt.

## Parameter-transition validation

For band/master/width updates:

- no NaN/Inf;
- no single-sample discontinuity attributable to direct unsmoothed control assignment;
- ramp/follower reaches target within its documented settling behavior;
- repeated fast UI updates remain stable.

Provide a regression fixture that toggles extreme accepted band settings and measures first-difference magnitude against a documented threshold derived from expected signal statistics.

## Stereo validation

For long renders at defined width/correlation settings:

- measured Pearson correlation should track requested correlation within ±0.03 for long fixtures;
- left/right RMS should remain matched within 0.25 dB in symmetric modes;
- changing width should not shift combined nominal RMS by more than 0.5 dB unless a mode explicitly documents otherwise.

## Gain-safety validation

Test at minimum:

- all band gains at maximum;
- maximum calibration correction + maximum user band offsets;
- animation at allowed extrema;
- width extrema;
- minimum and maximum supported sample rates;
- rapid control changes.

Assertions:

- engine output finite;
- deterministic safety pre-gain is applied according to contract;
- reported pre-gain matches applied gain;
- final guard prevents illegal full-scale overflow in the shipped signal path;
- ordinary reference presets do not spend meaningful time in hard limiting.

A test may track limiter intervention rate for seeded fixtures; if a normal preset engages it frequently, redesign gain staging.

## Meters

Peak/RMS telemetry must be derived from the same signal stage documented in the UI. If pre- and post-master meters both exist, label them. No meter may be labelled dB SPL unless a future calibrated hardware path genuinely measures acoustic pressure.

## Performance validation

Provide a benchmark harness separate from pass/fail unit tests. Record at least:

- sample rate;
- block size;
- channels;
- enabled feature set;
- rendered audio duration;
- wall time / realtime factor;
- environment metadata where available.

The worklet inner loop must not allocate per sample. A later release gate should define device/browser budgets from observed data instead of inventing a universal CPU percentage.

## Golden audio policy

Avoid committing large WAV files. Prefer numeric golden vectors, hashes of deterministic short renders (with tolerance-aware alternatives where floating-point differences matter), and measured spectral/statistical fixtures. If audio fixtures become necessary, keep them small and document provenance/licensing.

## Changing validation thresholds

Any PR that changes a DSP threshold must:

1. explain why the existing threshold is invalid or counterproductive;
2. provide before/after measured evidence;
3. update this document;
4. avoid bundling a threshold relaxation solely to green a failing implementation.
