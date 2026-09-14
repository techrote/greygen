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

Prefer narrow-band noise over pure sine tones for the default guided workflow because it better resembles the generated material and can reduce sensitivity to exact standing-wave/resonance behavior. A future advanced mode may expose other stimuli.

Default guided workflow concept:

1. user chooses a comfortable overall level;
2. 1 kHz (or another stable mid-band) acts as reference;
3. test band and reference are alternated/randomized;
4. user reports which is louder or adjusts until subjectively equal;
5. algorithm converges within bounded correction range;
6. uncertain/extreme bands can be skipped rather than chased;
7. result is saved as a named local playback profile.

The order should not always march monotonically low-to-high; randomization/retests reduce expectation/order effects.

## Extreme low/high bands

31 Hz and 16 kHz are especially likely to be limited by playback hardware, room/coupling, age/hearing, or sample-rate constraints.

Rules:

- never encourage indefinite gain increase until a band becomes audible;
- show a clear “skip / cannot match” path;
- cap test/correction gain;
- reduce global pre-gain as correction boosts increase;
- warn that inability to match may reflect transducer/room limitations as much as hearing;
- do not extrapolate skipped bands into a medical conclusion.

## Balanced vs full correction

Calibration application should support at least:

- **Balanced**: conservative fraction/smoothed form of the measured correction, default;
- **Full**: applies the measured relative correction within safety bounds, explicit opt-in;
- **Off**: stored profile retained but not applied.

The precise Balanced transform must be deterministic and documented (for example correction scaling plus spatial smoothing), not a hidden subjective tweak.

## Left/right calibration

Independent-ear/headphone-channel correction can be useful but carries more risk of large asymmetry.

When introduced:

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
- do not surprise the user with a large level jump when applying profiles/presets;
- use smoothing for all level changes;
- automatically compensate headroom for positive correction;
- provide visible master level and quick mute/stop;
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
- created/updated time;
- engine/schema version;
- sample rate during calibration;
- channel mode;
- reference band;
- raw relative offsets;
- confidence/retest markers;
- application mode (Balanced/Full/Off);
- optional user note naming headphones/speakers.

Avoid collecting unnecessary demographic/health data.

## Privacy

Calibration profiles are personal local data. Default behavior:

- local-only storage;
- excluded from normal share URLs;
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
