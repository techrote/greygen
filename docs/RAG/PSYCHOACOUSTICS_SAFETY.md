# Psychoacoustics and Safety

Status: canonical product language and psychoacoustic safety constraints.

## Core distinction

Greygen can measure and compensate **relative perceived level through the user's current playback chain**. Without calibrated transducers and acoustic measurement hardware it cannot know absolute sound pressure level at the eardrum or in the room.

The relevant chain is approximately:

`digital output -> DAC/device gain -> amplifier -> headphones/speakers -> coupling/room -> listener perception`

A calibration profile can therefore be useful while remaining non-clinical.

## Terminology

Preferred terms:

- perceived-level calibration;
- relative equal-loudness/playback profile;
- playback-chain correction;
- correction curve;
- listener + device compensation;
- linked/symmetric calibration;
- independent left/right playback calibration.

Avoid ordinary product claims that imply:

- audiogram;
- diagnostic hearing test;
- hearing-loss measurement;
- dB HL;
- calibrated dB SPL;
- medical/clinical accuracy.

Independent-channel differences must not be described as left/right hearing loss or as evidence about pathology. A measured asymmetry may come from transducer mismatch, fit, seal/coupling, room geometry, routing, device electronics/gain, listener perception, temporary conditions, or the subjective procedure itself.

## Equal-loudness references

ISO 226:2023 defines normal equal-loudness-level contours for pure tones under specific conditions, including binaural listening in a free progressive field with young otologically normal listeners. Its public abstract covers one-third-octave preferred frequencies from 20 Hz through 12.5 kHz.

Greygen may cite the standard as conceptual background. Do **not** transcribe paid/copyrighted numerical tables unless a documented reuse basis exists.

The built-in Grey target is therefore an original practical curve, not an ISO-226 reproduction.

## Guided calibration stimulus

Greygen uses narrow-band noise from its own ten-band filter bank rather than pure sine tones for the default workflow. This better resembles generated material and reduces dependence on a single exact sinusoidal resonance.

Current workflow:

1. user explicitly starts audio;
2. user chooses and acknowledges a comfortable overall level;
3. user chooses linked/symmetric or independent L/R calibration;
4. 1 kHz is the fixed reference;
5. the remaining nine bands are tested in deterministic seeded non-monotonic order;
6. reference/test are alternated and judged quieter/about-equal/louder;
7. a bounded 0.5 dB-grid binary search terminates in at most seven judgements per band;
8. difficult/extreme bands may be skipped;
9. completed bands may be retested;
10. raw result is reviewed and can be auditioned Off/Balanced/Full without persistence;
11. only explicit Save creates a private named local profile, defaulting to Balanced.

Linked mode presents both output channels together. Independent mode presents the complete left-channel pass, then the complete right-channel pass, with clear channel labelling and the non-target output faded to silence. Channel switching is smoothed.

The wizard never auto-increases master. Calibration silence, Abort, and normal global Stop remain available.

## Extreme low/high bands

31 Hz and 16 kHz are particularly likely to be limited by playback hardware, room/coupling, age/listener factors, and sample-rate constraints.

Rules:

- never encourage indefinite gain increase until a band appears;
- provide `Skip / cannot comfortably match`;
- cap test/correction gain;
- increase protective digital attenuation as correction/probe demand rises;
- explain that inability to match may reflect playback/environment limitations;
- retain skipped values as unknown rather than inventing data;
- never derive a medical conclusion from a skipped/bounded result on either channel.

## Balanced, Full, and Off

Calibration application supports:

- **Balanced:** deterministic conservative scaled/smoothed correction; default;
- **Full:** measured relative correction within software bounds; explicit opt-in;
- **Off:** profile remains stored/selected but correction is bypassed.

The exact transform is canonical in `CALIBRATION_PROFILES.md` and locked by tests.

For independent profiles, both channels are transformed independently and then pass the explicit inter-channel software safeguard. That safeguard is an engineering bound on applied browser-channel gain, **not a clinical threshold** and not a statement about what hearing asymmetry is normal/safe.

Linked/symmetric application remains available as the conservative conceptual fallback.

## Gain and exposure safety

Digital full scale is not acoustic loudness. Greygen cannot enforce a universal safe listening level because downstream gain and transducer sensitivity are unknown.

It must nevertheless reduce avoidable risk:

- conservative startup digital level;
- explicit user Start;
- explicit comfortable-level acknowledgement before guided matching;
- no automatic master increase for an inaudible/difficult band;
- bounded probe/correction values;
- smoothing for profile/channel/stimulus changes;
- deterministic headroom reservation for positive demand;
- worst-demanding L/R channel determines safety attenuation;
- visible master plus calibration silence and global Stop;
- linked fallback and quick bypass;
- no surprise autoplay from persistence, share, profile import, or profile management.

## Metering language

Allowed examples:

- Peak: -8.2 dBFS
- RMS: -23.1 dBFS
- Safety pre-gain: -6 dB
- guard activity

Do not label digital meters as SPL, phon, sone, or hearing threshold unless an actual measurement supports that unit.

## Profile metadata

A private calibration profile may record:

- sanitized name;
- optional sanitized device/headphone/speaker/playback note;
- payload/schema version;
- sample-rate context;
- channel mode;
- reference band;
- raw linked or left/right relative offsets;
- deterministic guided method/version/seed;
- randomized test order;
- per-band confidence, judgement, retest, and skip markers.

Greygen deliberately does not collect age, diagnosis, demographic data, hearing history, or unnecessary health information.

## Privacy and portability

Calibration profiles are personal local data by default:

- local-only ProfileState storage;
- excluded from normal share URLs;
- excluded from normal sound presets;
- names/notes/evidence/correction curves remain private-profile data;
- no backend upload in the core product;
- deletion/bypass controls available.

Issue #15 adds a **separate explicit personal calibration export/import** path. Export UI must say that the serialized data contains personal playback/calibration information. This is not the normal sound-share mechanism.

Import must validate before persistence, allocate a new local identity, remain unselected/unapplied, and never create/resume audio. The user explicitly selects a profile before it can affect playback.

## UX warning copy requirements

Calibration surfaces must communicate concisely:

- use a comfortable level;
- this is not a medical hearing test;
- results include playback device/environment/listener effects;
- independent L/R differences are not diagnostic;
- skip frequencies that cannot be matched comfortably;
- never turn the system up aggressively to force an inaudible band to appear;
- linked/symmetric mode is available;
- personal profile export is distinct from ordinary sound sharing.

## Reference URLs

- https://www.iso.org/standard/83117.html — ISO 226:2023 public abstract/scope.
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API — browser audio platform background.
- https://mynoise.net/calibration.php — product-class conceptual reference only; do not copy source/assets/preset data.
