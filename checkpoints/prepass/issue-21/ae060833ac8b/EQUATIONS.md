# Greygen #21: representation and projection contract

Proposal `logdb96-v1`, 2026-10-04. Mathematical micro-prepass only.
Assessed repository commit: `00ab20354d2ba2af7ca41147f01f324c70c74006`.
Source locators and observed Git identities are in `SOURCE_FINDINGS.md` and `sources.json`.

## 1. What is being represented

Represent requested **relative PSD level in dB**, not filter-component gains,
measured output, per-octave integrated power, loudness, acoustic SPL, calibration,
master gain, limiter gain, or animation's current instantaneous offset.

For a reference white PSD S_ref, target h means S_target(f)/S_ref = 10^(h(f)/10).
This fixes the vertical reference: do not normalize by a maximum, mean, RMS, or
power integral on every edit or projection. A constant +c dB edit remains +c dB.
The original Grey preset's one-time normalization is part of its revision-1
base definition, not an ongoing normalization operation.

The **preset identity and revision remain semantic data**, not a label inferred
from curve shape. Different preset-plus-offset states can have similar targets
but different existing engine realizations. Never choose a new preset simply to
obtain a smaller projection error. A curve alone is not a complete legacy state.

## 2. Canonical abscissae and interpolation

Use x = log2(f / 31.25 Hz). The ten exact control locations are x_i = i,
i = 0,...,9, corresponding to:

    31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz.

The canonical finite domain is [20, 20000] Hz. Let

    a = log2(20/31.25) = -0.6438561897747247
    b = log2(20000/31.25) = 9.321928094887362
    X = sorted({a,b} union {j/96 : j = -61,...,894}).

This gives **958 knots**, with at most 1/96 octave between knots and both domain
endpoints present. Every ten-band control location is a knot. `results/grid.json`
freezes the binary64 coordinates; `prototype.py` uses literal binary64 endpoint
constants instead of regenerating logarithms. Frequencies shown in CSV are
calculated display values; indices and canonical x values define the geometry.

Between consecutive knots, linearly interpolate **dB against x**, not amplitude
against Hz. Beyond the finite domain, hold the nearest endpoint; at DC use the
low-frequency limiting value without attempting log2(0). This is a target
extension policy, not a new crossover or filter design. In particular it does
not claim to reproduce the existing 96 kHz hidden ultrasonic residual.

The stored target and projection do not change with sample rate. Renderer
validation/feasibility near Nyquist remains a separate, explicitly reported
question. Never silently delete target nodes just because a device cannot
currently realize them. The existing 44.1 kHz response-validation upper bound
is 0.45*44100 = 19845 Hz; the stored 20 kHz endpoint is not a new claim of
validated audio performance.

## 3. Ten-band expansion E_p

For preset p, obtain the existing revision-1 ten target samples t_p,i.
White/Pink/Brown use the literal slopes in `spectra.ts`:

    t_white,i = 0
    t_pink,i  = -3.0103 i
    t_brown,i = -6.0206 i.

Grey uses the existing ten samples from `greyPracticalTargetDb()`; do **not**
re-evaluate its generating analytic formula at every new knot, since that would
silently choose different between-band semantics for the new expansion.

Define ten hat functions phi_i(x): on [i,i+1], phi_i = i+1-x and
phi_(i+1) = x-i, with all other hats zero. For x <= 0 let phi_0=1;
for x >= 9 let phi_9=1. They form a nonnegative partition of unity.

For current offsets u_i in [-24,+24] dB:

    T_p(x) = sum_i phi_i(x) t_p,i
    E_p(u)(x) = T_p(x) + sum_i phi_i(x) u_i
    h_k = E_p(u)(X_k).

Thus expansion is exact piecewise-linear interpolation of existing target
samples plus offsets, with flat edge extensions below 31.25 Hz and above
16 kHz. Pink/Brown retain their slopes exactly in the accepted 125 Hz..8 kHz
interior target range. Brown has a finite low-frequency limit rather than a
power-law singularity at DC.

This is an explicit **new target-space meaning for interpolated user offsets**.
Today `resolveSpectrumState()` applies offsets to compensated component gains;
it does not prove that the rendered PSD changes by this interpolated curve.
Target-space round trips do not establish waveform equivalence across engines.
Keep the old state/realization available for compatibility comparisons.

## 4. An advanced edit

The authoritative representation contains 958 target dB values, grid/schema
identity, relative-PSD units, edge policy, and base preset schema/id/revision.
`contract.ts` proposes the boundary types. `results/notch-target.json` is a
complete serialized example accepted by the prototype.

One edit is an atomic `replaceNodes([(canonicalIndex, targetDb), ...])` operation.
Indices must be unique integers in range; values must be finite, non-Boolean
numbers. All edits validate before committing; invalid edits leave the original
unchanged. No gain realization, smoothing, normalization, or lossy return
projection is performed by this operation.

For this first representation version retain the existing offset budget at
higher resolution:

    -24 <= h_k - T_p(X_k) <= +24  dB.

This is a proposed **target-edit envelope**, not proof of safe playback or a
filter-bank gain bound. Since both curves are linear on each cell, checking
knots bounds the complete continuous offset as well. Master, calibration,
animation, safety pre-gain and final limiting remain separate stages/state.

