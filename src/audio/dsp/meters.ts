import { gainToDecibels } from './numbers'

export interface MeterSnapshot {
  readonly frameCount: number
  readonly peakLinear: number
  readonly rmsLinear: number
  readonly peakDbfs: number
  readonly rmsDbfs: number
}

export class MeterAccumulator {
  private frameCountValue = 0
  private peakAbsoluteValue = 0
  private sumSquaresValue = 0

  get frameCount(): number {
    return this.frameCountValue
  }

  addSample(sample: number): void {
    const absolute = Math.abs(sample)
    if (absolute > this.peakAbsoluteValue) {
      this.peakAbsoluteValue = absolute
    }
    this.sumSquaresValue += sample * sample
    this.frameCountValue += 1
  }

  snapshot(): MeterSnapshot {
    const rmsLinear =
      this.frameCountValue > 0
        ? Math.sqrt(this.sumSquaresValue / this.frameCountValue)
        : 0

    return {
      frameCount: this.frameCountValue,
      peakLinear: this.peakAbsoluteValue,
      rmsLinear,
      peakDbfs: gainToDecibels(this.peakAbsoluteValue),
      rmsDbfs: gainToDecibels(rmsLinear),
    }
  }

  consume(): MeterSnapshot {
    const result = this.snapshot()
    this.reset()
    return result
  }

  reset(): void {
    this.frameCountValue = 0
    this.peakAbsoluteValue = 0
    this.sumSquaresValue = 0
  }
}
