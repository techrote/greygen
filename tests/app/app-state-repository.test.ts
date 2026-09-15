import { describe, expect, it } from 'vitest'
import {
  APP_STORAGE_VERSION,
  PROFILE_RECORD_SCHEMA_VERSION,
  createDefaultProfileState,
  createDefaultSoundState,
  createDefaultUiState,
  createProfileState,
  createSoundState,
  createUiState,
} from '../../src/app/state/appState'
import {
  AppStateRepository,
  PROFILE_STATE_STORAGE_KEY,
  SOUND_STATE_STORAGE_KEY,
  STORAGE_MANIFEST_KEY,
  UI_STATE_STORAGE_KEY,
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

class ThrowingStorage implements StoragePort {
  getItem(): string | null {
    throw new Error('fixture read denied')
  }

  setItem(): void {
    throw new Error('fixture quota exceeded')
  }

  removeItem(): void {
    throw new Error('fixture remove denied')
  }
}

function fixtureProfileState() {
  return createProfileState([
    {
      recordSchemaVersion: PROFILE_RECORD_SCHEMA_VERSION,
      id: 'private-fixture',
      name: 'Private fixture profile',
      kind: 'calibration',
      payloadSchemaVersion: 1,
      payload: { offsetsDb: [1, 0, -1] },
    },
  ])
}

describe('AppStateRepository', () => {
  it('returns clean defaults on first run without diagnostics', () => {
    const repository = new AppStateRepository(new MemoryStorage())
    const loaded = repository.load()

    expect(loaded.sound).toEqual(createDefaultSoundState())
    expect(loaded.profiles).toEqual(createDefaultProfileState())
    expect(loaded.ui).toEqual(createDefaultUiState())
    expect(loaded.diagnostics).toEqual([])
  })

  it('round-trips sound, private profiles, and UI preferences through separate documents', () => {
    const storage = new MemoryStorage()
    const repository = new AppStateRepository(storage)
    const sound = createSoundState({
      seed: 0x1234abcd,
      targetId: 'pink',
      userBandOffsetsDb: [0, 0, 2, 0, 0, -3, 0, 0, 0, 1],
      masterGainDb: -19,
    })
    const profiles = fixtureProfileState()
    const ui = createUiState(false)

    expect(repository.saveSound(sound).ok).toBe(true)
    expect(repository.saveProfiles(profiles).ok).toBe(true)
    expect(repository.saveUi(ui).ok).toBe(true)

    expect(storage.values.has(STORAGE_MANIFEST_KEY)).toBe(true)
    expect(storage.values.has(SOUND_STATE_STORAGE_KEY)).toBe(true)
    expect(storage.values.has(PROFILE_STATE_STORAGE_KEY)).toBe(true)
    expect(storage.values.has(UI_STATE_STORAGE_KEY)).toBe(true)

    const loaded = repository.load()
    expect(loaded.sound).toEqual(sound)
    expect(loaded.profiles).toEqual(profiles)
    expect(loaded.ui).toEqual(ui)
    expect(loaded.diagnostics).toEqual([])
  })

  it('recovers a malformed sound document without preventing profile/UI loading', () => {
    const storage = new MemoryStorage()
    const repository = new AppStateRepository(storage)
    const profiles = fixtureProfileState()
    const ui = createUiState(false)

    repository.saveProfiles(profiles)
    repository.saveUi(ui)
    storage.values.set(SOUND_STATE_STORAGE_KEY, '{broken json')

    const loaded = repository.load()
    expect(loaded.sound).toEqual(createDefaultSoundState())
    expect(loaded.profiles).toEqual(profiles)
    expect(loaded.ui).toEqual(ui)
    expect(loaded.diagnostics.some((entry) => entry.domain === 'sound')).toBe(
      true,
    )
  })

  it('migrates legacy sound state while keeping profile storage untouched', () => {
    const storage = new MemoryStorage()
    const profiles = fixtureProfileState()
    const repository = new AppStateRepository(storage)
    repository.saveProfiles(profiles)
    storage.values.set(
      SOUND_STATE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 0,
        seed: 7,
        preset: 'brown',
        bandsDb: [0, 0, 0, 4, 0, 0, 0, 0, 0, 0],
        masterDb: -21,
      }),
    )

    const loaded = repository.load()
    expect(loaded.sound.targetId).toBe('brown')
    expect(loaded.sound.userBandOffsetsDb[3]).toBe(4)
    expect(loaded.sound.seed).toBe(7)
    expect(loaded.profiles).toEqual(profiles)
    expect(
      loaded.diagnostics.some(
        (entry) => entry.domain === 'sound' && entry.code === 'migrated',
      ),
    ).toBe(true)
  })

  it('treats an unknown future storage manifest as read-only for the whole boot', () => {
    const storage = new MemoryStorage()
    const futureManifest = JSON.stringify({ schemaVersion: 99 })
    const futureSound = JSON.stringify({ schemaVersion: 99, targetId: 'white' })
    storage.values.set(STORAGE_MANIFEST_KEY, futureManifest)
    storage.values.set(SOUND_STATE_STORAGE_KEY, futureSound)
    const repository = new AppStateRepository(storage)

    const loaded = repository.load()
    expect(loaded.sound).toEqual(createDefaultSoundState())
    expect(loaded.profiles).toEqual(createDefaultProfileState())
    expect(loaded.ui).toEqual(createDefaultUiState())
    expect(
      loaded.diagnostics.some(
        (entry) => entry.code === 'future-storage-version',
      ),
    ).toBe(true)

    const attemptedSave = repository.saveSound(createDefaultSoundState())
    expect(attemptedSave.ok).toBe(false)
    expect(attemptedSave.diagnostic?.code).toBe('future-storage-version')
    expect(storage.values.get(STORAGE_MANIFEST_KEY)).toBe(futureManifest)
    expect(storage.values.get(SOUND_STATE_STORAGE_KEY)).toBe(futureSound)
  })

  it('write-protects only an unknown future domain while current sibling domains remain writable', () => {
    const storage = new MemoryStorage()
    const futureSound = JSON.stringify({ schemaVersion: 99, targetId: 'pink' })
    storage.values.set(
      STORAGE_MANIFEST_KEY,
      JSON.stringify({ schemaVersion: APP_STORAGE_VERSION }),
    )
    storage.values.set(SOUND_STATE_STORAGE_KEY, futureSound)
    const repository = new AppStateRepository(storage)

    const loaded = repository.load()
    expect(loaded.sound).toEqual(createDefaultSoundState())
    expect(
      loaded.diagnostics.some(
        (entry) => entry.domain === 'sound' && entry.code === 'future-version',
      ),
    ).toBe(true)

    const attemptedSoundSave = repository.saveSound(createDefaultSoundState())
    expect(attemptedSoundSave.ok).toBe(false)
    expect(attemptedSoundSave.diagnostic?.code).toBe('future-version')
    expect(storage.values.get(SOUND_STATE_STORAGE_KEY)).toBe(futureSound)

    const ui = createUiState(false)
    expect(repository.saveUi(ui).ok).toBe(true)
    expect(JSON.parse(storage.values.get(UI_STATE_STORAGE_KEY) ?? '{}')).toEqual(
      ui,
    )
    expect(storage.values.get(SOUND_STATE_STORAGE_KEY)).toBe(futureSound)
  })

  it('resets sound without deleting personal profiles or UI preferences', () => {
    const storage = new MemoryStorage()
    const repository = new AppStateRepository(storage)
    const profiles = fixtureProfileState()
    const ui = createUiState(false)
    const modifiedSound = createSoundState({
      seed: 999,
      targetId: 'white',
      userBandOffsetsDb: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      masterGainDb: -12,
    })

    repository.saveSound(modifiedSound)
    repository.saveProfiles(profiles)
    repository.saveUi(ui)
    expect(repository.resetSound().ok).toBe(true)

    const loaded = repository.load()
    expect(loaded.sound).toEqual(createDefaultSoundState())
    expect(loaded.profiles).toEqual(profiles)
    expect(loaded.ui).toEqual(ui)
  })

  it('deletes profiles only when explicitly requested and preserves sound state', () => {
    const storage = new MemoryStorage()
    const repository = new AppStateRepository(storage)
    const sound = createSoundState({
      seed: 77,
      targetId: 'pink',
      userBandOffsetsDb: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      masterGainDb: -25,
    })

    repository.saveSound(sound)
    repository.saveProfiles(fixtureProfileState())
    expect(repository.deleteProfiles().ok).toBe(true)

    const loaded = repository.load()
    expect(loaded.sound).toEqual(sound)
    expect(loaded.profiles).toEqual(createDefaultProfileState())
  })

  it('degrades gracefully when local storage reads and writes throw', () => {
    const repository = new AppStateRepository(new ThrowingStorage())
    const loaded = repository.load()

    expect(loaded.sound).toEqual(createDefaultSoundState())
    expect(loaded.profiles).toEqual(createDefaultProfileState())
    expect(loaded.ui).toEqual(createDefaultUiState())
    expect(
      loaded.diagnostics.some((entry) => entry.code === 'read-failed'),
    ).toBe(true)

    const save = repository.saveSound(createDefaultSoundState())
    expect(save.ok).toBe(false)
    expect(save.diagnostic?.code).toBe('write-failed')
    expect(save.diagnostic?.message).toContain('fixture quota exceeded')
  })
})
