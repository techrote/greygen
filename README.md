# greygen

A browser-based calibrated spectral-noise generator and psychoacoustic playground.

Greygen is a clean-room implementation inspired by the *class* of tools exemplified by myNoise's Grey Noise generator, not a source/assets clone. The project will synthesize noise locally, expose a simple ten-band interface, and progressively add deterministic DSP, safe headroom management, stereo decorrelation, spectral animation, user calibration profiles, and an advanced continuous-spectrum editor.

## Core principles

- **Local-first audio:** synthesis and calibration remain in the browser; no backend is required for the core product.
- **Deterministic DSP:** seeded sources and pure DSP modules make behavior reproducible and testable.
- **Perceptual, not medical:** calibration is relative to the listener + playback chain and must never be presented as a clinical audiogram or calibrated SPL measurement.
- **Safe by construction:** bounded boosts, automatic pre-gain, metering, and a final safety limiter protect headroom; calibration must not encourage chasing inaudible frequencies with ever-higher gain.
- **Clean-room implementation:** do not copy myNoise source, audio, artwork, branding, preset data, or copyrighted standards tables.
- **Repository as ground truth:** architecture, decisions, validation contracts, and autonomous-agent instructions live under `docs/RAG/` and are updated with implementation changes.

## Planned stack

- TypeScript + Vite
- React for UI/state composition
- Web Audio API + `AudioWorklet` for real-time DSP
- Pure TypeScript DSP core shared with unit/offline tests
- Vitest for deterministic DSP/unit tests
- Playwright for browser/integration smoke tests
- GitHub Actions for typecheck, lint, tests, build, and browser smoke checks

## RAG / development ground truth

Start with:

1. `docs/RAG/PROJECT_CHARTER.md`
2. `docs/RAG/PLAN_REVIEW.md`
3. `docs/RAG/ARCHITECTURE.md`
4. `docs/RAG/DSP_VALIDATION.md`
5. `docs/RAG/PSYCHOACOUSTICS_SAFETY.md`
6. `docs/RAG/UX_STATE.md`
7. `docs/RAG/AGENT_PLAYBOOK.md`
8. `docs/RAG/ROADMAP.md`

The GitHub issues are executable work packets. Each issue must be completed end-to-end: implementation, tests, documentation updates, PR, automated checks, review of failures, and merge only after required checks pass.
