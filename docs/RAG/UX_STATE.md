# UX and State Model

Status: canonical product-state and interaction guidance for the initial application.

## Primary interaction model

The default screen should answer four questions immediately:

1. Is audio running?
2. What spectral shape is active?
3. How loud is the digital output relative to full scale?
4. How do I stop/mute it instantly?

The friendly default should not expose implementation jargon such as biquad Q, render quanta, or correlation coefficients.

## Default control surface

Required primary controls:

- explicit Start/Stop or Start/Mute transport;
- ten vertically oriented or otherwise visually spectral band controls labelled by frequency;
- master level;
- preset selector: White, Pink, Brown/Red, Grey, plus user presets later;
- stereo width;
- animation enable/mode/depth/speed;
- calibration/profile entry point;
- compact peak/RMS/headroom status.

Advanced controls belong in a collapsible/secondary surface.

## Band behavior

Band labels use human-readable frequency notation while internal values remain numeric Hz.

Recommended display labels:

`31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k`.

Each band control needs:

- keyboard increments;
- accessible name including frequency and current gain;
- numeric readout available without relying solely on pointer position;
- reset-to-neutral action;
- clear disabled/degraded treatment if runtime sample rate cannot safely support the nominal band.

Do not communicate band level using color alone.

## Start/lifecycle UX

Browsers require user activation for reliable audio start. Initial UI should therefore be honest about state:

- before start: controls may be editable but audio status is `Ready`; prominent Start action;
- starting: brief `Starting…` state while worklet loads/context resumes;
- running: visible active state and immediate mute/stop;
- suspended/interrupted: visible recoverable state with Resume action;
- unsupported: capability explanation rather than silent failure.

## Preset behavior

Applying a preset changes the nominal target spectrum with smoothing. It must not abruptly reset unrelated state unless the preset explicitly owns it.

Define which fields a preset owns. Initial color presets should own spectral target only; master level, stereo width, calibration profile, and animation on/off remain user choices.

User changes after applying a named preset put the spectral state into a `Modified` variant until saved/reset.

## Animation

Default animation UX should use conceptual names rather than stochastic-process terminology. Candidate modes:

- Drift — slow independent mean-reverting band movement;
- Breathe — coherent broad spectral motion;
- Wander — deeper bounded movement;
- Orbit — coordinated movement across spectral regions.

Exact shipping modes can evolve. UI exposes depth and speed; advanced view may expose seed and normalization behavior.

Animation must be deterministic given state + seed and must respect global gain/safety bounds.

## Metering

Primary meter status can show:

- Peak dBFS;
- RMS dBFS;
- safety pre-gain when non-zero;
- limiter/guard indicator only when active.

Do not overload the default screen with analyzer detail. A spectrum view belongs in an expandable panel.

## State domains

### SoundState

Shareable by default:

- schema/engine version;
- seed;
- target/preset identifier;
- ten band offsets/target parameters;
- master level;
- stereo width/correlation mapping;
- animation mode/depth/speed/seed;
- generic non-personal engine options.

### ProfileState

Private/local by default:

- named calibration/playback profiles;
- measured relative corrections;
- left/right variants;
- balanced/full/off application mode;
- calibration metadata/confidence;
- optional user notes/device names.

### UiState

Local only:

- open panels;
- preferred simple/advanced view;
- visual theme/settings;
- analyzer visibility;
- non-audio presentation preferences.

## Persistence

Use a single explicit app storage version plus per-structure versioning where useful. Initial implementation may use `localStorage` for compact state; move to IndexedDB only when data size/transaction needs justify it.

Rules:

- parse persisted input defensively;
- validate numeric ranges;
- migrate older versions deterministically;
- recover gracefully to defaults on corrupt state;
- tests cover migrations and malformed input;
- reset actions distinguish `reset sound`, `delete profiles`, and `factory reset` where practical.

## Share URLs

A share URL represents sound state, not identity/profile data.

Requirements:

- compact versioned serialization;
- no personal calibration data by default;
- no local profile names/notes;
- validation/clamping on import;
- malformed URLs fail safely;
- imported state does not auto-start audio;
- future versions can migrate or reject incompatible payloads clearly.

An explicit advanced export may later include calibration profiles, but only through an intentional user action with clear wording.

## Calibration UX

Default guided calibration should:

- explain non-medical nature and playback-chain dependency;
- require comfortable master level confirmation;
- compare a reference band against one test band at a time;
- randomize/retest rather than using only monotonic ordering;
- allow `skip/cannot comfortably match`;
- bound correction range;
- show progress;
- let user audition Off vs Balanced vs Full result;
- save a named local profile only after review.

## Accessibility

Minimum requirements:

- all controls keyboard operable;
- logical tab order;
- visible focus states;
- native semantic controls where possible;
- labels/readouts available to screen readers;
- no pointer-only drag requirement for precise values;
- motion/animation UI respects reduced-motion preferences for visual movement (audio animation remains user-controlled separately);
- sufficient contrast;
- status changes exposed appropriately without chatty live-region spam.

## Responsive behavior

The ten-band surface must remain usable on narrow displays. Do not solve mobile width by shrinking hit targets below comfortable sizes. Horizontal scrolling for the spectrum is preferable to microscopic sliders if necessary, but responsive grouped layouts should be evaluated first.

## Error states

Provide user-visible states for:

- AudioWorklet unsupported;
- secure-context requirement not met;
- worklet module load failure;
- AudioContext resume failure;
- corrupted persisted state;
- imported/share state incompatible;
- runtime sample rate causing high-band degradation.

Errors should state what remains usable and what the user can do next.
