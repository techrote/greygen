# Stereo Width and Correlation Contract

Status: canonical stereo rendering contract introduced by issue #9.

## Purpose

Greygen stereo width controls the statistical correlation of two deterministic, identically shaped noise streams. It is not a pan control, delay trick, phase rotator, or duplicated mono signal with channel gain differences.

The control is designed so widening does not intentionally change spectral target, master level, or expected per-channel power.

## Deterministic source streams

The stereo renderer owns two independent PRNG streams derived from the same model seed:

- stream A: `Xoshiro128StarStar(seed, 0)`;
- stream B: `Xoshiro128StarStar(seed, 1)`.

Both streams pass through separate instances of the same ten-band filter-bank topology and the same current spectral/gain coefficients. This preserves deterministic replay while avoiding shared filter state between channels.

Stream A intentionally retains stream id `0`, so the established mono source identity remains stable.

## Accepted mixing model

Let normalized user width be `w` in `[0, 1]`.

Define:

```text
theta = w * pi / 4
c = cos(theta)
s = sin(theta)

L = c*A + s*B
R = c*A - s*B
```

For independent, equal-variance zero-mean streams A and B:

```text
Var(L) = Var(R) = Var(A) = Var(B)
Corr(L,R) = c^2 - s^2 = cos(2*theta) = cos(w*pi/2)
```

Therefore the expected power of each output channel is invariant with width, while correlation moves monotonically from `+1` to `0`.

The product surface intentionally does not expose negative-correlation / anti-phase width in issue #9.

## Width semantics

The normalized range is:

- `w = 0.00` -> **Mono**, target correlation `rho = 1.000`;
- `0 < w < 1/3` -> **Narrow**;
- `1/3 <= w < 2/3` -> **Normal**;
- `2/3 <= w <= 1` -> **Wide**;
- `w = 1.00` -> fully decorrelated target, `rho = 0.000`.

New first-run sound state defaults to `w = 0.5`, giving `rho ~= 0.707` and the human label **Normal**.

The UI exposes the friendly label, normalized percentage, and target correlation. Correlation is descriptive statistical state, not an acoustic spatial measurement.

## Runtime smoothing

Width is model-owned and smoothed in the pure DSP engine with a 40 ms one-pole transition. UI/worklet messages set the target width; the per-sample stereo matrix uses the smoothed width.

This avoids coefficient discontinuities and prevents a width gesture from becoming a hard channel jump. The worklet telemetry reports the currently applied smoothed width and derived correlation at the existing bounded telemetry cadence.

## Gain safety and metering

Stereo width does not add an independent gain stage.

The order is:

```text
source streams
-> identical spectral shaping
-> symmetric stereo correlation matrix
-> existing automatic safety pre-gain
-> existing master
-> per-channel final guard
-> stereo-aware meter accumulator
```

The matrix preserves expected channel variance; it is therefore not compensated with width-dependent nominal gain. The final guard remains an emergency overflow guard for rare instantaneous excursions, not a normal loudness-control mechanism.

Stereo meters count audio frames, not channel samples. Peak is the larger channel absolute peak for each frame; RMS accumulates the mean channel power `(L^2 + R^2) / 2` so meter time and nominal power remain comparable with mono fixtures.

## Persistence and migration

`SoundState` schema v2 adds `stereoWidth` in `[0,1]`.

Migration is intentionally sound-preserving:

- new first run: width `0.5` / Normal;
- persisted sound schema v1: migrates to width `0` / Mono;
- persisted sound schema v0: migrates to width `0` / Mono.

Older Greygen builds rendered mono, so assigning Mono during migration preserves their actual rendering semantics instead of silently widening existing saved sounds.

Lifecycle/autoplay state remains absent from SoundState. Restored width is preloaded while the browser engine is Ready and cannot start audio by itself.

## Validation contract

Deterministic long-run fixtures must establish:

- realized Pearson L/R correlation within `±0.03` of the requested target;
- left/right RMS difference within `0.25 dB` for symmetric modes;
- combined nominal RMS shift across representative width settings no greater than `0.5 dB`;
- exact repeatability for equal seed + sound + width state;
- finite output at width extremes and under rapid accepted width changes;
- smoothed rather than instantaneous width transitions;
- no dependency on pan nodes or main-thread sample processing.

Browser integration must establish:

- native keyboard adjustment;
- pointer/range adjustment;
- persistence across reload;
- no autoplay after reload;
- real two-channel AudioWorklet operation and width/correlation telemetry.
