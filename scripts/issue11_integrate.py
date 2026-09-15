from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    if old not in source:
        raise SystemExit(f'missing pattern in {path}: {old[:120]!r}')
    file.write_text(source.replace(old, new, 1))


# Persist the user preset library as a separate local sound-library document.
path = 'src/app/storage/AppStateRepository.ts'
replace_once(
    path,
    "} from '../state/appState'\n",
    "} from '../state/appState'\nimport {\n  type UserPresetLibraryState,\n  createDefaultUserPresetLibraryState,\n  parseUserPresetLibraryState,\n  serializeUserPresetLibraryState,\n} from '../state/userPresetState'\n",
)
replace_once(
    path,
    "export const UI_STATE_STORAGE_KEY = 'greygen.ui-state'\n",
    "export const UI_STATE_STORAGE_KEY = 'greygen.ui-state'\nexport const USER_PRESET_LIBRARY_STORAGE_KEY = 'greygen.user-presets'\n",
)
replace_once(
    path,
    "export type StateDomain = 'manifest' | 'sound' | 'profiles' | 'ui' | 'storage'\n",
    "export type StateDomain =\n  | 'manifest'\n  | 'sound'\n  | 'presets'\n  | 'profiles'\n  | 'ui'\n  | 'storage'\n",
)
replace_once(
    path,
    "  readonly sound: SoundState\n  readonly profiles: ProfileState\n",
    "  readonly sound: SoundState\n  readonly userPresets: UserPresetLibraryState\n  readonly profiles: ProfileState\n",
)
replace_once(
    path,
    "          sound: createDefaultSoundState(),\n          profiles: createDefaultProfileState(),\n",
    "          sound: createDefaultSoundState(),\n          userPresets: createDefaultUserPresetLibraryState(),\n          profiles: createDefaultProfileState(),\n",
)
replace_once(
    path,
    "    const profileRead = this.read(PROFILE_STATE_STORAGE_KEY, 'profiles')\n",
    "    const presetRead = this.read(USER_PRESET_LIBRARY_STORAGE_KEY, 'presets')\n    const profileRead = this.read(PROFILE_STATE_STORAGE_KEY, 'profiles')\n",
)
replace_once(
    path,
    "      ...soundRead.diagnostics,\n      ...profileRead.diagnostics,\n",
    "      ...soundRead.diagnostics,\n      ...presetRead.diagnostics,\n      ...profileRead.diagnostics,\n",
)
replace_once(
    path,
    "    const profiles = profileRead.value\n",
    "    const userPresets = presetRead.value\n      ? parseUserPresetLibraryState(presetRead.value)\n      : {\n          state: createDefaultUserPresetLibraryState(),\n          code: 'ok' as const,\n          messages: Object.freeze([]),\n        }\n    const profiles = profileRead.value\n",
)
replace_once(
    path,
    "    this.protectFutureDomain('sound', sound.code)\n    this.protectFutureDomain('profiles', profiles.code)\n",
    "    this.protectFutureDomain('sound', sound.code)\n    this.protectFutureDomain('presets', userPresets.code)\n    this.protectFutureDomain('profiles', profiles.code)\n",
)
replace_once(
    path,
    "      ...parseDiagnostics('sound', sound.code, sound.messages),\n      ...parseDiagnostics('profiles', profiles.code, profiles.messages),\n",
    "      ...parseDiagnostics('sound', sound.code, sound.messages),\n      ...parseDiagnostics('presets', userPresets.code, userPresets.messages),\n      ...parseDiagnostics('profiles', profiles.code, profiles.messages),\n",
)
replace_once(
    path,
    "      sound: sound.state,\n      profiles: profiles.state,\n",
    "      sound: sound.state,\n      userPresets: userPresets.state,\n      profiles: profiles.state,\n",
)
replace_once(
    path,
    "  saveProfiles(state: ProfileState): PersistenceResult {\n",
    "  saveUserPresets(state: UserPresetLibraryState): PersistenceResult {\n    return this.writeDomain(\n      USER_PRESET_LIBRARY_STORAGE_KEY,\n      serializeUserPresetLibraryState(state),\n      'presets',\n    )\n  }\n\n  saveProfiles(state: ProfileState): PersistenceResult {\n",
)
replace_once(
    path,
    "    this.writeProtection.set('sound', code)\n    this.writeProtection.set('profiles', code)\n",
    "    this.writeProtection.set('sound', code)\n    this.writeProtection.set('presets', code)\n    this.writeProtection.set('profiles', code)\n",
)

