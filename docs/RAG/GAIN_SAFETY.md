# Gain Safety, Smoothing, and Digital Metering

Status: canonical contract for issue #6 gain staging, deterministic headroom, smoothing, final guard, and output telemetry, updated for animation plus linked/independent calibration and guided stimulus playback.

## Signal order

Greygen's pure `GreygenDspEngine` owns the complete level path. Conceptually the current stereo path is:

1. seeded bipolar source normalization (`1.0` linear);
2. nominal target realization;
3. user band offsets;
4. bounded spectral-animation offsets;
5. stereo-width component mixing;
6. **per-output-channel calibration correction**;
7. deterministic safety pre-gain;
8. master gain;
9. final emergency full-scale guard;
10. post-guard peak/RMS metering.

The main thread never applies a second output gain stage and never processes audio blocks. `AudioEngine` sends typed state to the worklet and receives bounded telemetry only.

Requested shaping and protective attenuation remain separate values. A target, animation trajectory, calibration curve, or guided calibration probe changes the deterministic response estimate from which safety attenuation is derived; it does not hide or rewrite the reported safety pre-gain.

## Gain-state and calibration ownership

`GainStageState` schema version 1 still owns:

- `masterGainDb` in `[-60,0] dB`;
- ten animation offsets, each in `[-12,+12] dB`;
- a legacy linked ten-value calibration field retained for protocol/state compatibility.

Issue #15 introduces versioned `ChannelCalibrationState` as the canonical real-time calibration owner:

- ten left applied offsets;
- ten right applied offsets;
- each offset inside the existing global `[-24,+24] dB` calibration bound;
- per-band applied L/R difference additionally limited by the engineering safeguard documented in `CALIBRATION_PROFILES.md`.

The legacy one-curve API maps the same correction to both channels. It exists so historical callers remain linked/symmetric; it is not the representation for independent L/R playback.

User band offsets remain owned by `SpectrumState` and bounded to `[-24,+24] dB`.

The default master is `20*log10(0.05)`, approximately `-26.0206 dB`. These are digital gain units, not acoustic SPL.

## Deterministic safety pre-gain

Safety is derived from accepted requested state rather than recent stochastic peaks. Greygen deliberately does **not** implement fast automatic gain control.

For each accepted normal state, the engine evaluates the actual complementary ten-band transfer function at 512 deterministic frequencies from DC through Nyquist using runtime sample rate and requested component gains. Issue #15 evaluates the response **separately for the requested left and right output-channel calibration curves** and uses the larger peak estimate.

Headroom calculation then applies:

- `+0.5 dB` response-estimation margin;
- target shaped peak `-0.5 dBFS`;
- safety pre-gain `min(1, target / (estimate * margin))`.

For neutral White reconstruction the estimated transfer magnitude is unity to numerical precision, producing approximately `-1 dB` safety pre-gain from target plus margin. Positive user/animation/calibration demand produces more attenuation. If only one calibrated output channel is demanding, that channel still determines the shared safety target.

Full profile correction remains bounded to ±24 dB, Balanced to ±12 dB, and independent application is further constrained by the versioned inter-channel guard before safety estimation.

## Guided calibration transient

Guided stimulus state is runtime-only and is not persisted as SoundState/ProfileState.

Current contract:

- fixed selected-component base `-18 dB`;
- relative probe `[-24,+24] dB`;
- mode `inactive | silent | band`;
- channel `both | left | right`.

While stimulus mode owns output, safety pre-gain conservatively reserves the sum of normal requested-response demand plus bounded probe demand. Because normal/stimulus are actually crossfaded rather than simultaneously summed at full strength, this intentionally overestimates transition demand.

Issue #15 adds smoothed per-output-channel masks. Independent guided calibration can therefore present left-only or right-only material without a hard pan step. The non-target channel fades toward silence; master is never auto-raised.

