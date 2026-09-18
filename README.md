# greygen

A browser-based calibrated spectral-noise generator and psychoacoustic playground.

Greygen is grey noise. The project synthesizes noise locally, exposes a simple ten-band model, and progressively adds deterministic DSP, safe headroom management, power-preserving stereo decorrelation, spectral animation, user calibration profiles, and an advanced continuous-spectrum editor.

## Core principles

- **Local-first audio:** synthesis and calibration remain in the browser; no backend is required for the core product.
- **Deterministic DSP:** seeded sources and pure DSP modules make behavior reproducible and testable.
- **Perceptual, not medical:** calibration is relative to the listener + playback chain and must never be presented as a clinical audiogram or calibrated SPL measurement.
- **Safe by construction:** bounded boosts, deterministic safety pre-gain, metering, and a final overflow guard protect digital headroom; calibration must not encourage chasing inaudible frequencies with ever-higher gain.
- **Clean-room implementation:** do not copy myNoise source, audio, artwork, branding, preset data, or copyrighted standards tables.
- **Repository as ground truth:** architecture, decisions, validation contracts, and autonomous-agent instructions live under `docs/RAG/` and are updated with implementation changes.

## Stack

- TypeScript + Vite
- React for UI/state composition
- Web Audio API + `AudioWorklet` for real-time DSP
- Pure TypeScript DSP core shared by the AudioWorklet and unit/offline tests
- Vitest for deterministic DSP/unit tests
- Playwright for browser/integration smoke tests
- Biome for linting and formatting
- GitHub Actions for typecheck, lint/format verification, tests, build, and browser smoke checks

## Development

Greygen currently pins Node.js 24.21.0 through `.nvmrc`. Use the repository lockfile and `npm ci` for reproducible installs.

```bash
npm ci
npm run dev
```

The development server prints the local URL. The primary generator exposes White/Pink/Brown/Grey selection, ten keyboard-operable band offsets, master digital level, **power-preserving stereo width/correlation**, deterministic **Drift/Breathe/Wander/Orbit spectral animation**, local named sound presets, privacy-safe backend-free share links, private local playback-calibration profiles with Off/Balanced/Full application, a **guided linked or independent-L/R perceived-level calibration wizard**, lifecycle transport, digital Peak/RMS/headroom telemetry, an optional lazily loaded live spectrum/runtime diagnostics panel, and explicit runtime 16 kHz degradation state. Built-in colour presets own only spectral target fields; named user presets snapshot the complete generic SoundState. Normal share links use a compact versioned URL fragment containing sound settings only: private playback/calibration profiles, guided measurement evidence, profile names/notes, local preset names, and UI preferences are excluded by construction.

Animation has bounded depth/speed controls and optional mean-band-power normalization; it is seeded and sample-clocked rather than driven by wall time or random walks. Calibration correction is a private ProfileState layer before deterministic safety pre-gain: Balanced applies a conservative deterministic transform, Full is bounded explicit opt-in, and Off retains the profile while bypassing correction. Profiles can remain **linked/symmetric** or carry independent left/right measurements. Independent correction is applied to actual output-channel band components—not the internal stereo-decorrelation source streams—and an additional versioned per-band L/R differential guard limits applied asymmetry while worst-channel demand drives shared headroom attenuation. Left/right differences are playback-chain data, not a diagnosis.

The guided workflow uses bounded narrow-band noise against a 1 kHz reference, deterministic non-monotonic test ordering, explicit skip/retest/review, and saves only after the user names and confirms the result. Independent mode measures the left output channel and then the right output channel with clear channel indication and click-smoothed routing; linked mode remains the conservative fallback. Saved guided results default to Balanced. The wizard requires audio to have been started explicitly and a comfortable-level acknowledgement, never raises master automatically, offers immediate calibration silence/abort plus the normal Stop transport, and makes no medical/audiogram/SPL claims.

Private playback-profile management includes rename, optional device/headphone/speaker notes, duplicate, deliberate two-step delete, bypass, and a clearly separate **personal calibration export/import** envelope. This export is intentionally labelled as personal playback/calibration data and is never inserted into ordinary sound share URLs. Import validates and stores a new local profile but does not select/apply it and never creates or resumes audio. The manual linked/independent ten-band profile editor remains available as an advanced path. Current sound, local user presets, private profiles, and UI preferences are versioned local documents. Reload, profile application, profile import, wizard review, or share import never restores Running: choose **Start audio** explicitly to create/resume the browser audio context and initialize the worklet.

### Offline DSP characterization

Issue #16 adds a deterministic developer report over the same pure DSP engine used by the AudioWorklet. It requires no browser or audio hardware and reports spectral slopes, neutral/filter-bank behavior, stereo correlation/RMS balance, safety pre-gain/final-guard activity, animation bounds, and an informational offline realtime factor.

```bash
npm run characterize
npm run characterize -- --sample-rate 44100
npm run characterize -- --sample-rate 96000 --animation orbit --animation-depth 8
npm run characterize -- --json > characterization.json
```

The JSON report is versioned. DSP/statistical fields are deterministic for a fixed engine version/state/seed; wall-time performance and environment metadata are machine-local observations. Characterization supplements the pass/fail validation suite—it does not weaken or replace it. See `docs/RAG/DSP_CHARACTERIZATION.md`.

### Verification commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Useful local commands:

```bash
npm run format
npm run test:watch
npm run preview
npm run characterize -- --help
```

`npm run test:e2e` starts the production preview server automatically through Playwright configuration. CI installs Chromium for the current worklet/browser lifecycle gate; the broader cross-browser matrix is a later roadmap milestone.

## RAG / development ground truth

Start with:

1. `docs/RAG/PROJECT_CHARTER.md`
2. `docs/RAG/PLAN_REVIEW.md`
3. `docs/RAG/ARCHITECTURE.md`
4. `docs/RAG/DSP_VALIDATION.md`
5. `docs/RAG/SPECTRAL_TARGETS.md`
6. `docs/RAG/AUDIO_LIFECYCLE.md`
7. `docs/RAG/GAIN_SAFETY.md`
8. `docs/RAG/STEREO_WIDTH.md`
9. `docs/RAG/SPECTRAL_ANIMATION.md`
10. `docs/RAG/GENERATOR_UI.md`
11. `docs/RAG/STATE_PERSISTENCE.md`
12. `docs/RAG/PRESETS_SHARING.md`
13. `docs/RAG/CALIBRATION_PROFILES.md`
14. `docs/RAG/GUIDED_CALIBRATION.md`
15. `docs/RAG/ANALYZER_DIAGNOSTICS.md`
16. `docs/RAG/DSP_CHARACTERIZATION.md`
17. `docs/RAG/PSYCHOACOUSTICS_SAFETY.md`
18. `docs/RAG/UX_STATE.md`
19. `docs/RAG/AGENT_PLAYBOOK.md`
20. `docs/RAG/ROADMAP.md`

The GitHub issues are executable work packets. Each issue must be completed end-to-end: implementation, tests, documentation updates, PR, automated checks, review of failures, and merge only after required checks pass.
