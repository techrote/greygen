import { describe, expect, it } from 'vitest'
import {
  blockStatistics,
  isFiniteBlock,
} from '../../src/audio/dsp/statistics'

describe('block statistics', () => {
  it('measures a known deterministic vector', () => {
    const statistics = blockStatistics(new Float32Array([1, -1, 1, -1]))

    expect(statistics).toEqual({
      count: 4,
      mean: 0,
      variance: 1,
      rms: 1,
      peakAbsolute: 1,
    })
  })

  it('detects invalid samples and rejects invalid statistical input', () => {
    expect(isFiniteBlock(new Float32Array([1, 0, -1]))).toBe(true)
    expect(isFiniteBlock([1, Number.NaN])).toBe(false)
    expect(() => blockStatistics([])).toThrow(RangeError)
    expect(() => blockStatistics([1, Number.POSITIVE_INFINITY])).toThrow(
      RangeError,
    )
  })
})
