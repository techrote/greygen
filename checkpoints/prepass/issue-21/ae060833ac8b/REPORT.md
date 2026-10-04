# Results — Greygen #21 target representation micro-prepass

All values below are deterministic **target-space** dB errors, not measured sound, audio RMS, acoustic SPL or perceptual error. Baseline and provenance: `SOURCE_FINDINGS.md`. Definitions and proofs: `EQUATIONS.md`.

## Main results

| Case | Maximum curve error (dB) | Log-frequency RMS error (dB) | Return decision |
|---|---:|---:|---|
| white_neutral | 0 | 0 | silent-numerical |
| pink_neutral | 0 | 0 | silent-numerical |
| brown_neutral | 0 | 0 | silent-numerical |
| grey_neutral | 0 | 0 | silent-numerical |
| pink_fractional_controls | 6.5014660322e-13 | 2.16801684409e-13 | silent-numerical |
| brown_alternating_bounds | 4.19220214098e-13 | 1.4065152707e-13 | silent-numerical |
| white_narrow_notch_24db | 23.8415075624 | 0.630394648402 | confirm-approximation |
| notch_below_numerical_budget | 4.9669800661e-07 | 1.31332218438e-08 | silent-numerical |
| notch_above_numerical_budget | 1.98679223422e-06 | 5.25328873675e-08 | confirm-approximation |
| white_bounded_step | 24 | 4.34429606948 | confirm-approximation |
| white_both_domain_edges | 23.8913977083 | 0.58397684949 | confirm-approximation |

All four neutral presets are represented exactly in this run. The target-only fits over 125 Hz..8 kHz were 0, -3.0103 and -6.0206 dB/octave for White, Pink and Brown respectively. These do not constitute newly rendered PSD evidence.

The 160 generated simple states returned with at most **1.5916157281e-12 dB** control error. Named-case projection/re-expansion idempotence and JSON round trips passed. Ten invalid-input cases were rejected.

## Narrow-notch counterexample

A White-based single edited knot at x=5.5 creates a -24 dB triangular notch at **1414.213562 Hz**. Its support is **1/48 octave**, about **20.422222 Hz** wide; the adjacent 1/96-octave grid nodes are zero. Every one of the ten band centres remains zero. A centre-only comparison therefore reports zero change while losing the entire 24 dB notch.

The chosen whole-curve least-squares fit returns approximately -0.158494 dB at 1 kHz and -0.158490 dB at 2 kHz, with small compensating offsets elsewhere. At the notch centre it is only -0.158492 dB deep. Its full-field error is **23.8415075624 dB maximum** and **0.6303946484 dB log-frequency RMS**. Explicit approximation confirmation is required. A whole-field slope change alone is also inadequate: this target changes the 125 Hz..8 kHz fitted slope by only about -0.00691 dB/octave.

Unrepresentability is not a numerical accident. On [1 kHz,2 kHz], every ten-band curve is affine in log frequency. A curve zero at both endpoints must be zero throughout, and thus cannot also have -24 dB at their log midpoint. More strongly, any such affine approximation has maximum error at least 12 dB across those three locations: keeping both endpoints within e dB keeps the midpoint within e dB of zero, so its notch error is at least 24-e; hence e >= 12. The least-squares result is not the minimax result, but no ten-band fit can make this notch numerically lossless.

## Independent numerical cross-check

Two-point Gauss quadrature plus SciPy 1.17.0 `lsq_linear(method='bvls', lsq_solver='exact')` checked **43 cases**. Maximum disagreement with the standard-library solver: **1.587174836e-12 dB**. The independently assembled Gram matrix differed by at most 1.33226762955e-15; its smallest eigenvalue was 0.348368013703 and 2-norm condition number 3.06183020408. All assertions passed.

The independent solver is an optional offline oracle, not a proposed production dependency. It verifies the projection problem, not the current TypeScript DSP.

## Two consequential negative controls

**Bounds:** on the dense +/-24 dB step, solving unconstrained and then clipping gives 4.3656776266 dB RMS, versus 4.3442960695 dB for the true bounded optimum. Bounds must be part of the fit.

**UI quantization:** rounding the otherwise exactly representable fractional Pink state to 1 dB creates **0.5 dB maximum** and **0.2602426084 dB RMS** error. The model should retain fractions; any actual rounding must be tested after the transformation and flagged.

## Silent-return policy

For a supported valid curve and converged solve, require `maxAbsDb + 1e-10 <= 1e-6`. The two shallow-notch probes lie on opposite sides: approximately 4.967e-7 dB returns silently; approximately 1.987e-6 dB requires confirmation. This deliberately conservative budget describes numerical preservation, not an audible/inaudible boundary. No user experiment or auditory threshold is fabricated.

## Scope limits

No old/new audio rendering, browser/AudioWorklet integration, IIR/FIR/FFT selection, smoothing or safety implementation, or complete repository test suite was performed. The mathematics proves ideal representation round trips and exposes the target/realization and UI-quantization boundaries; it does not prove that any existing or future engine renders these curves exactly.
