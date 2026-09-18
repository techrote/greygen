import { fitPsdSlopeDbPerOctave, welchPsd } from './spectrum'
import {
  type AnimationMode,
  SpectralAnimation,
  createAnimationState,
} from '../dsp/animation'
import {
  DEFAULT_ENGINE_PRESET,
  DEFAULT_ENGINE_SEED,
  DSP_ENGINE_VERSION,
  GreygenDspEngine,
} from '../dsp/engine'
import {
  BAND_COUNT,
  NOMINAL_BAND_CENTERS_HZ,
  TenBandFilterBank,
} from '../dsp/filterBank'
import { createGainStageState } from '../dsp/gainSafety'
import { gainToDecibels } from '../dsp/numbers'
import { Xoshiro128StarStar } from '../dsp/rng'
import { blockStatistics } from '../dsp/statistics'
import {
  BROWN_PSD_SLOPE_DB_PER_OCTAVE,
  PINK_PSD_SLOPE_DB_PER_OCTAVE,
  PRESET_PSD_FIT_MAXIMUM_HZ,
  PRESET_PSD_FIT_MINIMUM_HZ,
  SPECTRAL_REALIZATION_VERSION,
  WHITE_PSD_SLOPE_DB_PER_OCTAVE,
  type SpectralPresetId,
  applySpectrumStateToFilterBank,
  createSpectrumState,
} from '../dsp/spectra'
import {
  DEFAULT_STEREO_WIDTH,
  createStereoWidthState,
  stereoWidthToCorrelation,
} from '../dsp/stereo'

export const CHARACTERIZATION_REPORT_SCHEMA_VERSION = 1 as const
export const DEFAULT_CHARACTERIZATION_SAMPLE_RATE = 48_000
export const DEFAULT_CHARACTERIZATION_FRAME_COUNT = 1 << 18
export const CHARACTERIZATION_WELCH_SEGMENT_LENGTH = 2048

const SPECTRAL_PRESETS = [
  ['white', WHITE_PSD_SLOPE_DB_PER_OCTAVE],
  ['pink', PINK_PSD_SLOPE_DB_PER_OCTAVE],
  ['brown', BROWN_PSD_SLOPE_DB_PER_OCTAVE],
] as const

export interface CharacterizationEnvironment {
  readonly runtime: string
  readonly platform: string
  readonly architecture: string
}

export interface CharacterizationOptions {
  readonly sampleRate?: number
  readonly frameCount?: number
  readonly seed?: number
  readonly presetId?: SpectralPresetId
  readonly stereoWidth?: number
  readonly animationMode?: AnimationMode
  readonly animationDepthDb?: number
  readonly animationSpeed?: number
  readonly animationEnergyPreserving?: boolean
  readonly environment?: CharacterizationEnvironment
  readonly now?: () => number
}

export interface SpectralSlopeCharacterization {
  readonly presetId: 'white' | 'pink' | 'brown'
  readonly expectedDbPerOctave: number
  readonly measuredDbPerOctave: number
  readonly errorDbPerOctave: number
  readonly rSquared: number
  readonly binCount: number
}

export interface BandResponseCharacterization {
  readonly bandIndex: number
  readonly nominalCenterHz: number
  readonly isolatedCenterResponseDb: number
}

export interface CharacterizationReport {
  readonly schemaVersion: typeof CHARACTERIZATION_REPORT_SCHEMA_VERSION
  readonly engine: {
    readonly dspVersion: number
    readonly spectralRealizationVersion: number
  }
  readonly input: {
    readonly sampleRate: number
    readonly frameCount: number
    readonly seed: number
    readonly presetId: SpectralPresetId
    readonly stereoWidth: number
    readonly targetStereoCorrelation: number
    readonly animation: {
      readonly mode: AnimationMode
      readonly depthDb: number
      readonly speed: number
      readonly energyPreserving: boolean
    }
  }
  readonly environment: CharacterizationEnvironment
  readonly spectral: {
    readonly fitRangeHz: readonly [number, number]
    readonly welchSegmentLength: number
    readonly presets: readonly SpectralSlopeCharacterization[]
  }
  readonly filterBank: {
    readonly highBandMode: string
    readonly neutralMaximumAbsoluteSampleError: number
    readonly neutralMaximumMagnitudeDeviationDb: number
    readonly bands: readonly BandResponseCharacterization[]
  }
  readonly output: {
    readonly left: {
      readonly mean: number
      readonly rms: number
      readonly peakAbsolute: number
    }
    readonly right: {
      readonly mean: number
      readonly rms: number
      readonly peakAbsolute: number
    }
    readonly stereoCorrelation: number
    readonly stereoRmsBalanceDb: number
  }
  readonly safety: {
    readonly targetPreGainDb: number
    readonly appliedPreGainDb: number
    readonly guardInterventions: number
  }
  readonly animation: {
    readonly enabled: boolean
    readonly maximumAbsoluteOffsetDb: number
    readonly meanAbsoluteBandPowerErrorDb: number
    readonly maximumAbsoluteBandPowerErrorDb: number
  }
  readonly benchmark: {
    readonly renderedAudioSeconds: number
    readonly wallTimeMs: number
    readonly realtimeFactor: number | null
    readonly informationalOnly: true
  }
}

