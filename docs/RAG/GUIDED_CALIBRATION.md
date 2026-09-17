# Guided Relative Perceived-Level Calibration

Status: canonical contract for issue #14 guided calibration.

## Purpose and boundary

Greygen's guided workflow estimates **relative perceived-level correction for the current listener + playback chain** using the existing ten-band model. It is not a medical hearing test, audiogram, dB HL measurement, or calibrated SPL measurement.

The workflow intentionally separates three concepts:

1. transient calibration stimulus playback;
2. an in-memory deterministic matching state machine;
3. the private persisted calibration profile defined by `CALIBRATION_PROFILES.md`.

Starting or abandoning the wizard never mutates a saved profile. A profile is created only after the review screen and an explicit Save action.

## Prerequisites and user control

The wizard does not start audio. Before Begin becomes available:

- the main Greygen audio engine must already be Running because the user explicitly selected Start audio;
- the user must confirm that they have set a comfortable overall listening level.

Greygen never raises master gain automatically during calibration. The normal master control remains the user's digital master. The user can use **Silence calibration**, the normal **Stop audio** transport, or **Abort calibration** at any time.

Abort:

- ends transient stimulus mode;
- restores the previously selected saved profile/application mode;
- discards the in-memory run;
- writes no new calibration profile.

A restart creates a fresh deterministic run from the same seed; abandoned responses are not retained.

## Stimulus topology

The default stimulus is narrow-band noise derived from Greygen's actual ten-band complementary filter bank rather than a sine oscillator or pre-rendered asset.

The worklet owns a transient `CalibrationStimulusState` with three modes:

- `inactive`: normal Greygen output;
- `silent`: calibration owns the output but emits silence;
- `band`: calibration owns the output and emits one selected filter-bank component.

This state is runtime-only. It is not part of `SoundState`, `ProfileState`, share URLs, or user sound presets.

### Level and bounds

The calibration stimulus base is `-18 dB` relative to the selected band component. The test-band relative probe offset is bounded to the same global calibration range as stored Full correction: `[-24,+24] dB`.

The reference band is the 1 kHz model band (index 5) at `0 dB` relative probe offset.

No workflow state can request an unbounded probe and no response path increases master gain.

### Transitions

Normal↔calibration and band-to-band changes are smoothed with a 40 ms one-pole transition. Entering the wizard first requests `silent`; no reference/test band auto-plays simply because the wizard was opened.

`Silence calibration` targets all calibration-band gains to zero while retaining calibration ownership of the output, producing a short click-free fade to silence. The normal Stop transport closes the AudioContext through the existing lifecycle path.

### Stereo

The calibration stimulus is centred: the selected deterministic A-stream band component is applied identically to left and right. Normal stereo width processing is bypassed while the transient stimulus owns the output. This avoids width-dependent perceived-position changes during matching.

## Digital safety

Transient calibration participates in the same deterministic safety-pre-gain system as normal Greygen output.

During stimulus mode the safety target conservatively accounts for both:

- the current normal requested-response estimate; and
- the bounded calibration probe gain.

This sum is conservative during the crossfade. Positive probe gain therefore cannot silently consume the existing headroom allowance. Master smoothing, final guard, and dBFS metering remain unchanged.

Digital safety does not make a claim about acoustic SPL or listening exposure because Greygen does not know downstream device gain/transducer sensitivity.

## Deterministic matching algorithm

The guided state machine is pure and wall-clock independent.

Constants:

- reference band: index 5 / 1 kHz;
- tested bands: the remaining nine bands;
- correction grid: `[-24,+24] dB`;
- grid spacing: `0.5 dB`;
- grid states: 97;
- maximum judgements for one test-band search: 7.

### Order

The nine test bands are Fisher-Yates shuffled using Greygen's seeded `Xoshiro128StarStar` PRNG with a dedicated guided-calibration stream id (`14`). Equal seeds therefore produce equal band order; no wall-clock or browser randomness determines order.

The default application derives the wizard seed deterministically from the current sound seed, keeping calibration ordering replayable while independent from the audio source stream.

### Pairwise response semantics

Each test starts at `0 dB` relative correction. The user hears the 1 kHz reference and the current test band, then chooses:

- **Test is quieter** → correction must increase;
- **About equal** → accept the current grid value;
- **Test is louder** → correction must decrease.

Quieter/louder responses perform a bounded binary search on the 97-point grid. Seven judgements are sufficient to terminate the search. An endpoint result is recorded as `bounded`, not chased beyond ±24 dB.

A band can instead be **Skip / cannot comfortably match**. It is recorded as `null`, with `skipped` outcome/confidence. No interpolation fabricates a correction for it.

## Extreme bands

31 Hz and 16 kHz steps display an explicit caveat that mismatch may reflect hardware, coupling, room, or listener limits. The UI tells the user to skip rather than raise overall level aggressively.

No inference about hearing loss or clinical threshold is made from skipped or bounded bands.

## Review and retest

After nine test bands complete, playback leaves transient-stimulus mode and the wizard shows a raw review table:

- reference band at 0 dB;
- each raw relative correction or Skipped;
- confidence;
- retest count.

Any completed non-reference band may be retested. Retesting performs a fresh bounded search for that band and replaces its result while incrementing its retest count.

Before saving, the user can audition the unsaved raw result as:

- Off;
- Balanced;
- Full.

This audition uses the existing #13 correction layer and transform functions. It does not create or persist a profile. Cancel restores the previously saved profile/application state.

## Saved measurement metadata

Issue #14 advances the typed calibration payload to schema v2. Schema-v1 calibration payloads remain readable and are interpreted with `measurement: null`.

A guided v2 payload can store:

- method id `guided-narrow-band-v1`;
- wizard version 1;
- deterministic seed;
- actual randomized band order;
- for each test band: judgement count, retest count, outcome, confidence, and skipped flag.

The payload does not collect age, diagnosis, hearing-history, demographic, or other unnecessary health data.

Saving always activates the new profile in **Balanced** mode. Full remains an explicit user choice after saving.

## Keyboard contract

While matching, the focusable wizard region supports:

- Space: alternate reference/test;
- Left: Test is quieter;
- Down: About equal;
- Right: Test is louder;
- K: skip/cannot comfortably match;
- S: silence calibration;
- Escape: abort.

Judgement controls remain disabled until both reference and test have been auditioned for the current comparison.

## Validation invariants

Issue #14 validation must lock:

- seeded order reproducibility and non-reference coverage;
- normal equal-response completion;
- repeated quieter/louder endpoint behavior;
- maximum seven-judgement termination;
- 0.5 dB grid behavior;
- skip preservation as `null`;
- deterministic review/retest replacement;
- abort/restart state reset;
- v1 profile-payload compatibility and v2 measurement validation;
- transient stimulus bounds;
- transient safety-pre-gain accounting;
- smooth fade to calibration silence;
- full browser journey with explicit start + comfort confirmation;
- no profile saved before explicit review Save;
- saved guided profile defaults Balanced;
- master level unchanged through wizard operation;
- keyboard response path;
- global Stop + Abort path;
- all prior #13 profile, share/privacy, transport, stereo, animation, analyzer, and no-autoplay tests.

Thresholds/bounds are product contracts and must not be loosened merely to make a failing test pass.
