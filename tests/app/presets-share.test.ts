import { describe, expect, it } from 'vitest'
import { createAnimationState } from '../../src/audio/dsp/animation'
import {
  PROFILE_RECORD_SCHEMA_VERSION,
  createProfileState,
  createSoundState,
  serializeProfileState,
  serializeSoundState,
} from '../../src/app/state/appState'
import {
  USER_PRESET_LIBRARY_MAX_COUNT,
  createDefaultUserPresetLibraryState,
  createUserPresetLibraryState,
  deleteUserSoundPreset,
  findMatchingUserSoundPreset,
  parseUserPresetLibraryState,
  sanitizeUserPresetName,
  saveUserSoundPreset,
  serializeUserPresetLibraryState,
} from '../../src/app/state/userPresetState'
import {
  BUILT_IN_PRESET_OWNED_FIELDS,
  USER_SOUND_PRESET_OWNED_FIELDS,
  applyBuiltInSoundPreset,
  findMatchingSavedPreset,
  isBuiltInSoundPresetModified,
} from '../../src/features/presets/soundPresets'
import {
  SHARE_FORMAT_VERSION,
  SHARE_PAYLOAD_MAX_CHARACTERS,
  createSoundShareUrl,
  parseSharedSoundPayload,
  parseSoundShareUrl,
  serializeSoundStateForShare,
  stripSoundShareFragment,
} from '../../src/features/sharing/shareState'

function fixtureSound() {
  return createSoundState({
    seed: 0x1234abcd,
    targetId: 'pink',
    userBandOffsetsDb: [0, 1, -2, 0, 0, 3, 0, 0, -1, 0],
    masterGainDb: -18,
    stereoWidth: 0.82,
    animation: createAnimationState('orbit', 99, 7.5, 1.75, false),
  })
}

function mutatePayload(
  encoded: string,
  mutate: (payload: unknown[]) => void,
): string {
  const padding = '='.repeat((4 - (encoded.length % 4)) % 4)
  const decoded = atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + padding)
  const payload = JSON.parse(decoded) as unknown[]
  mutate(payload)
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

describe('preset ownership and user library', () => {
  it('declares built-in colour presets as spectral-only and user presets as full SoundState snapshots', () => {
    expect(BUILT_IN_PRESET_OWNED_FIELDS).toEqual([
      'targetId',
      'userBandOffsetsDb',
    ])
    expect(USER_SOUND_PRESET_OWNED_FIELDS).toEqual([
      'seed',
      'targetId',
      'userBandOffsetsDb',
      'masterGainDb',
      'stereoWidth',
      'animation',
    ])
  })

  it('applies a built-in colour preset without resetting unrelated sound fields', () => {
    const source = fixtureSound()
    const next = applyBuiltInSoundPreset(source, 'brown')

    expect(next.targetId).toBe('brown')
    expect(next.userBandOffsetsDb).toEqual(Array(10).fill(0))
    expect(next.seed).toBe(source.seed)
    expect(next.masterGainDb).toBe(source.masterGainDb)
    expect(next.stereoWidth).toBe(source.stereoWidth)
    expect(next.animation).toEqual(source.animation)
    expect(isBuiltInSoundPresetModified(next)).toBe(false)
  })

  it('sanitizes user preset display names and supports deterministic save/load/delete', () => {
    expect(sanitizeUserPresetName('  <b> My\n  Preset </b>  ')).toBe(
      'b My Preset /b',
    )

    const first = saveUserSoundPreset(
      createDefaultUserPresetLibraryState(),
      '  <b> My\n  Preset </b>  ',
      fixtureSound(),
    )
    expect(first.preset.id).toBe('user-0001')
    expect(first.preset.name).toBe('b My Preset /b')
    expect(findMatchingUserSoundPreset(first.state, fixtureSound())?.id).toBe(
      'user-0001',
    )
    expect(findMatchingSavedPreset(first.state, fixtureSound())?.name).toBe(
      'b My Preset /b',
    )

    const second = saveUserSoundPreset(
      first.state,
      'Second',
      applyBuiltInSoundPreset(fixtureSound(), 'white'),
    )
    expect(second.preset.id).toBe('user-0002')
    const deleted = deleteUserSoundPreset(second.state, 'user-0001')
    expect(deleted.presets.map((preset) => preset.id)).toEqual(['user-0002'])
  })

  it('round-trips the preset library and safely rejects future library schemas', () => {
    const saved = saveUserSoundPreset(
      createDefaultUserPresetLibraryState(),
      'Fixture',
      fixtureSound(),
    ).state
    const parsed = parseUserPresetLibraryState(
      serializeUserPresetLibraryState(saved),
    )
    expect(parsed.code).toBe('ok')
    expect(parsed.state).toEqual(saved)

    const future = parseUserPresetLibraryState(
      JSON.stringify({ schemaVersion: 99, presets: [] }),
    )
    expect(future.code).toBe('future-version')
    expect(future.state.presets).toEqual([])
  })

  it('enforces the local preset count bound', () => {
    let state = createDefaultUserPresetLibraryState()
    for (let index = 0; index < USER_PRESET_LIBRARY_MAX_COUNT; index += 1) {
      state = saveUserSoundPreset(
        state,
        `Preset ${index + 1}`,
        fixtureSound(),
      ).state
    }
    expect(() =>
      saveUserSoundPreset(state, 'Too many', fixtureSound()),
    ).toThrow(RangeError)
    expect(createUserPresetLibraryState(state.presets).presets).toHaveLength(
      USER_PRESET_LIBRARY_MAX_COUNT,
    )
  })
})

