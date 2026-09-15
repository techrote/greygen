import { ANIMATION_MODES } from '../../audio/dsp/animation'
import { SPECTRAL_PRESET_IDS } from '../../audio/dsp/spectra'
import {
  SOUND_STATE_SCHEMA_VERSION,
  type SoundState,
  createSoundState,
  parseSoundState,
} from '../../app/state/appState'

export const SHARE_FORMAT_VERSION = 1 as const
export const SHARE_FRAGMENT_KEY = 's'
export const SHARE_PAYLOAD_MAX_CHARACTERS = 2048

export type ShareParseCode =
  | 'ok'
  | 'recovered'
  | 'malformed'
  | 'oversized'
  | 'future-version'
  | 'absent'

export interface ShareParseResult {
  readonly state: SoundState | null
  readonly code: ShareParseCode
  readonly messages: readonly string[]
}

function encodeBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(text: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new Error('share payload contains invalid base64url characters')
  }
  const padding = '='.repeat((4 - (text.length % 4)) % 4)
  return atob(text.replace(/-/g, '+').replace(/_/g, '/') + padding)
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function integerCode(value: unknown, maximum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < maximum
  )
}

export function serializeSoundStateForShare(state: SoundState): string {
  const canonical = createSoundState({
    seed: state.seed,
    targetId: state.targetId,
    userBandOffsetsDb: state.userBandOffsetsDb,
    masterGainDb: state.masterGainDb,
    stereoWidth: state.stereoWidth,
    animation: state.animation,
  })
  const targetCode = SPECTRAL_PRESET_IDS.indexOf(canonical.targetId)
  const animationModeCode = ANIMATION_MODES.indexOf(canonical.animation.mode)
  const payload = [
    SHARE_FORMAT_VERSION,
    SOUND_STATE_SCHEMA_VERSION,
    canonical.seed,
    targetCode,
    ...canonical.userBandOffsetsDb,
    canonical.masterGainDb,
    canonical.stereoWidth,
    animationModeCode,
    canonical.animation.seed,
    canonical.animation.depthDb,
    canonical.animation.speed,
    canonical.animation.energyPreserving ? 1 : 0,
  ]
  return encodeBase64Url(JSON.stringify(payload))
}

