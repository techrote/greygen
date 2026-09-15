import { describe, expect, it } from 'vitest'
import {
  type ANIMATION_MODES,
  ANIMATION_DEPTH_MAX_DB,
  ANIMATION_SPEED_MAX,
  SpectralAnimation,
  createAnimationState,
} from '../../src/audio/dsp/animation'
import { GreygenDspEngine } from '../../src/audio/dsp/engine'
import { createGainStageState } from '../../src/audio/dsp/gainSafety'
import { isFiniteBlock } from '../../src/audio/dsp/statistics'

const SAMPLE_RATE = 48_000

function snapshotSequence(
  mode: Exclude<(typeof ANIMATION_MODES)[number], 'off'>,
  seed = 1234,
): number[][] {
  const animation = new SpectralAnimation(
    SAMPLE_RATE,
    createAnimationState(mode, seed, 8, 1.5, true),
  )
  const output = new Float64Array(10)
  const snapshots: number[][] = []
  const targets = [0, 1_000, 10_000, 50_000, 120_000]
  let nextTarget = 0
  for (let frame = 0; frame <= targets[targets.length - 1]; frame += 1) {
    animation.nextOffsets(output)
    if (frame === targets[nextTarget]) {
      snapshots.push(Array.from(output))
      nextTarget += 1
      if (nextTarget === targets.length) {
        break
      }
    }
  }
  return snapshots
}

function meanBandPowerDb(offsetsDb: ArrayLike<number>): number {
  let sum = 0
  for (let index = 0; index < offsetsDb.length; index += 1) {
    sum += 10 ** (offsetsDb[index] / 10)
  }
  return 10 * Math.log10(sum / offsetsDb.length)
}

describe('spectral animation', () => {
  it('validates bounded user state and deterministic defaults', () => {
    expect(createAnimationState()).toMatchObject({
      mode: 'off',
      depthDb: 4,
      speed: 1,
      energyPreserving: true,
    })
    expect(() => createAnimationState('drift', 1, -0.1)).toThrow(RangeError)
    expect(() => createAnimationState('drift', 1, 12.1)).toThrow(RangeError)
    expect(() => createAnimationState('drift', 1, 4, 0.24)).toThrow(RangeError)
    expect(() => createAnimationState('drift', 1, 4, 4.01)).toThrow(RangeError)
    expect(() => createAnimationState('drift', -1)).toThrow(RangeError)
  })

  it.each(['drift', 'breathe', 'wander', 'orbit'] as const)(
    '%s is exactly reproducible for equal seed, state, and sample time',
    (mode) => {
      expect(snapshotSequence(mode, 0x1234_5678)).toEqual(
        snapshotSequence(mode, 0x1234_5678),
      )
    },
  )

  it('modes are structurally distinct rather than aliases with different names', () => {
    const drift = snapshotSequence('drift', 99)
    const breathe = snapshotSequence('breathe', 99)
    const wander = snapshotSequence('wander', 99)
    const orbit = snapshotSequence('orbit', 99)

    expect(drift).not.toEqual(breathe)
    expect(drift).not.toEqual(wander)
    expect(drift).not.toEqual(orbit)
    expect(breathe).not.toEqual(orbit)
  })

  it.each(['drift', 'breathe', 'wander', 'orbit'] as const)(
    '%s remains finite and within configured depth over a long max-speed run',
    (mode) => {
      const animation = new SpectralAnimation(
        SAMPLE_RATE,
        createAnimationState(
          mode,
          0xa5a5_5a5a,
          ANIMATION_DEPTH_MAX_DB,
          ANIMATION_SPEED_MAX,
          true,
        ),
      )
      const output = new Float64Array(10)
      let maximum = 0
      let finite = true
      for (let frame = 0; frame < 1 << 18; frame += 1) {
        animation.nextOffsets(output)
        for (const value of output) {
          finite &&= Number.isFinite(value)
          maximum = Math.max(maximum, Math.abs(value))
        }
      }
      expect(finite).toBe(true)
      expect(maximum).toBeLessThanOrEqual(ANIMATION_DEPTH_MAX_DB)
    },
  )

  it('energy-preserving mode keeps mean linear band power at unity', () => {
    const animation = new SpectralAnimation(
      SAMPLE_RATE,
      createAnimationState('orbit', 7, 10, 2, true),
    )
    const output = new Float64Array(10)
    let maximumErrorDb = 0
    for (let frame = 0; frame < 120_000; frame += 1) {
      animation.nextOffsets(output)
      if (frame % 997 === 0) {
        maximumErrorDb = Math.max(
          maximumErrorDb,
          Math.abs(meanBandPowerDb(output)),
        )
      }
    }
    expect(maximumErrorDb).toBeLessThan(1e-9)
  })

  it('Off deterministically targets neutral offsets while depth/speed transitions remain smoothed', () => {
    const animation = new SpectralAnimation(
      SAMPLE_RATE,
      createAnimationState('wander', 42, 12, 4, true),
    )
    const output = new Float64Array(10)
    for (let frame = 0; frame < SAMPLE_RATE / 2; frame += 1) {
      animation.nextOffsets(output)
    }
    expect(animation.appliedDepthDb).toBeCloseTo(12, 2)

    animation.setState(createAnimationState('off', 42, 12, 0.25, true))
    animation.nextOffsets(output)
    expect(Array.from(output)).toEqual(Array(10).fill(0))
    expect(animation.appliedDepthDb).toBeGreaterThan(0)
    expect(animation.appliedSpeed).toBeGreaterThan(0.25)

    for (let frame = 0; frame < SAMPLE_RATE * 2; frame += 1) {
      animation.nextOffsets(output)
    }
    expect(animation.appliedDepthDb).toBeLessThan(1e-5)
    expect(animation.appliedSpeed).toBeCloseTo(0.25, 4)
  })

  it('animation extrema participate in conservative safety pre-gain and stay finite', () => {
    const off = new GreygenDspEngine({
      sampleRate: 48_000,
      gainStageState: createGainStageState(-12),
      animationState: createAnimationState('off'),
    })
    const animated = new GreygenDspEngine({
      sampleRate: 48_000,
      gainStageState: createGainStageState(-12),
      animationState: createAnimationState('wander', 123, 12, 4, true),
    })

    expect(animated.safetyPreGainTargetLinear).toBeLessThan(
      off.safetyPreGainTargetLinear,
    )

    const left = new Float32Array(1 << 16)
    const right = new Float32Array(1 << 16)
    animated.renderStereo(left, right)
    expect(isFiniteBlock(left)).toBe(true)
    expect(isFiniteBlock(right)).toBe(true)
  })

  it('rapid accepted animation changes at 96 kHz remain finite', () => {
    const engine = new GreygenDspEngine({ sampleRate: 96_000 })
    const left = new Float32Array(128)
    const right = new Float32Array(128)
    const modes = ['drift', 'breathe', 'wander', 'orbit', 'off'] as const

    let finite = true
    for (let iteration = 0; iteration < 200; iteration += 1) {
      engine.setAnimationState(
        createAnimationState(
          modes[iteration % modes.length],
          iteration,
          iteration % 2 === 0 ? 0 : 12,
          iteration % 2 === 0 ? 0.25 : 4,
          iteration % 3 !== 0,
        ),
      )
      engine.renderStereo(left, right)
      finite &&= isFiniteBlock(left) && isFiniteBlock(right)
    }
    expect(finite).toBe(true)
  })
})
