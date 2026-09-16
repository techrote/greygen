import {
  APP_STORAGE_VERSION,
  type ProfileState,
  type SoundState,
  type StateParseCode,
  type UiState,
  createDefaultProfileState,
  createDefaultSoundState,
  createDefaultUiState,
  parseProfileState,
  parseSoundState,
  parseUiState,
  serializeProfileState,
  serializeSoundState,
  serializeStorageManifest,
  serializeUiState,
} from '../state/appState'
import {
  type UserPresetLibraryState,
  createDefaultUserPresetLibraryState,
  parseUserPresetLibraryState,
  serializeUserPresetLibraryState,
} from '../state/userPresetState'

export const STORAGE_MANIFEST_KEY = 'greygen.storage-manifest'
export const SOUND_STATE_STORAGE_KEY = 'greygen.sound-state'
export const PROFILE_STATE_STORAGE_KEY = 'greygen.profile-state'
export const UI_STATE_STORAGE_KEY = 'greygen.ui-state'
export const USER_PRESET_LIBRARY_STORAGE_KEY = 'greygen.user-presets'

export interface StoragePort {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type StateDomain =
  | 'manifest'
  | 'sound'
  | 'presets'
  | 'profiles'
  | 'ui'
  | 'storage'
type PersistedDomain = Exclude<StateDomain, 'manifest' | 'storage'>

export type StorageDiagnosticCode =
  | StateParseCode
  | 'read-failed'
  | 'write-failed'
  | 'future-storage-version'

export interface StorageDiagnostic {
  readonly domain: StateDomain
  readonly code: StorageDiagnosticCode
  readonly message: string
}

export interface LoadedAppState {
  readonly sound: SoundState
  readonly userPresets: UserPresetLibraryState
  readonly profiles: ProfileState
  readonly ui: UiState
  readonly diagnostics: readonly StorageDiagnostic[]
}

export interface PersistenceResult {
  readonly ok: boolean
  readonly diagnostic: StorageDiagnostic | null
}

interface ManifestParseResult {
  readonly future: boolean
  readonly diagnostics: readonly StorageDiagnostic[]
}

function diagnostic(
  domain: StateDomain,
  code: StorageDiagnosticCode,
  message: string,
): StorageDiagnostic {
  return Object.freeze({ domain, code, message })
}

function parseManifest(raw: string): ManifestParseResult {
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return {
      future: false,
      diagnostics: Object.freeze([
        diagnostic(
          'manifest',
          'malformed',
          'Storage manifest was malformed; domain documents were recovered independently.',
        ),
      ]),
    }
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      future: false,
      diagnostics: Object.freeze([
        diagnostic(
          'manifest',
          'recovered',
          'Storage manifest was invalid; domain documents were recovered independently.',
        ),
      ]),
    }
  }

  const version = (value as Record<string, unknown>).schemaVersion
  if (!Number.isInteger(version)) {
    return {
      future: false,
      diagnostics: Object.freeze([
        diagnostic(
          'manifest',
          'recovered',
          'Storage manifest had no valid version; domain documents were recovered independently.',
        ),
      ]),
    }
  }

  if ((version as number) > APP_STORAGE_VERSION) {
    return {
      future: true,
      diagnostics: Object.freeze([
        diagnostic(
          'manifest',
          'future-storage-version',
          `Local storage format v${version} is newer than this build. Stored documents were left untouched and safe defaults were loaded.`,
        ),
      ]),
    }
  }

  if (version !== APP_STORAGE_VERSION) {
    return {
      future: false,
      diagnostics: Object.freeze([
        diagnostic(
          'manifest',
          'recovered',
          'Unsupported storage manifest version was ignored; domain documents were recovered independently.',
        ),
      ]),
    }
  }

  return { future: false, diagnostics: Object.freeze([]) }
}

function parseDiagnostics(
  domain: PersistedDomain,
  code: StateParseCode,
  messages: readonly string[],
): readonly StorageDiagnostic[] {
  if (code === 'ok') {
    return Object.freeze([])
  }
  return Object.freeze(
    messages.map((message) => diagnostic(domain, code, message)),
  )
}

export class AppStateRepository {
  private readonly writeProtection = new Map<
    PersistedDomain,
    'future-version' | 'future-storage-version'
  >()

  constructor(private readonly storage: StoragePort) {}

