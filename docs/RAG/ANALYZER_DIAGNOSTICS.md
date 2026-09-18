# Analyzer and Diagnostics

Status: canonical analyzer/runtime-inspection contract, reconciled through issue #20 release hardening.

## Architecture

The live spectrum is intentionally **not** computed in the AudioWorklet. The production browser graph inserts a native `AnalyserNode` after the worklet and before `AudioDestination`. The worklet's existing bounded telemetry protocol is unchanged, so opening the analyzer adds no FFT work, allocations, or extra messages to the real-time callback.

The analyzer UI is code-split with `React.lazy` and mounted only while its panel is open. Its display loop is bounded to 15 samples/second, or 4 samples/second under `prefers-reduced-motion: reduce`. It stops on unmount and does not run while the document is hidden or audio is not Running.

## Spectrum semantics

- FFT size: 2048 via native `AnalyserNode`.
- Display range: -120..0 dBFS.
- Native analyzer smoothing: 0.72.
- Browser frequency bins are reduced to at most 64 visual bars on the main thread.
- The visualization is supplementary; exact runtime diagnostics remain textual.
- No acoustic dB SPL, phon, medical, or hearing-threshold claim is made.

## Diagnostics

The panel exposes generic bug-report/runtime state only: lifecycle, sample rate, **Greygen application version**, DSP engine version, audio protocol version, sound seed, spectral target/Modified state, high-band mode, Peak/RMS, safety pre-gain/current target, guard interventions, stereo correlation, telemetry sequence, and rendered frame count.

Private ProfileState/calibration names, notes, curves, evidence, and device metadata are structurally absent from analyzer props and diagnostics formatting.

For v0.1 the visible identifiers are Greygen `0.1.0`, DSP engine `1`, and audio protocol `6`. Application version lives in `src/version.ts`; release metadata tests require it to match `package.json`.

## Performance evidence

Analyzer FFT computation is delegated to the browser's `AnalyserNode` outside the worklet callback. Worklet callback computation/message traffic is therefore the same with the analyzer panel closed or open; only main-thread graph analysis plus bounded UI sampling are added.

`AudioEngine` allocates the analyzer's frequency buffer once when the browser graph starts and reuses that `Float32Array` for reads. `readAnalyzerFrame()` calls `getFloatFrequencyData()` into that buffer; it is an observational operation and must not disconnect/reconnect or rebuild the Web Audio graph.

The issue #19 audit found and fixed a lifecycle defect where `readAnalyzerFrame()` called `AnalyserNode.disconnect()` while sampling. Because the production graph is `AudioWorkletNode -> AnalyserNode -> AudioDestination`, that could sever live output after the first analyzer sample. Regression tests now require repeated reads to leave the analyzer connected and reserve disconnect for cleanup only.

The broader hot-path and machine-local realtime-factor evidence policy is in `CONFORMANCE.md`; analyzer activity is not used to relax deterministic DSP thresholds.

## Lifecycle

The analyser node is created only with the browser audio graph and connected once between the worklet and destination. It is disconnected during `AudioEngine` cleanup, not during spectrum reads. Repeated Start after Stop creates a fresh analyzer with the fresh audio graph.

The display loop owns at most one pending `requestAnimationFrame`; unmount/close cancels it and removes visibility/reduced-motion listeners. Reopening constructs a fresh panel loop without retaining the previous one. Issue #19 adds both instrumented repeated-start/stop cleanup coverage and a real cross-browser analyzer sampling/teardown journey.

## Browser evidence

Chromium's complete Playwright suite retains the dedicated analyzer tests. Firefox and Playwright WebKit also exercise opening the analyzer during a real AudioWorklet run, wait for live samples, close the panel, then Stop and restart the graph. This validates browser lifecycle/teardown behavior; it does not claim acoustic output validation or replace the deterministic DSP suite.
