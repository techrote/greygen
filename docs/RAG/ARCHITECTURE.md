# Greygen Architecture

Status: canonical technical architecture for the current implementation.

## System shape

Greygen is a static client application. There is no required backend.

```text
React UI/state
   |
   +--> versioned app state / local persistence
   |
   +--> AudioEngine facade --------------------------------------+
                                                               |
                                                         AudioWorkletNode
                                                               |
                                                     worklet adapter/process()
                                                               |
                                                        pure DSP engine
                                                               |
     +-------------+-------------+-------------+----------------+-------------+
     |             |             |             |                |             |
 seeded PRNG  spectral/filter  stereo mix  L/R calibration  smoothing  meters/safety
     |             |             |             |                |             |
     +-------------+-------------+-------------+----------------+-------------+
                                                               |
                                                          output bus
                                                               |
                                                     safety gain/guard
                                                               |
                                                     AudioDestination
```

The application is local-first: current sound, local user sound presets, private playback/calibration profiles, and UI preferences use versioned browser-local documents. Normal sound sharing is encoded directly in a URL fragment and requires no backend. Personal calibration portability is a separate explicit local export/import path.

## Repository layout

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
    calibration/
    analyzer/
  styles/
tests/
e2e/
docs/RAG/
```

Preserve dependency direction: UI/browser adapters depend on pure DSP; pure DSP must not depend on React, DOM, `AudioContext`, storage, URL, clipboard, or network globals.

## DSP engine contract

The pure engine operates on Float32-compatible blocks and explicit state. Inputs include sample rate, deterministic source seed/streams, spectral state, stereo width, animation state, channel-calibration state, transient calibration stimulus, smoothing, and safety/master state. Outputs are mono/stereo blocks plus digital telemetry.

No core algorithm may depend on `Math.random()`.

## Random generator

The deterministic source is xoshiro128** with explicit unsigned 32-bit seed and stream id. Stream A uses `(seed,0)` and stream B `(seed,1)`. Exact expansion/output vectors are locked by tests. Any released change to mapping requires an engine/state version decision.

Guided calibration also uses deterministic seeded ordering; independent left/right guided passes derive stable separate seeds from the saved sound seed rather than wall-clock randomness.

## Ten-band filter bank

Nominal centers are `31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz`.

The production bank is a sequential complementary first-order bilinear crossover bank. Each crossover algebraically partitions its input, so unity exposed gains reconstruct the source plus any intentional hidden ultrasonic residual to floating-point precision.

The low edge is an intentional shelf. At 44.1/48 kHz the nominal top crossover cannot meet the safety margin, so the 16 kHz region is the documented residual high shelf. At 96 kHz it can be a bounded bandpass with hidden ultrasonic residual. Runtime mode is explicit.

## Preset semantics

White, Pink, Brown/Red, and Grey Practical are canonical built-in spectral targets.

Built-in colour presets are spectral-only ownership objects: target id plus ten user offsets. Applying one must not reset seed, master, stereo, animation, private profile state, local user-preset library, or UI state.

Local user sound presets are sanitized names around complete canonical SoundState snapshots. Private calibration profiles are a separate state domain and never become sound-preset fields.

`PRESETS_SHARING.md` is canonical for this boundary.

## Stereo width/correlation

Stereo width is statistical correlation, not pan. For width `w` in `[0,1]`:

```text
theta = w * pi / 4
c = cos(theta)
s = sin(theta)
L = c * A + s * B
R = c * A - s * B
```

For independent equal-variance source streams this preserves channel variance and gives `Corr(L,R)=cos(w*pi/2)`. Width 0 is Mono, 0.5 Normal, 1 fully decorrelated Wide. Negative correlation is not exposed.

Each source owns independent filter-bank state. Width is smoothed and persisted in SoundState.

## Spectral animation

Animation is a deterministic bounded dynamic spectral-gain layer, not an unbounded random walk. Drift/Breathe/Wander/Orbit are sample-clocked seeded trajectories; Off is neutral. The same dynamic ten-band vector applies to both source streams before output-channel mixing so animation itself does not alter target correlation.

Depth/speed and applied offsets are smoothed. Optional mean-band-power normalization is explicit. Safety reserves configured animation headroom.

## Output-channel calibration

Issue #15 makes calibration explicitly channel-aware.

The internal decorrelation streams A/B are **not** left/right ears. For each exposed band the engine:

1. generates/filter-splits streams A and B;
2. applies the normal spectral/animation band gain;
3. forms the left/right stereo component with the width coefficients;
4. applies left calibration gain to the resulting left component and right calibration gain to the resulting right component;
5. sums components plus the appropriate residual;
6. passes both output channels through shared deterministic safety/master/guard stages.

Linked/symmetric profiles simply supply equal L/R calibration gains and therefore preserve previous linked spectral intent. Independent profiles supply distinct output-channel gains subject to the versioned inter-channel guard documented in `CALIBRATION_PROFILES.md`.

Channel calibration is smoothed. Safety evaluates both requested output-channel transfer curves and uses the more demanding one.

## Gain staging and safety

Conceptual stage order is:

1. source normalization;
2. nominal target;
3. user offsets;
4. animation offsets;
5. stereo component mixing;
6. per-output-channel calibration;
7. deterministic safety pre-gain;
8. master;
9. final guard.

Requested sound/profile state and protective attenuation remain separately observable. Do not replace this with fast stochastic AGC.

`GAIN_SAFETY.md` is canonical for exact bounds/smoothing.

## AudioWorklet protocol

The worklet uses one shared versioned typed protocol.

Current **protocol v6** supports:

- initialize with seed/spectrum/gain/stereo/animation/**channel calibration**;
- spectral/gain/stereo/animation/channel-calibration updates;
- calibration-stimulus schema v2 with `both | left | right` routing;
- seed reset;
- status/telemetry;
- clean stop;
- request-scoped acknowledgements/errors.

Application preset/share/profile serialization remains outside the AudioWorklet. Saved or imported data reaches audio only through validated `AudioEngine` control methods.

## Browser lifecycle

Audio creation respects autoplay restrictions:

- explicit Start from Ready;
- `AudioContext` create/resume only from accepted user gesture;
- visible suspended/recoverable/unsupported states;
- clean stop/dispose.

Persistence restore, sound-preset load, normal share import, calibration profile import, profile duplicate/rename, and guided review/save while stopped do **not** create/resume an AudioContext.

## State model

Keep semantic domains separate:

- **Sound:** shareable SoundState plus separate local named SoundState library;
- **Personal profile:** calibration/playback records and personal metadata;
- **UI:** local presentation preferences.

Within ProfileState, the generic record envelope owns independently versioned calibration payloads. This allowed issue #15 to advance calibration payload v1/v2→v3 without changing ProfileState's outer schema.

Version/migration/future-version behavior must be explicit and tested.

## Share and personal-export boundaries

Normal sharing is a deterministic versioned base64url tuple in the URL fragment. It contains canonical SoundState fields only and excludes local preset names, private profile ids/names/notes/evidence/correction curves, and UI state by construction.

Personal calibration export is a **different serializer and UI path**. Its envelope is explicitly identified as `personal-playback-calibration`, includes canonical private profile content, omits local ids, and exists only after an intentional user action. Import validates before storage and never selects/applies/autoplays the imported profile.

No backend is required for either path.

## Analyzer / diagnostics

The browser graph may insert a native AnalyserNode after the worklet and before destination. FFT/display work stays outside the worklet hot loop. Analyzer UI is lazily loaded, visibility/reduced-motion aware, and private-profile blind.

## Future continuous spectral engine

Ten-band state should remain representable as a sampled target curve so a future denser model can convert predictably. UI/application state must speak in target/sound/profile terms rather than reaching into filter internals.

## Performance constraints

The audio callback must avoid per-sample garbage, DOM/storage/URL/network access, locks, and unbounded loops; remain comfortably below render deadlines; and retain 44.1/48 kHz plus practical 96 kHz validation. Profile management/export/import occurs on the main thread and never in the audio callback.
