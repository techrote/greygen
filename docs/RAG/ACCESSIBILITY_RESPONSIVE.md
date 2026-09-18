# Accessibility and Responsive Interaction

Status: canonical interaction hardening contract for issue #18.

## Scope and invariants

Accessibility is control correctness, not a visual afterthought. This layer may change presentation, focus routing, semantic exposure, and test coverage, but it must not change requested SoundState, ProfileState privacy, DSP, calibration correction, startup level, seeded audio behavior, or provenance boundaries.

The browser-native controls remain authoritative wherever possible. Range inputs, selects, buttons, checkboxes, radios, text inputs, details/summary, and labelled forms are preferred over re-created ARIA widgets.

## Keyboard contract

Every user operation has a non-pointer path:

- transport Start/Stop/Resume uses a native button;
- built-in presets and calibration/profile modes use native selects;
- the ten band controls use native range inputs with 1 dB fine steps, Arrow-key increments, Home/End bounds, and the browser's PageUp/PageDown coarse range movement;
- each band exposes its frequency and current signed gain through its accessible name/value text and has a keyboard-operable neutral reset;
- master, stereo width, and animation use native controls;
- preset/profile save, load, import/export, bypass, reset, and delete actions use labelled native controls;
- guided calibration keeps visible button alternatives for every shortcut. Space, arrows, K, S, and Escape are owned by the programmatically focused active calibration region; when focus moves into a native input, select, button, or link, that control keeps its normal keyboard behavior and the region does not intercept the keystroke.

Guided calibration moves focus to the active region when the flow begins or changes channel/review phase. When Save/Abort returns to the entry surface, focus returns to the guided-calibration region rather than disappearing to the document body. The active region is programmatically focusable with `tabIndex=-1`; it does not add an extra normal Tab stop.

Starting audio temporarily disables the authoritative transport button while the AudioContext is being created. If that browser-required disabled interval drops keyboard focus, focus is restored to the same lifecycle button as soon as startup resolves, so the next keyboard action remains Stop/Retry rather than disappearing to the document body.

## Immediate audio stop

The existing authoritative transport action dock is fixed to the viewport edge. It is not a second transport implementation: the same lifecycle button remains Start, Stop, Resume, Retry, or disabled according to AudioEngine state, and the suspended-state explicit Stop remains alongside it.

This keeps global Stop immediately reachable while the user is deep in ten-band, profile, import/export, or calibration controls. Extra bottom padding prevents the fixed dock from covering the last page controls. On narrow screens the dock spans the safe viewport width and stacks its actions.

Calibration still has its separate **Silence calibration** control. Global Stop closes the audio context as before; calibration silence only stops the current calibration stimulus. Neither path raises master level or changes correction semantics.

## Focus and status communication

- All ordinary interactive controls use a visible 3 px `:focus-visible` outline.
- Programmatically focused guided-calibration regions use the same visible focus treatment.
- `summary` receives an explicit visible focus outline.
- Audio status, preset identity, calibration hearing-state/correction, storage/share notices, and errors retain concise semantic announcements. Rapid meter values are intentionally not live regions.
- Calibration correction/heard-state live regions are atomic so assistive technology receives coherent updates instead of fragments.
- State is never encoded by hue alone: audio has text status; high-band degradation has text; guard activity has a label; modified/preset state has text; errors/warnings have wording plus styling.

## Touch targets and narrow layouts

Buttons and selects retain a minimum 2.75 rem (44 px at the default root size) height. The formerly smaller per-band reset is raised to the same 44 px square minimum. Text/number inputs and textareas also receive a 44 px minimum height. Checkbox/radio hit areas are enlarged through their labels without replacing the native inputs.

The ten-band bank deliberately remains wider than a phone viewport and scrolls inside `.band-scroll`; individual controls are not compressed into unusable slivers. The document itself must not acquire horizontal scrolling at representative narrow portrait/landscape sizes. Calibration action rows stack on very narrow screens.

