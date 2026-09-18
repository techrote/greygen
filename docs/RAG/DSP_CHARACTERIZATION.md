# DSP Characterization Tooling

Status: canonical developer-facing report contract for issue #16.

## Purpose

Greygen has deterministic pass/fail DSP tests, but reviewers and developers also need a compact way to inspect what the current engine is actually doing. The characterization tool renders the same pure TypeScript DSP used by the AudioWorklet and emits measurements for spectral colour, filter-bank reconstruction, stereo statistics, gain safety, animation bounds, and offline render throughput.

The tool is evidence and diagnostics. It does **not** replace the assertions in `DSP_VALIDATION.md`, does not use audio hardware, and does not report acoustic SPL.

## Commands

Install the pinned dependencies first with `npm ci`, then run:

```bash
npm run characterize
npm run characterize -- --sample-rate 44100
npm run characterize -- --sample-rate 48000 --preset pink --width 0.75
npm run characterize -- --sample-rate 96000 --animation orbit --animation-depth 8 --animation-speed 2
npm run characterize -- --json > characterization.json
```

`44.1`, `48`, and `96 kHz` are the required validation sample rates. Other finite positive runtime sample rates may be inspected, but only documented validation ranges and filter-bank rules should be treated as conformance claims.

The default fixture is `48 kHz`, `2^18` frames, the engine default seed/state, and no spectral animation. Increase `--frames` for lower-variance stochastic measurements when investigating a marginal spectral result. The minimum accepted frame count is the Welch segment length (`2048`).

Run `npm run characterize -- --help` for the complete option list.

## Execution model

The CLI is a thin Node/Vite developer wrapper around `src/audio/analysis/characterization.ts`. Vite loads the TypeScript DSP graph without introducing a separate runtime dependency or duplicating DSP code. The measurements therefore exercise the same pure engine implementation used by unit tests and the browser adapter.

The CLI does not create an `AudioContext`, open an output device, load a page, or perform network access.

## Report schema

JSON output currently uses schema version `1`. Version changes are required if consumers would otherwise misinterpret a field.

The report records:

- DSP and spectral-realization versions;
- sample rate, frame count, seed, preset, stereo width/correlation target, and animation state;
- runtime/platform/architecture metadata supplied by the CLI;
- measured White/Pink/Brown PSD slopes using the repository Welch/Hann estimator and canonical fit range;
- neutral filter-bank sample/reconstruction error, high-band mode, and isolated nominal-band center responses;
- left/right mean, RMS, peak, measured Pearson correlation, and RMS balance;
- requested/applied deterministic safety pre-gain and final-guard intervention count;
- animation maximum offset and mean/max band-power normalization error when animation is active;
- rendered audio duration, wall time, and realtime factor.

All deterministic DSP fields are reproducible for the same versioned engine state and fixture. Wall time/realtime factor and explicit environment metadata are machine-local observations and are not deterministic cross-machine values.

## Interpretation rules

White, Pink, and Brown slope errors should be interpreted against the current `DSP_VALIDATION.md` tolerance and fit range. The report intentionally exposes the runtime 16 kHz degradation mode rather than hiding Nyquist-limited behavior.

Stereo correlation and L/R RMS balance are reported using the same statistical conventions as the deterministic test suite. Safety-pre-gain is a digital headroom quantity. Peak/RMS values are digital sample-domain measurements. None of these values are dB SPL, dB HL, phon, or a medical measurement.

`guardInterventions` is useful for spotting pathological states, but a zero value in one fixture is not a universal proof that clipping protection can never engage. Pass/fail safety behavior remains locked by dedicated adversarial tests.

## Performance interpretation

The offline realtime factor is informational. It is intended for same-machine or carefully controlled before/after comparisons, not as a universal CI performance threshold. Runtime, platform, and CPU architecture metadata are included so a report is not mistaken for a portable hardware benchmark.

Browser AudioWorklet scheduling, UI load, power management, and device-specific behavior are outside this offline timing number. Cross-browser release performance remains the scope of issue #19.

## Reproducibility and provenance

The tool uses the repository's seeded PRNG and contains no `Math.random()` path. It reuses existing DSP/statistics code and adds no FFT/statistics runtime dependency. Reports are compact text/JSON and should be preferred over committing large generated audio files.
