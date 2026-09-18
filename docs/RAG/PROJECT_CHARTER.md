# Greygen Project Charter

Status: canonical project intent and scope, reconciled for the v0.1 release candidate.

## Mission

Build a high-quality browser noise generator that starts as a friendly ten-band grey-noise tool and grows into a calibrated spectral-noise laboratory. The product should be useful immediately for masking, concentration, experimentation, and subjective spectral shaping, while retaining enough rigor that its output is deterministic, measurable, and reproducible.

## Product layers

### Friendly surface

A compact ten-band control surface around approximate octave centers:

`31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz`.

It provides master output, white/pink/brown/grey presets, stereo width, animation, save/restore, and a clear calibration entry point.

### Serious surface

A deeper panel exposes meter/analyzer data, seeds, numeric band gains, profile management, conservative/full calibration application, animation parameters, and validation/diagnostic information.

### Experimental surface

Later work may add a continuous high-resolution spectral curve, imported correction data, measurement-assisted workflows, spectral morphing/randomization, and more sophisticated synthesis. These capabilities must not destabilize the simpler interface.

## Non-goals for the initial product

- No backend account system.
- No streaming or hosted noise recordings.
- No claim to measure absolute dB SPL without calibrated external hardware.
- No medical diagnosis, audiogram, hearing-aid fitting, or clinical interpretation.
- No copying of myNoise code, recordings, visual assets, branding, calibration values, or proprietary preset data.
- No premature high-resolution FFT engine before the ten-band DSP is validated.

## Architectural principles

1. **Pure DSP below browser integration.** Random generation, filters, gain smoothing, stereo correlation, metering primitives, and safety math must be implementable as ordinary deterministic TypeScript functions/classes. `AudioWorkletProcessor` is an adapter around that core, not the only implementation.
2. **Seed everything stochastic.** Given the same engine version, sample rate, seed, and state trajectory, output should be reproducible within defined floating-point tolerances.
3. **Define spectra precisely.** “White,” “pink,” and “brown” refer to target power spectral density behavior, not arbitrary slider shapes. Preset validation uses measured spectral slope/tolerance.
4. **Runtime sample-rate awareness.** Filter design is derived from the actual `AudioContext.sampleRate`. Bands too close to Nyquist must degrade gracefully rather than become unstable.
5. **Smooth all audible parameter changes.** No direct discontinuous gain/filter jumps on the audio thread.
6. **Separate nominal shaping from safety gain.** User/preset/calibration gains describe the target spectrum. Automatic pre-gain protects headroom independently and is inspectable.
7. **Do not make hidden limiter behavior part of the sound.** The final limiter is an emergency guard. Normal presets/configurations should have sufficient pre-gain that it rarely acts.
8. **Local-first privacy.** Calibration profiles and named playback profiles stay local unless the user explicitly exports them. Share URLs exclude personal calibration by default.
9. **Accessibility is part of control correctness.** Every slider and transport action must be operable and understandable with keyboard and assistive technology.
10. **Repository docs evolve with code.** Any implementation that invalidates a RAG statement updates the affected document in the same PR.

## Quality bars

### DSP correctness

- No NaN/Inf output under accepted control ranges.
- No unstable filter state at supported browser sample rates.
- Deterministic golden/snapshot tests for seeded output primitives.
- Spectral tests establish expected white/pink/brown slope and filter-bank behavior.
- Parameter smoothing tests prove bounded discontinuities.
- Headroom/safety tests exercise pathological all-bands-boosted states.

### Product behavior

- Audio starts only after an explicit user gesture and resumes correctly after browser suspension.
- State survives reload through a versioned storage schema.
- UI never implies browser dBFS values are acoustic dB SPL.
- Unsupported/unsafe high-frequency bands are surfaced clearly at low sample rates.
- No network dependency is required once the app is installed/cached, except optional external links.

### Engineering

Required CI includes: high-severity dependency advisory audit, format/lint, TypeScript typecheck, unit and deterministic DSP validation tests, 44.1/48/96 kHz characterization evidence, production/PWA builds, Chromium full Playwright coverage, Firefox/WebKit core production-path coverage, and GitHub Pages base-path verification.

## v0.1 browser support evidence

The v0.1 browser statement is evidence-based rather than aspirational:

- **Chromium:** complete production-path Playwright suite, including specialized accessibility, calibration, sharing, analyzer, PWA/offline, and failure journeys.
- **Firefox:** production-build core journey covering persistence/no-autostart, real AudioWorklet startup, repeated lifecycle cleanup, analyzer sampling/teardown, and privacy-safe sharing.
- **Playwright WebKit:** the same engine-neutral core journey as Safari-class evidence.

Runtime support requires a secure context plus Web Audio `AudioContext`, `AudioWorklet`, and `AudioWorkletNode`. Greygen detects capabilities rather than UA-sniffing and does not silently substitute a different audio engine.

Playwright WebKit is not a completed physical Safari/macOS/iOS validation. A current Safari hardware lifecycle/interruption check and a current desktop NVDA/VoiceOver spot check remain explicit pre-tag operator gates in `docs/RELEASE_CHECKLIST.md`. The project must not imply those manual checks happened when they did not.

## Clean-room/IP boundary

Greygen may reproduce general ideas and standard DSP techniques, but implementation and product expression must be original. Do not scrape or copy source/assets from the reference site. Do not transcribe copyrighted tables from paid standards. Public standards pages may be cited for definitions and scope; any numerical data incorporated into the product must have a documented reuse basis or be independently derived/created.

The v0.1 provenance audit is recorded in `docs/RELEASE_AUDIT.md`. No Greygen source license has been selected by the owner; the public repository must not be described as open source until that governance decision is explicit.

## Decision ownership

The canonical architecture is in `ARCHITECTURE.md`; validation rules in `DSP_VALIDATION.md`; psychoacoustic/safety constraints in `PSYCHOACOUSTICS_SAFETY.md`; UX/state contracts in `UX_STATE.md`; execution policy in `AGENT_PLAYBOOK.md`; dependency order in `ROADMAP.md`. User-facing operation and release mechanics live in `../USER_GUIDE.md` and `../RELEASE_CHECKLIST.md`.
