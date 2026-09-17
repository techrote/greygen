# Calibration Profiles and Correction Pipeline

Status: canonical contract for issues #13-#15 calibration profile state, bounded correction application, guided measurement, independent L/R correction, personal portability, privacy, and safety integration.

## Product boundary

Greygen calibration profiles describe **relative perceived-level correction for a listener + playback chain**. They are not audiograms, hearing-loss measurements, calibrated acoustic SPL measurements, or medical tests.

The profile layer is local/private `ProfileState`. It is intentionally outside `SoundState`, user sound presets, and normal share URLs.

Issue #13 established the private profile model and correction pipeline. Issue #14 added deterministic guided narrow-band measurement. Issue #15 adds technically real linked/symmetric and independent left/right correction plus explicit personal-profile management/export/import.

## State ownership and schema history

`ProfileState` schema v2 remains the application envelope:

- versioned local profile records;
- `activeProfileId`, or `null`;
- application mode `off | balanced | full`.

Independent-channel support does **not** require another `ProfileState` envelope version because each generic `LocalProfileRecord` already owns a versioned payload.

Calibration payload history:

- **v1:** one linked ten-band raw curve, no guided evidence;
- **v2:** one linked ten-band raw curve plus optional guided evidence;
- **v3:** explicit `channelMode: linked | independent`, left/right raw curves, optional sanitized device/playback note, and linked or per-channel guided evidence.

Payload v1/v2 remains readable and migrates **in memory** to v3 linked mode. Greygen does not reinterpret historical linked data as independent-ear data. Unsupported future payload versions are rejected rather than guessed.

The default reference is the 1 kHz nominal band, index 5.

## Raw profile data

Each channel curve contains exactly ten raw relative offsets. A known value is finite and clamped to `[-24,+24] dB`; a non-reference band may be `null` for skipped/unknown. The reference band must be known.

Linked mode stores one effective measurement symmetrically: right raw data is canonicalized to the left raw data. Independent mode retains distinct left and right raw measurements.

A skipped/unknown band remains `null` in personal profile data and contributes **0 dB correction** when applied. Greygen does not fabricate an interpolation or diagnostic inference.

Optional profile notes are intended for playback-chain context such as headphones, speakers, DAC, fit, or room. Names and notes are normalized/sanitized as plain text data, length-bounded, and never interpreted as HTML.

## Guided evidence

Guided evidence uses method `guided-narrow-band-v1` and records only data needed to make the result reproducible/auditable:

- wizard version;
- deterministic unsigned seed;
- actual randomized nine-band order;
- judgement count;
- retest count;
- outcome;
- confidence;
- skipped flag.

Linked profiles may hold `linkedMeasurement`. Independent profiles may hold separate `leftMeasurement` and `rightMeasurement`. Evidence is structurally validated before use. No demographic, diagnosis, medical-history, or unnecessary health data is collected.

## Application modes

The existing transforms apply **per channel**.

### Off

The profile remains stored/selected but both applied channel curves are ten zeros.

### Full

For each channel independently:

1. subtract that channel's stored reference-band value so its reference is 0 dB;
2. clamp known relative values to `[-24,+24] dB`;
3. map skipped bands to applied 0 dB.

Full is explicit opt-in.

### Balanced

For each channel independently:

1. compute Full while retaining unknowns through the transform;
2. multiply known values by **0.60**;
3. perform one local smoothing pass with center weight `0.50` and neighbor weights `0.25 / 0.25`;
4. omit unknown neighbors and renormalize remaining weights;
5. leave an unknown center unknown rather than filling it;
6. re-anchor the transformed reference to 0 dB;
7. clamp known values to `[-12,+12] dB`;
8. map unknowns to applied 0 dB.

Balanced remains the default for newly saved/selected profiles.

## Independent-channel safeguard

Independent measurements can contain large left/right differences for many reasons: transducer mismatch, fit/coupling, room geometry, device routing, temporary conditions, listener perception, or measurement uncertainty. Greygen does not know which cause applies and does not interpret asymmetry diagnostically.

Issue #15 therefore adds a separate **versioned engineering safeguard** at the applied-correction boundary:

`MAX_INTERCHANNEL_CORRECTION_DIFFERENCE_DB = 20*log10(2) = 6.020599913... dB`

For each band, applied left/right correction may differ by at most 6.0206 dB — a maximum **2:1 amplitude-gain ratio**. If a requested transformed pair exceeds that span, the pair is symmetrically contracted around its midpoint and remains subject to the global ±24 dB calibration bound.

This number is **not** a medical safety threshold and is not evidence that a 6 dB hearing asymmetry is safe, normal, abnormal, or clinically meaningful. It is a conservative software guard against allowing one browser output channel to receive arbitrarily more correction than the other from an uncertain subjective procedure. Changing it requires an explicit versioned engineering decision plus validation.

