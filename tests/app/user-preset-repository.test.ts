import { describe, expect, it } from 'vitest'
import {
  APP_STORAGE_VERSION,
  PROFILE_RECORD_SCHEMA_VERSION,
  createDefaultProfileState,
  createDefaultSoundState,
  createProfileState,
  createSoundState,
  createUiState,
} from '../../src/app/state/appState'
import {
  createDefaultUserPresetLibraryState,
  saveUserSoundPreset,
} from '../../src/app/state/userPresetState'
import {
  AppStateRepository,
  PROFILE_STATE_STORAGE_KEY,
  SOUND_STATE_STORAGE_KEY,
  STORAGE_MANIFEST_KEY,
  USER_PRESET_LIBRARY_STORAGE_KEY,
  type StoragePort,
} from '../../src/app/storage/AppStateRepository'

class MemoryStorage implements StoragePort {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

function privateProfiles() {
  return createProfileState([
    {
      recordSchemaVersion: PROFILE_RECORD_SCHEMA_VERSION,
      id: 'private-profile',
      name: 'Secret headphones',
      kind: 'calibration',
      payloadSchemaVersion: 1,
      payload: { note: 'private note', correctionDb: [1, 0, -1] },
    },
  ])
}

function savedLibrary() {
  const sound = createSoundState({
    seed: 44,
    targetId: 'pink',
    userBandOffsetsDb: [0, 0, 2, 0, 0, 0, 0, 0, 0, -1],
    masterGainDb: -20,
    stereoWidth: 0.75,
  })
  return saveUserSoundPreset(
    createDefaultUserPresetLibraryState(),
    'Pink room',
    sound,
  ).state
}

describe('user preset persistence domain', () => {
  it('round-trips presets independently from current sound, private profiles, and UI state', () => {
    const storage = new MemoryStorage()
    const repository = new AppStateRepository(storage)
    const sound = createSoundState({
      seed: 9,
      targetId: 'brown',
      userBandOffsetsDb: Array(10).fill(0),
      masterGainDb: -24,
      stereoWidth: 0.4,
    })
    const presets = savedLibrary()
    const profiles = privateProfiles()
    const ui = createUiState(false)

    expect(repository.saveSound(sound).ok).toBe(true)
    expect(repository.saveUserPresets(presets).ok).toBe(true)
    expect(repository.saveProfiles(profiles).ok).toBe(true)
    expect(repository.saveUi(ui).ok).toBe(true)

    const loaded = repository.load()
    expect(loaded.sound).toEqual(sound)
    expect(loaded.userPresets).toEqual(presets)
    expect(loaded.profiles).toEqual(profiles)
    expect(loaded.ui).toEqual(ui)
    expect(storage.values.has(USER_PRESET_LIBRARY_STORAGE_KEY)).toBe(true)

    const presetJson = storage.values.get(USER_PRESET_LIBRARY_STORAGE_KEY) ?? ''
    expect(presetJson).toContain('Pink room')
    expect(presetJson).not.toContain('Secret headphones')
    expect(presetJson).not.toContain('private note')
  })

  it('reset sound and delete profiles never delete the saved sound-preset library', () => {
    const storage = new MemoryStorage()
    const repository = new AppStateRepository(storage)
    const presets = savedLibrary()
    repository.saveSound(
      createSoundState({
        seed: 100,
        targetId: 'white',
        userBandOffsetsDb: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        masterGainDb: -12,
      }),
    )
    repository.saveUserPresets(presets)
    repository.saveProfiles(privateProfiles())

    expect(repository.resetSound().ok).toBe(true)
    expect(repository.load().userPresets).toEqual(presets)
    expect(repository.deleteProfiles().ok).toBe(true)

    const loaded = repository.load()
    expect(loaded.sound).toEqual(createDefaultSoundState())
    expect(loaded.userPresets).toEqual(presets)
    expect(loaded.profiles).toEqual(createDefaultProfileState())
  })

  it('write-protects a future preset-library schema without blocking current sibling domains', () => {
    const storage = new MemoryStorage()
    const futureLibrary = JSON.stringify({ schemaVersion: 99, presets: [] })
    storage.values.set(
      STORAGE_MANIFEST_KEY,
      JSON.stringify({ schemaVersion: APP_STORAGE_VERSION }),
    )
    storage.values.set(USER_PRESET_LIBRARY_STORAGE_KEY, futureLibrary)
    const repository = new AppStateRepository(storage)

    const loaded = repository.load()
    expect(loaded.userPresets).toEqual(createDefaultUserPresetLibraryState())
    expect(
      loaded.diagnostics.some(
        (entry) =>
          entry.domain === 'presets' && entry.code === 'future-version',
      ),
    ).toBe(true)

    const presetSave = repository.saveUserPresets(savedLibrary())
    expect(presetSave.ok).toBe(false)
    expect(presetSave.diagnostic?.code).toBe('future-version')
    expect(storage.values.get(USER_PRESET_LIBRARY_STORAGE_KEY)).toBe(
      futureLibrary,
    )

    const sound = createSoundState({
      seed: 1,
      targetId: 'white',
      userBandOffsetsDb: Array(10).fill(0),
      masterGainDb: -30,
    })
    expect(repository.saveSound(sound).ok).toBe(true)
    expect(storage.values.get(SOUND_STATE_STORAGE_KEY)).toContain('"white"')
    expect(storage.values.get(USER_PRESET_LIBRARY_STORAGE_KEY)).toBe(
      futureLibrary,
    )
  })

  it('a future storage manifest also protects the preset library', () => {
    const storage = new MemoryStorage()
    const futureManifest = JSON.stringify({ schemaVersion: 99 })
    const existingPresetLibrary = JSON.stringify({
      schemaVersion: 99,
      presets: [],
    })
    storage.values.set(STORAGE_MANIFEST_KEY, futureManifest)
    storage.values.set(USER_PRESET_LIBRARY_STORAGE_KEY, existingPresetLibrary)
    storage.values.set(
      PROFILE_STATE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, profiles: [] }),
    )
    const repository = new AppStateRepository(storage)

    const loaded = repository.load()
    expect(loaded.userPresets).toEqual(createDefaultUserPresetLibraryState())
    const save = repository.saveUserPresets(savedLibrary())
    expect(save.ok).toBe(false)
    expect(save.diagnostic?.code).toBe('future-storage-version')
    expect(storage.values.get(USER_PRESET_LIBRARY_STORAGE_KEY)).toBe(
      existingPresetLibrary,
    )
  })
})
