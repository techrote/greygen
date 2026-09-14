# Greygen Architecture

Status: canonical technical architecture for initial implementation.

## System shape

Greygen is a static client application. There is no required backend.

```text
React UI/state
   |
   +--> versioned app state / local persistence
   |
   +--> AudioEngine facade -------------------------------+
                                                        |
                                                  AudioWorkletNode
                                                        |
                                              worklet adapter/process()
                                                        |
                                                 pure DSP engine
                                                        |
        +----------------+---------------+---------------+----------------+
        |                |               |               |                |
   seeded PRNG      spectral/filter   stereo mix      smoothing      meters/safety
        |                |               |               |                |
        +----------------+---------------+---------------+----------------+
                                                        |
                                                    output bus
                                                        |
                                                safety gain/limiter
                                                        |
                                                  AudioDestination
```

## Repository layout target

```text
src/
  app/
    App.tsx
    state/
    storage/
  audio/
    AudioEngine.ts
    protocol.ts
    worklet/
      greygen-processor.ts
      register.ts
    dsp/
      rng.ts
      biquad.ts
      filterBank.ts
      spectra.ts
      smoothing.ts
      stereo.ts
      gainSafety.ts
      meters.ts
      engine.ts
    analysis/
      spectrum.ts
      statistics.ts
  features/
    generator/
    presets/
    animation/
    calibration/
    profiles/
    analyzer/
  components/
  styles/
tests/
  dsp/
  integration/
  fixtures/
e2e/
docs/RAG/
```

Exact names may evolve, but preserve the dependency direction: UI/browser adapters depend on pure DSP; pure DSP must not depend on React, DOM, `AudioContext`, or `AudioWorklet*` globals.

## DSP engine contract

The pure engine operates on blocks of Float32-compatible samples and explicit state.

Inputs should conceptually include:

- sample rate;
- block/frame count;
- left/right PRNG seeds or a deterministic master seed expanded into streams;
- nominal spectral/band gains;
- stereo correlation/width target;
- smoothing state;
- safety/pre-gain state;
- optional animation offsets;
- calibration correction values.

Outputs include stereo sample blocks and telemetry sufficient for peak/RMS/headroom displays.

No core algorithm may depend on `Math.random()`.

## Random generator

Use a small, explicitly specified seeded PRNG with stable integer behavior in JavaScript/TypeScript (for example, an audited xoshiro/xorshift-family implementation). Document:

- seed width and expansion;
- whether zero seed is legal;
- generated numeric range;
- exact state transition;
- golden vectors.

Do not change PRNG algorithm casually after release because it changes deterministic render identity. If changed, version the engine/state format.

## Ten-band filter bank

Initial nominal centers:

`31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz`.

The implementation should use a stable IIR topology suitable for real-time noise shaping. Candidate MVP topology: cascaded biquads/band partitioning with coefficients generated from runtime sample rate.

Requirements:

- finite coefficients for all supported states;
- no center/Q request at or beyond safe Nyquist margin;
- explicit treatment of first/last bands (low/high shelves or bounded edge bands are acceptable if validated);
- reconstruction/normalization behavior measured, not assumed;
- no allocation in the inner sample loop after initialization;
- parameter changes smoothed or coefficients crossfaded/interpolated safely.

The exact filter topology is an implementation issue and should be selected by measured reconstruction/spectral results, not aesthetic preference.

## Preset semantics

White, pink, and brown/red are spectral targets:

- white: approximately 0 dB/octave power-spectral-density slope over the validated interior range;
- pink: approximately -3.0103 dB/octave PSD slope;
- brown/red: approximately -6.0206 dB/octave PSD slope, with deliberate low-frequency bounding/DC rejection.

Because edge bands, finite filters, and sample-rate limits affect the realized spectrum, acceptance uses measured tolerances defined in `DSP_VALIDATION.md` rather than exact per-slider numbers.

Generic grey is an original practical target shaped for broadly flatter perceived spectral presence at a defined nominal listening context. It is not claimed to reproduce ISO 226 numerical data. Store its provenance/rationale in code/docs when introduced.

## Stereo width/correlation

Stereo width is a statistical property, not just pan.

A preferred model uses two independent zero-mean, unit-variance streams `A` and `B`, then constructs channels with a target correlation while preserving expected variance. One valid formulation is:

```text
L = A
R = rho * A + sqrt(1 - rho^2) * B
```

for `rho` in `[-1, 1]`, with user-facing width mapped to a safe/useful subset. If a symmetric matrix is chosen instead, it must similarly preserve power and be validated statistically.

Do not allow width changes to create obvious loudness jumps.

## Parameter smoothing

User controls and automation must not write discontinuous gain changes directly into the sample path. Provide reusable smoothing primitives with explicit time constants and deterministic behavior at any sample rate.

Suggested classes:

- exponential one-pole target follower for continuous controls;
- bounded linear ramp where exact arrival time matters;
- coefficient transition strategy for filter changes.

Manual controls can use roughly tens-to-low-hundreds of milliseconds; animation generally moves much slower. Exact defaults are tuned subjectively but covered by discontinuity tests.

## Gain staging and safety

Separate these concepts:

1. source normalization;
2. nominal spectrum/preset gain;
3. user band offsets;
4. animation offsets;
5. calibration correction;
6. automatic safety pre-gain;
7. master gain;
8. final safety limiter/clip guard.

The engine must be able to report nominal requested gain separately from safety attenuation.

Do not create a fast automatic-gain loop that audibly pumps in response to stochastic peaks. Prefer a deterministic/conservative pre-gain derived from target state plus margin, with peak monitoring and a rarely active final guard.

## AudioWorklet protocol

The worklet adapter receives structured control messages and/or `AudioParam`s. Keep message protocol versioned. Avoid high-frequency object churn across `MessagePort`.

Control messages should support at minimum:

- initialize/reset seed;
- set band/preset state;
- set stereo target;
- set smoothing times;
- set calibration/profile correction;
- set master level;
- request/report telemetry;
- suspend/stop cleanly.

Use an explicit protocol type shared between main thread and worklet.

## Browser lifecycle

Audio creation must respect autoplay restrictions:

- UI initially shows a deliberate Start action;
- create/resume the audio context only in response to an accepted user gesture;
- tolerate `suspended`/`interrupted` context states;
- provide a visible recover/resume path;
- stop/disconnect nodes cleanly during hot reload/test teardown.

`AudioWorklet` requires a secure context in normal browsers; localhost is acceptable for development. Production must use HTTPS.

## State model

Keep three domains separate:

- **Sound state:** shareable generator state: preset, bands, master, width, animation, seed, etc.
- **Personal profile state:** calibration/device profiles, local names, correction metadata; private by default.
- **UI state:** panel expansion, theme/view preferences; local only.

Version each persisted schema. Migrations are explicit and tested.

## Future continuous spectral engine

Do not block the MVP on it, but keep a compatibility boundary: ten-band state should be representable as a sampled target curve. A future engine may use denser IIR/FIR/FFT-based shaping. The UI should talk in terms of a target spectrum model rather than reaching directly into biquad objects.

## Performance constraints

The audio callback must:

- avoid garbage-producing per-sample allocations;
- avoid DOM/logging/network access;
- avoid locks or unbounded loops;
- remain comfortably below render-quantum deadlines on modest contemporary desktop/mobile CPUs.

Performance benchmarks must include 44.1 and 48 kHz and should include 96 kHz where practical. Correctness and glitch-free behavior take priority over micro-optimizations.
