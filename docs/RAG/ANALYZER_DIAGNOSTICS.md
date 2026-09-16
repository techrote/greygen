# Analyzer and Diagnostics

Status: canonical analyzer/runtime-inspection contract through issue #12.

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

The panel exposes generic bug-report/runtime state only: lifecycle, sample rate, DSP engine version, audio protocol version, sound seed, spectral target/Modified state, high-band mode, Peak/RMS, safety pre-gain/current target, guard interventions, stereo correlation, telemetry sequence, and rendered frame count.

Private ProfileState/calibration names, notes, curves, and device metadata are structurally absent from analyzer props and diagnostics formatting.

## Performance evidence

Issue #12 does not modify `greygen-processor.ts`, the DSP render loop, or telemetry cadence. Analyzer FFT computation is delegated to the browser's `AnalyserNode` outside the worklet callback. Therefore worklet callback computation/message traffic is identical with analyzer closed or open; only main-thread graph analysis + bounded UI sampling are added.

## Lifecycle

The analyser node is created only with the browser audio graph and disconnected during AudioEngine cleanup. The display loop owns at most one pending `requestAnimationFrame`; unmount/close cancels it and removes visibility/reduced-motion listeners. Reopening constructs a fresh panel loop without retaining the previous one.