  load(): LoadedAppState {
    const diagnostics: StorageDiagnostic[] = []
    this.writeProtection.clear()

    const manifestRead = this.read(STORAGE_MANIFEST_KEY, 'manifest')
    diagnostics.push(...manifestRead.diagnostics)
    if (manifestRead.value !== null) {
      const manifest = parseManifest(manifestRead.value)
      diagnostics.push(...manifest.diagnostics)
      if (manifest.future) {
        this.protectAllDomains('future-storage-version')
        return Object.freeze({
          sound: createDefaultSoundState(),
          userPresets: createDefaultUserPresetLibraryState(),
          profiles: createDefaultProfileState(),
          ui: createDefaultUiState(),
          diagnostics: Object.freeze(diagnostics),
        })
      }
    }

    const soundRead = this.read(SOUND_STATE_STORAGE_KEY, 'sound')
    const presetRead = this.read(USER_PRESET_LIBRARY_STORAGE_KEY, 'presets')
    const profileRead = this.read(PROFILE_STATE_STORAGE_KEY, 'profiles')
    const uiRead = this.read(UI_STATE_STORAGE_KEY, 'ui')
    diagnostics.push(
      ...soundRead.diagnostics,
      ...presetRead.diagnostics,
      ...profileRead.diagnostics,
      ...uiRead.diagnostics,
    )

    const sound = soundRead.value
      ? parseSoundState(soundRead.value)
      : {
          state: createDefaultSoundState(),
          code: 'ok' as const,
          messages: Object.freeze([]),
        }
    const userPresets = presetRead.value
      ? parseUserPresetLibraryState(presetRead.value)
      : {
          state: createDefaultUserPresetLibraryState(),
          code: 'ok' as const,
          messages: Object.freeze([]),
        }
    const profiles = profileRead.value
      ? parseProfileState(profileRead.value)
      : {
          state: createDefaultProfileState(),
          code: 'ok' as const,
          messages: Object.freeze([]),
        }
    const ui = uiRead.value
      ? parseUiState(uiRead.value)
      : {
          state: createDefaultUiState(),
          code: 'ok' as const,
          messages: Object.freeze([]),
        }

    this.protectFutureDomain('sound', sound.code)
    this.protectFutureDomain('presets', userPresets.code)
    this.protectFutureDomain('profiles', profiles.code)
    this.protectFutureDomain('ui', ui.code)

    diagnostics.push(
      ...parseDiagnostics('sound', sound.code, sound.messages),
      ...parseDiagnostics('presets', userPresets.code, userPresets.messages),
      ...parseDiagnostics('profiles', profiles.code, profiles.messages),
      ...parseDiagnostics('ui', ui.code, ui.messages),
    )

    return Object.freeze({
      sound: sound.state,
      userPresets: userPresets.state,
      profiles: profiles.state,
      ui: ui.state,
      diagnostics: Object.freeze(diagnostics),
    })
  }

  saveSound(state: SoundState): PersistenceResult {
    return this.writeDomain(
      SOUND_STATE_STORAGE_KEY,
      serializeSoundState(state),
      'sound',
    )
  }

  saveUserPresets(state: UserPresetLibraryState): PersistenceResult {
    return this.writeDomain(
      USER_PRESET_LIBRARY_STORAGE_KEY,
      serializeUserPresetLibraryState(state),
      'presets',
    )
  }

  saveProfiles(state: ProfileState): PersistenceResult {
    return this.writeDomain(
      PROFILE_STATE_STORAGE_KEY,
      serializeProfileState(state),
      'profiles',
    )
  }

  saveUi(state: UiState): PersistenceResult {
    return this.writeDomain(UI_STATE_STORAGE_KEY, serializeUiState(state), 'ui')
  }

  resetSound(): PersistenceResult {
    return this.saveSound(createDefaultSoundState())
  }

  deleteProfiles(): PersistenceResult {
    return this.saveProfiles(createDefaultProfileState())
  }

  private protectAllDomains(
    code: 'future-version' | 'future-storage-version',
  ): void {
    this.writeProtection.set('sound', code)
    this.writeProtection.set('presets', code)
    this.writeProtection.set('profiles', code)
    this.writeProtection.set('ui', code)
  }

  private protectFutureDomain(
    domain: PersistedDomain,
    code: StateParseCode,
  ): void {
    if (code === 'future-version') {
      this.writeProtection.set(domain, 'future-version')
    }
  }

  private read(
    key: string,
    domain: StateDomain,
  ): {
    readonly value: string | null
    readonly diagnostics: readonly StorageDiagnostic[]
  } {
    try {
      return {
        value: this.storage.getItem(key),
        diagnostics: Object.freeze([]),
      }
    } catch (error) {
      return {
        value: null,
        diagnostics: Object.freeze([
          diagnostic(
            domain,
            'read-failed',
            `Local ${domain} storage could not be read: ${errorMessage(error)}`,
          ),
        ]),
      }
    }
  }

  private writeDomain(
    key: string,
    value: string,
    domain: PersistedDomain,
  ): PersistenceResult {
    const protection = this.writeProtection.get(domain)
    if (protection) {
      const scope =
        protection === 'future-storage-version'
          ? 'storage format'
          : `${domain} state schema`
      return Object.freeze({
        ok: false,
        diagnostic: diagnostic(
          domain,
          protection,
          `The stored ${scope} is newer than this Greygen build and was not overwritten.`,
        ),
      })
    }

    try {
      this.storage.setItem(key, value)
      this.storage.setItem(STORAGE_MANIFEST_KEY, serializeStorageManifest())
      return Object.freeze({ ok: true, diagnostic: null })
    } catch (error) {
      return Object.freeze({
        ok: false,
        diagnostic: diagnostic(
          domain,
          'write-failed',
          `Local ${domain} state could not be saved: ${errorMessage(error)}`,
        ),
      })
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown storage error'
}
