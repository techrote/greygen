import type { HighBandMode } from './dsp/filterBank'
import {
  GAIN_STAGE_SCHEMA_VERSION,
  type GainStageState,
  createGainStageState,
} from './dsp/gainSafety'
import {
  SPECTRAL_PRESET_IDS,
  type SpectralPresetId,
  type SpectrumState,
  createSpectrumState,
} from './dsp/spectra'

export const AUDIO_PROTOCOL_VERSION = 2 as const
export const GREYGEN_PROCESSOR_NAME = 'greygen-processor-v2'

export interface SerializedSpectrumState {
  readonly targetId: SpectralPresetId
  readonly userBandOffsetsDb: readonly number[]
}

export interface SerializedGainStageState {
  readonly schemaVersion: typeof GAIN_STAGE_SCHEMA_VERSION
  readonly masterGainDb: number
  readonly animationBandOffsetsDb: readonly number[]
  readonly calibrationBandOffsetsDb: readonly number[]
}

interface ProtocolEnvelope {
  readonly version: typeof AUDIO_PROTOCOL_VERSION
  readonly requestId: number
}

export interface InitializeMessage extends ProtocolEnvelope {
  readonly type: 'initialize'
  readonly seed: number
  readonly spectrum: SerializedSpectrumState
  readonly gainStage: SerializedGainStageState
}

export interface SetSpectrumMessage extends ProtocolEnvelope {
  readonly type: 'set-spectrum'
  readonly spectrum: SerializedSpectrumState
}

export interface SetGainStageMessage extends ProtocolEnvelope {
  readonly type: 'set-gain-stage'
  readonly gainStage: SerializedGainStageState
}

export interface ResetSeedMessage extends ProtocolEnvelope {
  readonly type: 'reset-seed'
  readonly seed: number
}

export interface RequestStatusMessage extends ProtocolEnvelope {
  readonly type: 'request-status'
}

export interface StopMessage extends ProtocolEnvelope {
  readonly type: 'stop'
}

export type MainToWorkletMessage =
  | InitializeMessage
  | SetSpectrumMessage
  | SetGainStageMessage
  | ResetSeedMessage
  | RequestStatusMessage
  | StopMessage

export interface ReadyMessage extends ProtocolEnvelope {
  readonly type: 'ready'
  readonly sampleRate: number
  readonly targetId: SpectralPresetId
  readonly highBandMode: HighBandMode
}

export interface AckMessage extends ProtocolEnvelope {
  readonly type: 'ack'
  readonly command: 'set-spectrum' | 'set-gain-stage' | 'reset-seed'
}

export interface StatusMessage extends ProtocolEnvelope {
  readonly type: 'status'
  readonly sampleRate: number
  readonly targetId: SpectralPresetId
  readonly highBandMode: HighBandMode
  readonly renderedFrames: number
}

export interface TelemetryMessage {
  readonly version: typeof AUDIO_PROTOCOL_VERSION
  readonly type: 'telemetry'
  readonly sequence: number
  readonly frameCount: number
  readonly peakDbfs: number
  readonly rmsDbfs: number
  readonly safetyPreGainDb: number
  readonly safetyPreGainTargetDb: number
  readonly masterGainDb: number
  readonly guardInterventions: number
}

export interface StoppedMessage extends ProtocolEnvelope {
  readonly type: 'stopped'
}

export interface WorkletErrorMessage {
  readonly version: typeof AUDIO_PROTOCOL_VERSION
  readonly type: 'error'
  readonly requestId?: number
  readonly code: 'invalid-message' | 'engine-error'
  readonly message: string
}

export type WorkletToMainMessage =
  | ReadyMessage
  | AckMessage
  | StatusMessage
  | TelemetryMessage
  | StoppedMessage
  | WorkletErrorMessage

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRequestId(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  )
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isAudioSeed(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffff_ffff
  )
}

function isPresetId(value: unknown): value is SpectralPresetId {
  return (
    typeof value === 'string' &&
    SPECTRAL_PRESET_IDS.includes(value as SpectralPresetId)
  )
}

function isHighBandMode(value: unknown): value is HighBandMode {
  return value === 'bounded-bandpass' || value === 'degraded-high-shelf'
}

function parseSpectrumState(value: unknown): SerializedSpectrumState | null {
  if (!isRecord(value) || !isPresetId(value.targetId)) {
    return null
  }
  if (!Array.isArray(value.userBandOffsetsDb)) {
    return null
  }

  try {
    return serializeSpectrumState(
      createSpectrumState(value.targetId, value.userBandOffsetsDb),
    )
  } catch {
    return null
  }
}

function parseGainStageState(value: unknown): SerializedGainStageState | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== GAIN_STAGE_SCHEMA_VERSION ||
    !isFiniteNumber(value.masterGainDb) ||
    !Array.isArray(value.animationBandOffsetsDb) ||
    !Array.isArray(value.calibrationBandOffsetsDb)
  ) {
    return null
  }

  try {
    return serializeGainStageState(
      createGainStageState(
        value.masterGainDb,
        value.animationBandOffsetsDb,
        value.calibrationBandOffsetsDb,
      ),
    )
  } catch {
    return null
  }
}

export function serializeSpectrumState(
  state: SpectrumState,
): SerializedSpectrumState {
  const canonical = createSpectrumState(state.targetId, state.userBandOffsetsDb)
  return {
    targetId: canonical.targetId,
    userBandOffsetsDb: Array.from(canonical.userBandOffsetsDb),
  }
}

export function deserializeSpectrumState(
  state: SerializedSpectrumState,
): SpectrumState {
  return createSpectrumState(state.targetId, state.userBandOffsetsDb)
}