# Load preset/share presentation styles.
replace_once(
    'src/main.tsx',
    "import './styles/animation.css'\n",
    "import './styles/animation.css'\nimport './styles/presets.css'\n",
)

# Extend the primary App surface and controller.
path = 'src/app/App.tsx'
replace_once(
    path,
    "import {\n  BAND_STEP_DB,",
    "import {\n  createSoundShareUrl,\n  parseSoundShareUrl,\n  stripSoundShareFragment,\n} from '../features/sharing/shareState'\nimport {\n  BAND_STEP_DB,",
)
replace_once(
    path,
    "} from './state/appState'\nimport type {\n",
    "} from './state/appState'\nimport {\n  USER_PRESET_NAME_MAX_LENGTH,\n  type UserPresetLibraryState,\n  type UserSoundPreset,\n  createDefaultUserPresetLibraryState,\n  deleteUserSoundPreset,\n  findMatchingUserSoundPreset,\n  findUserSoundPreset,\n  saveUserSoundPreset,\n} from './state/userPresetState'\nimport type {\n",
)
replace_once(
    path,
    "  readonly profileCount: number\n  readonly onPrimaryAction: () => void\n",
    "  readonly profileCount: number\n  readonly userPresets: readonly UserSoundPreset[]\n  readonly matchedUserPresetName: string | null\n  readonly shareUrl: string\n  readonly shareNotice: string | null\n  readonly onPrimaryAction: () => void\n",
)
replace_once(
    path,
    "  readonly onDeleteProfiles: () => void\n}",
    "  readonly onDeleteProfiles: () => void\n  readonly onSaveUserPreset: (name: string) => boolean\n  readonly onLoadUserPreset: (id: string) => void\n  readonly onDeleteUserPreset: (id: string) => void\n  readonly onCopyShareUrl: () => void\n  readonly onImportShareUrl: (href: string) => void\n}",
)
replace_once(
    path,
    "  profileCount,\n  onPrimaryAction,",
    "  profileCount,\n  userPresets,\n  matchedUserPresetName,\n  shareUrl,\n  shareNotice,\n  onPrimaryAction,",
)
replace_once(
    path,
    "  onDeleteProfiles,\n}: GeneratorSurfaceProps) {\n  const telemetry",
    "  onDeleteProfiles,\n  onSaveUserPreset,\n  onLoadUserPreset,\n  onDeleteUserPreset,\n  onCopyShareUrl,\n  onImportShareUrl,\n}: GeneratorSurfaceProps) {\n  const [presetNameDraft, setPresetNameDraft] = useState('')\n  const [shareImportDraft, setShareImportDraft] = useState('')\n  const telemetry",
)
replace_once(
    path,
    "  const modified = isModifiedPreset(spectrumState)\n",
    "  const modified =\n    matchedUserPresetName === null && isModifiedPreset(spectrumState)\n",
)
replace_once(
    path,
    "  const handleAnimationModeChange = (\n",
    "  const handleSavePreset = (): void => {\n    if (onSaveUserPreset(presetNameDraft)) {\n      setPresetNameDraft('')\n    }\n  }\n\n  const handleAnimationModeChange = (\n",
)
replace_once(
    path,
    "            <strong>{selectedPreset?.label ?? spectrumState.targetId}</strong>\n            {modified ? <span>Modified</span> : <span>Preset</span>}\n",
    "            <strong>\n              {matchedUserPresetName ?? selectedPreset?.label ?? spectrumState.targetId}\n            </strong>\n            {matchedUserPresetName ? (\n              <span>Saved preset</span>\n            ) : modified ? (\n              <span>Modified</span>\n            ) : (\n              <span>Preset</span>\n            )}\n",
)
preset_section = r'''      <section
        className="preset-library-card"
        aria-labelledby="preset-library-heading"
      >
        <div className="section-heading-row">
          <div>
            <p className="label">Library &amp; sharing</p>
            <h2 id="preset-library-heading">Presets &amp; share links</h2>
          </div>
          <span className="profile-count">
            {userPresets.length} saved {userPresets.length === 1 ? 'preset' : 'presets'}
          </span>
        </div>

        <form
          className="preset-save-row"
          onSubmit={(event) => {
            event.preventDefault()
            handleSavePreset()
          }}
        >
          <label htmlFor="user-preset-name">
            Save current sound
            <input
              id="user-preset-name"
              type="text"
              maxLength={USER_PRESET_NAME_MAX_LENGTH}
              value={presetNameDraft}
              disabled={controlsDisabled}
              autoComplete="off"
              onChange={(event) => setPresetNameDraft(event.currentTarget.value)}
            />
          </label>
          <button
            className="secondary-action"
            type="submit"
            disabled={controlsDisabled || presetNameDraft.trim().length === 0}
          >
            Save preset
          </button>
        </form>

        {userPresets.length > 0 ? (
          <ul className="saved-preset-list" aria-label="Saved sound presets">
            {userPresets.map((preset) => (
              <li className="saved-preset-item" key={preset.id}>
                <strong className="saved-preset-name">{preset.name}</strong>
                <button
                  className="secondary-action"
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => onLoadUserPreset(preset.id)}
                >
                  Load
                </button>
                <button
                  className="danger-action"
                  type="button"
                  aria-label={`Delete saved preset ${preset.name}`}
                  onClick={() => onDeleteUserPreset(preset.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="status-note">No local sound presets saved yet.</p>
        )}

        <div className="share-copy-row">
          <label htmlFor="share-url">
            Current sound share link
            <input id="share-url" type="text" readOnly value={shareUrl} />
          </label>
          <button
            className="secondary-action"
            type="button"
            disabled={!engineReady || shareUrl.length === 0}
            onClick={onCopyShareUrl}
          >
            Copy share link
          </button>
        </div>

        <form
          className="share-load-row"
          onSubmit={(event) => {
            event.preventDefault()
            onImportShareUrl(shareImportDraft)
          }}
        >
          <label htmlFor="share-import-url">
            Load shared sound URL
            <input
              id="share-import-url"
              type="text"
              value={shareImportDraft}
              disabled={controlsDisabled}
              autoComplete="off"
              onChange={(event) => setShareImportDraft(event.currentTarget.value)}
            />
          </label>
          <button
            className="secondary-action"
            type="submit"
            disabled={controlsDisabled || shareImportDraft.trim().length === 0}
          >
            Load shared sound
          </button>
        </form>

        <p className="share-privacy-note">
          Normal share links contain only versioned sound settings. Local preset
          names, playback/calibration profiles, profile notes, and UI preferences
          are excluded. Loading a link never starts audio.
        </p>
        {shareNotice ? (
          <p className="share-notice" role="status">
            {shareNotice}
          </p>
        ) : null}
      </section>

'''
replace_once(
    path,
    "      <section className=\"output-card\" aria-labelledby=\"output-heading\">\n",
    preset_section + "      <section className=\"output-card\" aria-labelledby=\"output-heading\">\n",
)
replace_once(
    path,
    "  const [profileState, setProfileState] = useState<ProfileState>(() =>\n    createDefaultProfileState(),\n  )\n",
    "  const [profileState, setProfileState] = useState<ProfileState>(() =>\n    createDefaultProfileState(),\n  )\n  const [userPresetState, setUserPresetState] = useState<UserPresetLibraryState>(\n    () => createDefaultUserPresetLibraryState(),\n  )\n",
)
replace_once(
    path,
    "  const [storageNotice, setStorageNotice] = useState<string | null>(null)\n",
    "  const [storageNotice, setStorageNotice] = useState<string | null>(null)\n  const [shareNotice, setShareNotice] = useState<string | null>(null)\n",
)
old_load = """    const loaded = repository.load()
    setSoundState(loaded.sound)
    setProfileState(loaded.profiles)
    setUiState(loaded.ui)
    setStorageNotice(diagnosticsNotice(loaded.diagnostics))

    const engine = createBrowserAudioEngine()
"""
new_load = """    const loaded = repository.load()
    let initialSound = loaded.sound
    setProfileState(loaded.profiles)
    setUserPresetState(loaded.userPresets)
    setUiState(loaded.ui)
    setStorageNotice(diagnosticsNotice(loaded.diagnostics))

    if (typeof globalThis.location !== 'undefined') {
      const shared = parseSoundShareUrl(globalThis.location.href)
      if (shared.state) {
        initialSound = shared.state
        const detail = shared.messages.length > 0 ? ` ${shared.messages.join(' ')}` : ''
        setShareNotice(
          `Shared sound loaded. Audio remains Ready until you choose Start.${detail}`,
        )
        try {
          globalThis.history?.replaceState(
            null,
            '',
            stripSoundShareFragment(globalThis.location.href),
          )
        } catch {
          // URL cleanup is cosmetic; successful import remains authoritative.
        }
      } else if (shared.code !== 'absent') {
        setShareNotice(shared.messages.join(' '))
      }
    }
    setSoundState(initialSound)

    const engine = createBrowserAudioEngine()
"""
replace_once(path, old_load, new_load)
replace_once(
    path,
    "        await engine.resetSeed(loaded.sound.seed)\n        await engine.setSpectrumState(soundStateToSpectrumState(loaded.sound))\n        await engine.setMasterGainDb(loaded.sound.masterGainDb)\n        await engine.setStereoWidth(loaded.sound.stereoWidth)\n        await engine.setAnimationState(soundStateToAnimationState(loaded.sound))\n\n        if (loaded.diagnostics.some((entry) => entry.code === 'migrated')) {\n          const result = repository.saveSound(loaded.sound)\n",
    "        await engine.resetSeed(initialSound.seed)\n        await engine.setSpectrumState(soundStateToSpectrumState(initialSound))\n        await engine.setMasterGainDb(initialSound.masterGainDb)\n        await engine.setStereoWidth(initialSound.stereoWidth)\n        await engine.setAnimationState(soundStateToAnimationState(initialSound))\n\n        if (\n          initialSound !== loaded.sound ||\n          loaded.diagnostics.some((entry) => entry.code === 'migrated')\n        ) {\n          const result = repository.saveSound(initialSound)\n",
)
replace_once(
    path,
    "  const persistSound = (next: SoundState): void => {\n",
    "  const persistUserPresets = (next: UserPresetLibraryState): void => {\n    const repository = repositoryRef.current\n    if (repository) {\n      reportPersistenceResult(repository.saveUserPresets(next))\n    }\n  }\n\n  const persistSound = (next: SoundState): void => {\n",
)
insert_anchor = "  const handleToggleFutureFeatures = (): void => {\n"
handlers = r'''  const applySoundSnapshot = (next: SoundState, notice: string): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    setControlError(null)
    setSoundState(next)
    void Promise.all([
      engine.resetSeed(next.seed),
      engine.setSpectrumState(soundStateToSpectrumState(next)),
      engine.setMasterGainDb(next.masterGainDb),
      engine.setStereoWidth(next.stereoWidth),
      engine.setAnimationState(soundStateToAnimationState(next)),
    ])
      .then(() => {
        persistSound(next)
        setShareNotice(notice)
      })
      .catch(reportControlFailure)
  }

  const handleSaveUserPreset = (name: string): boolean => {
    try {
      const saved = saveUserSoundPreset(userPresetState, name, soundState)
      setUserPresetState(saved.state)
      persistUserPresets(saved.state)
      setShareNotice(`Saved local sound preset “${saved.preset.name}”.`)
      return true
    } catch (error) {
      setShareNotice(errorText(error))
      return false
    }
  }

  const handleLoadUserPreset = (id: string): void => {
    const preset = findUserSoundPreset(userPresetState, id)
    if (!preset) {
      setShareNotice('That saved preset is no longer available.')
      return
    }
    applySoundSnapshot(
      preset.sound,
      `Loaded local sound preset “${preset.name}”. Loading did not start audio.`,
    )
  }

  const handleDeleteUserPreset = (id: string): void => {
    const preset = findUserSoundPreset(userPresetState, id)
    const next = deleteUserSoundPreset(userPresetState, id)
    setUserPresetState(next)
    persistUserPresets(next)
    if (preset) {
      setShareNotice(`Deleted local sound preset “${preset.name}”.`)
    }
  }

  const handleCopyShareUrl = (): void => {
    if (typeof globalThis.location === 'undefined') {
      return
    }
    const url = createSoundShareUrl(globalThis.location.href, soundState)
    const clipboard = globalThis.navigator?.clipboard
    if (!clipboard?.writeText) {
      setShareNotice('Clipboard access is unavailable. Select and copy the visible share link manually.')
      return
    }
    void clipboard
      .writeText(url)
      .then(() => setShareNotice('Share link copied. It contains sound settings only.'))
      .catch(() =>
        setShareNotice('Clipboard write was blocked. Select and copy the visible share link manually.'),
      )
  }

  const handleImportShareUrl = (href: string): void => {
    if (typeof globalThis.location === 'undefined') {
      return
    }
    const parsed = parseSoundShareUrl(href, globalThis.location.href)
    if (!parsed.state) {
      setShareNotice(
        parsed.messages.join(' ') || 'No shared sound payload was found in that URL.',
      )
      return
    }
    const detail = parsed.messages.length > 0 ? ` ${parsed.messages.join(' ')}` : ''
    applySoundSnapshot(
      parsed.state,
      `Shared sound loaded. Loading did not start audio.${detail}`,
    )
  }

'''
replace_once(path, insert_anchor, handlers + insert_anchor)
replace_once(
    path,
    "  return (\n    <GeneratorSurface\n",
    "  const matchingUserPreset = findMatchingUserSoundPreset(\n    userPresetState,\n    soundState,\n  )\n  const shareUrl =\n    typeof globalThis.location === 'undefined'\n      ? ''\n      : createSoundShareUrl(globalThis.location.href, soundState)\n\n  return (\n    <GeneratorSurface\n",
)
replace_once(
    path,
    "      profileCount={profileState.profiles.length}\n      onPrimaryAction={handlePrimaryAction}\n",
    "      profileCount={profileState.profiles.length}\n      userPresets={userPresetState.presets}\n      matchedUserPresetName={matchingUserPreset?.name ?? null}\n      shareUrl={shareUrl}\n      shareNotice={shareNotice}\n      onPrimaryAction={handlePrimaryAction}\n",
)
replace_once(
    path,
    "      onDeleteProfiles={handleDeleteProfiles}\n    />\n",
    "      onDeleteProfiles={handleDeleteProfiles}\n      onSaveUserPreset={handleSaveUserPreset}\n      onLoadUserPreset={handleLoadUserPreset}\n      onDeleteUserPreset={handleDeleteUserPreset}\n      onCopyShareUrl={handleCopyShareUrl}\n      onImportShareUrl={handleImportShareUrl}\n    />\n",
)

# Static presentation fixtures supply new preset/share props.
path = 'tests/app-shell.test.tsx'
replace_once(
    path,
    "    profileCount: 0,\n    onPrimaryAction: noop,",
    "    profileCount: 0,\n    userPresets: [],\n    matchedUserPresetName: null,\n    shareUrl: 'https://example.test/#s=fixture',\n    shareNotice: null,\n    onPrimaryAction: noop,",
)
replace_once(
    path,
    "    onDeleteProfiles: noop,\n",
    "    onDeleteProfiles: noop,\n    onSaveUserPreset: () => true,\n    onLoadUserPreset: noop,\n    onDeleteUserPreset: noop,\n    onCopyShareUrl: noop,\n    onImportShareUrl: noop,\n",
)
replace_once(
    path,
    "    expect(markup).toContain('Playback calibration')\n",
    "    expect(markup).toContain('Playback calibration')\n    expect(markup).toContain('Presets &amp; share links')\n    expect(markup).toContain('profiles, profile notes, and UI preferences')\n",
)
