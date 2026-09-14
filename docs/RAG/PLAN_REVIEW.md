# Plan Review and Improvement Record

This document captures the deliberate review of the initial concept before implementation. It exists so future agents understand *why* the roadmap is shaped as it is and do not accidentally reintroduce rejected shortcuts.

## Initial plan

The first-pass plan was:

1. Build a TypeScript browser app.
2. Generate stereo noise in an `AudioWorklet`.
3. Split it across ten octave-like bands.
4. Add white/pink/brown/grey presets.
5. Add ten sliders, master volume, width, animation, and metering.
6. Add manual/personal calibration.
7. Add persistence, sharing, PWA support, and later a continuous spectral editor.

This is directionally correct but insufficiently precise for autonomous implementation.

## Review findings

### 1. Worklet-only DSP would be difficult to validate

A design where the actual algorithms live only inside `AudioWorkletProcessor.process()` makes deterministic unit testing, offline analysis, and regression reproduction unnecessarily difficult.

**Improvement:** make the audio thread an adapter. Core random generation, biquad/filter state, stereo correlation, smoothing, gain staging, and meters are pure deterministic TypeScript modules usable by Node/Vitest and by the worklet.

### 2. “Ten equal bands” is ambiguous

A flat set of octave-band slider values does not by itself define white noise. Octave bands contain increasing bandwidth at higher frequencies, so equal integrated energy per octave corresponds approximately to pink noise, while white noise is flat in power spectral density.

**Improvement:** define preset targets by spectral behavior. Unit/offline tests measure slope over a valid range. UI slider semantics are documented independently from those targets.

### 3. Fixed-frequency filter coefficients would be unsafe

Browser sample rates vary. A nominal 16 kHz center may sit too close to Nyquist on lower-rate contexts and fixed coefficients can become invalid or misleading.

**Improvement:** compute coefficients from the runtime sample rate; validate every filter; explicitly degrade/disable or remap a band when its design margin cannot be met.

### 4. Brown noise requires low-frequency discipline

Naively integrating white noise produces random DC drift and can consume headroom with near-DC energy.

**Improvement:** brown/red targets require explicit low-frequency bounding/DC blocking and spectral validation. Do not implement an unconstrained integrator as the shipping source.

### 5. “Grey noise” cannot be treated as a universal scientific curve

Equal-loudness depends on level, listener, transducer, coupling, and environment. ISO 226 describes a specific reference population and measurement setup, not a universal headphone compensation curve. Transcribing copyrighted standard tables is also an avoidable licensing problem.

**Improvement:** ship an original, documented generic-grey preset as a practical product target, not an ISO reproduction. Personal calibration is described as relative listener/playback-chain compensation. No clinical/absolute claims.

### 6. Manual threshold calibration can encourage unsafe behavior

If a user cannot hear a high/low band, repeatedly increasing it can create large physical output while remaining subjectively weak or inaudible.

**Improvement:** bounded adjustment ranges, automatic pre-gain, warnings at extreme bands, a stop rule for inaudible stimuli, and a recommended equal-loudness A/B procedure. “Balanced” correction is the default; full correction is opt-in.

### 7. Automatic headroom cannot be an afterthought

Summed filtered noise is stochastic. Ten positive gains plus calibration can produce substantial overs even when no single path clips.

**Improvement:** nominal spectral gain and safety pre-gain are separate. Conservative headroom is predicted from state, actual peak/RMS is monitored, and a transparent final guard catches exceptional overs. Tests include pathological states.

### 8. Stereo width should preserve variance

Simple L/R crossfade formulas can change loudness as width changes.

**Improvement:** define stereo width via correlation between independent seeded processes using power-preserving mixing. Validate measured correlation and per-channel variance statistically.

### 9. Random animation needs invariants

Unbounded random walks can drift into clipping or permanently skew the spectrum; independent band motion also changes total energy dramatically.

**Improvement:** use bounded/mean-reverting stochastic motion with deterministic seeds. Offer an optional energy-preserving normalization mode and test bounds/reproducibility.

### 10. Browser E2E audio tests can be flaky

CI environments do not provide trustworthy acoustic hardware. Browser audio scheduling also introduces timing variation.

**Improvement:** correctness lives primarily in deterministic pure-DSP tests and offline/statistical validators. Playwright verifies app lifecycle, worklet loading, controls, persistence, and no-console-error behavior; it does not pretend to acoustically certify CI output.

### 11. Persistence and sharing have privacy implications

A calibration profile may encode personal hearing/playback characteristics. Putting it silently into a share URL is undesirable.

**Improvement:** versioned local state; shareable sound state is separate from personal profiles. Calibration data is excluded from URLs/exports unless the user explicitly chooses to include it.

### 12. High-resolution editing is attractive but premature

Starting with FFT overlap-add or a 128-point curve increases complexity before core gain staging and validation are trustworthy.

**Improvement:** validate the ten-band engine first. Continuous spectral editing is a later architecture extension with an explicit compatibility layer to the simpler control surface.

## Resulting implementation strategy

The improved roadmap is deliberately layered:

1. repository/CI scaffold and explicit contracts;
2. deterministic DSP primitives;
3. validated filter bank and spectral presets;
4. browser/worklet lifecycle;
5. gain safety and observability;
6. primary UI/state/persistence;
7. stereo/animation/share/analyzer features;
8. calibration model and guided calibration;
9. PWA/accessibility/browser/performance hardening;
10. advanced spectral laboratory features only after the MVP contract is stable.

## Design review checklist for future changes

Before accepting a major DSP/product change, answer:

- Can it be deterministically tested outside the browser audio thread?
- Is its spectral meaning defined mathematically?
- Does it preserve bounded output and stable filter state at supported sample rates?
- Does it alter nominal sound or only safety gain? Are those separated?
- Does it make a psychoacoustic/medical claim stronger than the evidence supports?
- Does it introduce copied/proprietary numerical data or assets?
- Does it expose personal calibration implicitly?
- Can keyboard/screen-reader users operate it?
- Are the relevant RAG docs and validation thresholds updated in the same PR?

If any answer is unclear, implementation is not ready to merge.