Keyboard/numeric edits address canonical nodes directly. A later pointer
adapter must snap x to the nearest canonical node, breaking exact ties toward
the lower index, then display the selected actual frequency. The canonical
model never promises arbitrary sub-grid resolution. Importing/resampling a
free-frequency drawing is a separate approximation requiring its own preview;
there is no hidden continuous curve between the stored knots.

## 5. Back-projection P_p: bounded integrated least squares

Hold the base preset and all unrelated state fixed. For a valid high-resolution
curve h, define the return offsets as the unique minimizer

    u* = argmin_{u in [-24,+24]^10}
         integral_a^b [h(x) - T_p(x) - sum_i phi_i(x)u_i]^2 dx.

This gives equal weight per octave, not equal weight per linear-Hz bin, per
pixel, or per arbitrary sample count. It is a target-shape approximation, not
a perceptual or energy-preserving optimum. Least squares determines the
candidate; a separate maximum-error certificate determines whether silently
returning that candidate is permitted.

Let r = h - T_p at the fine nodes. For two nodal linear curves v,w, the exact
cell integral is

    integral_{X_k}^{X_(k+1)} v(x)w(x) dx
      = dx/6 * (2 v_k w_k + v_k w_(k+1)
                + v_(k+1) w_k + 2 v_(k+1) w_(k+1)).

Let B_ki = phi_i(X_k), and let M assemble these 2x2 cell mass matrices. Then

    G = B^T M B,       q = B^T M r,
    objective = u^T G u - 2 q^T u + constant.

G is positive definite: any nonzero control vector creates a nonzero
continuous piecewise-linear function on an interval of positive length.
Consequently the bounded objective is strictly convex and has exactly one
minimizer. In the unconstrained case u* = G^(-1)q; implementation should solve,
not form an inverse. All valid simple expansions have zero objective at their
original offsets, so uniqueness proves **P_p(E_p(u)) = u** in exact arithmetic.

The prototype uses deterministic coordinate order 0..9, starting at zero:

    u_i <- clip((q_i - sum_(j != i) G_ij u_j) / G_ii, -24, +24).

It requires projected KKT residual

    max_i |u_i - clip(u_i - (Gu-q)_i/G_ii, -24,+24)| <= 1e-12 dB

and fails closed after 10000 sweeps. This is a constrained fit, **not** an
unconstrained fit followed by clipping. An independent SciPy BVLS/SVD route
using two-point Gauss quadrature verifies the same continuous objective.

Equal-octave squared-error fitting can produce small broad positive/negative
compensations around a notch. That is deliberate objective behavior, not an
attempt to preserve the notch. If least-squares residual exceeds the return
budget, the user sees both curves before accepting any such change. The
criterion below is conservative: it may request confirmation even where some
other, non-selected ten-band approximation has a smaller maximum error.

## 6. Complete-curve loss certificate

Re-expand the **actual final offsets to be stored/applied**, after any adapter
quantization or clamping. Let e_k = h_k - E_p(u*)_k. Report

    E_inf = max_k |e_k|
    E_rms = sqrt(sum_k dx/3 *
                 (e_k^2 + e_k e_(k+1) + e_(k+1)^2) / (b-a)).

Both are exact continuous-curve metrics up to floating-point evaluation:
the residual is linear on every fine cell, so its maximum absolute value
cannot hide between knots. This guarantee concerns the canonical curve, not a
sub-grid drawing that was never represented.

The proposed first-release policy is deliberately numerical, not an invented
psychoacoustic audibility threshold:

    silent return iff valid supported metadata, solver converged,
                      and E_inf + 1e-10 dB <= 1e-6 dB.

Otherwise, valid curves require an approximation preview and explicit
confirmation. Invalid/unsupported curves or failed solves are rejected rather
than made silently acceptable by a defaults/clamping path. E_rms is informative
and must never replace E_inf as the acceptance gate. Threshold/version changes
are explicit policy changes and require new evidence; the current audio slope
tolerance of +/-0.5 dB/octave is not a valid return-projection budget.

The 1e-10 guard is an engineering floating-point margin, not a formal interval
arithmetic proof. Cross-language ports must pass the frozen fixtures and
near-threshold tests. Platform-bit-identical solver output is not claimed.
Stored node samples are authoritative; reject unknown grids/preset revisions.

## 7. State transition semantics

Viewing advanced controls does not change audio/state. Preserve the exact
original simple values for an unedited view round trip; avoid a needless
solve/write. The high-resolution document is authoritative after a real
advanced edit. Merely showing a simple approximation must not discard it.

Returning after an edit computes a projection preview bound to the current
source revision. A silent numerical return can use the certified candidate.
A lossy return offers explicit Convert (discard details with undo retained)
or Cancel/Keep advanced. Confirmation for a stale source revision is invalid.
After committing conversion store exactly E_p(u*) as the new simple curve;
do not retain a hidden, active notch under simple controls. Repeated mere view
switches must not accumulate tiny conversions. No automatic preset selection,
master compensation, calibration baking, or animation freezing is permitted.

The existing UI's `BAND_STEP_DB = 1` is an interaction step, not a state-schema
integer constraint. Preserve fractional projected values in state and provide
honest numeric display/editing; rounding to 1 dB on return is an additional
lossy transformation which must be re-certified. The prototype includes a
negative control showing 0.5 dB peak error from such rounding.