Linked/symmetric mode remains available at all times as the conservative fallback.

## DSP placement

Independent correction is applied to **actual output-channel band components**, not to Greygen's decorrelation source streams.

At stereo width > 0 Greygen internally uses two deterministic decorrelated source/filter-bank streams. Those streams are not ears. For every band the engine first forms the normal left/right stereo mixture, then multiplies the left output-band component by the left calibration gain and the right output-band component by the right calibration gain.

The level path is therefore conceptually:

1. seeded source normalization;
2. nominal target;
3. user band offsets;
4. spectral animation offsets;
5. stereo width/component mixing;
6. **per-output-channel calibration correction**;
7. deterministic safety pre-gain;
8. master;
9. final guard/metering.

Linked correction uses identical channel gains, preserving the previous linked spectral intent. Legacy `AudioEngine.setCalibrationBandOffsetsDb()` remains a compatibility API and maps one curve to both channels. The explicit API is `setCalibrationChannelOffsetsDb(left, right)` through protocol v6 `set-channel-calibration`.

## Smoothing and headroom

Left and right calibration gains use the same 40 ms one-pole control smoothing as other audible gain components. Profile selection, Off/Balanced/Full, linked/independent changes, and bypass do not hard-step output-band gains.

Deterministic safety pre-gain evaluates both requested output-channel response curves and uses the **more demanding channel**. Positive correction therefore reduces shared safety gain before master rather than silently consuming digital headroom in one ear. The final sample guard remains emergency-only.

The guided calibration stimulus is runtime-only. Protocol v6 can route it to `both`, `left`, or `right`; channel masks and normal/stimulus wet transitions are smoothed over 40 ms. In independent guided mode the non-target output channel is faded to silence during the test. The user master is never changed automatically.

## Profile management

The calibration surface supports:

- select a local profile;
- Off/Balanced/Full and explicit Bypass;
- linked or independent guided calibration;
- linked or independent manual profile creation;
- optional device/headphone/speaker note;
- rename/update note without changing DSP measurement data;
- duplicate without auto-selecting the copy;
- deliberate two-step delete (`Delete…` then `Confirm delete`);
- bulk local-profile deletion through the existing separate privacy/reset control.

Deleting the active profile bypasses correction safely. Sound reset remains distinct and never deletes profiles.

## Explicit personal export/import

Ordinary sound sharing remains profile-free. Issue #15 adds a separate explicit portability envelope:

- envelope schema version 1;
- kind `greygen-personal-calibration-profile`;
- data class `personal-playback-calibration`;
- profile name;
- canonical calibration payload.

Preparing an export is an intentional UI action and is labelled as personal playback/calibration data. Local record ids are not exported. Export canonicalizes readable historical payloads to the current v3 shape.

Import:

- parses JSON defensively;
- requires the known envelope kind/data class/schema;
- rejects future envelope versions;
- rejects malformed/future calibration payloads;
- canonicalizes/migrates valid historical payloads;
- allocates a new local id;
- stores the imported profile locally;
- does **not** select/apply it;
- does **not** create/resume an AudioContext.

The user must explicitly select the imported profile before it can affect a running engine.

## Privacy

Calibration profiles are personal local data by default:

- stored under `ProfileState`;
- guided evidence and optional device notes remain inside the private profile payload;
- excluded from `SoundState`;
- excluded from named sound presets;
- excluded from ordinary share URL fragments;
- no backend upload in the core product;
- export only through the clearly separate personal-profile path;
- delete/bypass controls remain available.

## Validation invariants

Issue #15 extends the existing #13/#14 gate with:

- v1/v2 payload migration to linked v3;
- linked Off/Balanced/Full symmetry;
- independent per-channel transforms;
- raw independent measurements retained without silently rewriting them to the inter-channel cap;
- applied per-band L/R difference never exceeding 6.0206 dB;
- channel state rejecting malformed/non-finite/out-of-bound inputs;
- output-channel DSP evidence showing L/R correction is real rather than source-stream relabelling;
- legacy linked construction output-equivalent to explicit linked channel state;
- worst-channel correction driving deterministic safety pre-gain;
- channel-routed/smoothed guided stimulus;
- linked and independent deterministic guided state-machine paths;
- rename/note/duplicate/delete/bypass profile management;
- explicit personal export/import roundtrip and malformed/future rejection;
- normal share URLs excluding profile names, notes, ids, measurements, and corrections;
- import not selecting a profile and not starting audio;
- full existing transport/share/preset/stereo/animation/analyzer/calibration regression suite.

Do not weaken gain-safety, DSP, or privacy thresholds merely to make validation pass.