describe('privacy-safe share payloads', () => {
  it('round-trips canonical SoundState deterministically in a compact URL fragment', () => {
    const sound = fixtureSound()
    const first = serializeSoundStateForShare(sound)
    const second = serializeSoundStateForShare(sound)
    expect(first).toBe(second)
    expect(first.length).toBeLessThan(SHARE_PAYLOAD_MAX_CHARACTERS)

    const parsed = parseSharedSoundPayload(first)
    expect(parsed.code).toBe('ok')
    expect(serializeSoundState(parsed.state!)).toBe(serializeSoundState(sound))

    const url = createSoundShareUrl('https://example.test/greygen?x=1', sound)
    expect(url).toContain('#s=')
    expect(parseSoundShareUrl(url).state).toEqual(sound)
    expect(stripSoundShareFragment(url)).toBe(
      'https://example.test/greygen?x=1',
    )
  })

  it('contains only SoundState data and excludes private profile fixtures and user preset names', () => {
    const privateProfiles = createProfileState([
      {
        recordSchemaVersion: PROFILE_RECORD_SCHEMA_VERSION,
        id: 'private-headphones',
        name: 'SECRET private profile name',
        kind: 'calibration',
        payloadSchemaVersion: 1,
        payload: {
          note: 'SECRET calibration note',
          correctionDb: [1, 0, -1],
        },
      },
    ])
    const preset = saveUserSoundPreset(
      createDefaultUserPresetLibraryState(),
      'SECRET local preset name',
      fixtureSound(),
    ).preset

    const payload = serializeSoundStateForShare(preset.sound)
    const url = createSoundShareUrl('https://example.test/', preset.sound)
    expect(payload).not.toContain('SECRET')
    expect(url).not.toContain('SECRET')
    expect(url).not.toContain('private-headphones')
    expect(url).not.toContain('calibration')
    expect(serializeProfileState(privateProfiles)).toContain('SECRET')
  })

  it('rejects malformed, truncated, oversized, and future share formats', () => {
    expect(parseSharedSoundPayload('%%%').code).toBe('malformed')

    const valid = serializeSoundStateForShare(fixtureSound())
    expect(parseSharedSoundPayload(valid.slice(0, -4)).code).toBe('malformed')
    expect(
      parseSharedSoundPayload('a'.repeat(SHARE_PAYLOAD_MAX_CHARACTERS + 1))
        .code,
    ).toBe('oversized')

    const future = mutatePayload(valid, (payload) => {
      payload[0] = SHARE_FORMAT_VERSION + 1
    })
    expect(parseSharedSoundPayload(future).code).toBe('future-version')
  })

  it('clamps finite out-of-range share values through the canonical SoundState parser', () => {
    const valid = serializeSoundStateForShare(fixtureSound())
    const changed = mutatePayload(valid, (payload) => {
      payload[4] = 999
      payload[14] = 99
      payload[15] = -4
      payload[18] = 99
      payload[19] = 99
    })
    const parsed = parseSharedSoundPayload(changed)
    expect(parsed.code).toBe('recovered')
    expect(parsed.state?.userBandOffsetsDb[0]).toBe(24)
    expect(parsed.state?.masterGainDb).toBe(0)
    expect(parsed.state?.stereoWidth).toBe(0)
    expect(parsed.state?.animation.depthDb).toBe(12)
    expect(parsed.state?.animation.speed).toBe(4)
  })
})
