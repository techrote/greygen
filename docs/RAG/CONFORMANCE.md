# Cross-browser, performance, and DSP conformance

Status: canonical hardening contract for issue #19. This document defines what Greygen actually automates and what a release claim may infer from that evidence.

## Browser support contract

Greygen's browser runtime requires a secure context, Web Audio `AudioContext`, `AudioWorklet`, and `AudioWorkletNode`. Unsupported capability is surfaced explicitly; the application never silently falls back to a different audio engine.

The Playwright matrix is intentionally layered:

- **Chromium:** the complete browser suite, including specialized accessibility, PWA/offline, calibration, analyzer, sharing, lifecycle, and failure-injection journeys.
- **Firefox:** the cross-browser core suite against the production build: state/persistence, real AudioWorklet initialization, repeated start/stop cleanup, and privacy-safe sharing. On headless Linux CI, Firefox can initialize the worklet but leave `AudioContext` suspended when the runner exposes no usable audio sink; that narrow condition is accepted only for the Firefox project after processor-ready evidence is visible, while actual Running/audible output remains a manual release spot check.
- **WebKit:** the same cross-browser core suite as a Safari-class engine check, including Running AudioWorklet and analyzer sampling where the CI engine exposes a running context.

The Firefox/WebKit projects do not blanket-skip failing tests. They select the engine-neutral core journey explicitly. Chromium-only specialized tests include browser instrumentation and service-worker/offline fixtures whose purpose is already covered by deterministic state/PWA validation plus the Chromium production-path integration suite; expanding every specialized fixture to every engine is not a v0.1 support claim. Any future browser-specific exclusion from the cross-browser core itself must name the concrete incompatibility and retain equivalent deterministic coverage.

The Firefox headless-suspension exception is deliberately narrow rather than a skip: the test still requires the processor initialization response to populate sample-rate/high-band runtime state, requires the Resume and Stop lifecycle controls to remain available, repeats fresh context creation and explicit cleanup three times, and rejects the same suspended outcome in Chromium/WebKit. Analyzer graph behavior is additionally covered by the deterministic instrumented lifecycle fixture and by real Running browser paths. This exception does not permit a shipped Firefox build that cannot reach Running on a real browser/device.

Playwright WebKit is a Safari-class engine, not a substitute for a physical macOS/iOS Safari release check. A release operator should still perform the manual spot checks listed below on a current Safari device when one is available.

## Cross-browser core journeys

Each Firefox/WebKit/Chromium core run verifies:

1. production application boot reaches Ready without creating audio;
2. representative spectrum, band, master, width, and animation controls persist across reload without restoring Running;
3. a real AudioWorklet initializes; Chromium/WebKit require Running in CI, while only headless Firefox may remain Suspended after processor-ready evidence as described above;
4. three consecutive start/stop cycles close cleanly, with analyzer sampling/teardown exercised when the browser reaches Running;
5. normal share URLs round-trip generic SoundState while excluding private profile/calibration data and never auto-starting audio;
6. uncaught page errors remain absent.

The unit lifecycle conformance fixture additionally repeats five start/stop cycles with instrumented context/node/analyzer/message-port objects and requires every owned resource to be released exactly once.

## Analyzer graph invariant

`AudioEngine.readAnalyzerFrame()` is a read operation. It must not disconnect or rebuild the live Web Audio graph. Analyzer disconnection belongs only to lifecycle cleanup.

The #19 audit found a violation of this invariant: sampling called `AnalyserNode.disconnect()`, so opening the analyzer could sever the graph after its first sample. The repair keeps the graph connected while sampling and retains exactly-once analyzer disconnection during stop/dispose. This is regression-gated by the instrumented lifecycle test and the real-browser analyzer journey.

## DSP sample-rate matrix

The deterministic characterization command runs in CI at:

- 44,100 Hz — expected high-band mode `degraded-high-shelf`;
- 48,000 Hz — expected high-band mode `degraded-high-shelf`;
- 96,000 Hz — expected high-band mode `bounded-bandpass` with ultrasonic residual outside the exposed ten controls.

The pass/fail DSP suite remains authoritative for the numeric contracts in `DSP_VALIDATION.md`: spectral-slope tolerances, neutral reconstruction, high-band behavior, stereo correlation/RMS balance, animation bounds/reproducibility, finite output, safety pre-gain, and final-guard behavior. Characterization is additional evidence and must not be used to relax those thresholds.

Ordinary default/reference renders are expected to report zero final-guard interventions. If a normal preset begins relying persistently on the final guard, that is a gain-staging defect rather than permission to broaden a threshold.

## Performance evidence policy

`npm run characterize` times the same pure DSP engine used by the worklet and reports rendered audio duration, wall time, realtime factor, sample rate, feature state, and environment metadata. CI runs the default characterization at all three sample rates so each release candidate leaves comparable machine-local evidence in its workflow log.

Realtime factor is **informational evidence**, not a universal CPU-percentage or device-support promise. Hosted-runner timing varies with virtualization and load. A hard timing threshold is therefore not part of the deterministic DSP contract. The release criterion is that observed reference-runner factors are comfortably above realtime and show no obvious regression relative to nearby runs; a material collapse must be investigated before release.

The worklet hot path was inspected during #19. `GreygenAudioProcessor.process()` reuses the browser-owned output buffers, and `GreygenDspEngine.renderMono/renderStereo()` reuse preallocated filter/scratch/smoother storage. There are no object/array allocations inside the per-sample loops. Control-state canonicalization may allocate on message/control changes, and telemetry constructs a message at the bounded 10 Hz telemetry cadence; neither is per-sample churn.

The analyzer remains on the main thread, uses a single reusable `Float32Array`, and UI sampling is frame-bounded and suspended when the panel/document is inactive according to `ANALYZER_DIAGNOSTICS.md`.

## Production/PWA path

Cross-browser core tests run against the production Vite preview rather than the dev server. The CI job also verifies the generated PWA artifact at `/` and the `/greygen/` GitHub Pages base path. Chromium retains the explicit offline reload/update integration coverage from issue #17. Sound/profile persistence and normal share privacy are tested independently of service-worker state.

## Manual release spot checks

Automated evidence does not claim acoustic hardware validation. Before a tagged release, perform when practical:

- current desktop Firefox: Start, confirm the context reaches Running and output is audible, change a band/width, Stop, restart;
- current desktop Safari on macOS or Safari on iOS/iPadOS: the same lifecycle check plus background/foreground interruption recovery;
- current Chromium: installed/offline reload and explicit Start after reload;
- confirm no browser resumes sound merely from reload, imported/share state, profile selection, or service-worker update.

The Firefox Running check is mandatory before making a v0.1 Firefox support claim because headless Linux CI may not expose a usable audio sink. A manual browser failure is a release blocker if it affects a browser Greygen claims to support; record the exact browser/OS version and reproduction rather than weakening DSP/state/privacy contracts.

## Re-running the conformance pass

From a clean checkout with the pinned Node/npm versions:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run characterize -- --sample-rate 44100
npm run characterize -- --sample-rate 48000
npm run characterize -- --sample-rate 96000
npm run build
npm run verify:pwa
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
npm run build:pages
npm run verify:pwa:pages
```

Do not convert timing observations into deterministic correctness thresholds without a separate evidence-backed contract change.
