# Assessed source and compatibility findings

Repository: `techrote/greygen`, issue **#21**, “Post-MVP: continuous
high-resolution spectral model and editor”. Issue read through the GitHub
connector on 2026-10-04; it was open and reported zero comments.

Assessed HEAD commit: `00ab20354d2ba2af7ca41147f01f324c70c74006`.
The commit endpoint identifies its root tree as
`3fa675d115fc02b4a9dbb4bea2abf04fc88e0c66`, dated 2026-09-18,
“Harden Greygen v0.1 release readiness (#44)”. That commit message closes #20.
This prepass does not independently re-run #20's release checks.

All repository source was read through GET/read connector actions. An attempted
local public clone failed because github.com could not resolve in the container;
no local checkout was obtained. The artifact includes derived contract facts,
source locators and observed Git blob identities, **not** a copy of the complete
repository and not a claim of locally re-hashing source blobs.

## Source ledger

All file locators below are relative to the assessed commit. Immutable full URLs
and the Git blob IDs observed in connector tree results are in `sources.json`.

| Source | Locator | Finding used |
|---|---|---|
| `src/audio/dsp/filterBank.ts` | `NOMINAL_BAND_CENTERS_HZ`, `BAND_COUNT` | Exact centres are 31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz. Do not use rounded UI labels as frequency knots. |
| `src/audio/dsp/spectra.ts` | `SpectralTarget`, `SpectrumState`, `powerLawTargetDb`, `greyPracticalTargetDb`, `createSpectrumState`, `resolveSpectrumState` | Public target samples and user offsets are separate from engine compensation. White/Pink/Brown target slopes are literal 0/-3.0103/-6.0206 dB/octave. Offsets are finite real numbers in [-24,+24], not integers. Target schema, preset revision and realization version are each 1. |
| `src/features/generator/uiModel.ts` | `BAND_STEP_DB`, `setUserBandOffset`, `formatSignedDb`, `isModifiedPreset` | UI step is 1 dB; setter retains supplied fractional values. Display currently uses one decimal place and treats magnitudes under 0.05 as zero for formatting. Modified uses exact nonzero offsets. Dense edits must affect Modified state even when all centre samples remain zero. |
| `docs/RAG/SPECTRAL_TARGETS.md` | “Target model versus filter realization”, “Colour targets”, “Ten-band realization v1”, “PSD validation method”, “Brown low-frequency invariant” | Pink/Brown's compensated engine tilts are -3.85/-20 dB/octave, NOT target slopes. Existing acceptance fits rendered PSD over 125 Hz..8 kHz; Brown must remain bounded near DC. |
| `docs/RAG/DSP_VALIDATION.md` | “Noise-colour targets”, “Filter bank validation”, “High-band/Nyquist rule”, “Changing validation thresholds” | Rendered slope tolerance is +/-0.5 dB/octave, not a curve round-trip tolerance. Neutral response validation uses 20 Hz..min(20 kHz,0.45 fs). Sample rates 44.1/48/96 kHz and the edge/hidden-residual distinctions remain relevant to later realization validation. |
| `docs/RAG/DSP_CHARACTERIZATION.md` | “Execution model”, “Report schema”, “Interpretation rules” | Existing characterization renders the actual pure TypeScript DSP. This Python prepass does not replace it and its target-curve slopes are not new measured audio results. |
| `docs/RAG/PRESETS_SHARING.md` | “Built-in colour preset ownership”, “Normal share format v1”, “Defensive normal-share import” | Built-ins own targetId and offsets, not master/width/seed/calibration. Share format currently contains ten offsets and rejects payloads over 2048 characters. A 958-point curve cannot silently be stuffed into that contract. |
| `docs/RAG/STATE_PERSISTENCE.md` | “SoundState schema v3”, “Validation and recovery”, “Domain separation”, “Future-schema behavior” | Current SoundState has ten offsets; private ProfileState is separate. Need explicit future schema migration, unknown-version protection and sound-only serialization. New representation parse failures must not destroy retained source data through legacy recovery defaults. |

## Important boundary conclusions

**Preserve intent, not compensated coefficients.** Brown's internal -20 dB/octave
weighting must not become the dense target; the actual target reaches -54.1854 dB
at 16 kHz relative to its 31.25 Hz reference before user offsets.

**Do not infer a preset from a fitted curve.** Preset identity fixes how offsets
map back into the existing engine and how future preset revisions are interpreted.
The high-resolution document retains that identity; applying a different named
preset is a separate explicit user action.

**State fidelity is not waveform fidelity.** The proposed expansion defines a
stable ideal target. The old complementary bank's overlapping components do not
make target interpolation identical to its rendered frequency response. No
rendered old/new equality or #21 audio acceptance is claimed here.

**The UI must represent fractions and advanced modifications honestly.** Do not
round the mathematical answer using `BAND_STEP_DB`; keep that as a control
interaction step. A future advanced modified indicator must examine the dense
curve against its base, not merely the ten centre values or projected offsets.
Existing untouched simple values should not acquire tiny numerical nonzero
Modified flags just because a view opened and closed.

**Calibration remains outside this boundary.** No private profile or correction
is an input to the prototype or proposed target document. Animation, master,
width, source seed and safety stages are likewise not projected or captured as
part of a static edit.

## External primary numerical reference

SciPy official `scipy.optimize.lsq_linear` reference:
https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.lsq_linear.html

Consulted for the bounded linear least-squares formulation and independent BVLS
solver semantics. The executed environment used SciPy **1.17.0**, not the current
web manual's version. Its actual solver version and results are recorded in
`results/crosscheck.json`. SciPy is an optional independent test oracle here,
not a proposed browser or real-time dependency. The main prototype requires
only Python's standard library and derives its own objective/integration.
