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
      numbers.ts
      rng.ts
      statistics.ts
      onePole.ts
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

Exact names may evolve, but preserve the dependency direction: UI/browser adapters depend on pure DSP; pure DSP must not depend on React, DOM, `AudioContext`, or `AudioWorklet*` globals. The small `dsp/statistics.ts` module contains browser-independent block measurements used by deterministic tests and later runtime telemetry; heavier FFT/spectral analysis belongs under `audio/analysis/`.

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

The MVP deterministic source is **xoshiro128\*\***, using four unsigned 32-bit state words and JavaScript integer/bitwise operations. This choice follows the xoshiro family by David Blackman and Sebastiano Vigna; the seed mixer uses the standard MurmurHash3 `fmix32` avalanche constants associated with Austin Appleby. It is a simulation/audio PRNG, not a cryptographic generator.

Canonical behavior implemented in `src/audio/dsp/rng.ts`:

- external `seed` and `streamId` are unsigned 32-bit integers;
- seed `0` is legal and has a locked golden sequence;
- the `(seed, streamId)` pair expands deterministically to four state words by stepping with `0x9e3779b9` and applying the 32-bit avalanche mixer;
- the all-zero xoshiro state is explicitly prevented, although normal expansion is not expected to produce it;
- `nextUint32()` returns `[0, 2^32 - 1]` exactly;
- unit-float mapping divides by `2^32`, producing `[0, 1)`;
- bipolar audio mapping is `2 * uint32 / 2^32 - 1`, producing `[-1, 1)` with theoretical mean `0` and variance `1/3`;
- stream identity is deterministic and intended for later independent left/right/feature streams;
- exact seed expansion and output golden vectors live in `tests/dsp/rng.test.ts`.

Reference algorithm descriptions are available at `https://prng.di.unimi.it/` for xoshiro and in the public MurmurHash3 reference implementation for `fmix32`. Greygen's concrete seed-expansion composition and stream mapping are project-defined and locked by tests.

Changing the PRNG, seed expansion, stream mapping, integer-to-float mapping, or transition order changes deterministic render identity. After a released engine version, any such change requires an engine/state version change and migration decision rather than silently updating fixtures.

## Ten-band filter bank

Nominal centers are:

`31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz`.

The MVP filter bank in `src/audio/dsp/filterBank.ts` uses a **sequential complementary first-order bilinear crossover bank**. It was selected by deterministic response/impulse characterization rather than by assuming ten parallel peaking filters would reconstruct a useful neutral state.

For each exposed boundary, the crossover frequency is the geometric midpoint between adjacent octave-spaced centers, equivalently `center[i] * sqrt(2)`. A crossover low-pass uses the bilinear one-pole form in `onePole.ts`:

```text
k = tan(pi * fc / sampleRate)
norm = 1 / (1 + k)
b0 = b1 = k * norm
a1 = (k - 1) * norm

low[n] = b0 * x[n] + state
state = b1 * x[n] - a1 * low[n]
high[n] = x[n] - low[n]
```

The next crossover processes the previous stage's `high` residual. Consequently every stage is an algebraic partition of its input. With all exposed band gains at unity, the ten exposed components plus any intentionally hidden ultrasonic residual reconstruct the original sample to floating-point precision. This is the neutral-state contract; no parallel-filter normalization or frequency-dependent correction is required.

The basis components intentionally overlap. Their amplitude at the printed center frequency is therefore not defined as 0 dB; the user band value is a multiplier on a complementary spectral component, not the gain of an isolated constant-Q bell. Deterministic response tests verify that interior component peaks remain close to their nominal spectral regions.

### Edge bands and Nyquist policy

- The 31.25 Hz component is an intentional low shelf below the first crossover at approximately 44.19 Hz.
- The lower edge of the 16 kHz component is approximately 11.314 kHz.
- Its nominal upper edge is `16000 * sqrt(2)`, approximately 22.627 kHz.
- A one-pole crossover may only be instantiated when its cutoff is at or below **90% of Nyquist**. This leaves an explicit numerical/spectral safety margin rather than constructing an edge filter merely to preserve a label.
- At 44.1 and 48 kHz the nominal 22.627 kHz upper crossover is unavailable, so `highBandMode` is `degraded-high-shelf`: the 16 kHz control owns the residual above approximately 11.314 kHz.
- At 96 kHz the upper crossover is safe, so `highBandMode` is `bounded-bandpass`: the exposed 16 kHz component is bounded above at approximately 22.627 kHz and the ultrasonic residual above that boundary passes at unity outside the ten user-controlled bands.

`highBandMode`, `highBandDegraded`, and `highBandUpperEdgeHz` make this policy explicit for later UI/accessibility work. A runtime sample-rate change is a bank/audio-context lifecycle event; coefficients are not continuously retuned in the sample loop.

### Topology selection notes

Two simple alternatives were rejected during issue #3 characterization:

- a matched-z/exponential one-pole partition preserved algebraic reconstruction but its complementary high branch did not approach unity at Nyquist, making the top-band behavior unnecessarily attenuated;
- a second-order Butterworth low-pass with `high = input - low` also reconstructed neutrally, but the resulting complementary band components showed larger resonant peaks and less faithful nominal-region placement.

The selected bilinear first-order partition gives exact neutral reconstruction, monotonic low/high edge behavior, stable finite one-state sections, and no per-sample allocation. The production inner path stores all section state, gains, and scratch components up front.

Band gains are currently accepted in linear range `[0, 16]`; later gain-staging/safety logic may impose more user-facing constraints and pre-gain. Gain changes must use the reusable smoothing layer before they reach the real-time signal path. The fixed crossover coefficients themselves do not need to change for ordinary band-gain updates.

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

User controls and automation must not write discontinuous gain changes directly into the sample path. The foundational implementation in `src/audio/dsp/smoothing.ts` provides:

- `OnePoleSmoother`: an exponential target follower with coefficient `exp(-1 / (tau * sampleRate))`, so a positive time constant has the same meaning at different runtime sample rates; `tau = 0` deliberately snaps to the target;
- `LinearRamp`: a bounded linear transition that arrives exactly on the target after a specified integer sample count, plus a seconds-to-samples convenience path using the runtime sample rate.

Both validate numeric inputs before state mutation and perform no heap allocation in `next()`. Filter-bank crossover coefficients are fixed for a bank's runtime sample rate; ordinary spectral-control transitions therefore smooth band gains rather than retuning IIR coefficients in place.

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

Do not block the MVP on it, but keep a compatibility boundary: ten-band state should be representable as a sampled target curve. A future engine may use denser IIR/FIR/FFT-based shaping. The UI should talk in terms of a target spectrum model rather than reaching directly into filter-section objects.

## Performance constraints

The audio callback must:

- avoid garbage-producing per-sample allocations;
- avoid DOM/logging/network access;
- avoid locks or unbounded loops;
- remain comfortably below render-quantum deadlines on modest contemporary desktop/mobile CPUs.

Performance benchmarks must include 44.1 and 48 kHz and should include 96 kHz where practical. Correctness and glitch-free behavior take priority over micro-optimizations.
