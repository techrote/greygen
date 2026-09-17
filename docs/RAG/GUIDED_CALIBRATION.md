# Guided Relative Perceived-Level Calibration

Status: canonical contract for issues #14-#15 guided linked and independent-channel calibration.

## Purpose and boundary

Greygen's guided workflow estimates **relative perceived-level correction for the current listener + playback chain** using the ten-band model. It is not a medical hearing test, audiogram, dB HL measurement, calibrated SPL measurement, or diagnosis of left/right hearing asymmetry.

The workflow separates:

1. transient calibration stimulus playback;
2. a deterministic in-memory matching state machine;
3. the private calibration profile defined by `CALIBRATION_PROFILES.md`.

Opening, aborting, or auditioning a wizard result never mutates a saved profile. Persistence occurs only after review and explicit Save.

## User control

The wizard never starts audio. Begin requires:

- the main audio engine already Running after explicit **Start audio**;
- explicit confirmation that the user set a comfortable overall level.

Greygen never raises master automatically during calibration. **Silence calibration**, the normal **Stop audio** transport, and **Abort calibration** remain available.

Abort ends transient stimulus mode, restores the previously selected saved profile/application mode, discards the in-memory run, and writes no profile.

## Channel modes

Issue #15 adds an explicit pre-test choice:

- **Linked / symmetric:** one nine-band run; every stimulus is sent to both output channels and the resulting curve is applied identically left/right.
- **Independent left / right:** one deterministic nine-band run on the left output channel followed by one on the right output channel. The non-target channel is faded to silence while the target channel is tested.

The UI always identifies the active channel. Linked mode remains available as the conservative fallback.

Independent L/R differences are playback-chain observations only. They may arise from transducer mismatch, fit/coupling, room, routing, device gain, listener perception, or measurement uncertainty. Greygen does not label or interpret them as hearing loss.

## Stimulus topology

The default stimulus is narrow-band noise from Greygen's actual complementary ten-band filter bank.

Runtime `CalibrationStimulusState` supports:

- `inactive`: normal Greygen output;
- `silent`: calibration owns output but emits silence;
- `band`: one selected filter-bank component;
- channel target `both | left | right`.

The stimulus state is runtime-only and never enters SoundState, ProfileState, normal share URLs, or named sound presets.

### Level and bounds

- base stimulus: `-18 dB` relative to the selected band component;
- test relative probe: `[-24,+24] dB`;
- reference: 1 kHz / band index 5 / `0 dB` relative probe.

No response can request an unbounded probe or increase master.

### Transitions

Normal↔stimulus, band changes, and left/right channel masks use 40 ms one-pole smoothing. Entering the wizard requests `silent`; no reference/test band auto-plays simply because the wizard opened.

In independent mode a channel transition is therefore a fade, not a hard pan or channel step.

## Digital safety

Transient calibration participates in deterministic safety pre-gain. The safety target conservatively accounts for normal requested response plus bounded calibration probe demand during crossfade.

Saved independent correction is evaluated per output channel and the more demanding channel determines shared safety attenuation. The separate per-band inter-channel correction guard is defined in `CALIBRATION_PROFILES.md`.

These mechanisms protect digital headroom; they do not establish acoustic SPL or universal listening exposure safety because downstream gain/transducer sensitivity is unknown.

## Deterministic matching algorithm

The inner per-channel state machine is pure and wall-clock independent.

Constants:

- reference: 1 kHz / index 5;
- tested bands: remaining nine;
- correction grid: `[-24,+24] dB`;
- spacing: `0.5 dB`;
- grid states: 97;
- maximum judgements per band search: 7.

Each test starts at 0 dB relative correction. User responses mean:

- **Test is quieter** → correction must increase;
- **About equal** → accept current grid value;
- **Test is louder** → correction must decrease.

Quieter/louder perform bounded binary search. Endpoint termination is `bounded`, never chased beyond ±24 dB. **Skip / cannot comfortably match** stores `null`; no interpolation is fabricated.

### Ordering and channel composition

Each nine-band pass uses seeded `Xoshiro128StarStar` shuffling. Equal seeds reproduce equal order.

The outer issue-#15 channel state machine reuses the exact #14 per-band algorithm rather than duplicating convergence logic:

- linked mode uses the base guided seed;
- independent left/right derive stable separate seeds from that base seed;
- left completes before right begins;
- completing a retest returns to overall review rather than restarting the other channel.

A linked run therefore has 9 test bands; an independent run has 18 test-band steps total.

## Extreme bands

31 Hz and 16 kHz display the existing hardware/coupling/room/listener caveat and explicit skip path. No clinical inference is made from skipped or bounded results on either channel.

## Review, retest, and audition

Linked review displays one raw curve. Independent review displays L and R raw corrections for each band. The reference remains explicit; skipped values remain unknown.

Any completed non-reference band can be retested. Independent mode allows left or right retest independently while retaining the other channel's completed result.

Before saving, the unsaved result can be auditioned as Off/Balanced/Full through the real channel-aware profile transform. Audition is not persistence. Cancel restores the prior saved profile/application state.

## Saved metadata

Issue #15 advances newly created calibration payloads to schema v3 while preserving v1/v2 compatibility as linked profiles.

Linked guided profiles store linked evidence. Independent guided profiles store separate left/right evidence, each containing method/version, seed, actual order, judgement/retest counts, outcome, confidence, and skipped flags.

Optional device/headphone/speaker note is plain local profile data. The workflow does not collect age, diagnosis, hearing history, demographic information, or unnecessary health data.

New guided saves activate in **Balanced** mode. Full remains explicit opt-in.

## Keyboard contract

The focusable **Keyboard controls** button supports while matching:

- Space: alternate reference/test;
- Left: Test is quieter;
- Down: About equal;
- Right: Test is louder;
- K: skip;
- S: silence calibration;
- Escape: abort.

Judgement controls remain disabled until reference and test were both auditioned for the current comparison.

## Validation invariants

The #14-#15 guided gate covers:

- deterministic linked order and nine-band completion;
- deterministic independent left→right composition and distinct channel seeds;
- 18-step independent completion;
- per-channel skip preservation as `null`;
- per-channel retest without losing the other channel;
- maximum seven-judgement bounded convergence;
- 0.5 dB grid semantics;
- channel-routed AudioWorklet stimulus;
- smooth channel/silence transitions;
- explicit Start + comfortable-level acknowledgement;
- visible active channel and non-diagnostic L/R language;
- extreme-band caveat/skip;
- no saved profile before explicit Save;
- unsaved Off/Balanced/Full audition;
- saved profile defaults Balanced;
- master unchanged;
- global Stop/Abort/restart/Escape;
- no autoplay from profile import or wizard state;
- all prior profile/privacy/share/transport/stereo/animation/analyzer regressions.

Bounds are product contracts and must not be loosened merely to make validation pass.
