# Greygen Development Roadmap

Status: canonical dependency order and issue map.

The roadmap is intentionally staged so the audio math becomes testable before UI complexity and calibration arrive. Issue numbers below assume the repository's initial issue set created with this roadmap.

## Dependency graph

```text
#1 scaffold/CI
 |
 +--> #2 deterministic DSP primitives/RNG
 |      |
 |      +--> #3 validated ten-band filter bank
 |              |
 |              +--> #4 spectral target engine + white/pink/brown/grey
 |                      |
 |                      +--> #5 AudioWorklet/browser engine
 |                              |
 |                              +--> #6 gain safety + metering
 |                                      |
 |                                      +--> #7 primary generator UI
 |                                              |
 |                                              +--> #8 versioned state/persistence
 |                                              |      |
 |                                              |      +--> #11 presets/share URLs
 |                                              |
 |                                              +--> #9 stereo correlation/width
 |                                              |
 |                                              +--> #10 deterministic animation
 |                                              |
 |                                              +--> #12 analyzer/diagnostics
 |                                              |
 |                                              +--> #13 calibration profile/correction pipeline
 |                                                     |
 |                                                     +--> #14 guided calibration wizard
 |                                                            |
 |                                                            +--> #15 L/R + playback profiles/export
 |
 +-----------------------------------------------------------> #16 reference/characterization tooling

#7 + #8 + #11 + #14 --> #17 PWA/offline/deployment
#7 + #14             --> #18 accessibility/responsive hardening
#9 + #10 + #12 + #15 + #16 + #18 --> #19 cross-browser/performance/conformance
#17 + #19 --> #20 v0.1 release hardening

#20 --> #21 continuous high-resolution spectral model/editor (post-MVP)
#21 --> #22 spectral morphing/advanced automation (post-MVP)
```

## Phase A — foundation and measurable DSP

### #1 Bootstrap TypeScript/React/Vite app, CI, test harness

Create runnable app/tooling, Vitest, Playwright, lint/format/typecheck, production build, and GitHub Actions. No substantive DSP yet. CI becomes the merge gate for all following work.

### #2 Deterministic DSP primitives and seeded PRNG

Implement reusable dB math, clamps, block utilities, seeded PRNG with golden vectors, smoothing primitives, and foundational statistical test helpers. No DOM/Web Audio dependencies.

### #3 Validated ten-band filter bank

Evaluate/select a stable runtime-sample-rate-aware topology, implement it in pure TypeScript, characterize reconstruction/edge bands, and cover 44.1/48/96 kHz behavior. High-band degradation near Nyquist must be explicit.

### #4 Spectral target engine and colour presets

Define/implement measured white, pink, brown/red, and original generic-grey targets. PSD/Welch validation verifies slope semantics. Brown/red includes DC/low-frequency control. Grey provenance is documented and not an ISO-table transcription.

### #5 AudioWorklet and browser AudioEngine lifecycle

Wrap the pure engine in a versioned worklet protocol. Implement user-gesture start, resume/suspend handling, failure states, cleanup, and browser smoke coverage on localhost/secure-equivalent origin.

### #6 Gain safety, smoothing integration, and meters

Introduce explicit nominal gain stages, automatic safety pre-gain, master gain, peak/RMS telemetry, and final guard. Prove pathological accepted states remain finite and normal presets do not rely on constant limiting.

## Phase B — usable product core

### #7 Primary ten-band generator UI and transport

Build the friendly default control surface with start/stop/mute, ten accessible frequency controls, master, preset selector, width/animation placeholders, and compact meter/headroom state. UI talks to `AudioEngine`, not DSP internals.

### #8 Versioned state, persistence, and migrations

Implement separated `SoundState`, `ProfileState`, and `UiState`, defensive load/migrations, corrupt-state recovery, reset semantics, and storage tests.

### #9 Power-preserving stereo width/correlation

Implement deterministic stereo decorrelation/correlation, map user-friendly width labels/continuous control to statistical target, preserve variance, and validate correlation/RMS invariants.

### #10 Deterministic bounded spectral animation

Implement seeded, bounded/mean-reverting animation modes with depth/speed and optional energy-preserving behavior. No unbounded random walks or unsmoothed jumps.

### #11 Preset library, user presets, and privacy-safe share URLs

Formalize spectral-only ownership for built-in colour presets; save complete generic SoundState snapshots as local named user presets; serialize versioned SoundState into backend-free URL fragments; and exclude ProfileState, local preset names/library metadata, and UiState from normal sharing. Imports never auto-start audio.

### #12 Spectrum analyzer and diagnostics panel

Add efficient post-engine spectrum visualization/diagnostics, seed/sample-rate/runtime status, and meter detail without destabilizing the audio thread. Visualization work respects reduced-motion and performance constraints.

## Phase C — calibration

### #13 Calibration profile model and correction pipeline

Implement local named relative correction profiles, correction bounds, Off/Balanced/Full modes, deterministic Balanced transform, metadata, and integration with gain-safety math. No guided measurement UI yet.

### #14 Guided equal-loudness calibration wizard

Implement narrow-band reference/test comparison flow, randomized/retest order, comfortable-level acknowledgement, skip/cannot-match path, bounded adjustments, progress/review, and audition of Off/Balanced/Full. Wording follows safety RAG.

