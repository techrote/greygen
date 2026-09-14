import { describe, expect, it } from 'vitest'
import { MeterAccumulator } from '../../src/audio/dsp/meters'

describe('MeterAccumulator', () => {
  it('computes known-vector peak and RMS in linear and dBFS units', () => {
    const meter = new MeterAccumulator()
    for (const sample of [1, -1, 0, 0]) {
      meter.addSample(sample)
    }

    const snapshot = meter.snapshot()
    expect(snapshot.frameCount).toBe(4)
    expect(snapshot.peakLinear).toBe(1)
    expect(snapshot.rmsLinear).toBeCloseTo(Math.SQRT1_2, 12)
    expect(snapshot.peakDbfs).toBeCloseTo(0, 12)
    expect(snapshot.rmsDbfs).toBeCloseTo(-3.010299956639812, 10)
  })

  it('consume resets the accumulation window deterministically', () => {
    const meter = new MeterAccumulator()
    meter.addSample(0.5)
    expect(meter.consume().frameCount).toBe(1)

    const empty = meter.snapshot()
    expect(empty.frameCount).toBe(0)
    expect(empty.peakLinear).toBe(0)
    expect(empty.rmsLinear).toBe(0)
    expect(empty.peakDbfs).toBe(-160)
    expect(empty.rmsDbfs).toBe(-160)
  })
})
