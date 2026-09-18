import {
  FFT_SIZE,
  WELCH_FIT_MAX_HZ,
  WELCH_FIT_MIN_HZ,
  WELCH_HOP_SIZE,
  estimatePsdDb,
  fitLogFrequencySlope,
} from '../../../tests/helpers/spectralAnalysis'
import {
  ANIMATION_DEPTH_MAX_DB,
  ANIMATION_SPEED_MAX,
  createAnimationState,
  getAnimationBandOffsets,
  type AnimationMode,
} from '../dsp/animation'
import {
  TEN_BAND_NOMINAL_FREQUENCIES_HZ,
  createTenBandFilterBank,
} from '../dsp/filterBank'
import { dbToAmplitude, rmsToDb } from '../dsp/math'
import { createSeededRng, type SeededRng } from '../dsp/prng'
import {
  createSpectrumState,
  getSpectrumBandOffsets,
  SPECTRAL_REALIZATION_VERSION,
  type SpectrumPresetId,
} from '../dsp/spectra'
import {
  createStereoWidthState,
  stereoWidthToCorrelation,
} from '../dsp/stereoWidth'
import {
  DSP_ENGINE_VERSION,
  DEFAULT_ENGINE_PRESET,
  DEFAULT_ENGINE_SEED,
  GreygenDspEngine,
} from '../dsp/engine'
import { createGainStageState } from '../dsp/gainSafety'

export const CHARACTERIZATION_REPORT_SCHEMA_VERSION = 1 as const
export const DEFAULT_CHARACTERIZATION_SAMPLE_RATE = 48_000
export const DEFAULT_CHARACTERIZATION_FRAME_COUNT = 2 ** 18
export const CHARACTERIZATION_MIN_FRAME_COUNT = FFT_SIZE

export interface CharacterizationEnvironment {
  runtime: string
  platform: string
  architecture: string
}

export interface CharacterizationOptions {
  sampleRate?: number
  frameCount?: number
  seed?: number
  presetId?: SpectrumPresetId
  stereoWidth?: number
  animationMode?: AnimationMode
  animationDepthDb?: number
  animationSpeed?: number
  animationEnergyPreserving?: boolean
  environment?: CharacterizationEnvironment
  now?: () => number
}

export interface PsdSlopeCharacterization {
  measuredDbPerOctave: number
  targetDbPerOctave: number
  errorDbPerOctave: number
  rSquared: number
}

export interface BlockStatistics {
  mean: number
  rms: number
  peak: number
}

export interface FilterBandCharacterization {
  nominalFrequencyHz: number
  centerResponseDb: number
}

export interface FilterBankCharacterization {
  highBandMode: 'bounded-bandpass' | 'degraded-high-shelf'
  neutralMaximumSampleError: number
  neutralMaximumMagnitudeDeviationDb: number
  nominalBandCenterResponses: FilterBandCharacterization[]
}

export interface AnimationCharacterization {
  enabled: boolean
  maximumAbsoluteOffsetDb: number
  meanAbsoluteBandPowerErrorDb: number
  maximumAbsoluteBandPowerErrorDb: number
}

export interface CharacterizationReport {
  schemaVersion: typeof CHARACTERIZATION_REPORT_SCHEMA_VERSION
  engine: {
    dspVersion: number
    spectralRealizationVersion: number
  }
  input: {
    sampleRate: number
    frameCount: number
    seed: number
    presetId: SpectrumPresetId
    stereoWidth: number
    targetStereoCorrelation: number
    animation: {
      mode: AnimationMode
      depthDb: number
      speed: number
      energyPreserving: boolean
    }
  }
  environment: CharacterizationEnvironment
  psd: {
    estimator: 'welch-hann'
    fftSize: number
    hopSize: number
    fitRangeHz: readonly [number, number]
    white: PsdSlopeCharacterization
    pink: PsdSlopeCharacterization
    brown: PsdSlopeCharacterization
  }
  filterBank: FilterBankCharacterization
  output: {
    left: BlockStatistics
    right: BlockStatistics
    stereoCorrelation: number
    rmsBalanceDb: number
  }
  safety: {
    targetPreGainDb: number
    appliedPreGainDb: number
    guardInterventions: number
  }
  animation: AnimationCharacterization
  benchmark: {
    renderedAudioSeconds: number
    wallTimeSeconds: number
    realtimeFactor: number | null
    informationalOnly: true
  }
}

