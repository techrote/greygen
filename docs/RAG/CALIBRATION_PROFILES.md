# Calibration Profiles and Correction Pipeline

Status: canonical contract for issues #13-#14 calibration profile state, bounded correction application, guided-measurement metadata, privacy, and safety integration.

## Product boundary

Greygen calibration profiles describe **relative perceived-level correction for a listener + playback chain**. They are not audiograms, hearing-loss measurements, calibrated acoustic SPL measurements, or medical tests.

The profile layer is local/private `ProfileState`. It is intentionally outside `SoundState`, user sound presets, and normal share URLs.

Issue #13 established the profile model and real correction pipeline. Issue #14 adds the guided narrow-band measurement workflow that produces the same bounded profile type. The guided stimulus/state machine is documented separately in `GUIDED_CALIBRATION.md`.

## State ownership

`ProfileState` schema v2 contains:

- an array of versioned local profile records;
- `activeProfileId`, or `null`;
- calibration application mode `off | balanced | full`.

Schema v1 ProfileState migrates with no active profile and mode Off. This preserves pre-calibration renderer behavior and prevents an upgrade from applying correction unexpectedly.

A calibration record uses the generic `LocalProfileRecord` envelope with:

- `kind: calibration`;
- calibration payload schema v2 for newly created profiles;
- local id and sanitized local name;
- optional sample rate context;
- reference-band index;
- exactly ten raw relative offsets, each finite or `null` for skipped/unknown;
- optional validated guided-measurement evidence.

Calibration payload schema v1 remains readable. It has the same sample-rate/reference/raw-offset fields but no guided measurement evidence; it is interpreted as `measurement: null` rather than rewritten or rejected.

The default reference is the 1 kHz nominal band, index 5 in the ten-band model.

## Guided measurement metadata

A v2 payload may contain private guided evidence produced by `guided-narrow-band-v1`:

- wizard schema/version;
- deterministic unsigned seed;
- actual randomized nine-band test order;
- for every non-reference band: judgement count, retest count, outcome, confidence, and skipped flag.

The evidence is validated structurally before use. Its band order must contain each non-reference band exactly once; evidence must cover that order exactly; skip/outcome/confidence flags must be internally consistent. Malformed evidence causes the calibration record to be rejected safely rather than partially trusted.

No age, diagnosis, medical history, demographic data, or other unnecessary health information is collected by the core guided workflow.

## Bounds and skipped values

Raw known offsets are clamped to the existing global calibration layer bound of `[-24,+24] dB`. The reference band must be known. Other bands may be `null`.

A skipped/unknown band remains unknown in stored profile data and contributes **0 dB correction** when applied. Greygen does not silently invent an interpolated measurement for a skipped band.

This is particularly important at the extreme low/high regions, where transducer, room/coupling, sample-rate, and listener factors can make matching unreliable.

## Application modes

### Off

The profile is retained but all ten applied calibration offsets are zero.

### Full

Full is explicit opt-in. For each known band:

1. subtract the stored reference-band raw offset so the reference is 0 dB;
2. clamp the resulting relative correction to `[-24,+24] dB`;
3. map skipped bands to 0 dB for the applied DSP vector.

Full never escapes the global gain-stage calibration bound.

### Balanced

Balanced is the default for a newly saved/selected calibration profile and is deliberately conservative. It is deterministic:

1. compute the Full relative curve above, retaining skipped bands as unknown during the transform;
2. multiply known values by **0.60**;
3. apply one local smoothing pass using center weight `0.50` and immediate-neighbor weights `0.25 / 0.25`;
4. omit unknown neighbors and renormalize the weights that remain;
5. keep an unknown center band unknown rather than filling it;
6. re-anchor the transformed reference band to 0 dB;
7. clamp known applied values to `[-12,+12] dB`;
8. map skipped bands to 0 dB in the final applied DSP vector.

The constants and exact transform are locked by unit tests. Changes require an explicit calibration behavior/version decision rather than silent retuning.

## DSP placement and smoothing

Saved calibration correction is the real stage 5 in Greygen's level path:

1. source normalization;
2. nominal target;
3. user band offsets;
4. animation offsets;
5. **calibration correction**;
6. deterministic safety pre-gain;
7. master;
8. final guard.

The existing `GainStageState.calibrationBandOffsetsDb` is the sole DSP input for saved/profile correction. `AudioEngine.setCalibrationBandOffsetsDb()` updates it through the versioned `set-gain-stage` worklet command.

Calibration profile changes inherit the existing 40 ms component-gain smoothing, so profile/mode switches do not hard-step filter gains.

Issue #14 additionally introduces a transient runtime-only calibration-stimulus command for narrow-band reference/test playback. That transient state is not saved as profile/sound state; see `GUIDED_CALIBRATION.md`.

## Headroom behavior

Saved calibration boosts participate in the same deterministic transfer-function response estimate as user and animation offsets **before** safety pre-gain is chosen. Therefore positive correction causes additional protective attenuation rather than silently consuming headroom.

The transient guided stimulus also participates in conservative safety accounting while active. Full correction and guided probes must never bypass or compensate away safety attenuation. Greygen never raises the master control automatically to make an inaudible band appear.

The final sample-domain guard remains emergency-only.

## UI behavior

The calibration surface now provides two paths over the same private profile model:

- guided relative perceived-level calibration from issue #14;
- the issue #13 manual ten-band editor as an advanced/manual path.

Common profile controls allow:

- choose an active local profile;
- choose Off / Balanced / Full;
- delete profiles;
- show non-medical/private-local language.

The guided workflow requires explicit running audio plus a comfortable-level acknowledgement, supports skip/retest/review and unsaved Off/Balanced/Full audition, and writes a profile only after explicit Save. A newly saved guided result activates in Balanced mode. Manual saving likewise defaults to Balanced.

Profile application, reload, migration, wizard review, or share import never starts audio. The normal explicit Start lifecycle remains authoritative.

## Privacy

Calibration data is private local state by default:

- stored under the ProfileState persistence document;
- guided measurement evidence remains inside that private profile payload;
- excluded from normal SoundState serialization;
- excluded from normal user sound presets;
- excluded from normal share URL fragments;
- no backend upload in the core product;
- deletion/bypass controls remain available.

Tests use unique private fixture strings and verify normal sound sharing does not contain profile ids/names or calibration state.

## Validation invariants

Across issues #13-#14 validation covers:

- profile payload creation/parsing and name sanitation;
- ProfileState v1 -> v2 migration with correction Off;
- calibration payload v1 compatibility and v2 guided-evidence validation;
- invalid active-profile/mode recovery to safe bypass;
- exact Full transform;
- exact locked Balanced transform;
- global and Balanced correction bounds;
- skipped/unknown behavior;
- Off neutral behavior;
- positive calibration boosts causing stronger deterministic safety pre-gain;
- real AudioEngine calibration updates using the gain-stage path;
- guided transient-stimulus safety/smoothing;
- persistence/reload without autoplay;
- privacy exclusion from normal share URLs;
- malformed profile storage/evidence recovery;
- browser save/select/mode/delete and guided review/save/abort lifecycles.

Do not weaken gain-safety or DSP thresholds to accommodate calibration.