### #15 Independent L/R and playback profile management

Extend calibration to explicit channel modes, linked/symmetric fallback, capped inter-channel differences, profile naming/device notes, deliberate export/import, deletion, and non-diagnostic asymmetry language.

### #16 DSP characterization/reference tooling

Build repeatable developer scripts/reports for spectral response, slope, correlation, gain safety, and realtime-factor benchmarks. These supplement pass/fail tests and produce compact textual/JSON artifacts rather than committing large audio files.

## Phase D — hardening and release

### #17 PWA/offline operation and static deployment

Add manifest/service worker/offline shell and a static deployment workflow suitable for HTTPS hosting (prefer GitHub Pages when repository configuration allows). Ensure worklet assets cache/version correctly and updates do not strand stale processors.

### #18 Accessibility and responsive interaction hardening

Audit/fix keyboard interaction, semantic labelling, focus, contrast, status announcements, touch targets, narrow-screen ten-band layout, and reduced-motion visual behavior. Include automated accessibility checks where practical plus documented manual checks.

### #19 Cross-browser, performance, and DSP conformance pass

Run current Chromium/Firefox/WebKit matrix, characterize 44.1/48/96 kHz behavior, fix interoperability and hot-loop allocation issues, establish evidence-based performance budgets, and reconcile any documentation discrepancies.

### #20 v0.1 release hardening and operator documentation

Complete release checklist, README/user guide, calibration warnings, architecture/validation reconciliation, license/provenance audit, dependency audit, CI green default branch, changelog/versioning, and a tagged/releasable static build process.

## Phase E — post-MVP spectral laboratory

### #21 Continuous high-resolution spectral model/editor

Introduce a denser target-spectrum representation and editor behind the stable simple interface. Ten-band states must round-trip/convert predictably. Choose IIR/FIR/FFT realization from measured evidence and maintain safety/validation contracts.

### #22 Spectral morphing and advanced automation

Add curve morphing, keyframed/stochastic spectral trajectories, richer seeded automation, and preset interpolation while preserving bounded energy, deterministic replay, and compatibility with the simple animation modes.

## MVP boundary

Issues #1–#20 define the first credible release. #21–#22 are intentionally post-MVP and must not delay a useful calibrated ten-band generator.

## Parallelism guidance

Do not parallelize tightly coupled DSP issues #2–#6 against unmerged predecessor assumptions. After #7/#8, #9/#10/#12 can proceed with moderate independence. #16 can begin after the DSP contracts exist and can be extended incrementally. Accessibility should be considered throughout, but #18 is the dedicated audit rather than permission to defer obvious accessibility defects.

## Release gates

No v0.1 release until:

- required CI passes on default branch;
- seeded DSP validators are green;
- worklet lifecycle is reliable on supported browsers;
- normal presets do not depend on heavy limiting;
- calibration language and gain bounds meet safety RAG;
- personal calibration is excluded from normal share paths;
- keyboard operation and stop/mute are reliable;
- license/provenance audit finds no copied reference-site assets/data.

### Implemented: issue #12 analyzer/diagnostics

Native main-thread AnalyserNode spectrum, bounded/lazy diagnostics UI, reduced-motion/visibility lifecycle, and private-safe runtime diagnostics are implemented and test-gated.

### Implemented: issue #16 DSP characterization/reference tooling

A browser-independent developer CLI now emits versioned human-readable or JSON characterization reports for White/Pink/Brown spectral slope, neutral/filter-bank response, stereo correlation/RMS balance, gain-safety/final-guard telemetry, bounded animation statistics, and machine-local offline realtime factor. Required 44.1/48/96 kHz coverage and adversarial numeric boundaries are test-gated; the benchmark remains informational rather than a universal CI timing threshold.

### Implemented: issue #18 accessibility/responsive hardening

The native generator/profile/calibration control surface now has explicit keyboard/focus contracts, viewport-reachable lifecycle Stop, 44 px critical touch targets, deliberate narrow-screen ten-band scrolling, and visual-only reduced-motion behavior. Chromium regressions cover semantic names/IDs/tab order, fine/coarse range operation, keyboard profile creation/selection, complete guided calibration plus abort/focus restoration, portrait/landscape containment, and Stop reachability. `ACCESSIBILITY_RESPONSIVE.md` records the source/DOM manual review and keeps a real desktop screen-reader spot check as a release-time human gate rather than claiming CI substitutes for assistive technology.

### Implemented: issue #19 cross-browser/performance/conformance hardening

The production-path browser matrix now combines the full Chromium suite with focused Firefox/WebKit core journeys for persistence, real AudioWorklet initialization/lifecycle cleanup, share privacy, and no-autostart behavior. A narrow headless-Linux Firefox suspension condition is explicitly documented rather than hidden behind blanket skips, while real-device Firefox Running remains a release spot check. CI characterizes the same DSP engine at 44.1/48/96 kHz without weakening numeric thresholds, and the hot-loop audit records preallocated render storage. The pass also repaired a real analyzer lifecycle defect: sampling no longer disconnects the live Web Audio graph, with repeated cleanup and adversarial ownership tests enforcing the invariant. With #19 complete, #20 v0.1 release hardening is the next dependency-ready MVP issue.
