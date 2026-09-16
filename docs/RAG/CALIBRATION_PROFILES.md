# Calibration Profiles and Correction Pipeline

Status: canonical contract for issue #13 calibration profile state, bounded correction application, privacy, and safety integration.

## Product boundary

Greygen calibration profiles describe **relative perceived-level correction for a listener + playback chain**. They are not audiograms, hearing-loss measurements, calibrated acoustic SPL measurements, or medical tests.

The profile layer is local/private `ProfileState`. It is intentionally outside `SoundState`, user sound presets, and normal share URLs.

The guided measurement workflow is owned by issue #14. Issue #13 establishes the model and real correction pipeline so later measurement can write trustworthy profiles without changing DSP ownership.

## State ownership

`ProfileState` schema v2 contains:

- an array of versioned local profile records;
- `activeProfileId`, or `null`;
- calibration application mode `off | balanced | full`.

Schema v1 profiles migrate with no active profile and mode Off. This preserves pre-calibration renderer behavior and prevents an upgrade from applying correction unexpectedly.

A calibration record uses the generic `LocalProfileRecord` envelope with:

- `kind: calibration`;
- calibration payload schema v1;
- local id and sanitized local name;
- optional sample rate context;
- reference-band index;
- exactly ten raw relative offsets, each finite or `null` for skipped/unknown.

The default reference is the 1 kHz nominal band, index 5 in the ten-band model.

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

Calibration correction is the real stage 5 in Greygen's level path:

1. source normalization;
2. nominal target;
3. user band offsets;
4. animation offsets;
5. **calibration correction**;
6. deterministic safety pre-gain;
7. master;
8. final guard.

The existing `GainStageState.calibrationBandOffsetsDb` is the sole DSP input for this layer. `AudioEngine.setCalibrationBandOffsetsDb()` updates it through the existing versioned `set-gain-stage` worklet command.

No new audio protocol shape is required for issue #13. Calibration changes inherit the existing 40 ms component-gain smoothing, so profile/mode switches do not hard-step filter gains.

## Headroom behavior

Calibration boosts participate in the same deterministic transfer-function response estimate as user and animation offsets **before** safety pre-gain is chosen. Therefore positive correction causes additional protective attenuation rather than silently consuming headroom.

Full correction must never bypass or compensate away safety attenuation. Greygen also never raises the master control automatically to make an inaudible band appear.

The final sample-domain guard remains emergency-only.

## UI behavior

The issue #13 UI is intentionally a minimal pipeline editor, not the guided calibration wizard:

- choose an active local profile;
- choose Off / Balanced / Full;
- create a manual ten-band relative profile for pipeline validation;
- blank a non-reference band to mark it skipped/unknown;
- delete profiles;
- show non-medical/private-local language.

Saving a new profile activates it in Balanced mode. Selecting an existing profile also defaults to Balanced; the user can explicitly choose Full or Off.

Profile application, reload, import, or migration never starts audio. The normal explicit Start lifecycle remains authoritative.

## Privacy

Calibration data is private local state by default:

- stored under the ProfileState persistence document;
- excluded from normal SoundState serialization;
- excluded from normal user sound presets;
- excluded from normal share URL fragments;
- no backend upload in the core product;
- deletion/bypass controls remain available.

Tests use unique private fixture strings and verify normal sound sharing does not contain profile ids/names or calibration state.

## Validation invariants

Issue #13 validation must cover:

- profile payload creation/parsing and name sanitation;
- ProfileState v1 -> v2 migration with correction Off;
- invalid active-profile/mode recovery to safe bypass;
- exact Full transform;
- exact locked Balanced transform;
- global and Balanced correction bounds;
- skipped/unknown behavior;
- Off neutral behavior;
- positive calibration boosts causing stronger deterministic safety pre-gain;
- real AudioEngine calibration updates using the existing gain-stage path;
- persistence/reload without autoplay;
- privacy exclusion from normal share URLs;
- malformed profile storage recovery;
- browser save/select/mode/delete lifecycle.

Do not weaken gain-safety or DSP thresholds to accommodate calibration.
