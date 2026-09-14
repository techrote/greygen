import { TenBandFilterBank, type HighBandMode } from './filterBank'
import { Xoshiro128StarStar } from './rng'
import {
  type SpectralPresetId,
  type SpectrumState,
  applySpectrumStateToFilterBank,
  createSpectrumState,
} from './spectra'

export const DEFAULT_ENGINE_SEED = 0x4752_4559
export const DEFAULT_ENGINE_PRESET: SpectralPresetId = 'grey'

export interface GreygenDspEngineOptions {
  readonly sampleRate: number
  readonly seed?: number
  readonly spectrumState?: SpectrumState
}

export interface GreygenDspResetOptions {
  readonly seed?: number
  readonly spectrumState?: SpectrumState
}

function canonicalSpectrumState(state: SpectrumState): SpectrumState {
  return createSpectrumState(state.targetId, state.userBandOffsetsDb)
}

export class GreygenDspEngine {
  readonly sampleRate: number

  private readonly filterBank: TenBandFilterBank
  private generator: Xoshiro128StarStar
  private seedValue: number
  private spectrumStateValue: SpectrumState

  constructor(options: GreygenDspEngineOptions) {
    this.sampleRate = options.sampleRate
    this.filterBank = new TenBandFilterBank(options.sampleRate)
    this.seedValue = options.seed ?? DEFAULT_ENGINE_SEED
    this.generator = new Xoshiro128StarStar(this.seedValue)
    this.spectrumStateValue = options.spectrumState
      ? canonicalSpectrumState(options.spectrumState)
      : createSpectrumState(DEFAULT_ENGINE_PRESET)
    applySpectrumStateToFilterBank(this.filterBank, this.spectrumStateValue)
  }

  get seed(): number {
    return this.seedValue
  }

  get spectrumState(): SpectrumState {
    return this.spectrumStateValue
  }

  get targetId(): SpectralPresetId {
    return this.spectrumStateValue.targetId
  }

  get highBandMode(): HighBandMode {
    return this.filterBank.highBandMode
  }

  setSeed(seed: number): void {
    const nextGenerator = new Xoshiro128StarStar(seed)
    this.seedValue = seed
    this.generator = nextGenerator
  }

  setSpectrumState(state: SpectrumState): void {
    const canonical = canonicalSpectrumState(state)
    applySpectrumStateToFilterBank(this.filterBank, canonical)
    this.spectrumStateValue = canonical
  }

  reset(options: GreygenDspResetOptions = {}): void {
    const nextSeed = options.seed ?? this.seedValue
    const nextGenerator = new Xoshiro128StarStar(nextSeed)
    const nextSpectrum = options.spectrumState
      ? canonicalSpectrumState(options.spectrumState)
      : this.spectrumStateValue

    this.filterBank.reset()
    applySpectrumStateToFilterBank(this.filterBank, nextSpectrum)
    this.seedValue = nextSeed
    this.generator = nextGenerator
    this.spectrumStateValue = nextSpectrum
  }

  renderMono(output: Float32Array): void {
    for (let index = 0; index < output.length; index += 1) {
      output[index] = this.filterBank.processSample(
        this.generator.nextBipolar(),
      )
    }
  }
}
