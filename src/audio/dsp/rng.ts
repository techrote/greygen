const UINT32_MAX = 0xffff_ffff
const UINT32_RANGE = 0x1_0000_0000
const GOLDEN_RATIO_32 = 0x9e37_79b9
const BIPOLAR_SCALE = 2 / UINT32_RANGE

export type Xoshiro128State = readonly [number, number, number, number]

function assertUint32(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`)
  }

  return value >>> 0
}

function mixSeedWord(value: number): number {
  let mixed = value >>> 0
  mixed ^= mixed >>> 16
  mixed = Math.imul(mixed, 0x85eb_ca6b) >>> 0
  mixed ^= mixed >>> 13
  mixed = Math.imul(mixed, 0xc2b2_ae35) >>> 0
  mixed ^= mixed >>> 16
  return mixed >>> 0
}

function rotateLeft32(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0
}

export function expandSeed(seed: number, streamId = 0): Xoshiro128State {
  const validatedSeed = assertUint32(seed, 'seed')
  const validatedStream = assertUint32(streamId, 'streamId')
  let cursor =
    (validatedSeed ^
      Math.imul((validatedStream + 1) >>> 0, GOLDEN_RATIO_32)) >>>
    0

  cursor = (cursor + GOLDEN_RATIO_32) >>> 0
  let s0 = mixSeedWord(cursor)
  cursor = (cursor + GOLDEN_RATIO_32) >>> 0
  const s1 = mixSeedWord(cursor)
  cursor = (cursor + GOLDEN_RATIO_32) >>> 0
  const s2 = mixSeedWord(cursor)
  cursor = (cursor + GOLDEN_RATIO_32) >>> 0
  const s3 = mixSeedWord(cursor)

  if ((s0 | s1 | s2 | s3) === 0) {
    s0 = 0x6d2b_79f5
  }

  return [s0, s1, s2, s3]
}

export function uint32ToBipolar(value: number): number {
  const validatedValue = assertUint32(value, 'value')
  return validatedValue * BIPOLAR_SCALE - 1
}

export class Xoshiro128StarStar {
  private s0: number
  private s1: number
  private s2: number
  private s3: number

  constructor(seed: number, streamId = 0) {
    const state = expandSeed(seed, streamId)
    this.s0 = state[0]
    this.s1 = state[1]
    this.s2 = state[2]
    this.s3 = state[3]
  }

  getState(): Xoshiro128State {
    return [this.s0, this.s1, this.s2, this.s3]
  }

  nextUint32(): number {
    const result =
      Math.imul(rotateLeft32(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0
    const shifted = (this.s1 << 9) >>> 0

    this.s2 = (this.s2 ^ this.s0) >>> 0
    this.s3 = (this.s3 ^ this.s1) >>> 0
    this.s1 = (this.s1 ^ this.s2) >>> 0
    this.s0 = (this.s0 ^ this.s3) >>> 0
    this.s2 = (this.s2 ^ shifted) >>> 0
    this.s3 = rotateLeft32(this.s3, 11)

    return result
  }

  nextUnitFloat(): number {
    return this.nextUint32() / UINT32_RANGE
  }

  nextBipolar(): number {
    return this.nextUint32() * BIPOLAR_SCALE - 1
  }

  fillBipolar(output: Float32Array): void {
    for (let index = 0; index < output.length; index += 1) {
      output[index] = this.nextBipolar()
    }
  }
}
