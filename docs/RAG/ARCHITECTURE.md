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

The application is local-first: current sound, local user sound presets, private playback/calibration profiles, and UI preferences use versioned browser-local documents. Normal sound sharing is encoded directly in a URL fragment and requires no backend.

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
    dsp/
    analysis/
  features/
    generator/
    presets/
    sharing/
    animation/
    calibration/
    profiles/
    analyzer/
  components/
  styles/
tests/
e2e/
docs/RAG/
```

Exact names may evolve, but preserve dependency direction: UI/browser adapters depend on pure DSP; pure DSP must not depend on React, DOM, `AudioContext`, storage, URL, or clipboard globals.

## DSP engine contract

The pure engine operates on Float32-compatible blocks and explicit state. Inputs conceptually include sample rate, deterministic source seed/streams, static spectral state, stereo target, animation state, smoothing, safety/pre-gain, and future calibration correction. Outputs are stereo blocks plus digital telemetry.

No core algorithm may depend on `Math.random()`.

## Random generator

The deterministic source is xoshiro128** with explicit unsigned 32-bit seed and stream id. Stream A uses `(seed,0)` and stream B `(seed,1)`. Exact seed expansion/output vectors are locked by tests. Any released change to PRNG mapping requires an engine/state version decision rather than silent fixture replacement.

## Ten-band filter bank

Nominal centers are `31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz`.

The production bank is a sequential complementary first-order bilinear crossover bank. Each crossover algebraically partitions its input, so with exposed gains at unity the ten components plus any intentional ultrasonic residual reconstruct the source to floating-point precision.

The low edge is an intentional shelf. At 44.1/48 kHz the nominal top crossover cannot meet the safety margin, so the 16 kHz region becomes the documented residual high shelf. At 96 kHz it can be a bounded bandpass with hidden ultrasonic residual. Runtime mode is explicit.

Band gain changes use smoothing; crossover coefficients are fixed for the runtime sample rate.

## Preset semantics

White, Pink, Brown/Red, and Grey Practical are canonical built-in spectral targets.

Built-in colour presets are deliberately **spectral-only ownership objects**: they own target id + ten user band offsets. Applying one must not reset audio seed, master, stereo, animation, private profile state, local user-preset library, or UI state.

Local user sound presets are a separate application-layer concept: a sanitized local name around a complete canonical SoundState snapshot. They do not alter or extend DSP types.

`PRESETS_SHARING.md` is canonical for ownership, local library semantics, and share format.

## Stereo width/correlation

Stereo width is statistical correlation, not pan. For width `w` in `[0,1]`:

```text
theta = w * pi / 4
c = cos(theta)
s = sin(theta)
L = c * A + s * B
R = c * A - s * B
```

For independent equal-variance streams this preserves channel variance and gives `Corr(L,R)=cos(w*pi/2)`. Width 0 is Mono, 0.5 Normal, and 1 fully decorrelated Wide. Negative correlation is not exposed.

Each source owns independent filter-bank state. Width is smoothed and persisted in SoundState. Pre-stereo states migrate to Mono.

## Spectral animation

Animation is a deterministic bounded dynamic spectral-gain layer, not an unbounded random walk. Drift/Breathe/Wander/Orbit are sample-clocked seeded trajectories; Off is neutral. The same dynamic ten-band vector is applied to source streams A/B before stereo mixing so animation itself does not alter target correlation.

Depth/speed and applied offsets are smoothed. Optional mean-band-power normalization is explicit and deterministic. Safety reserves configured animation headroom. Detailed semantics live in `SPECTRAL_ANIMATION.md`.

## Gain staging and safety

Stage order remains:

1. source normalization;
2. nominal target;
3. user band offsets;
4. animation offsets;
5. calibration correction;
6. automatic deterministic safety pre-gain;
7. master;
8. final guard.

Requested sound state and protective attenuation remain separately observable. Do not replace this with a fast stochastic AGC.

## AudioWorklet protocol

The worklet uses a shared versioned typed protocol. Protocol v4 supports initialize with seed/spectrum/gain/stereo/animation, updates to those domains, seed reset, status/telemetry, and clean stop.

Application preset/share serialization stays outside the AudioWorklet. Imported or saved SoundState reaches audio only through the typed AudioEngine controls.

## Browser lifecycle

Audio creation respects autoplay restrictions:

- explicit Start from Ready;
- AudioContext create/resume only from accepted user gesture;
- visible suspended/recoverable/unsupported states;
- clean stop/dispose.

Persistence restore, user-preset load, and share import do **not** create/resume an AudioContext. A valid startup share is validated/preloaded while Ready and silent.

## State model

Keep three semantic state domains separate:

- **Sound:** generic shareable SoundState plus a local library of named SoundState snapshots;
- **Personal profile:** calibration/device records and personal metadata, private by default;
- **UI:** local presentation preferences only.

Within the Sound domain, current sound and user-preset library are separate versioned persistence documents. A normal share serializer accepts only SoundState; it cannot read the local library, ProfileState, or UiState.

Version each persisted structure. Migrations/future-version behavior are explicit and tested.

## Share boundary

Normal sharing is a deterministic versioned base64url tuple in the URL fragment. The fragment contains only canonical SoundState fields. It excludes local saved-preset names/library contents, private profiles/calibration curves/notes, and UI preferences by construction.

Share decode is bounded before parsing and passes accepted finite values through canonical SoundState validation/clamping. Future versions fail closed/visibly. No backend is required.

## Analyzer / diagnostics

The browser graph may insert a native AnalyserNode after the worklet and before destination. Spectrum FFT/display work remains outside the worklet hot loop; existing worklet telemetry stays bounded. The analyzer UI is lazily loaded, visibility-aware, reduced-motion-aware, and private-profile-blind. `ANALYZER_DIAGNOSTICS.md` is canonical for details.

## Future continuous spectral engine

Ten-band state should remain representable as a sampled target curve so a future denser model can convert predictably. UI/application state must continue to speak in target/sound terms rather than reaching into filter sections.

## Performance constraints

The audio callback must avoid per-sample garbage, DOM/storage/URL/network access, locks, and unbounded loops; remain comfortably below render deadlines; and retain 44.1/48 kHz plus practical 96 kHz validation. Preset-library and share encoding occur on the main thread and never in the audio callback.
