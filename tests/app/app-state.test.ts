import { describe, expect, it } from 'vitest'
import { createAnimationState } from '../../src/audio/dsp/animation'
import { DEFAULT_ENGINE_SEED } from '../../src/audio/dsp/engine'
import { DEFAULT_MASTER_GAIN_DB } from '../../src/audio/dsp/gainSafety'
import { DEFAULT_STEREO_WIDTH } from '../../src/audio/dsp/stereo'
import { isModifiedPreset } from '../../src/features/generator/uiModel'
import {
  PROFILE_RECORD_SCHEMA_VERSION,
  PROFILE_STATE_SCHEMA_VERSION,
  SOUND_STATE_SCHEMA_VERSION,
  UI_STATE_SCHEMA_VERSION,
  createDefaultProfileState,
  createDefaultSoundState,
  createProfileState,
  createSoundState,
  parseProfileState,
  parseSoundState,
  parseUiState,
  serializeProfileState,
  serializeSoundState,
  soundStateToSpectrumState,
} from '../../src/app/state/appState'

describe('versioned app state schemas', () => {
  it('creates deterministic sound defaults with Normal stereo width and animation Off', () => {
    const state = createDefaultSoundState()
    expect(state.schemaVersion).toBe(SOUND_STATE_SCHEMA_VERSION)
    expect(state.seed).toBe(DEFAULT_ENGINE_SEED)
    expect(state.targetId).toBe('grey')
    expect(state.userBandOffsetsDb).toEqual(Array(10).fill(0))
    expect(state.masterGainDb).toBe(DEFAULT_MASTER_GAIN_DB)
    expect(state.stereoWidth).toBe(DEFAULT_STEREO_WIDTH)
    expect(state.animation).toMatchObject({
      mode: 'off',
      depthDb: 4,
      speed: 1,
      energyPreserving: true,
    })
  })

  it('migrates legacy sound v0/v1 deterministically with old rendering semantics', () => {
    const v0 = parseSoundState(
      JSON.stringify({
        schemaVersion: 0,
        seed: 123456,
        preset: 'pink',
        bandsDb: [0, 0, 2, 0, 0, 0, 0, 0, 0, -1],
        masterDb: -18,
      }),
    )
    expect(v0.code).toBe('migrated')
    expect(v0.state.stereoWidth).toBe(0)
    expect(v0.state.animation.mode).toBe('off')
    expect(isModifiedPreset(soundStateToSpectrumState(v0.state))).toBe(true)

    const v1 = parseSoundState(
      JSON.stringify({
        schemaVersion: 1,
        seed: 77,
        targetId: 'white',
        userBandOffsetsDb: Array(10).fill(0),
        masterGainDb: -20,
      }),
    )
    expect(v1.code).toBe('migrated')
    expect(v1.state).toMatchObject({
      schemaVersion: SOUND_STATE_SCHEMA_VERSION,
      seed: 77,
      targetId: 'white',
      masterGainDb: -20,
      stereoWidth: 0,
      animation: { mode: 'off' },
    })
  })

  it('migrates sound schema v2 to v3 with animation Off while preserving width', () => {
    const result = parseSoundState(
      JSON.stringify({
        schemaVersion: 2,
        seed: 12,
        targetId: 'grey',
        userBandOffsetsDb: Array(10).fill(0),
        masterGainDb: -24,
        stereoWidth: 0.82,
      }),
    )
    expect(result.code).toBe('migrated')
    expect(result.state).toMatchObject({
      stereoWidth: 0.82,
      animation: { mode: 'off' },
    })
  })

  it('recovers and clamps invalid sound and animation values independently', () => {
    const result = parseSoundState(
      JSON.stringify({
        schemaVersion: SOUND_STATE_SCHEMA_VERSION,
        seed: -4,
        targetId: 'ultraviolet',
        userBandOffsetsDb: [99, -99, null, 4, 5, 6, 7, 8, 9, 10],
        masterGainDb: 12,
        stereoWidth: 4,
        animation: {
          schemaVersion: 1,
          mode: 'teleport',
          seed: -5,
          depthDb: 99,
          speed: 0.01,
          energyPreserving: 'yes',
        },
      }),
    )

    expect(result.code).toBe('recovered')
    expect(result.state.seed).toBe(DEFAULT_ENGINE_SEED)
    expect(result.state.targetId).toBe('grey')
    expect(result.state.userBandOffsetsDb[0]).toBe(24)
    expect(result.state.userBandOffsetsDb[1]).toBe(-24)
    expect(result.state.masterGainDb).toBe(0)
    expect(result.state.stereoWidth).toBe(1)
    expect(result.state.animation).toMatchObject({
      mode: 'off',
      depthDb: 12,
      speed: 0.25,
      energyPreserving: true,
    })
    expect(result.messages.length).toBeGreaterThan(0)
  })

  it('falls back safely on malformed JSON and unknown future sound schemas', () => {
    const malformed = parseSoundState('{not json')
    expect(malformed.code).toBe('malformed')
    expect(malformed.state).toEqual(createDefaultSoundState())

    const future = parseSoundState(
      JSON.stringify({ schemaVersion: 99, targetId: 'white' }),
    )
    expect(future.code).toBe('future-version')
    expect(future.state).toEqual(createDefaultSoundState())
  })

  it('round-trips generic animation settings while keeping private profiles outside sound serialization', () => {
    const sound = createSoundState({
      seed: 42,
      targetId: 'brown',
      userBandOffsetsDb: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      masterGainDb: -24,
      stereoWidth: 0.8,
      animation: createAnimationState('wander', 9876, 7.5, 2.25, false),
    })
    const profiles = createProfileState([
      {
        recordSchemaVersion: PROFILE_RECORD_SCHEMA_VERSION,
        id: 'fixture-headphones',
        name: 'Fixture headphones',
        kind: 'calibration',
        payloadSchemaVersion: 1,
        payload: { correctionDb: [1, 0, -1], note: 'private fixture' },
      },
    ])

    const soundJson = serializeSoundState(sound)
    const profileJson = serializeProfileState(profiles)
    const parsed = parseSoundState(soundJson)

    expect(parsed.code).toBe('ok')
    expect(parsed.state.animation).toEqual(sound.animation)
    expect(soundJson).toContain('"stereoWidth":0.8')
    expect(soundJson).toContain('"mode":"wander"')
    expect(soundJson).not.toContain('profiles')
    expect(soundJson).not.toContain('Fixture headphones')
    expect(soundJson).not.toContain('private fixture')
    expect(profileJson).toContain('Fixture headphones')
    expect(profileJson).toContain('private fixture')
  })

  it('migrates private profile schema v1 with correction bypassed', () => {
    const migrated = parseProfileState(
      JSON.stringify({
        schemaVersion: 1,
        profiles: [
          {
            recordSchemaVersion: PROFILE_RECORD_SCHEMA_VERSION,
            id: 'legacy-profile',
            name: 'Legacy profile',
            kind: 'calibration',
            payloadSchemaVersion: 1,
            payload: { rawBandOffsetsDb: Array(10).fill(0) },
          },
        ],
      }),
    )
    expect(migrated.code).toBe('migrated')
    expect(migrated.state.schemaVersion).toBe(PROFILE_STATE_SCHEMA_VERSION)
    expect(migrated.state.profiles).toHaveLength(1)
    expect(migrated.state.activeProfileId).toBeNull()
    expect(migrated.state.calibrationMode).toBe('off')
  })

  it('validates current private profile selection and recovers invalid activation safely', () => {
    const valid = parseProfileState(
      JSON.stringify({
        schemaVersion: PROFILE_STATE_SCHEMA_VERSION,
        profiles: [
          {
            recordSchemaVersion: PROFILE_RECORD_SCHEMA_VERSION,
            id: 'p1',
            name: 'Playback chain A',
            kind: 'calibration',
            payloadSchemaVersion: 1,
            payload: {
              sampleRateHz: 48000,
              referenceBandIndex: 5,
              rawBandOffsetsDb: Array(10).fill(0),
            },
          },
        ],
        activeProfileId: 'p1',
        calibrationMode: 'balanced',
      }),
    )
    expect(valid.code).toBe('ok')
    expect(valid.state.activeProfileId).toBe('p1')
    expect(valid.state.calibrationMode).toBe('balanced')

    const invalidSelection = parseProfileState(
      JSON.stringify({
        schemaVersion: PROFILE_STATE_SCHEMA_VERSION,
        profiles: valid.state.profiles,
        activeProfileId: 'missing',
        calibrationMode: 'full',
      }),
    )
    expect(invalidSelection.code).toBe('recovered')
    expect(invalidSelection.state.activeProfileId).toBeNull()
    expect(invalidSelection.state.calibrationMode).toBe('off')

    const invalidRecord = parseProfileState(
      JSON.stringify({
        schemaVersion: PROFILE_STATE_SCHEMA_VERSION,
        profiles: [
          {
            recordSchemaVersion: PROFILE_RECORD_SCHEMA_VERSION,
            id: '',
            name: 'Broken',
            kind: 'medical',
            payloadSchemaVersion: 1,
            payload: {},
          },
        ],
        activeProfileId: null,
        calibrationMode: 'off',
      }),
    )
    expect(invalidRecord.code).toBe('recovered')
    expect(invalidRecord.state).toEqual(createDefaultProfileState())
  })

  it('recovers UI preferences independently from sound/profile state', () => {
    const valid = parseUiState(
      JSON.stringify({
        schemaVersion: UI_STATE_SCHEMA_VERSION,
        futureFeaturesVisible: false,
        analyzerVisible: false,
      }),
    )
    expect(valid.code).toBe('ok')
    expect(valid.state.futureFeaturesVisible).toBe(false)

    const invalid = parseUiState(
      JSON.stringify({
        schemaVersion: UI_STATE_SCHEMA_VERSION,
        futureFeaturesVisible: 'yes',
        analyzerVisible: false,
      }),
    )
    expect(invalid.code).toBe('recovered')
    expect(invalid.state.futureFeaturesVisible).toBe(true)
  })
})