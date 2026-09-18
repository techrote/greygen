# Greygen v0.1 release audit

Audit date: 2026-09-18

This document records the repository-side release-hardening audit for v0.1. It is an engineering/provenance record, not a legal opinion or a substitute for the manual browser/assistive-technology checks in `RELEASE_CHECKLIST.md`.

## Scope and release baseline

The v0.1 MVP is issues #1 through #20. Issues #21 and #22 are explicitly post-MVP spectral-laboratory work and are not release blockers for the ten-band product.

The release baseline entering issue #20 had #1-#19 implemented and no open MVP issue other than #20. The default branch already carried production PWA/offline support, accessibility/responsive hardening, deterministic DSP characterization, and the Chromium/Firefox/WebKit conformance pass.

Issue #20 found two canonical-document discrepancies and repairs them in the release PR:

- `STATE_PERSISTENCE.md` still described the private ProfileState envelope as schema v1 although implementation and `CALIBRATION_PROFILES.md` use schema v2;
- `UX_STATE.md` still described explicit private-profile export as future work although the separate personal calibration export/import path shipped in #15.

No DSP equation, gain bound, privacy boundary, autoplay rule, calibration algorithm, source identity, or provenance rule is changed by that reconciliation.

## Application and compatibility versions

v0.1 exposes and locks the following identifiers:

- Greygen application: `0.1.0`;
- DSP engine: `1`;
- AudioWorklet protocol: `6`;
- SoundState schema: `3`;
- ProfileState schema: `2`;
- UiState schema: `2`;
- normal sound-share format: `1`;
- personal calibration export envelope: `1`;
- spectral target schema / built-in preset revision / ten-band realization: `1 / 1 / 1`.

The analyzer diagnostics display the application, DSP-engine, and audio-protocol versions. Unit coverage locks the v0.1 package/application version and principal runtime/state compatibility identifiers.

## Dependency and license audit

`package.json` is private and pins all direct dependencies exactly. The shipping runtime dependency surface is only:

| Package | v0.1 pin | Lockfile license metadata |
| --- | ---: | --- |
| `react` | 19.3.0 | MIT |
| `react-dom` | 19.3.0 | MIT |

Direct development tooling is pinned as well:

| Package | v0.1 pin | License |
| --- | ---: | --- |
| `@biomejs/biome` | 2.5.13 | MIT OR Apache-2.0 |
| `@playwright/test` | 1.63.0 | Apache-2.0 |
| `@types/node` | 24.13.4 | MIT |
| `@types/react` | 19.3.0 | MIT |
| `@types/react-dom` | 19.3.0 | MIT |
| `@vitejs/plugin-react` | 6.1.1 | MIT |
| `typescript` | 7.0.2 | Apache-2.0 |
| `vite` | 8.3.0 | MIT |
| `vitest` | 5.0.0 | MIT |

The lockfile remains the reproducible dependency authority. CI installs with `npm ci`; no CDN runtime dependency is required by the core application.

### Greygen source-license status

The repository owner has not selected a source license in the recorded project instructions and the repository has no `LICENSE` file. Issue #20 explicitly forbids inventing a license without that decision. Therefore v0.1 does **not** claim an open-source license. Anyone redistributing or reusing Greygen source must not infer permission from the dependency licenses or from the repository being publicly readable.

A future owner-selected source license is a separate governance change and should add the actual license text plus update this audit/README.

## Clean-room and provenance audit

The v0.1 implementation remains independent and clean-room:

- myNoise is cited only as a product-class/conceptual reference in RAG documentation;
- no myNoise JavaScript, CSS, HTML, recordings, artwork, branding, calibration values, or preset tables are bundled;
- Grey Practical v1 is an original repository-defined heuristic with its formula and revision recorded in `SPECTRAL_TARGETS.md`;
- White/Pink/Brown meanings use ordinary mathematical PSD definitions and independently characterized Greygen realization coefficients;
- ISO 226:2023 is referenced for public conceptual scope only; no paid/copyrighted ISO numerical equal-loudness table is embedded;
- the PWA icon and generated application assets are Greygen repository assets/build output rather than copied reference-site material.

The release copy must not claim affiliation with or endorsement by myNoise, ISO, or any standards body.

## Privacy and secure-default audit

The v0.1 architecture is a static client with no required backend. The release audit found no product analytics integration, tracking service, account system, hosted noise stream, or calibration-upload path.

Important terminology: AudioWorklet **telemetry** in the source is bounded in-memory DSP status exchanged between the processor and the main thread. It is not network analytics/telemetry.

Normal sound sharing accepts `SoundState` only and uses a versioned URL fragment. It structurally excludes private ProfileState, guided evidence, correction curves, profile names/notes/ids, local preset-library metadata, and UiState. Personal calibration leaves local storage only through the separate explicit personal export action; import stores a new record unselected/unapplied and never creates or resumes audio.

The service worker caches application assets, including the exact emitted worklet version set, but not local user/profile state.

## DSP, safety, and browser evidence

Issue #19 established the release-candidate browser matrix:

- Chromium: complete Playwright suite;
- Firefox: production-build engine-neutral core journey;
- Playwright WebKit: the same core journey as Safari-class automation.

CI characterization covers 44.1, 48, and 96 kHz. The issue-#19 hosted reference observation reported 12.00×, 11.16×, and 5.61× offline realtime respectively, with expected high-band modes and zero final-guard interventions in ordinary reference renders. Those figures are machine-local evidence, not minimum-device guarantees.

Deterministic DSP validation remains authoritative for spectral slopes, reconstruction, stereo correlation/RMS balance, animation bounds, gain safety, finite output, and final-guard behavior. No v0.1 threshold is relaxed by the release-hardening pass.

Calibration copy continues to state that relative perceived-level matching is not an audiogram, diagnostic hearing test, dB HL result, or calibrated acoustic SPL measurement. Independent L/R differences remain non-diagnostic playback-chain observations.

## Accessibility release state

Issue #18 established keyboard/focus semantics, fixed Stop reachability, critical 44 px targets, narrow portrait/landscape containment, deliberate ten-band horizontal scrolling, and reduced-motion presentation without changing audio animation.

Automated evidence does not claim human screen-reader certification. A current desktop screen-reader spot check remains a pre-tag operator gate. Likewise Playwright WebKit is not represented as a completed physical Safari/macOS/iOS check.

## Debug/debt review

Default-branch code search before the release PR found no `TODO`, `FIXME`, or `console.log` markers. Release hardening does not remove intentional diagnostics, characterization reports, or user-visible error reporting merely to make the tree look quiet.

The release PR adds no new runtime dependency and no new product feature; it is limited to version exposure, release tests, documentation/RAG reconciliation, audit evidence, and release mechanics.

## Known release limitations

- Physical current Safari/macOS or iOS/iPadOS remains a manual release spot check; Playwright WebKit is Safari-class engine evidence only.
- A current desktop NVDA or VoiceOver spot check remains manual.
- GitHub Pages requires the documented one-time repository setting selecting GitHub Actions as the Pages publishing source before manual deployment.
- No Greygen source license has been selected; do not label v0.1 open source until the owner explicitly chooses one.
- Greygen cannot determine acoustic SPL or enforce a universal listening exposure level because downstream hardware gain/sensitivity is unknown.

These limitations are explicit release/operator gates or product boundaries; none changes the protected source/audio/provenance semantics of the v0.1 engine.