export function serializeGainStageState(
  state: GainStageState,
): SerializedGainStageState {
  const canonical = createGainStageState(
    state.masterGainDb,
    state.animationBandOffsetsDb,
    state.calibrationBandOffsetsDb,
  )
  return {
    schemaVersion: GAIN_STAGE_SCHEMA_VERSION,
    masterGainDb: canonical.masterGainDb,
    animationBandOffsetsDb: Array.from(canonical.animationBandOffsetsDb),
    calibrationBandOffsetsDb: Array.from(canonical.calibrationBandOffsetsDb),
  }
}

export function deserializeGainStageState(
  state: SerializedGainStageState,
): GainStageState {
  return createGainStageState(
    state.masterGainDb,
    state.animationBandOffsetsDb,
    state.calibrationBandOffsetsDb,
  )
}

export function parseMainToWorkletMessage(
  value: unknown,
): MainToWorkletMessage | null {
  if (
    !isRecord(value) ||
    value.version !== AUDIO_PROTOCOL_VERSION ||
    !isRequestId(value.requestId) ||
    typeof value.type !== 'string'
  ) {
    return null
  }

  switch (value.type) {
    case 'initialize': {
      const spectrum = parseSpectrumState(value.spectrum)
      const gainStage = parseGainStageState(value.gainStage)
      if (!isAudioSeed(value.seed) || !spectrum || !gainStage) {
        return null
      }
      return {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'initialize',
        requestId: value.requestId,
        seed: value.seed,
        spectrum,
        gainStage,
      }
    }
    case 'set-spectrum': {
      const spectrum = parseSpectrumState(value.spectrum)
      if (!spectrum) {
        return null
      }
      return {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-spectrum',
        requestId: value.requestId,
        spectrum,
      }
    }
    case 'set-gain-stage': {
      const gainStage = parseGainStageState(value.gainStage)
      if (!gainStage) {
        return null
      }
      return {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-gain-stage',
        requestId: value.requestId,
        gainStage,
      }
    }
    case 'reset-seed':
      if (!isAudioSeed(value.seed)) {
        return null
      }
      return {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'reset-seed',
        requestId: value.requestId,
        seed: value.seed,
      }
    case 'request-status':
      return {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'request-status',
        requestId: value.requestId,
      }
    case 'stop':
      return {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'stop',
        requestId: value.requestId,
      }
    default:
      return null
  }
}

export function parseWorkletToMainMessage(
  value: unknown,
): WorkletToMainMessage | null {
  if (
    !isRecord(value) ||
    value.version !== AUDIO_PROTOCOL_VERSION ||
    typeof value.type !== 'string'
  ) {
    return null
  }

  if (value.type === 'telemetry') {
    if (
      !isPositiveSafeInteger(value.sequence) ||
      !isNonNegativeSafeInteger(value.frameCount) ||
      !isFiniteNumber(value.peakDbfs) ||
      !isFiniteNumber(value.rmsDbfs) ||
      !isFiniteNumber(value.safetyPreGainDb) ||
      !isFiniteNumber(value.safetyPreGainTargetDb) ||
      !isFiniteNumber(value.masterGainDb) ||
      !isNonNegativeSafeInteger(value.guardInterventions)
    ) {
      return null
    }
    return {
      version: AUDIO_PROTOCOL_VERSION,
      type: 'telemetry',
      sequence: value.sequence,
      frameCount: value.frameCount,
      peakDbfs: value.peakDbfs,
      rmsDbfs: value.rmsDbfs,
      safetyPreGainDb: value.safetyPreGainDb,
      safetyPreGainTargetDb: value.safetyPreGainTargetDb,
      masterGainDb: value.masterGainDb,
      guardInterventions: value.guardInterventions,
    }
  }

  if (value.type === 'error') {
    if (
      (value.requestId !== undefined && !isRequestId(value.requestId)) ||
      (value.code !== 'invalid-message' && value.code !== 'engine-error') ||
      typeof value.message !== 'string'
    ) {
      return null
    }
    return {
      version: AUDIO_PROTOCOL_VERSION,
      type: 'error',
      ...(value.requestId === undefined ? {} : { requestId: value.requestId }),
      code: value.code,
      message: value.message,
    }
  }

  if (!isRequestId(value.requestId)) {
    return null
  }

  switch (value.type) {
    case 'ready':
      if (
        !isFiniteNumber(value.sampleRate) ||
        !(value.sampleRate > 0) ||
        !isPresetId(value.targetId) ||
        !isHighBandMode(value.highBandMode)
      ) {
        return null
      }
      return {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'ready',
        requestId: value.requestId,
        sampleRate: value.sampleRate,
        targetId: value.targetId,
        highBandMode: value.highBandMode,
      }
    case 'ack':
      if (
        value.command !== 'set-spectrum' &&
        value.command !== 'set-gain-stage' &&
        value.command !== 'reset-seed'
      ) {
        return null
      }
      return {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'ack',
        requestId: value.requestId,
        command: value.command,
      }
    case 'status':
      if (
        !isFiniteNumber(value.sampleRate) ||
        !(value.sampleRate > 0) ||
        !isPresetId(value.targetId) ||
        !isHighBandMode(value.highBandMode) ||
        !isNonNegativeSafeInteger(value.renderedFrames)
      ) {
        return null
      }
      return {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'status',
        requestId: value.requestId,
        sampleRate: value.sampleRate,
        targetId: value.targetId,
        highBandMode: value.highBandMode,
        renderedFrames: value.renderedFrames,
      }
    case 'stopped':
      return {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'stopped',
        requestId: value.requestId,
      }
    default:
      return null
  }
}
