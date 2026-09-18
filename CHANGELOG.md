# Changelog

All notable Greygen release changes are recorded here. Greygen uses semantic-style application version identifiers; compatibility-critical DSP/protocol/state formats retain their own explicit version numbers.

## 0.1.0 — release candidate

### Generator and DSP

- Deterministic seeded browser noise synthesis with measured White, Pink, Brown/Red, and original Grey Practical targets.
- Runtime-sample-rate-aware complementary ten-band filter bank with explicit 16 kHz Nyquist degradation behavior.
- Power-preserving stereo correlation/width, bounded deterministic spectral animation, smoothed control changes, deterministic safety pre-gain, final overflow guard, and digital Peak/RMS telemetry.
- Offline deterministic DSP validation and developer characterization at 44.1, 48, and 96 kHz.

### Product surface

- Accessible ten-band generator UI with explicit Start/Stop/Resume lifecycle and viewport-reachable Stop.
- Versioned local SoundState, user sound presets, private playback/calibration ProfileState, and UI preferences with defensive migration/recovery.
- Backend-free privacy-safe SoundState share URLs.
- Live native-browser analyzer and private-safe runtime diagnostics.
- Installable PWA/offline shell with coherent main-thread/AudioWorklet cache versioning and explicit update activation.

### Calibration

- Local relative perceived-level playback profiles with Off/Balanced/Full application.
- Guided deterministic narrow-band matching with bounded judgements, skip/retest/review, comfortable-level acknowledgement, and explicit save.
- Linked/symmetric and independent left/right playback calibration, smoothed channel routing, conservative inter-channel correction guard, profile management, and separate explicit personal-profile export/import.
- Calibration remains non-medical and cannot determine calibrated acoustic SPL.

### Hardening

- Production-path Chromium, Firefox, and Playwright WebKit conformance coverage; WebKit is Safari-class automation rather than a physical Safari certification.
- Keyboard/focus/touch/responsive/reduced-motion regression coverage and fixed lifecycle transport.
- Analyzer sampling repaired so diagnostics no longer disconnect the live Web Audio graph.
- Static GitHub Pages deployment path and offline reload verification.
- v0.1 release metadata, user guide, release checklist, dependency/license/provenance/privacy audit, and canonical RAG reconciliation.

### Compatibility identifiers

- Application: 0.1.0
- DSP engine: 1
- AudioWorklet protocol: 6
- SoundState: 3
- ProfileState: 2
- UiState: 2
- Normal share format: 1
- Personal calibration export envelope: 1

### Release limitations

- Current physical Safari/macOS or iOS/iPadOS remains a manual pre-tag release check.
- A current desktop NVDA or VoiceOver spot check remains a manual pre-tag release check.
- No Greygen source license has been selected by the repository owner; v0.1 must not be advertised as open source unless that decision is made explicitly.
- Digital dBFS/headroom measurements and subjective calibration are not acoustic SPL, dB HL, audiograms, or medical measurements.
