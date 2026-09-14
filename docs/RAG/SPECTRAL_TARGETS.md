# Spectral Targets and Preset Realization

Status: canonical contract for Greygen spectral targets, colour presets, and their ten-band realization.

## Target model versus filter realization

Greygen keeps **requested spectral meaning** separate from the implementation-specific gains used to realize it.

A `SpectralTarget` describes the sound in target-space: preset identity, stable per-band dB samples, expected PSD slope where applicable, revision, and provenance. `SpectrumState` adds user band offsets without mutating that target. `resolveSpectrumState()` then maps the target plus offsets into gains for the current complementary ten-band engine.

This separation is intentional. The issue #3 filter bank is a sequence of overlapping complementary first-order components, so a mathematical target slope cannot generally be copied directly into component gains. The target is the public/architectural contract; the realization is an engine-specific mapping validated from rendered output.

Current versions:

- spectral target schema: `1`;
- built-in preset revision: `1`;
- ten-band realization version: `1`.

Changing built-in target values, target provenance, or target-to-engine realization after release requires deliberate versioning and new deterministic evidence rather than silently replacing fixtures.

## Colour targets

The initial mathematical PSD targets are:

- White: `0 dB/octave`;
- Pink: `-3.0103 dB/octave`;
- Brown / Red: `-6.0206 dB/octave` above the deliberately bounded low-frequency region;
- Grey Practical v1: an original non-standard perceptual-shaping heuristic described below rather than a single power-law slope.

For White/Pink/Brown, the stored target samples use the nominal band centers and the requested slope in log-frequency space. These values are not claimed to be the literal component gains of the current filter bank.

## Ten-band realization v1

### White

White uses unity gain on every exposed component and, when present at 96 kHz, unity gain on the hidden ultrasonic residual. Because the complementary bank reconstructs neutrally, this realizes a flat PSD apart from stochastic estimation error.

### Pink

The overlapping first-order basis needs a slightly steeper component tilt than the requested PSD slope. Realization v1 uses approximately `-3.85 dB/octave` across component-center frequency. This value is an implementation compensation selected by deterministic response/render characterization; it is not the Pink target itself.

The same tilt is extended to the hidden ultrasonic residual when that residual exists at 96 kHz so the realization does not jump back to unity above the exposed 16 kHz component.

### Brown / Red

Greygen does **not** create Brown/Red by free-running integration of white noise. Realization v1 uses a steep `-20 dB/octave` component weighting. This suppresses upper complementary components so the bounded first low-shelf tail dominates the validated interior range and produces the requested approximately `-6.0206 dB/octave` PSD without random DC walk.

The `-20 dB/octave` internal weighting is therefore a realization coefficient, not a claim that Brown noise itself has a `-20 dB/octave` target. Across the ten nominal centers it reaches about `-180 dB` at 16 kHz, remaining above the DSP conversion floor while making the low-shelf asymptote dominant. At 96 kHz the hidden residual receives the matching realization tilt.

## Grey Practical v1

Grey Practical v1 is an original Greygen heuristic intended to give broader low/high spectral presence while keeping the middle region comparatively restrained. It is **not** an ISO 226 reproduction, not a clinical or medical equal-loudness model, and not a transcription of myNoise data.

For each nominal center frequency `f`, define:

```text
octavePosition = log2(f / 1000)
broadEdgeLift = 5 * (1 - exp(-0.1 * octavePosition^2))
gentleHighAsymmetry = 0.15 * max(octavePosition, 0)
rawDb = broadEdgeLift + gentleHighAsymmetry
```

The ten raw values are normalized by subtracting their maximum so the highest target point is `0 dB` and all other points are attenuation relative to it. Revision-1 values are locked by tests so any later perceptual tuning is an explicit preset revision rather than an unnoticed behavioral change.

This preset is a practical product curve only. Personal listener/playback compensation belongs to the later calibration stage and remains separate from sound-preset data.

## User offsets and bounds

User band offsets remain a distinct layer from built-in target values. Issue #4 accepts offsets in `[-24, +24] dB`; the resolver applies those offsets to the preset realization gains without changing the immutable target definition.

Tests exercise maximum accepted offsets across all four presets and verify the resulting gains remain finite, non-negative, and inside the current filter-bank gain range. Later gain-safety work may impose stricter user-facing headroom behavior, but it must preserve the target/offset distinction.

## PSD validation method

Stochastic preset validation uses the deterministic analysis utilities in `src/audio/analysis/spectrum.ts`:

- Hann window;
- 50% overlapping Welch segments;
- deterministic in-place radix-2 FFT;
- one-sided power spectral density normalization;
- least-squares fit of `10*log10(power)` against `log2(frequency/1 kHz)`.

The shipping issue #4 fit interval is `125 Hz .. 8 kHz`, avoiding DC/low-edge behavior and the sample-rate-dependent 16 kHz edge. White, Pink, and Brown are required to measure within `±0.5 dB/octave` of their target at 44.1 and 48 kHz, with 96 kHz spot coverage. Required stochastic fixtures use fixed seeds and sufficiently long deterministic renders; the primary 44.1/48 kHz slope fixtures use `2^19` frames.

The analysis FFT is developer/test infrastructure, not a dependency in the real-time audio hot path.

## Brown low-frequency invariant

Brown/Red validation additionally checks that the rendered mean remains near zero, output statistics remain finite/bounded, and the near-DC response flattens rather than continuing an unbounded random-walk spectrum. This is a product invariant: future Brown implementations may improve fidelity, but they must preserve explicit low-frequency/DC bounding.

## Provenance boundary

No myNoise preset values, recordings, code, or visual assets are used. No ISO equal-loudness numerical tables are embedded. Standard colour-noise slope definitions and ordinary DSP techniques are used as mathematical background; Grey Practical v1 and Greygen's realization compensation are independently defined within this repository.
