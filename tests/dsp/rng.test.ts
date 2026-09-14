import { describe, expect, it } from 'vitest'
import {
  Xoshiro128StarStar,
  expandSeed,
  uint32ToBipolar,
} from '../../src/audio/dsp/rng'
import { blockStatistics } from '../../src/audio/dsp/statistics'

const SEED_ZERO_GOLDEN = [
  0x4d0e_705b, 0x4c8e_c075, 0x7800_bf96, 0xdcc1_d59d, 0xdd2a_4e9f,
  0x2cbf_bc45, 0xbf9d_e59b, 0x5227_0d4c, 0x48fa_2b0a, 0xc19b_e14f,
]

const SEEDED_STREAM_GOLDEN = [
  0x2784_7062, 0x1f2c_ee3b, 0x0136_10e4, 0xc9aa_3763, 0x3c80_2d26,
]

describe('xoshiro128** deterministic generator', () => {
  it('locks the seed expansion and seed-zero output vector', () => {
    expect(expandSeed(0)).toEqual([
      0x3cd6_e3f3, 0x1b14_7dcc, 0x4c08_1dbf, 0x4879_81ab,
    ])

    const generator = new Xoshiro128StarStar(0)
    const actual = SEED_ZERO_GOLDEN.map(() => generator.nextUint32())
    expect(actual).toEqual(SEED_ZERO_GOLDEN)
  })

  it('derives independent deterministic streams from the stream identifier', () => {
    const generator = new Xoshiro128StarStar(1, 7)
    const actual = SEEDED_STREAM_GOLDEN.map(() => generator.nextUint32())

    expect(actual).toEqual(SEEDED_STREAM_GOLDEN)
    expect(expandSeed(1, 7)).not.toEqual(expandSeed(1, 8))
  })

  it('rejects seeds and stream identifiers outside uint32', () => {
    expect(() => new Xoshiro128StarStar(-1)).toThrow(RangeError)
    expect(() => new Xoshiro128StarStar(0x1_0000_0000)).toThrow(RangeError)
    expect(() => new Xoshiro128StarStar(1, 1.5)).toThrow(RangeError)
  })
})

describe('bipolar noise mapping', () => {
  it('maps the uint32 endpoints into [-1, 1)', () => {
    expect(uint32ToBipolar(0)).toBe(-1)
    expect(uint32ToBipolar(0xffff_ffff)).toBeLessThan(1)
    expect(uint32ToBipolar(0xffff_ffff)).toBeGreaterThan(0.999999)
  })

  it('is reproducible and statistically sane over a long fixed fixture', () => {
    const frameCount = 1 << 18
    const first = new Float32Array(frameCount)
    const second = new Float32Array(frameCount)
    new Xoshiro128StarStar(0x1234_5678).fillBipolar(first)
    new Xoshiro128StarStar(0x1234_5678).fillBipolar(second)

    expect(second).toEqual(first)

    const statistics = blockStatistics(first)
    expect(Math.abs(statistics.mean)).toBeLessThan(0.005)
    expect(Math.abs(statistics.variance - 1 / 3)).toBeLessThan(0.005)
    expect(statistics.peakAbsolute).toBeLessThanOrEqual(1)
  })
})
