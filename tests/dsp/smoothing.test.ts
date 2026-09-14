import { describe, expect, it } from 'vitest'
import { LinearRamp, OnePoleSmoother } from '../../src/audio/dsp/smoothing'

describe('OnePoleSmoother', () => {
  it.each([44_100, 48_000, 96_000])(
    'tracks one time constant consistently at %d Hz',
    (sampleRate) => {
      const timeConstantSeconds = 0.01
      const smoother = new OnePoleSmoother(0, sampleRate, timeConstantSeconds)
      smoother.setTarget(1)
      const sampleCount = Math.round(sampleRate * timeConstantSeconds)
      let previous = smoother.current

      for (let index = 0; index < sampleCount; index += 1) {
        const current = smoother.next()
        expect(Number.isFinite(current)).toBe(true)
        expect(current).toBeGreaterThan(previous)
        expect(current).toBeLessThan(1)
        previous = current
      }

      expect(1 - smoother.current).toBeCloseTo(Math.exp(-1), 10)
    },
  )

  it('snaps deterministically when the time constant is zero', () => {
    const smoother = new OnePoleSmoother(0, 48_000, 0)
    smoother.setTarget(-12)
    expect(smoother.next()).toBe(-12)
  })

  it('rejects invalid control values before they can create NaN/Inf', () => {
    expect(() => new OnePoleSmoother(0, 0, 0.01)).toThrow(RangeError)
    const smoother = new OnePoleSmoother(0, 48_000, 0.01)
    expect(() => smoother.setTarget(Number.NaN)).toThrow(RangeError)
    expect(() => smoother.setTimeConstantSeconds(-1)).toThrow(RangeError)
  })
})

describe('LinearRamp', () => {
  it('arrives exactly at the target after the requested sample count', () => {
    const ramp = new LinearRamp(0)
    ramp.setTargetSamples(1, 4)

    expect([ramp.next(), ramp.next(), ramp.next(), ramp.next()]).toEqual([
      0.25, 0.5, 0.75, 1,
    ])
    expect(ramp.remainingSamples).toBe(0)
    expect(ramp.next()).toBe(1)
  })

  it('converts seconds to a sample-rate-aware exact ramp length', () => {
    const ramp = new LinearRamp(-1)
    ramp.setTargetSeconds(1, 0.01, 48_000)
    expect(ramp.remainingSamples).toBe(480)

    for (let index = 0; index < 480; index += 1) {
      ramp.next()
    }

    expect(ramp.current).toBe(1)
  })

  it('rejects invalid targets, durations, rates, and sample counts', () => {
    const ramp = new LinearRamp(0)
    expect(() => ramp.setTargetSamples(Number.NaN, 4)).toThrow(RangeError)
    expect(() => ramp.setTargetSamples(1, -1)).toThrow(RangeError)
    expect(() => ramp.setTargetSamples(1, 1.5)).toThrow(RangeError)
    expect(() => ramp.setTargetSeconds(1, -1, 48_000)).toThrow(RangeError)
    expect(() => ramp.setTargetSeconds(1, 1, 0)).toThrow(RangeError)
  })
})