## Reduced motion

`prefers-reduced-motion: reduce` suppresses CSS animation/transition duration and smooth scrolling. It is presentation-only. It must **not** change spectral-animation mode, depth, speed, seed, mean-power option, generated samples, or persisted SoundState.

The analyzer's already-existing reduced-motion sampling policy remains independent of audio spectral animation.

## Automated regression evidence

`e2e/accessibility.spec.ts` provides a dependency-free browser accessibility gate in addition to the existing feature journeys. It checks:

- native control naming/label association on the rendered core surface;
- duplicate IDs and forbidden positive tab indices;
- first-interaction focus visibility, startup focus restoration, and keyboard Start/Stop;
- keyboard preset changes plus fine/coarse/boundary ten-band range operation;
- the 44 px band-reset target;
- keyboard profile creation/selection;
- complete guided calibration through keyboard shortcuts, review/save focus, and Escape abort/focus restoration;
- native calibration buttons remaining native keyboard controls rather than double-firing region shortcuts;
- 360×640 portrait and 844×390 landscape document containment, intentional band scrolling, and viewport-reachable Stop after scrolling to the bottom;
- reduced-motion presentation while serialized spectral-animation state remains unchanged across reload.

This semantic audit is deliberately small and repository-owned rather than presented as a complete WCAG conformance scanner. The release pass must still retain human/assistive-technology review.

## Manual review checklist and issue #18 results

The issue #18 implementation was manually reviewed at source/DOM-contract level alongside Chromium Playwright evidence:

- **Keyboard/focus:** native controls are retained; no positive tab index is introduced; the first transport action is the first normal interactive stop; startup restores lifecycle-button focus after the temporary disabled state; guided start/phase/end focus routing is explicit; visible focus rules cover buttons, inputs, selects, links, summary, and programmatically focused guided regions.
- **Names/roles/values:** transport/preset/profile/calibration controls are native and labelled; ten-band ranges expose frequency + signed gain; range readouts remain visible; destructive profile buttons carry record-specific accessible labels.
- **Non-colour state:** Running/Suspended/Error, preset/Modified, High shelf degradation, guard activity, notices, and errors all have text equivalents.
- **Contrast:** the hardening pass preserves the existing high-contrast light-on-dark palette and focus outline; no new hue-only information is introduced.
- **Responsive/touch:** the fixed transport is safe-area aware, action rows stack at phone width, ten-band scrolling remains deliberate, the document is contained at the tested portrait/landscape boundaries, and the smallest band button is raised to 44 px.
- **Reduced motion:** CSS motion is suppressed without touching audio animation state.
- **Calibration safety:** comfortable-level acknowledgement, skip, silence, abort, global Stop, non-medical wording, and no-auto-master behavior remain intact and keyboard reachable; native controls inside the shortcut region retain their normal activation semantics.
- **Imported/recovered state:** existing visible storage/share/import status and no-autoplay contracts are unchanged.

A desktop NVDA/VoiceOver hardware session is not available inside GitHub Actions, so this document does **not** claim a human screen-reader product certification. The regression strategy instead keeps native semantics, role/name/value assertions, focus journeys, and a release-time assistive-technology spot-check as an explicit human checklist item rather than fabricating evidence.

## Release-time assistive-technology spot check

Before a public v0.1 release, perform one current desktop screen-reader spot check (NVDA + Chromium/Firefox on Windows or VoiceOver + Safari on macOS) covering:

1. Start/Stop and audio status announcement;
2. one preset and two band ranges including their frequency/current-gain speech;
3. saved profile selection and calibration mode;
4. guided start, reference/test, judgement, skip, silence, Abort, and focus return;
5. malformed/import notice and one destructive confirmation path;
6. narrow/zoomed layout with the Stop dock still reachable.

Record the browser/AT versions and any defects in the release-hardening issue rather than weakening native semantics to satisfy a synthetic check.