The deterministic frequency-domain estimate is not claimed to be an absolute sample-domain bound for every stochastic transient. The final sample guard remains the last output invariant.

## Smoothing

Audible state changes are never written directly into the sample path.

Current constants:

- normal spectral/component gains: `40 ms` one-pole;
- left calibration-band gains: `40 ms` one-pole;
- right calibration-band gains: `40 ms` one-pole;
- guided stimulus selected-band gain: `40 ms` one-pole;
- normal↔stimulus ownership: `40 ms` one-pole;
- guided left/right channel masks: `40 ms` one-pole;
- master: `40 ms` one-pole;
- safety attenuation attack: `5 ms`;
- safety attenuation release: `150 ms`.

Profile select, Off/Balanced/Full, linked/independent correction, channel routing, reference/test changes, and calibration silence therefore do not hard-step audible gains.

The shorter safety attack reduces exposure to newly demanding state while remaining continuous. The final guard covers the attack interval. Slower release avoids sudden level rise after boosts disappear.

All time constants derive samples from runtime sample rate.

## Final guard

The final guard is emergency-only:

- finite samples clamp to `[-0.999,+0.999]`;
- non-finite samples become zero;
- every intervention is counted in telemetry.

It is not a compressor, limiter-as-loudness-tool, or normal shaping stage. Ordinary deterministic White/Pink/Brown/Grey fixtures at 0 dB master must continue to produce zero guard interventions. If normal states rely materially on the guard, headroom design must be fixed rather than normalizing clipping.

## Meter stage and units

`MeterAccumulator` measures final post-master/post-guard digital output. Telemetry reports:

- frame count;
- peak dBFS;
- RMS dBFS;
- applied and target safety pre-gain dB;
- applied master dB;
- final-guard intervention count;
- stereo width/correlation state where applicable.

Worklet telemetry remains bounded at nominally 10 updates/s. Per-sample metering uses primitive preallocated state; an object is allocated only when a telemetry snapshot is consumed.

`dBFS` means digital full scale. It is never labelled SPL, phon, sone, hearing threshold, or clinical level.

## Protocol history and current control use

Issue #6 introduced protocol v2. Stereo/animation/analyzer/calibration work advanced the shared typed protocol subsequently.

Issue #15 advances it to **v6**:

- initialize includes explicit versioned channel-calibration state;
- `set-channel-calibration` updates validated L/R correction;
- calibration stimulus schema v2 includes `both | left | right` targeting;
- acknowledgements remain request-scoped.

`AudioEngine.setCalibrationChannelOffsetsDb(left,right)` is the explicit independent-channel API. `setCalibrationBandOffsetsDb(values)` remains a linked compatibility facade and maps `values` to both output channels.

## Real-time constraints

The audio callback performs seeded source generation, complementary filter-bank component processing, stereo component mixing, preallocated normal/calibration/stimulus smoothers, scalar gain/crossfade, final finite/clamp checks, and primitive meter accumulation.

It performs no DOM/storage/URL/network access, Promise work, logging, locks, or deliberate per-sample allocation. Response/headroom estimation occurs only when accepted control state changes.

## Validation invariants

Validation covers:

- neutral White response at 44.1/48/96 kHz;
- maximum accepted user/animation/calibration demand;
- real L/R output-channel correction rather than relabelling decorrelation streams;
- linked legacy construction output-equivalent to explicit linked channel state;
- worst-demanding output channel driving safety pre-gain;
- applied L/R correction difference respecting the versioned inter-channel guard;
- positive calibration/probe demand producing stronger safety attenuation;
- channel-routed guided stimulus and smooth explicit silence;
- rapid state changes remaining finite;
- master at maximum 0 dB;
- final output inside guard for pathological accepted states;
- telemetry matching actual applied safety/master state;
- ordinary presets not relying on guard;
- real Chromium retaining explicit Start/Stop authority and master-level invariance through calibration.

Do not weaken gain-safety, calibration, or DSP thresholds merely to make a regression pass.
