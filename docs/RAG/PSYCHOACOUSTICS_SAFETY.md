# Psychoacoustics and Safety

Status: canonical product language and safety constraints.

## Core distinction

Greygen can measure and compensate **relative perceived level through the user's current playback chain**. Without calibrated transducers and acoustic measurement hardware it cannot know absolute sound pressure level at the eardrum or in the room.

The relevant chain is approximately:

`digital output -> DAC/device gain -> amplifier -> headphones/speakers -> coupling/room -> listener hearing`

A calibration profile can therefore be useful while remaining non-clinical.

## Terminology

Preferred terms:

- perceived-level calibration;
- relative equal-loudness profile;
- playback profile;
- correction curve;
- listener + device compensation.

Avoid in ordinary product UI unless carefully qualified:

- audiogram;
- hearing test;
- hearing loss measurement;
- dB HL;
- dB SPL;
- medical/diagnostic claims.

## Equal-loudness references

ISO 226:2023 defines normal equal-loudness-level contours for pure tones under specific conditions, including binaural listening in a free progressive field with young otologically normal listeners. Its public abstract covers one-third-octave preferred frequencies from 20 Hz through 12.5 kHz.

Greygen may cite the standard as conceptual background. Do **not** transcribe paid/copyrighted numerical tables into the codebase unless a documented license/reuse basis exists.

A generic Grey preset must therefore be an original practical curve with documented provenance/rationale, not labelled as an ISO-226 reproduction.

## Calibration stimulus

Greygen's implemented guided workflow uses narrow-band noise rather than pure sine tones because it better resembles the generated material and reduces dependence on a single exact sinusoidal resonance. A future advanced mode may expose other stimuli.

Issue #14 implements the default workflow as:

1. user explicitly starts audio, chooses a comfortable overall level, and confirms that level before the wizard can begin;
2. the 1 kHz ten-band component acts as the fixed reference;
3. the other nine bands are tested in deterministic seeded non-monotonic order;
4. reference and test are alternated, and the user judges the test as quieter, about equal, or louder;
5. a bounded 0.5 dB-grid binary search converges in at most seven judgements per search;
6. uncertain/extreme bands can be skipped rather than chased;
7. completed bands can be retested from review;
8. the raw result can be auditioned Off/Balanced/Full without being saved;
9. only an explicit final Save creates a named local playback profile, defaulting to Balanced.

The wizard has explicit calibration silence and Abort controls, while the normal global Stop transport remains authoritative. It never auto-increases master gain.

## Extreme low/high bands

31 Hz and 16 kHz are especially likely to be limited by playback hardware, room/coupling, age/hearing, or sample-rate constraints.

Rules:

- never encourage indefinite gain increase until a band becomes audible;
- show a clear “skip / cannot match” path;
- cap test/correction gain;
- reduce global pre-gain as correction/probe boosts increase;
- warn that inability to match may reflect transducer/room limitations as much as listener factors;
- do not extrapolate skipped bands into a medical conclusion.

The guided UI displays this caveat on both extreme-band steps and preserves a skip as `null` rather than inventing a value.

## Balanced vs full correction

Calibration application supports:

- **Balanced**: deterministic conservative scaled/smoothed form of the measured correction, default;
- **Full**: applies the measured relative correction within safety bounds, explicit opt-in;
- **Off**: stored profile retained but not applied.

The precise Balanced transform is canonical in `CALIBRATION_PROFILES.md` and locked by tests; it is not a hidden subjective tweak. The guided review may audition all three modes before saving, but a saved guided result activates in Balanced mode.

## Left/right calibration

Independent-ear/headphone-channel correction can be useful but carries more risk of large asymmetry. It is not part of the current guided workflow; the current transient stimulus is centred and produces one shared profile curve.

When independent-channel calibration is introduced:

- calibrate channels independently with clear channel indication;
- cap inter-channel correction difference;
- offer linked/symmetric fallback;
- do not interpret asymmetry diagnostically;
- preserve a quick reset/bypass.

## Gain and exposure safety

Digital full scale is not acoustic loudness. The application cannot enforce a universal safe listening level because device gain and transducer sensitivity are unknown.

Nevertheless it must reduce avoidable risk:

- start at conservative digital level;
- require explicit user start;
- require comfortable-level acknowledgement before guided matching;
- do not surprise the user with a large level jump when applying profiles/presets;
- use smoothing for all audible level/stimulus changes;
- automatically compensate digital headroom for positive correction/probe demand;
- provide visible master level and immediate calibration silence plus quick global stop;
- never auto-increase master level to compensate for an inaudible test band;
- persist the user's chosen master level cautiously and consider a startup ceiling if later user testing justifies it.

## Metering language

Allowed examples:

- Peak: -8.2 dBFS
- RMS: -23.1 dBFS
- Safety pre-gain: -6 dB
- limiter/guard activity

Do not label digital meters as SPL, phon, sones, or hearing threshold unless the underlying measurement actually supports that unit.

## Profile metadata

A profile may record:

- name;
- engine/schema version;
- sample rate during calibration;
- reference band;
- raw relative offsets;
- deterministic guided method/version/seed;
- randomized test order;
- per-band confidence, judgement, retest, and skip markers;
- application mode (Balanced/Full/Off).

The current guided workflow deliberately does **not** collect age, diagnosis, demographic data, hearing history, or other unnecessary health information.

## Privacy

Calibration profiles are personal local data. Default behavior:

- local-only storage;
- excluded from normal share URLs and normal sound presets;
- guided measurement evidence remains in the private profile payload;
- exports omit calibration unless explicitly requested;
- deletion/reset available;
- no telemetry upload in the core project.

## UX warning copy requirements

Calibration screens must communicate, in concise form:

- use a comfortable level;
- this is not a medical hearing test;
- results include the playback device/environment;
- skip frequencies you cannot comfortably match;
- never turn the system up aggressively to force an inaudible band to appear.

## Reference URLs

- https://www.iso.org/standard/83117.html — ISO 226:2023 public abstract/scope.
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API — browser audio platform background.
- https://mynoise.net/calibration.php — product-class reference for listener/equipment/environment compensation; use for conceptual comparison only, not source/preset copying.