function assertSampleRate(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('sampleRate must be finite and positive')
  }
  return value
}

function assertFrameCount(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < CHARACTERIZATION_WELCH_SEGMENT_LENGTH
  ) {
    throw new RangeError(
      `frameCount must be a safe integer >= ${CHARACTERIZATION_WELCH_SEGMENT_LENGTH}`,
    )
  }
  return value
}

function assertUint32(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`)
  }
  return value
}

function renderPreset(
  presetId: SpectralPresetId,
  sampleRate: number,
  frameCount: number,
  seed: number,
): Float32Array {
  const bank = new TenBandFilterBank(sampleRate)
  applySpectrumStateToFilterBank(bank, createSpectrumState(presetId))
  const generator = new Xoshiro128StarStar(seed, sampleRate)
  const output = new Float32Array(frameCount)

  for (let index = 0; index < frameCount; index += 1) {
    output[index] = bank.processSample(generator.nextBipolar())
  }

  return output
}

function characterizeSpectralSlopes(
  sampleRate: number,
  frameCount: number,
  seed: number,
): readonly SpectralSlopeCharacterization[] {
  return SPECTRAL_PRESETS.map(([presetId, expectedDbPerOctave]) => {
    const samples = renderPreset(presetId, sampleRate, frameCount, seed)
    const fit = fitPsdSlopeDbPerOctave(
      welchPsd(samples, sampleRate, CHARACTERIZATION_WELCH_SEGMENT_LENGTH),
      PRESET_PSD_FIT_MINIMUM_HZ,
      PRESET_PSD_FIT_MAXIMUM_HZ,
    )
    return {
      presetId,
      expectedDbPerOctave,
      measuredDbPerOctave: fit.slopeDbPerOctave,
      errorDbPerOctave: fit.slopeDbPerOctave - expectedDbPerOctave,
      rSquared: fit.rSquared,
      binCount: fit.binCount,
    }
  })
}

function sineResponseDb(
  bank: TenBandFilterBank,
  frequencyHz: number,
  sampleRate: number,
): number {
  const settleFrames = Math.max(4096, Math.ceil((sampleRate / frequencyHz) * 8))
  const measureFrames = Math.max(
    8192,
    Math.ceil((sampleRate / frequencyHz) * 16),
  )
  let inputPower = 0
  let outputPower = 0
  let phase = 0
  const phaseIncrement = (Math.PI * 2 * frequencyHz) / sampleRate

  for (let frame = 0; frame < settleFrames + measureFrames; frame += 1) {
    const input = Math.sin(phase)
    phase += phaseIncrement
    if (phase >= Math.PI * 2) {
      phase -= Math.PI * 2
    }
    const output = bank.processSample(input)
    if (frame >= settleFrames) {
      inputPower += input * input
      outputPower += output * output
    }
  }

  const gain = Math.sqrt(outputPower / inputPower)
  return gainToDecibels(gain)
}

function characterizeFilterBank(
  sampleRate: number,
): CharacterizationReport['filterBank'] {
  const neutral = new TenBandFilterBank(sampleRate)
  const impulseFrames = 32_768
  let maxSampleError = 0
  for (let frame = 0; frame < impulseFrames; frame += 1) {
    const input = frame === 0 ? 1 : 0
    const output = neutral.processSample(input)
    maxSampleError = Math.max(maxSampleError, Math.abs(output - input))
  }

  const maximumProbeHz = Math.min(20_000, sampleRate * 0.45)
  const probeCount = 24
  let maxMagnitudeDeviationDb = 0
  for (let index = 0; index < probeCount; index += 1) {
    const position = index / (probeCount - 1)
    const frequencyHz = 20 * (maximumProbeHz / 20) ** position
    const responseDb = sineResponseDb(
      new TenBandFilterBank(sampleRate),
      frequencyHz,
      sampleRate,
    )
    maxMagnitudeDeviationDb = Math.max(
      maxMagnitudeDeviationDb,
      Math.abs(responseDb),
    )
  }

  const bands = NOMINAL_BAND_CENTERS_HZ.map((nominalCenterHz, bandIndex) => {
    const bank = new TenBandFilterBank(sampleRate)
    const gains = new Float64Array(BAND_COUNT)
    gains[bandIndex] = 1
    bank.setBandGainsLinear(gains)
    bank.setUltrasonicResidualGainLinear(0)
    return {
      bandIndex,
      nominalCenterHz,
      isolatedCenterResponseDb: sineResponseDb(
        bank,
        nominalCenterHz,
        sampleRate,
      ),
    }
  })

  return {
    highBandMode: neutral.highBandMode,
    neutralMaximumAbsoluteSampleError: maxSampleError,
    neutralMaximumMagnitudeDeviationDb: maxMagnitudeDeviationDb,
    bands,
  }
}

function pearsonCorrelation(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
): number {
  if (left.length !== right.length || left.length < 2) {
    throw new RangeError('correlation inputs must have equal length >= 2')
  }

  let meanLeft = 0
  let meanRight = 0
  let covariance = 0
  let varianceLeft = 0
  let varianceRight = 0

  for (let index = 0; index < left.length; index += 1) {
    const count = index + 1
    const leftDelta = left[index] - meanLeft
    const rightDelta = right[index] - meanRight
    meanLeft += leftDelta / count
    meanRight += rightDelta / count
    covariance += leftDelta * (right[index] - meanRight)
    varianceLeft += leftDelta * (left[index] - meanLeft)
    varianceRight += rightDelta * (right[index] - meanRight)
  }

  const denominator = Math.sqrt(varianceLeft * varianceRight)
  return denominator > 0 ? covariance / denominator : 1
}

function characterizeAnimation(
  sampleRate: number,
  frameCount: number,
  mode: AnimationMode,
  seed: number,
  depthDb: number,
  speed: number,
  energyPreserving: boolean,
): CharacterizationReport['animation'] {
  if (mode === 'off') {
    return {
      enabled: false,
      maximumAbsoluteOffsetDb: 0,
      meanAbsoluteBandPowerErrorDb: 0,
      maximumAbsoluteBandPowerErrorDb: 0,
    }
  }

  const animation = new SpectralAnimation(
    sampleRate,
    createAnimationState(mode, seed, depthDb, speed, energyPreserving),
  )
  const offsetsDb = new Float64Array(BAND_COUNT)
  let maximumAbsoluteOffsetDb = 0
  let sumAbsoluteBandPowerErrorDb = 0
  let maximumAbsoluteBandPowerErrorDb = 0

  for (let frame = 0; frame < frameCount; frame += 1) {
    animation.nextOffsets(offsetsDb)
    let meanBandPower = 0
    for (let band = 0; band < BAND_COUNT; band += 1) {
      maximumAbsoluteOffsetDb = Math.max(
        maximumAbsoluteOffsetDb,
        Math.abs(offsetsDb[band]),
      )
      meanBandPower += 10 ** (offsetsDb[band] / 10)
    }
    meanBandPower /= BAND_COUNT
    const powerErrorDb = Math.abs(10 * Math.log10(meanBandPower))
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

  const animationState = createAnimationState(
    animationMode,
    (seed ^ 0x414e_494d) >>> 0,
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
    spectral: {
      fitRangeHz: [PRESET_PSD_FIT_MINIMUM_HZ, PRESET_PSD_FIT_MAXIMUM_HZ],
      welchSegmentLength: CHARACTERIZATION_WELCH_SEGMENT_LENGTH,
      presets: characterizeSpectralSlopes(sampleRate, frameCount, seed),
    },
    filterBank: characterizeFilterBank(sampleRate),
    output: {
      left: {
        mean: leftStats.mean,
        rms: leftStats.rms,
        peakAbsolute: leftStats.peakAbsolute,
      },
      right: {
        mean: rightStats.mean,
        rms: rightStats.rms,
        peakAbsolute: rightStats.peakAbsolute,
      },
      stereoCorrelation: pearsonCorrelation(left, right),
      stereoRmsBalanceDb: 20 * Math.log10(leftStats.rms / rightStats.rms),
    },
    safety: {
      targetPreGainDb: telemetry.safetyPreGainTargetDb,
      appliedPreGainDb: telemetry.safetyPreGainDb,
      guardInterventions: telemetry.guardInterventions,
    },
    animation: characterizeAnimation(
      sampleRate,
      frameCount,
      animationMode,
      animationState.seed,
      animationDepthDb,
      animationSpeed,
      animationEnergyPreserving,
    ),
    benchmark: {
      renderedAudioSeconds,
      wallTimeMs,
      realtimeFactor:
        wallTimeMs > 0 ? renderedAudioSeconds / (wallTimeMs / 1000) : null,
      informationalOnly: true,
    },
  }
}

function fixed(value: number, digits = 4): string {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value)
}

export function formatCharacterizationReport(
  report: CharacterizationReport,
): string {
  const lines = [
    `Greygen DSP characterization v${report.schemaVersion}`,
    `engine DSP v${report.engine.dspVersion}; spectral realization v${report.engine.spectralRealizationVersion}`,
    `input: ${report.input.sampleRate} Hz, ${report.input.frameCount} frames, seed 0x${report.input.seed.toString(16).padStart(8, '0')}, preset ${report.input.presetId}`,
    `environment: ${report.environment.runtime}; ${report.environment.platform}/${report.environment.architecture}`,
    `PSD fit: ${report.spectral.fitRangeHz[0]}..${report.spectral.fitRangeHz[1]} Hz, Welch ${report.spectral.welchSegmentLength}`,
  ]

  for (const preset of report.spectral.presets) {
    lines.push(
      `  ${preset.presetId}: ${fixed(preset.measuredDbPerOctave)} dB/oct (target ${fixed(preset.expectedDbPerOctave)}; error ${fixed(preset.errorDbPerOctave)}; R² ${fixed(preset.rSquared)})`,
    )
  }

  lines.push(
    `filter bank: ${report.filterBank.highBandMode}; neutral max sample error ${report.filterBank.neutralMaximumAbsoluteSampleError.toExponential(3)}; max magnitude deviation ${fixed(report.filterBank.neutralMaximumMagnitudeDeviationDb, 6)} dB`,
    `stereo: correlation ${fixed(report.output.stereoCorrelation)} (target ${fixed(report.input.targetStereoCorrelation)}); L/R RMS balance ${fixed(report.output.stereoRmsBalanceDb)} dB`,
    `output: L mean ${report.output.left.mean.toExponential(3)}, RMS ${fixed(report.output.left.rms)}, peak ${fixed(report.output.left.peakAbsolute)}; R mean ${report.output.right.mean.toExponential(3)}, RMS ${fixed(report.output.right.rms)}, peak ${fixed(report.output.right.peakAbsolute)}`,
    `safety: target ${fixed(report.safety.targetPreGainDb)} dB, applied ${fixed(report.safety.appliedPreGainDb)} dB, guard interventions ${report.safety.guardInterventions}`,
  )

  if (report.animation.enabled) {
    lines.push(
      `animation ${report.input.animation.mode}: max |offset| ${fixed(report.animation.maximumAbsoluteOffsetDb)} dB; mean/max band-power error ${fixed(report.animation.meanAbsoluteBandPowerErrorDb, 6)}/${fixed(report.animation.maximumAbsoluteBandPowerErrorDb, 6)} dB`,
    )
  } else {
    lines.push('animation: off')
  }

  const realtime =
    report.benchmark.realtimeFactor === null
      ? 'n/a'
      : `${fixed(report.benchmark.realtimeFactor, 2)}x realtime`
  lines.push(
    `benchmark: ${fixed(report.benchmark.renderedAudioSeconds, 3)} s audio in ${fixed(report.benchmark.wallTimeMs, 2)} ms (${realtime}; informational only)`,
  )

  return `${lines.join('\n')}\n`
}
