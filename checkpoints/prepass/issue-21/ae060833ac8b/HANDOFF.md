# HANDOFF — Greygen #21 representation micro-prepass

## Status and decision

Completed representation-only mathematical prepass against
`00ab20354d2ba2af7ca41147f01f324c70c74006` on 2026-10-04.
GitHub remained read-only; no branches, commits, issues, comments, PRs or workflow
actions were created or changed. These files are a local proposal/evidence packet,
not an accepted change to canonical repository instructions.

**Recommended representation freeze:** 958 canonical log-frequency/dB knots,
20 Hz..20 kHz, 96 intervals/octave, piecewise-linear interpolation, endpoint hold,
immutable base preset identity/revision, and a +/-24 dB dense offset envelope.
Lift existing ten target samples plus offsets with clamped linear hats. Return
with a unique equal-octave integrated box-constrained least-squares projection.
Certify loss using the full continuous curve's exact maximum nodal dB error.

**Recommended return policy:** silently return only within a numerical 1e-6 dB
maximum-error budget, with a 1e-10 dB guard and a successful bounded solve;
otherwise show approximation and require confirmation. This is numerical
preservation, not an audibility claim. Do not substitute an RMS-only test or the
existing rendered-PSD slope tolerance. Preserve unedited simple state exactly
without a needless projection, and retain an advanced original until a confirmed
conversion commits. Bind previews to the source edit revision to reject stale
confirmations.

## What actually ran

- Main reference: CPython 3.13.5, standard library; exact cell-integral objective,
  fixed-order constrained coordinate solve, full-field residual metrics.
- 11 named cases: all four current neutral presets, fractional Pink controls,
  alternating-bound Brown controls, 24 dB narrow notch, two numerical-threshold
  notch probes, a bounded step and both finite-domain edge edits.
- 160 deterministic generated valid ten-band round trips, seed 21004.
- 10 invalid-input rejection cases.
- Projection/re-expansion idempotence and serialized node-value round trips for
  all named cases.
- Independent two-point-Gauss assembly plus SciPy 1.17.0 BVLS/dense solver on
  43 cases (11 named and 32 dense random targets). Maximum control disagreement
  was about 1.59e-12 dB. All assertions passed.
- A negative control demonstrates that fitting without bounds then clipping is
  not the constrained optimum. Another demonstrates that 1 dB rounding adds
  0.5 dB maximum loss to an otherwise representable state.

See `REPORT.md` and the retained JSON/logs for exact numbers and qualifications.

## Reproduce

From this directory, with Python 3.10 or later:

```sh
python prototype.py --out rerun
```

The core prototype has no third-party dependencies. To reproduce the independent
oracle in a separate environment, use the actually tested dependency versions:

```sh
python -m pip install numpy==2.3.5 scipy==1.17.0
OPENBLAS_NUM_THREADS=1 python crosscheck_scipy.py --out rerun
```

The cross-check reads `curves.csv` and `results.json` produced by the first
command. `OPENBLAS_NUM_THREADS=1` is a POSIX environment setting; on other systems
set that environment variable by the shell's normal mechanism. The new `rerun/`
folder keeps original evidence intact. Float-close reproducibility across
platforms is required; bit-identical solver output is not asserted.

## Smallest subsequent implementation sequence

1. Add a pure target-representation module adjacent to `src/audio/dsp/spectra.ts`
   implementing `contract.ts`, canonical grid/base lookup, strict validation,
   expansion, projection and complete-curve loss reporting. Reuse
   `NOMINAL_BAND_CENTERS_HZ`, `getSpectralTarget()` and existing offset limits.
   Do not reinterpret `resolveSpectrumState()` gains as samples. Port these
   fixtures before any audio integration.
2. Extend sound-state/preset persistence with a discriminated spectral form and
   explicit migration from SoundState v3. Add a versioned sharing representation
   rather than bypassing the existing v1 ten-offset/2048-character bounds.
   Keep ProfileState/calibration and unrelated sound fields separate. Inspect
   current state/share implementations before editing; this micro-prepass read
   their canonical contracts, not every serializer caller.
3. In the generator/editor boundary, retain exact untouched simple values;
   support fraction-preserving controls, canonical-node edits, honest Modified
   state, non-destructive return preview, source-revision check and explicit
   approximation commit/undo. Certify the final adapter-stored values, not just
   an ideal fit before rounding. Mere view changes must not repeatedly rewrite
   curves or select a different audio realization.
4. Only then let a separate realization investigation consume this target.
   Compare existing and future rendered output using the repository's seeded
   validation/characterization paths; maintain preset meaning, DC bounds,
   44.1/48/96 kHz edge rules, separate correction, smoothing and safety stages.

## Deliberately not done / not claimed

No IIR/FIR/FFT/hybrid selection, engine implementation, audio rendering, browser
or accessibility execution, sample-rate stability tests, real-time performance,
calibrated listening, acoustic safety assessment, or complete repository test
suite was run. Source was read via the connector; there is no local repository
checkout. The target envelope and numerical return budget are proposed
versioned policy, not already accepted Greygen behavior.

This settles the representation/projection proposal within the requested
scope. It does not establish that the existing engine exactly realizes arbitrary
simple interpolated offsets or the new narrow notch, nor that #21 is complete.

## Independent publication

Publish the packet as a clearly labelled research/prepass artifact, retaining
its baseline, equations, prototype, results, source ledger and limitations.
Do not substitute this packet for production implementation or canonical RAG
approval. No further computation or remote write is required to preserve it.
`MANIFEST.sha256` covers every payload file except itself; the external ZIP
hash covers the archive including that manifest. No font/assets or source
checkout are included.
