# greygen

A browser-based calibrated spectral-noise generator and psychoacoustic playground.

Greygen is a clean-room implementation inspired by the *class* of tools exemplified by myNoise's Grey Noise generator, not a source/assets clone. The project synthesizes noise locally, exposes a simple ten-band model, and progressively adds deterministic DSP, safe headroom management, stereo decorrelation, spectral animation, user calibration profiles, and an advanced continuous-spectrum editor.

## Core principles

- **Local-first audio:** synthesis and calibration remain in the browser; no backend is required for the core product.
- **Deterministic DSP:** seeded sources and pure DSP modules make behavior reproducible and testable.
- **Perceptual, not medical:** calibration is relative to the listener + playback chain and must never be presented as a clinical audiogram or calibrated SPL measurement.
- **Safe by construction:** bounded boosts, automatic pre-gain, metering, and a final safety limiter protect headroom; calibration must not encourage chasing inaudible frequencies with ever-higher gain.
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

The development server prints the local URL. Audio never starts on page load: choose **Start audio** explicitly to create/resume the browser audio context and initialize the worklet. Issue #5 uses a deliberately conservative temporary output attenuation; full gain-safety staging and metering arrive in issue #6.

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
7. `docs/RAG/PSYCHOACOUSTICS_SAFETY.md`
8. `docs/RAG/UX_STATE.md`
9. `docs/RAG/AGENT_PLAYBOOK.md`
10. `docs/RAG/ROADMAP.md`

The GitHub issues are executable work packets. Each issue must be completed end-to-end: implementation, tests, documentation updates, PR, automated checks, review of failures, and merge only after required checks pass.