const SPECTRAL_SLOPE_FIXTURE_SEED = 0x5350_4543
const FILTER_BANK_FIXTURE_SEED = 0x4642_414e
const DEFAULT_STEREO_WIDTH = 0.5
const MIN_POSITIVE_POWER = 1e-30

function assertSampleRate(sampleRate: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('sampleRate must be a finite positive number')
  }
  return sampleRate
}

function assertFrameCount(frameCount: number): number {
  if (
    !Number.isInteger(frameCount) ||
    frameCount < CHARACTERIZATION_MIN_FRAME_COUNT
  ) {
    throw new RangeError(
      `frameCount must be an integer >= ${CHARACTERIZATION_MIN_FRAME_COUNT}`,
    )
  }
  return frameCount
}

function assertUint32(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`)
  }
  return value
}

function blockStatistics(samples: Float32Array): BlockStatistics {
  let sum = 0
  let sumSquares = 0
  let peak = 0
  for (const sample of samples) {
    sum += sample
    sumSquares += sample * sample
    peak = Math.max(peak, Math.abs(sample))
  }
  return {
    mean: sum / samples.length,
    rms: Math.sqrt(sumSquares / samples.length),
    peak,
  }
}

function pearsonCorrelation(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length || left.length === 0) {
    throw new RangeError('stereo blocks must have equal non-zero length')
  }

  let sumLeft = 0
  let sumRight = 0
  for (let index = 0; index < left.length; index += 1) {
    sumLeft += left[index]
    sumRight += right[index]
  }
  const meanLeft = sumLeft / left.length
  const meanRight = sumRight / right.length

  let covariance = 0
  let varianceLeft = 0
  let varianceRight = 0
  for (let index = 0; index < left.length; index += 1) {
    const centeredLeft = left[index] - meanLeft
    const centeredRight = right[index] - meanRight
    covariance += centeredLeft * centeredRight
    varianceLeft += centeredLeft * centeredLeft
    varianceRight += centeredRight * centeredRight
  }

  const denominator = Math.sqrt(varianceLeft * varianceRight)
  return denominator > 0 ? covariance / denominator : 0
}

function rmsBalanceDb(leftRms: number, rightRms: number): number {
  return 20 * Math.log10(Math.max(leftRms, 1e-30) / Math.max(rightRms, 1e-30))
}

function seededNoise(frameCount: number, seed: number): Float32Array {
  const rng = createSeededRng(seed)
  const samples = new Float32Array(frameCount)
  for (let index = 0; index < frameCount; index += 1) {
    samples[index] = rng.nextFloatSigned()
  }
  return samples
}

function characterizePsdSlope(
  samples: Float32Array,
  sampleRate: number,
  targetDbPerOctave: number,
): PsdSlopeCharacterization {
  const psd = estimatePsdDb(samples, sampleRate)
  const fit = fitLogFrequencySlope(
    psd,
    WELCH_FIT_MIN_HZ,
    Math.min(WELCH_FIT_MAX_HZ, sampleRate * 0.45),
  )
  return {
    measuredDbPerOctave: fit.slopeDbPerOctave,
    targetDbPerOctave,
    errorDbPerOctave: fit.slopeDbPerOctave - targetDbPerOctave,
    rSquared: fit.rSquared,
  }
}

function renderSpectralFixture(
  presetId: SpectrumPresetId,
  sampleRate: number,
  frameCount: number,
  seed: number,
): Float32Array {
  const engine = new GreygenDspEngine({
    sampleRate,
    seed,
    spectrumState: createSpectrumState(presetId),
    gainStageState: createGainStageState(),
    stereoWidthState: createStereoWidthState(0),
    animationState: createAnimationState('off', 0),
  })
  const left = new Float32Array(frameCount)
  const right = new Float32Array(frameCount)
  engine.renderStereo(left, right)
  return left
}

function characterizePsd(
  sampleRate: number,
  frameCount: number,
): CharacterizationReport['psd'] {
  const spectralFrameCount = Math.max(frameCount, 32_768)
  return {
    estimator: 'welch-hann',
    fftSize: FFT_SIZE,
    hopSize: WELCH_HOP_SIZE,
    fitRangeHz: [WELCH_FIT_MIN_HZ, WELCH_FIT_MAX_HZ],
    white: characterizePsdSlope(
      renderSpectralFixture(
        'white',
        sampleRate,
        spectralFrameCount,
        SPECTRAL_SLOPE_FIXTURE_SEED,
      ),
      sampleRate,
      0,
    ),
    pink: characterizePsdSlope(
      renderSpectralFixture(
        'pink',
        sampleRate,
        spectralFrameCount,
        SPECTRAL_SLOPE_FIXTURE_SEED,
      ),
      sampleRate,
      -3.010299956639812,
    ),
    brown: characterizePsdSlope(
      renderSpectralFixture(
        'brown',
        sampleRate,
        spectralFrameCount,
        SPECTRAL_SLOPE_FIXTURE_SEED,
      ),
      sampleRate,
      -6.020599913279624,
    ),
  }
}

function characterizeFilterBank(
  sampleRate: number,
  frameCount: number,
): FilterBankCharacterization {
  const filterBank = createTenBandFilterBank(sampleRate)
  const input = seededNoise(frameCount, FILTER_BANK_FIXTURE_SEED)
  const bands = TEN_BAND_NOMINAL_FREQUENCIES_HZ.map(
    () => new Float32Array(frameCount),
  )
  const reconstructed = new Float32Array(frameCount)
  let neutralMaximumSampleError = 0

  for (let frame = 0; frame < frameCount; frame += 1) {
    const bandValues = filterBank.processSample(input[frame])
    let sum = 0
    for (let band = 0; band < bandValues.length; band += 1) {
      bands[band][frame] = bandValues[band]
      sum += bandValues[band]
    }
    reconstructed[frame] = sum
    neutralMaximumSampleError = Math.max(
      neutralMaximumSampleError,
      Math.abs(sum - input[frame]),
    )
  }

  const inputPsd = estimatePsdDb(input, sampleRate)
  const reconstructedPsd = estimatePsdDb(reconstructed, sampleRate)
  let neutralMaximumMagnitudeDeviationDb = 0
  for (let index = 0; index < inputPsd.length; index += 1) {
    const frequency = inputPsd[index].frequencyHz
    if (frequency < 20 || frequency > sampleRate * 0.45) {
      continue
    }
    neutralMaximumMagnitudeDeviationDb = Math.max(
      neutralMaximumMagnitudeDeviationDb,
      Math.abs(
        reconstructedPsd[index].powerDb - inputPsd[index].powerDb,
      ),
    )
  }

  const nominalBandCenterResponses = bands.map((bandSamples, index) => {
    const nominalFrequencyHz = TEN_BAND_NOMINAL_FREQUENCIES_HZ[index]
    const psd = estimatePsdDb(bandSamples, sampleRate)
    const nearest = psd.reduce((best, candidate) =>
      Math.abs(candidate.frequencyHz - nominalFrequencyHz) <
      Math.abs(best.frequencyHz - nominalFrequencyHz)
        ? candidate
        : best,
    )
    const inputNearest = inputPsd.reduce((best, candidate) =>
      Math.abs(candidate.frequencyHz - nominalFrequencyHz) <
      Math.abs(best.frequencyHz - nominalFrequencyHz)
        ? candidate
        : best,
    )
    return {
      nominalFrequencyHz,
      centerResponseDb: nearest.powerDb - inputNearest.powerDb,
    }
  })

  return {
    highBandMode:
      sampleRate >= 96_000 ? 'bounded-bandpass' : 'degraded-high-shelf',
    neutralMaximumSampleError,
    neutralMaximumMagnitudeDeviationDb,
    nominalBandCenterResponses,
  }
}

function characterizeAnimation(
  mode: AnimationMode,
  depthDb: number,
  speed: number,
  energyPreserving: boolean,
  sampleRate: number,
  frameCount: number,
  seed: number,
): AnimationCharacterization {
  if (mode === 'off') {
    return {
      enabled: false,
      maximumAbsoluteOffsetDb: 0,
      meanAbsoluteBandPowerErrorDb: 0,
      maximumAbsoluteBandPowerErrorDb: 0,
    }
  }

  const state = createAnimationState(
    mode,
    seed,
    depthDb,
    speed,
    energyPreserving,
  )
  let maximumAbsoluteOffsetDb = 0
  let sumAbsoluteBandPowerErrorDb = 0
  let maximumAbsoluteBandPowerErrorDb = 0

  for (let frame = 0; frame < frameCount; frame += 1) {
    const offsets = getAnimationBandOffsets(state, frame, sampleRate)
    let bandPower = 0
    for (const offsetDb of offsets) {
      maximumAbsoluteOffsetDb = Math.max(
        maximumAbsoluteOffsetDb,
        Math.abs(offsetDb),
      )
      const amplitude = dbToAmplitude(offsetDb)
      bandPower += amplitude * amplitude
    }
    const meanBandPower = bandPower / offsets.length
    const powerErrorDb = Math.abs(rmsToDb(Math.sqrt(meanBandPower)))
    sumAbsoluteBandPowerErrorDb += powerErrorDb
    maximumAbsoluteBandPowerErrorDb = Math.max(
      maximumAbsoluteBandPowerErrorDb,
      powerErrorDb,
    )
  }

  return {
    enabled: true,
    maximumAbsoluteOffsetDb,
    meanAbsoluteBandPowerErrorDb: sumAbsoluteBandPowerErrorDb / frameCount,
    maximumAbsoluteBandPowerErrorDb,
  }
}

function defaultEnvironment(): CharacterizationEnvironment {
  return {
    runtime: 'unspecified',
    platform: 'unspecified',
    architecture: 'unspecified',
  }
}

export function characterizeDsp(
  options: CharacterizationOptions = {},
): CharacterizationReport {
  const sampleRate = assertSampleRate(
    options.sampleRate ?? DEFAULT_CHARACTERIZATION_SAMPLE_RATE,
  )
  const frameCount = assertFrameCount(
    options.frameCount ?? DEFAULT_CHARACTERIZATION_FRAME_COUNT,
  )
  const seed = assertUint32(options.seed ?? DEFAULT_ENGINE_SEED, 'seed')
  const presetId = options.presetId ?? DEFAULT_ENGINE_PRESET
  const stereoWidth = options.stereoWidth ?? DEFAULT_STEREO_WIDTH
  const animationMode = options.animationMode ?? 'off'
  const animationDepthDb = options.animationDepthDb ?? 4
  const animationSpeed = options.animationSpeed ?? 1
  const animationEnergyPreserving = options.animationEnergyPreserving ?? true
  const now = options.now ?? (() => globalThis.performance.now())

  const animationSeed = (seed ^ 0x414e_494d) >>> 0
  const animationState = createAnimationState(
    animationMode,
    animationSeed,
    animationDepthDb,
    animationSpeed,
    animationEnergyPreserving,
  )
  const engine = new GreygenDspEngine({
    sampleRate,
    seed,
    spectrumState: createSpectrumState(presetId),
    gainStageState: createGainStageState(),
    stereoWidthState: createStereoWidthState(stereoWidth),
    animationState,
  })
  const left = new Float32Array(frameCount)
  const right = new Float32Array(frameCount)
  const startedAt = now()
  engine.renderStereo(left, right)
  const wallTimeMs = Math.max(0, now() - startedAt)
  const telemetry = engine.consumeTelemetry()
  const leftStats = blockStatistics(left)
  const rightStats = blockStatistics(right)
  const renderedAudioSeconds = frameCount / sampleRate

  return {
    schemaVersion: CHARACTERIZATION_REPORT_SCHEMA_VERSION,
    engine: {
      dspVersion: DSP_ENGINE_VERSION,
      spectralRealizationVersion: SPECTRAL_REALIZATION_VERSION,
    },
    input: {
      sampleRate,
      frameCount,
      seed,
      presetId,
      stereoWidth,
      targetStereoCorrelation: stereoWidthToCorrelation(stereoWidth),
      animation: {
        mode: animationMode,
        depthDb: animationDepthDb,
        speed: animationSpeed,
        energyPreserving: animationEnergyPreserving,
      },
    },
    environment: options.environment ?? defaultEnvironment(),
    psd: characterizePsd(sampleRate, frameCount),
    filterBank: characterizeFilterBank(sampleRate, frameCount),
    output: {
      left: leftStats,
      right: rightStats,
      stereoCorrelation: pearsonCorrelation(left, right),
      rmsBalanceDb: rmsBalanceDb(leftStats.rms, rightStats.rms),
    },
    safety: {
      targetPreGainDb: telemetry.targetPreGainDb,
      appliedPreGainDb: telemetry.appliedPreGainDb,
      guardInterventions: telemetry.guardInterventions,
    },
    animation: characterizeAnimation(
      animationMode,
      animationDepthDb,
      animationSpeed,
      animationEnergyPreserving,
      sampleRate,
      frameCount,
      animationSeed,
    ),
    benchmark: {
      renderedAudioSeconds,
      wallTimeSeconds: wallTimeMs / 1000,
      realtimeFactor: wallTimeMs > 0 ? (renderedAudioSeconds * 1000) / wallTimeMs : null,
      informationalOnly: true,
    },
  }
}

function formatSigned(value: number, digits: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
}

function formatScientific(value: number): string {
  return value.toExponential(3)
}

function formatPsdLine(
  label: string,
  result: PsdSlopeCharacterization,
): string {
  return `  ${label}: ${formatSigned(result.measuredDbPerOctave, 4)} dB/oct (target ${formatSigned(result.targetDbPerOctave, 4)}; error ${formatSigned(result.errorDbPerOctave, 4)}; R² ${result.rSquared.toFixed(4)})`
}

export function formatCharacterizationReport(
  report: CharacterizationReport,
): string {
  const lines = [
    `Greygen DSP characterization v${report.schemaVersion}`,
    `engine DSP v${report.engine.dspVersion}; spectral realization v${report.engine.spectralRealizationVersion}`,
    `input: ${report.input.sampleRate} Hz, ${report.input.frameCount} frames, seed 0x${report.input.seed.toString(16).padStart(8, '0')}, preset ${report.input.presetId}`,
    `environment: ${report.environment.runtime}; ${report.environment.platform}/${report.environment.architecture}`,
    `PSD fit: ${report.psd.fitRangeHz[0]}..${report.psd.fitRangeHz[1]} Hz, Welch ${report.psd.fftSize}`,
    formatPsdLine('white', report.psd.white),
    formatPsdLine('pink', report.psd.pink),
    formatPsdLine('brown', report.psd.brown),
    `filter bank: ${report.filterBank.highBandMode}; neutral max sample error ${report.filterBank.neutralMaximumSampleError.toExponential(3)}; max magnitude deviation ${report.filterBank.neutralMaximumMagnitudeDeviationDb.toFixed(6)} dB`,
    `stereo: correlation ${report.output.stereoCorrelation.toFixed(4)} (target ${report.input.targetStereoCorrelation.toFixed(4)}); L/R RMS balance ${report.output.rmsBalanceDb.toFixed(4)} dB`,
    `output: L mean ${formatScientific(report.output.left.mean)}, RMS ${report.output.left.rms.toFixed(4)}, peak ${report.output.left.peak.toFixed(4)}; R mean ${formatScientific(report.output.right.mean)}, RMS ${report.output.right.rms.toFixed(4)}, peak ${report.output.right.peak.toFixed(4)}`,
    `safety: target ${report.safety.targetPreGainDb.toFixed(4)} dB, applied ${report.safety.appliedPreGainDb.toFixed(4)} dB, guard interventions ${report.safety.guardInterventions}`,
    report.animation.enabled
      ? `animation: max |offset| ${report.animation.maximumAbsoluteOffsetDb.toFixed(4)} dB; mean/max power error ${report.animation.meanAbsoluteBandPowerErrorDb.toExponential(3)}/${report.animation.maximumAbsoluteBandPowerErrorDb.toExponential(3)} dB`
      : 'animation: off',
    `benchmark: ${report.benchmark.renderedAudioSeconds.toFixed(3)} s audio in ${(report.benchmark.wallTimeSeconds * 1000).toFixed(2)} ms (${report.benchmark.realtimeFactor === null ? 'n/a' : `${report.benchmark.realtimeFactor.toFixed(2)}x`} realtime; informational only)`,
  ]
  return `${lines.join('\n')}\n`
}
