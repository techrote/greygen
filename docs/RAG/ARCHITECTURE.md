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
      animation.ts
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

Inputs conceptually include:

- sample rate;
- block/frame count;
- deterministic source seed/stream ids;
- nominal spectral/band gains;
- stereo correlation/width target;
- deterministic animation state and animation seed;
- smoothing state;
- safety/pre-gain state;
- optional calibration correction values.

Outputs include stereo sample blocks and telemetry sufficient for peak/RMS/headroom displays.

No core algorithm may depend on `Math.random()` or wall-clock time.

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
- stream identity is deterministic and intended for independent left/right/feature streams;
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

## Preset semantics

White, pink, and brown/red are spectral targets:

- white: approximately 0 dB/octave power-spectral-density slope over the validated interior range;
- pink: approximately -3.0103 dB/octave PSD slope;
- brown/red: approximately -6.0206 dB/octave PSD slope, with deliberate low-frequency bounding/DC rejection.

Because edge bands, finite filters, and sample-rate limits affect the realized spectrum, acceptance uses measured tolerances defined in `DSP_VALIDATION.md` rather than exact per-slider numbers.

Generic grey is an original practical target shaped for broadly flatter perceived spectral presence at a defined nominal listening context. It is not claimed to reproduce ISO 226 numerical data.

## Stereo width/correlation

Stereo width is a statistical property, not pan. The accepted issue #9 renderer uses two deterministic independent zero-mean streams `A` and `B`, each passed through a separate instance of the same current spectral-shaping path, then applies a symmetric constant-power correlation matrix.

For normalized width `w` in `[0,1]`:

```text
theta = w * pi / 4
c = cos(theta)
s = sin(theta)

L = c * A + s * B
R = c * A - s * B
```

For independent equal-variance streams this gives `Var(L)=Var(R)` and `Corr(L,R)=cos(w*pi/2)`. The exposed range is non-negative correlation only: Mono at `w=0`, Normal at `0.5`, fully decorrelated Wide at `1`.

Stream A uses `(seed,0)` and B uses `(seed,1)`. Both receive the same spectral gain vector per audio frame, including any active animation, so spectral movement does not redefine the requested stereo correlation model.

Detailed stereo semantics are canonicalized in `STEREO_WIDTH.md`.

## Spectral animation

Issue #10 adds a separate deterministic modulation stage between the static/layered spectral target and final safety/master output. It does not mutate persisted user band offsets.

Animation is evaluated from the audio sample clock. Mode phase/frequency parameters are derived from a dedicated animation seed and bounded analytic oscillators; there is no wall-clock dependency or integrated random walk. Shipped modes are Off, Drift, Breathe, Wander, and Orbit.

The runtime composition is conceptually:

```text
static band gain
  * smoothed dynamic animation gain
  -> spectral sum
  -> deterministic safety pre-gain
  -> master
  -> final guard
```

Depth/speed and per-band animation offsets are smoothed independently. Optional energy-preserving normalization removes instantaneous mean linear band-power gain before the dynamic offsets reach their output smoothers. Safety does not rely on that normalization: when animation is active the deterministic pre-gain reserves headroom for the configured maximum animation depth.

Exact mode equations, depth/speed ranges, smoothing constants, state/migration semantics, and acceptance tests are canonicalized in `SPECTRAL_ANIMATION.md`.

## Parameter smoothing

User controls and automation must not write discontinuous gain changes directly into the sample path. `OnePoleSmoother` is the reusable exponential target follower and `LinearRamp` provides exact finite-duration linear transitions. Filter-bank crossover coefficients remain fixed for an AudioContext sample rate; controls smooth gains rather than retuning IIR sections per sample.

Animation uses dedicated parameter and per-band output smoothers defined in `SPECTRAL_ANIMATION.md`.

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

The engine reports requested/applied safety attenuation separately from nominal sound state. Do not create a fast stochastic AGC; safety pre-gain is deterministic from accepted control state plus margin, with the final guard as a rarely active last resort.

## AudioWorklet protocol

The worklet adapter uses a shared versioned typed protocol and avoids high-frequency message/object churn. Protocol v4 supports:

- initialize with seed, spectrum, gain, stereo width, and animation state;
- set spectrum/preset state;
- set gain/master state;
- set stereo width;
- set animation state;
- reset audio seed;
- request status/telemetry;
- stop cleanly.

Animation can be preloaded before an AudioContext exists. Worklet control does not bypass the pure DSP engine.

## Browser lifecycle

Audio creation must respect autoplay restrictions:

- UI initially shows an explicit Start action;
- create/resume AudioContext only from accepted user gesture;
- tolerate suspended/interrupted states;
- provide visible resume/recover paths;
- stop/disconnect nodes cleanly during hot reload/test teardown.

`AudioWorklet` requires a secure context in normal browsers; localhost is acceptable for development. Production must use HTTPS.

## State model

Keep three domains separate:

- **Sound state:** shareable generator state: preset, bands, master, width, animation, audio seed, animation seed, etc.;
- **Personal profile state:** calibration/device profiles, local names, correction metadata; private by default;
- **UI state:** presentation preferences only.

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
