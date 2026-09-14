import { type HighBandMode } from './dsp/filterBank'
import {
  SPECTRAL_PRESET_IDS,
  type SpectralPresetId,
  type SpectrumState,
  createSpectrumState,
} from './dsp/spectra'

export const AUDIO_PROTOCOL_VERSION = 1 as const
export const GREYGEN_PROCESSOR_NAME = 'greygen-processor-v1'

export interface SerializedSpectrumState {
  readonly targetId: SpectralPresetId
  readonly userBandOffsetsDb: readonly number[]
}

interface ProtocolEnvelope {
  readonly version: typeof AUDIO_PROTOCOL_VERSION
  readonly requestId: number
}

export interface InitializeMessage extends ProtocolEnvelope {
  readonly type: 'initialize'
  readonly seed: number
  readonly spectrum: SerializedSpectrumState
}

export interface SetSpectrumMessage extends ProtocolEnvelope {
  readonly type: 'set-spectrum'
  readonly spectrum: SerializedSpectrumState
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
  readonly command: 'set-spectrum' | 'reset-seed'
}

export interface StatusMessage extends ProtocolEnvelope {
  readonly type: 'status'
  readonly sampleRate: number
  readonly targetId: SpectralPresetId
  readonly highBandMode: HighBandMode
  readonly renderedFrames: number
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
  | StoppedMessage
  | WorkletErrorMessage

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRequestId(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0
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
      if (!isAudioSeed(value.seed) || !spectrum) {
        return null
      }
      return {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'initialize',
        requestId: value.requestId,
        seed: value.seed,
        spectrum,
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
        typeof value.sampleRate !== 'number' ||
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
      if (value.command !== 'set-spectrum' && value.command !== 'reset-seed') {
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
        typeof value.sampleRate !== 'number' ||
        !(value.sampleRate > 0) ||
        !isPresetId(value.targetId) ||
        !isHighBandMode(value.highBandMode) ||
        typeof value.renderedFrames !== 'number' ||
        !Number.isSafeInteger(value.renderedFrames) ||
        value.renderedFrames < 0
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
