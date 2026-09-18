# UX and State Model

Status: canonical product-state and interaction guidance, reconciled through issue #20 v0.1 release hardening.

## Primary interaction model

The default screen should answer four questions immediately:

1. Is audio running?
2. What spectral shape/saved sound is active?
3. How loud is the digital output relative to full scale?
4. How do I stop/mute it instantly?

The friendly default should not expose implementation jargon such as biquad Q or render quanta.

## Default control surface

Required primary controls:

- explicit Start/Stop or Start/Mute transport;
- ten frequency-labelled spectral controls;
- master level;
- built-in White/Pink/Brown/Grey colour selector;
- local user sound-preset save/load/delete;
- normal sound share-link copy/load;
- stereo width;
- animation mode/depth/speed;
- calibration/profile entry point;
- compact peak/RMS/headroom status.

Advanced controls belong in a collapsible/secondary surface. The analyzer/diagnostics panel is secondary, defaults closed for new/legacy state, and persists its open/closed presentation preference locally.

The authoritative transport actions remain fixed at the viewport edge so Start/Resume/Stop remains immediately reachable while deep in calibration, profile, sharing, or analyzer controls. This is presentation of the existing AudioEngine lifecycle actions, not a parallel transport state machine.

## Band behavior

Recommended display labels:

`31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k`.

Each band control needs keyboard increments, an accessible name including frequency/current gain, a numeric readout, neutral reset, and clear text for any runtime degradation. Do not communicate band level using colour alone.

The current native range contract uses 1 dB fine Arrow-key steps, Home/End bounds, and browser-native PageUp/PageDown coarse movement. Horizontal scrolling on narrow screens is deliberate so the ten controls keep useful dimensions.

## Start/lifecycle UX

Initial UI is honest about browser autoplay constraints:

- before start: controls may be editable but status is Ready; prominent Start action;
- starting: brief Starting… state while worklet/context initialize;
- running: visible active state and immediate Stop;
- suspended/interrupted: visible recoverable state with Resume and Stop;
- unsupported: capability explanation rather than silent failure.

Loading persisted state, a local saved preset, a normal share URL, a private profile import, or a service-worker update does not create an autoplay exception.

## Built-in preset behavior

Built-in colour presets own only spectral target fields: target id and ten user band offsets. Selecting one resets those offsets to neutral but preserves master, stereo width, animation, audio seed, user-preset library, private profiles, and UI state.

User band changes after a built-in colour selection produce visible `Modified` state. Changes to master/stereo/animation do not make a built-in colour target Modified because those fields are outside its ownership.

## User sound presets

A saved user preset is a local named snapshot of complete generic SoundState. It may include seed, spectral target/bands, master, stereo, and animation, but never private ProfileState or UiState.

When current SoundState exactly matches a saved snapshot, show the sanitized local name and `Saved preset`. Loading remains explicit and never starts audio. Deletion affects only that library record. Reset sound and Delete profiles preserve the library.

Names must be sanitized/bounded before storage/display and rendered as text rather than HTML.

## Animation

Shipping modes are conceptual names: Off, Drift, Breathe, Wander, Orbit. UI exposes depth, speed, and mean-band-power normalization. Animation is deterministic given state + seed and respects global gain/safety bounds.

`prefers-reduced-motion` is a visual-presentation preference only. It may reduce analyzer/CSS motion, but must not silently alter spectral-animation mode, depth, speed, seed, normalization, samples, or persisted SoundState.

## Metering

Primary meter status can show Peak dBFS, RMS dBFS, safety pre-gain, and final guard activity. Do not label digital meters as SPL, phon, sones, or hearing threshold.

## State semantics

### SoundState

Shareable by default:

- schema version;
- audio seed;
- target/preset identifier;
- ten band offsets;
- master level;
- stereo width;
- animation mode/depth/speed/seed/normalization;
- generic non-personal engine options.

### UserPresetLibraryState

Local sound-library metadata:

- its own schema version;
- deterministic local preset ids;
- sanitized local display names;
- canonical SoundState snapshots.

It is not included in normal share URLs. A saved preset name is metadata around a SoundState, not part of the sound identity itself.

### ProfileState

Private/local by default:

- named calibration/playback profiles;
- measured relative corrections;
- linked/symmetric or independent left/right data;
- balanced/full/off application mode;
- calibration metadata/confidence/evidence;
- optional sanitized user notes/device names.

ProfileState schema v2 is the current envelope. Current calibration payloads are independently versioned at v3; historical v1/v2 payloads remain readable as linked data. Exact migration/application semantics live in `CALIBRATION_PROFILES.md` and `STATE_PERSISTENCE.md`.

