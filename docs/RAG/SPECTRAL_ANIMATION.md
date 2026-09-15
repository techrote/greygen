# Deterministic Spectral Animation

Status: canonical contract for issue #10 spectral movement.

## Purpose

Spectral animation is a deterministic modulation layer over Greygen's requested ten-band target. It is not a second preset system and it never mutates the stored user band offsets. The same animation state, seed, sample rate, and elapsed sample count reproduce the same modulation trajectory.

The implementation lives in `src/audio/dsp/animation.ts` and is consumed only by the pure DSP engine. React and browser APIs do not generate motion.

## State

`AnimationState` schema v1 contains:

- `mode`: `off | drift | breathe | wander | orbit`;
- unsigned 32-bit animation `seed`;
- `depthDb`: `0 .. 12 dB`;
- `speed`: `0.25 .. 4.0` normalized multiplier;
- `energyPreserving`: boolean.

Defaults are Off, seed `0x414e494d`, depth `4 dB`, speed `1.0`, and energy preservation enabled.

The animation seed is deliberately separate from the audio-noise seed. Changing motion identity therefore does not silently redefine the underlying deterministic noise stream.

## Time model

Animation advances from the audio sample clock only. There is no wall-clock read, timer callback, frame-rate dependency, or `Math.random()` call in the algorithm.

A trajectory advances once per rendered audio frame. Stereo stream A and B receive the same animated ten-band gain vector for that frame, so spectral movement does not itself redefine the stereo-correlation model.

## Bounded modes

All shipped modes are analytic combinations of bounded sinusoids. None is an integrated random walk, so no mode can drift without limit over long sessions.

### Drift

Per-band low-rate seeded phase/frequency motion formed from two bounded sinusoidal components. Adjacent bands can move differently without accumulating state error.

Base frequency: `0.018 Hz * speed` before each band's seeded multiplier.

### Breathe

Broad coherent movement with a small frequency-position phase spread. It is intentionally more correlated across bands than Drift or Wander.

Base frequency: `0.04 Hz * speed`.

### Wander

A richer three-component seeded trajectory using incommensurate bounded rates. It gives less obviously periodic local motion without random-walk accumulation.

Base frequency: `0.009 Hz * speed`.

### Orbit

A traveling sinusoidal wave across normalized band position, creating a spectral emphasis that moves around the ten-band control surface.

Base frequency: `0.032 Hz * speed`.

## Depth and hard bounds

Each raw mode is bounded before depth scaling. The final target offset for every exposed band is then bounded to `[-depthDb, +depthDb]`.

At the maximum supported depth, no dynamic animation target can exceed `±12 dB`. Non-finite or out-of-range state is rejected by the pure constructor and recovered/clamped by the persisted-state parser.

## Energy-preserving normalization

When `energyPreserving` is enabled, Greygen removes the instantaneous mean linear-power gain of the ten animation offsets before applying them:

```text
normalizationDb = 10 * log10(mean(10^(offsetDb / 10)))
normalizedOffsetDb[i] = offsetDb[i] - normalizationDb
```

Therefore the arithmetic mean of the ten animation gain factors in the power domain is unity, apart from any final depth bound. This is deterministic and is not a stochastic AGC loop.

The option is user-visible because preserving mean band power is a policy choice, not a hidden correction. Disabling it leaves the bounded trajectory otherwise unchanged.

## Smoothing and Off behavior

Animation uses two smoothing layers with different responsibilities:

- depth/speed parameter targets: 120 ms one-pole smoothing;
- per-band animation offsets before they multiply the filter-bank gains: 80 ms one-pole smoothing.

Selecting Off makes the procedural target exactly neutral (`0 dB` in every band). The per-band output smoothers then return the actual applied animation gain toward neutral rather than snapping the filter multipliers.

Mode changes, depth changes, speed changes, and rapid accepted UI updates therefore do not write discontinuous dB values directly into the sample path.

## Gain-safety interaction

Animation is upstream of the existing deterministic safety pre-gain, master, and final guard.

For an enabled animation mode the safety estimator reserves headroom for the configured maximum animation depth, multiplying the static shaped-response estimate by `gain(depthDb)` before deriving safety pre-gain. This is intentionally conservative: the animation cannot outrun the safety calculation even when a trajectory reaches an extreme band offset.

Energy-preserving normalization is not relied upon as the safety mechanism. The final guard remains authoritative for illegal full-scale overflow.

## Persistence and migration

Issue #10 advances `SoundState` to schema v3 and stores generic animation state alongside preset, band offsets, master, stereo width, and audio seed.

Existing schema-v2 sounds migrate with animation **Off**. Earlier v0/v1 sounds also remain Off. This preserves the sound of saved states created before spectral animation existed rather than silently introducing motion on upgrade.

Animation state is generic shareable sound state. It does not belong to private calibration/profile storage.

## Worklet protocol

Audio protocol v4 adds:

- animation state to `initialize`;
- `set-animation` control + acknowledgement;
- animation state in `ready` and `status` responses.

Controls can be preloaded while the engine is Ready and owns no AudioContext. Restoring a persisted animated sound never starts audio; the user must still choose Start explicitly.

## Validation contract

Automated tests must prove:

- exact reproducibility for equal seed/state/sample time;
- visibly/numerically distinct shipped modes rather than aliases;
- finite output and per-band bounds over long maximum-depth/maximum-speed runs;
- energy-preserving normalization remains within a tight deterministic tolerance;
- Off returns targets to neutral and smoothing state converges;
- rapid accepted mode/depth/speed changes remain finite at 96 kHz;
- maximum animation depth participates in safety pre-gain;
- state serialization/migration preserves old sounds as Off;
- native browser controls update mode/depth/speed/normalization, persist across reload, and never create autoplay intent;
- a real AudioWorklet accepts animation changes while Running without breaking meters or lifecycle controls.

No acceptance threshold may be widened merely to make a failing implementation green.
