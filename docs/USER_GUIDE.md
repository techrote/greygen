# Greygen v0.1 user guide

Greygen is a local-first browser spectral-noise generator. Audio is synthesized in the browser; the normal product does not need an account, backend, analytics service, or streamed noise recordings.

Greygen's calibration tools are for **relative perceived-level matching through the current listener + playback chain**. They are not a medical hearing test, audiogram, dB HL measurement, or calibrated acoustic SPL measurement.

## Start and stop

Opening Greygen is silent. Restored settings, shared links, imported profiles, offline reloads, and application updates do not start audio.

Choose **Start audio** explicitly. While audio is running the global transport remains fixed at the viewport edge so **Stop audio** is reachable even when the page is scrolled. If the browser suspends or interrupts the audio context, use **Resume** or **Stop** explicitly.

Start at a comfortable device/headphone/speaker level. Greygen's dBFS meters and safety pre-gain describe digital headroom; they cannot determine the acoustic level produced by downstream hardware.

## Colour presets and ten bands

Built-in targets are **White**, **Pink**, **Brown / Red**, and **Grey (Practical)**. White/Pink/Brown have measured power-spectral-density meanings. Grey Practical is Greygen's original practical perceptual-shaping curve; it is not an ISO 226 table and is not copied from myNoise.

The ten controls are approximately 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, and 16k Hz. Band offsets are bounded to ±24 dB. Each range works with the keyboard and has a neutral reset.

Selecting a built-in colour changes only the spectral target and resets its ten user offsets. It does **not** reset master level, stereo width, animation, seed, saved sound presets, private profiles, or UI preferences. Editing a band marks the colour target as **Modified**.

At 44.1 and 48 kHz the 16 kHz control intentionally becomes a stable high shelf because the nominal upper crossover is too close to Nyquist. Greygen reports this runtime mode instead of constructing an unsafe filter. At 96 kHz it can be a bounded bandpass.

## Master level and meters

Master is a digital gain control from -60 to 0 dB. Greygen also applies a deterministic, inspectable safety pre-gain when requested shaping needs more headroom. Peak and RMS are final digital dBFS measurements. The final guard is emergency overflow protection, not a loudness processor.

These values are **not dB SPL** and do not establish a universally safe listening level.

## Stereo width

Width is a power-preserving statistical correlation control rather than pan. The range runs from Mono through Narrow/Normal to Wide; negative-correlation/anti-phase modes are not exposed. Width changes are smoothed and are included in saved/shareable sound state.

## Spectral animation

Animation modes are Off, Drift, Breathe, Wander, and Orbit. Depth, speed, seed, and **Preserve mean band power** are deterministic sound settings. Motion is sample-clocked and bounded; it is not an accumulating random walk.

`prefers-reduced-motion` affects visual presentation only. It does not silently change the audio animation mode or generated sound.

## Saving sounds and sharing

A local user preset saves the complete generic SoundState: seed, spectral target/bands, master, stereo width, and animation. Preset names stay local metadata.

**Copy share link** creates a versioned URL fragment containing SoundState only. Normal share links intentionally exclude playback/calibration profiles, profile names/notes/evidence, local preset names/library data, and UI preferences. Loading a share never starts audio automatically.

## Analyzer and diagnostics

The optional analyzer runs outside the AudioWorklet hot loop using the browser's native `AnalyserNode`. It displays a live spectrum plus private-safe runtime diagnostics such as Greygen app version, DSP engine version, audio protocol version, sample rate, seed, high-band mode, meters, stereo correlation, and rendered frames.

The analyzer does not expose private calibration curves, profile names, notes, or device metadata.

## Playback calibration profiles

Profiles are private local playback/calibration records. Application modes are:

- **Off** — retain the selected profile but bypass correction.
- **Balanced** — conservative deterministic scaled/smoothed correction; the default for newly saved guided results.
- **Full** — bounded measured relative correction; explicit opt-in.

Profiles may be linked/symmetric or independent left/right. Independent differences can arise from devices, fit/coupling, room/routing, electronics, perception, temporary conditions, or measurement uncertainty. Greygen does not interpret them as hearing loss. Applied L/R correction also passes an engineering inter-channel guard and global headroom safety.

Profile rename, note, duplicate, deliberate delete, bypass, and explicit personal export/import are separate from ordinary sound sharing. Personal export is labelled as personal playback/calibration data. Imported profiles are stored unselected/unapplied and cannot start audio.

## Guided perceived-level calibration

Before beginning, start audio yourself and confirm a comfortable overall level. The wizard compares narrow-band noise with a 1 kHz reference in deterministic non-monotonic order. You may choose linked/symmetric or independent left/right measurement.

Use quieter/about-equal/louder judgements, retest completed bands, or choose **Skip / cannot comfortably match**. Adjustment is bounded to ±24 dB on a 0.5 dB grid and terminates; Greygen never raises master automatically to force a difficult band to become audible. The 31 Hz and 16 kHz regions include extra hardware/environment caveats.

**Silence calibration**, **Abort calibration**, and global **Stop audio** remain available. Nothing is saved until the review page and explicit Save. New guided profiles default to Balanced.

## Reset and deletion

The reset actions are intentionally separate:

- **Reset sound settings** resets current SoundState only.
- **Delete saved preset** deletes only that local sound-preset record.
- **Delete profiles** deletes private ProfileState only.

Resetting sound does not delete profiles or saved presets.

## Offline/PWA use

After one successful online load/install, the application shell and exact emitted AudioWorklet asset can reopen offline. The service worker caches application assets only, not user sound/profile/UI state. Updates wait for the explicit **Reload update** action so the main application and worklet protocol stay version-coherent.

Offline reload remains silent until **Start audio**.

## Browser support in v0.1

The release candidate is automated against:

- Chromium: full Playwright browser suite;
- Firefox: production-build core lifecycle/state/privacy/audio-worklet journey;
- Playwright WebKit: the same core journey as Safari-class engine evidence.

A Playwright WebKit pass is not a substitute for a current physical Safari/macOS or iOS/iPadOS check. The release checklist keeps current Safari and desktop assistive-technology spot checks as operator gates before publishing a tagged v0.1 release.

Greygen requires a secure context plus Web Audio `AudioContext`, `AudioWorklet`, and `AudioWorkletNode`; unsupported capability is reported rather than silently falling back to a different audio engine.

## Privacy summary

Core operation is local-first. There is no analytics/telemetry backend in v0.1. Runtime audio telemetry is an in-memory main-thread/worklet diagnostic channel; it is not network telemetry. Normal sharing encodes generic sound state in the URL fragment. Private profile data leaves local storage only when the user explicitly uses the separate personal-profile export action.