export function parseSharedSoundPayload(encoded: string): ShareParseResult {
  if (encoded.length === 0) {
    return {
      state: null,
      code: 'absent',
      messages: Object.freeze([]),
    }
  }
  if (encoded.length > SHARE_PAYLOAD_MAX_CHARACTERS) {
    return {
      state: null,
      code: 'oversized',
      messages: Object.freeze([
        `Shared sound payload exceeded the ${SHARE_PAYLOAD_MAX_CHARACTERS}-character limit and was ignored.`,
      ]),
    }
  }

  let value: unknown
  try {
    value = JSON.parse(decodeBase64Url(encoded)) as unknown
  } catch {
    return {
      state: null,
      code: 'malformed',
      messages: Object.freeze([
        'Shared sound payload was malformed and was not loaded.',
      ]),
    }
  }

  if (!Array.isArray(value) || value.length !== 21) {
    return {
      state: null,
      code: 'malformed',
      messages: Object.freeze([
        'Shared sound payload had the wrong shape and was not loaded.',
      ]),
    }
  }

  const shareVersion = value[0]
  if (typeof shareVersion !== 'number' || !Number.isInteger(shareVersion)) {
    return {
      state: null,
      code: 'malformed',
      messages: Object.freeze(['Shared sound payload had no valid version.']),
    }
  }
  if (shareVersion > SHARE_FORMAT_VERSION) {
    return {
      state: null,
      code: 'future-version',
      messages: Object.freeze([
        `Shared sound format v${shareVersion} is newer than this Greygen build and was not loaded.`,
      ]),
    }
  }
  if (shareVersion !== SHARE_FORMAT_VERSION) {
    return {
      state: null,
      code: 'malformed',
      messages: Object.freeze([
        'Unsupported shared sound format was not loaded.',
      ]),
    }
  }

  const soundSchemaVersion = value[1]
  if (
    typeof soundSchemaVersion !== 'number' ||
    !Number.isInteger(soundSchemaVersion)
  ) {
    return {
      state: null,
      code: 'malformed',
      messages: Object.freeze([
        'Shared sound payload had no sound schema version.',
      ]),
    }
  }
  if (soundSchemaVersion > SOUND_STATE_SCHEMA_VERSION) {
    return {
      state: null,
      code: 'future-version',
      messages: Object.freeze([
        `Shared sound schema v${soundSchemaVersion} is newer than this build and was not loaded.`,
      ]),
    }
  }
  if (soundSchemaVersion !== SOUND_STATE_SCHEMA_VERSION) {
    return {
      state: null,
      code: 'malformed',
      messages: Object.freeze([
        'Shared sound schema does not match this share-format version.',
      ]),
    }
  }

  if (
    !finiteNumber(value[2]) ||
    !integerCode(value[3], SPECTRAL_PRESET_IDS.length) ||
    !value.slice(4, 14).every(finiteNumber) ||
    !finiteNumber(value[14]) ||
    !finiteNumber(value[15]) ||
    !integerCode(value[16], ANIMATION_MODES.length) ||
    !finiteNumber(value[17]) ||
    !finiteNumber(value[18]) ||
    !finiteNumber(value[19]) ||
    (value[20] !== 0 && value[20] !== 1)
  ) {
    return {
      state: null,
      code: 'malformed',
      messages: Object.freeze([
        'Shared sound payload contained invalid field types and was not loaded.',
      ]),
    }
  }

  const parsed = parseSoundState(
    JSON.stringify({
      schemaVersion: SOUND_STATE_SCHEMA_VERSION,
      seed: value[2],
      targetId: SPECTRAL_PRESET_IDS[value[3]],
      userBandOffsetsDb: value.slice(4, 14),
      masterGainDb: value[14],
      stereoWidth: value[15],
      animation: {
        schemaVersion: 1,
        mode: ANIMATION_MODES[value[16]],
        seed: value[17],
        depthDb: value[18],
        speed: value[19],
        energyPreserving: value[20] === 1,
      },
    }),
  )

  if (parsed.code === 'future-version' || parsed.code === 'malformed') {
    return {
      state: null,
      code: 'malformed',
      messages: Object.freeze([
        'Shared sound payload could not be interpreted safely.',
      ]),
    }
  }

  return {
    state: parsed.state,
    code: parsed.code === 'ok' ? 'ok' : 'recovered',
    messages: Object.freeze(parsed.messages),
  }
}

export function createSoundShareUrl(
  baseHref: string,
  state: SoundState,
): string {
  const url = new URL(baseHref)
  url.hash = `${SHARE_FRAGMENT_KEY}=${serializeSoundStateForShare(state)}`
  return url.toString()
}

export function parseSoundShareUrl(
  href: string,
  baseHref?: string,
): ShareParseResult {
  let url: URL
  try {
    url = baseHref ? new URL(href, baseHref) : new URL(href)
  } catch {
    return {
      state: null,
      code: 'malformed',
      messages: Object.freeze([
        'Shared sound URL was invalid and was not loaded.',
      ]),
    }
  }
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  const encoded = fragment.get(SHARE_FRAGMENT_KEY)
  return encoded === null
    ? {
        state: null,
        code: 'absent',
        messages: Object.freeze([]),
      }
    : parseSharedSoundPayload(encoded)
}

export function stripSoundShareFragment(href: string): string {
  const url = new URL(href)
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  fragment.delete(SHARE_FRAGMENT_KEY)
  const remainder = fragment.toString()
  url.hash = remainder.length > 0 ? remainder : ''
  return url.toString()
}