### UiState

Local only: open panels, visual preferences, analyzer visibility, and other non-audio presentation state. UI schema v2 adds persisted analyzer visibility; v1 migrates deterministically with the analyzer closed.

## Persistence

Use an explicit app storage version plus independently versioned documents where useful. Current compact state uses localStorage through the repository abstraction.

Rules:

- parse persisted input defensively;
- validate numeric ranges;
- migrate older versions deterministically;
- recover gracefully on corruption;
- never overwrite unknown future documents from an older build;
- keep reset actions distinct.

Current reset/deletion distinctions are:

- Reset sound — current SoundState only;
- Delete saved preset — one UserPresetLibraryState record only;
- Delete profiles — private ProfileState only.

## Share URLs and private portability

A normal share URL represents **SoundState only**, not identity/profile/library/UI data.

Current requirements and implementation:

- compact versioned deterministic serialization;
- URL fragment rather than backend-dependent storage;
- no personal calibration data;
- no profile names/notes/ids/evidence/corrections;
- no saved user-preset names/library contents;
- no UI preferences;
- canonical validation/clamping for finite accepted values;
- bounded rejection of malformed/truncated/oversized payloads;
- clear rejection of unknown future versions;
- imported state never auto-starts audio.

A normal share input is therefore safe to load while Ready: it changes requested SoundState and remains Ready/silent. If the user explicitly loads one while already Running, existing typed/smoothed AudioEngine controls update the current engine; there is still no hidden start/resume action.

Private playback/calibration portability is now implemented as a **separate explicit surface and serializer**. Preparing a personal export requires an intentional user action and is clearly labelled as personal playback/calibration data. Its envelope may contain the profile name, optional playback-device note, linked/independent measurement/correction data, and guided evidence because that is the private data the user chose to export. It omits the local record id and never appears in the normal `#s=` share fragment.

Personal profile import validates before storage, creates a new local identity, and remains unselected/unapplied. It never creates or resumes audio. See `PRESETS_SHARING.md` and `CALIBRATION_PROFILES.md`.

## Calibration UX

Guided calibration explains its non-medical/playback-chain nature, requires comfortable-level confirmation, uses bounded reference/test comparisons, permits skip/cannot-match, randomizes/retests, and saves a named local profile only after review.

Linked/symmetric mode presents both channels. Independent mode presents a complete left pass then right pass with explicit channel wording and smooth routing. Independent differences are not interpreted diagnostically.

Keyboard shortcuts on the active guided region supplement—not replace—the visible native buttons. Focus moves into the active region when the flow starts or changes major phase, and returns to the guided entry region on Save/Abort so keyboard users are not dropped back to the document body.

Calibration silence, Abort, and the global Stop remain separately available; the wizard never raises master automatically.

## Accessibility

Minimum requirements:

- all controls keyboard operable;
- logical tab order with no positive `tabindex`;
- visible focus states for native controls, disclosure summaries, and programmatically focused workflow regions;
- native semantic controls where possible;
- labels/readouts available to screen readers;
- no pointer-only drag requirement for precise values;
- both fine and coarse keyboard range adjustment;
- visual motion respects reduced-motion preferences without changing audio animation;
- practical touch targets, including a 44 px minimum for ordinary buttons/selects and the band reset action;
- sufficient contrast;
- status changes exposed without chatty live-region spam;
- no state depends on hue alone;
- global Stop remains immediately reachable while audio can run.

Saved preset names are ordinary escaped text. Share URLs and personal export/import use selectable/labelled native text controls and buttons/forms.

The detailed implemented contract, browser regression evidence, and release-time assistive-technology checklist live in `ACCESSIBILITY_RESPONSIVE.md` and `../RELEASE_CHECKLIST.md`.

## Responsive behavior

The ten-band surface must remain usable on narrow displays. Do not shrink hit targets to microscopic sizes; horizontal spectral scrolling is preferable when needed. Preset/share/profile forms may stack into a single column on narrow viewports.

The document itself must remain horizontally contained at representative phone portrait and landscape sizes. The transport action dock is safe-area aware and action rows may stack on narrow screens; extra page-bottom space prevents it from covering final controls.

## Error states

Provide user-visible states for AudioWorklet unsupported, secure-context/worklet failures, AudioContext resume failure, corrupt/future persisted state, malformed/future shared state, malformed/future personal-profile import, storage/clipboard failure, and runtime high-band degradation.

Errors should state what remains usable and what the user can do next.
