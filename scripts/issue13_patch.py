from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing pattern in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# ProfileState v2: persist active profile + application mode while migrating v1 safely.
path = 'src/app/state/appState.ts'
replace(path, "export const PROFILE_STATE_SCHEMA_VERSION = 1 as const", "export const PROFILE_STATE_SCHEMA_VERSION = 2 as const")
replace(path, "export type ProfileKind = 'calibration' | 'playback'\n", "export type ProfileKind = 'calibration' | 'playback'\nexport type CalibrationApplicationMode = 'off' | 'balanced' | 'full'\n")
replace(path, "export interface ProfileState {\n  readonly schemaVersion: typeof PROFILE_STATE_SCHEMA_VERSION\n  readonly profiles: readonly LocalProfileRecord[]\n}\n", "export interface ProfileState {\n  readonly schemaVersion: typeof PROFILE_STATE_SCHEMA_VERSION\n  readonly profiles: readonly LocalProfileRecord[]\n  readonly activeProfileId: string | null\n  readonly calibrationMode: CalibrationApplicationMode\n}\n")
replace(path, "export function createDefaultProfileState(): ProfileState {\n  return Object.freeze({\n    schemaVersion: PROFILE_STATE_SCHEMA_VERSION,\n    profiles: Object.freeze([]),\n  })\n}\n", "export function createDefaultProfileState(): ProfileState {\n  return createProfileState([], null, 'off')\n}\n")
replace(path, "export function createProfileState(\n  profiles: readonly LocalProfileRecord[],\n): ProfileState {\n  const canonical = profiles.map((profile) => {\n    const parsed = parseProfileRecord(profile)\n    if (!parsed) {\n      throw new RangeError('profile record is invalid')\n    }\n    return parsed\n  })\n  return Object.freeze({\n    schemaVersion: PROFILE_STATE_SCHEMA_VERSION,\n    profiles: Object.freeze(canonical),\n  })\n}\n", "export function createProfileState(\n  profiles: readonly LocalProfileRecord[],\n  activeProfileId: string | null = null,\n  calibrationMode: CalibrationApplicationMode = 'off',\n): ProfileState {\n  const canonical = profiles.map((profile) => {\n    const parsed = parseProfileRecord(profile)\n    if (!parsed) {\n      throw new RangeError('profile record is invalid')\n    }\n    return parsed\n  })\n  const active =\n    activeProfileId !== null && canonical.some((profile) => profile.id === activeProfileId)\n      ? activeProfileId\n      : null\n  const mode =\n    active === null ||\n    (calibrationMode !== 'off' &&\n      calibrationMode !== 'balanced' &&\n      calibrationMode !== 'full')\n      ? 'off'\n      : calibrationMode\n  return Object.freeze({\n    schemaVersion: PROFILE_STATE_SCHEMA_VERSION,\n    profiles: Object.freeze(canonical),\n    activeProfileId: active,\n    calibrationMode: mode,\n  })\n}\n")
old = "  if (value.schemaVersion > PROFILE_STATE_SCHEMA_VERSION) {\n    return {\n      state: createDefaultProfileState(),\n      code: 'future-version',\n      messages: Object.freeze([\n        `Private profile schema v${value.schemaVersion} is newer than this build; original storage was left untouched.`,\n      ]),\n    }\n  }\n  if (\n    value.schemaVersion !== PROFILE_STATE_SCHEMA_VERSION ||\n    !Array.isArray(value.profiles)\n  ) {"
new = "  if (value.schemaVersion > PROFILE_STATE_SCHEMA_VERSION) {\n    return {\n      state: createDefaultProfileState(),\n      code: 'future-version',\n      messages: Object.freeze([\n        `Private profile schema v${value.schemaVersion} is newer than this build; original storage was left untouched.`,\n      ]),\n    }\n  }\n  if (value.schemaVersion !== 1 && value.schemaVersion !== PROFILE_STATE_SCHEMA_VERSION) {"
replace(path, old, new)
replace(path, "  const profiles: LocalProfileRecord[] = []\n  for (const candidate of value.profiles) {", "  if (!Array.isArray(value.profiles)) {\n    return {\n      state: createDefaultProfileState(),\n      code: 'recovered',\n      messages: Object.freeze(['Private profile list was invalid and was not loaded.']),\n    }\n  }\n\n  const profiles: LocalProfileRecord[] = []\n  for (const candidate of value.profiles) {")
replace(path, "  return {\n    state: createProfileState(profiles),\n    code: 'ok',\n    messages: Object.freeze([]),\n  }\n}\n\nexport function createUiState", "  if (value.schemaVersion === 1) {\n    return {\n      state: createProfileState(profiles, null, 'off'),\n      code: 'migrated',\n      messages: Object.freeze([\n        'Private profile state schema v1 was migrated to v2 with correction bypassed to preserve previous audio behavior.',\n      ]),\n    }\n  }\n\n  const requestedActive =\n    typeof value.activeProfileId === 'string' ? value.activeProfileId : null\n  const activeProfileId =\n    requestedActive !== null && profiles.some((profile) => profile.id === requestedActive)\n      ? requestedActive\n      : null\n  const requestedMode = value.calibrationMode\n  const calibrationMode: CalibrationApplicationMode =\n    activeProfileId !== null &&\n    (requestedMode === 'off' || requestedMode === 'balanced' || requestedMode === 'full')\n      ? requestedMode\n      : 'off'\n  const recovered =\n    requestedActive !== activeProfileId ||\n    requestedMode !== calibrationMode\n\n  return {\n    state: createProfileState(profiles, activeProfileId, calibrationMode),\n    code: recovered ? 'recovered' : 'ok',\n    messages: recovered\n      ? Object.freeze([\n          'Invalid calibration profile selection/application state was bypassed safely.',\n        ])\n      : Object.freeze([]),\n  }\n}\n\nexport function createUiState")
replace(path, "export function serializeProfileState(state: ProfileState): string {\n  const canonical = createProfileState(state.profiles)\n  return JSON.stringify(canonical)\n}\n", "export function serializeProfileState(state: ProfileState): string {\n  const canonical = createProfileState(\n    state.profiles,\n    state.activeProfileId,\n    state.calibrationMode,\n  )\n  return JSON.stringify(canonical)\n}\n")

# AudioEngine already owns the calibration gain stage; expose a narrow control.
path = 'src/audio/AudioEngine.ts'
needle = "  async setMasterGainDb(masterGainDb: number): Promise<void> {\n    await this.setGainStageState(\n      createGainStageState(\n        masterGainDb,\n        this.gainStageValue.animationBandOffsetsDb,\n        this.gainStageValue.calibrationBandOffsetsDb,\n      ),\n    )\n  }\n"
insert = needle + "\n  async setCalibrationBandOffsetsDb(values: ArrayLike<number>): Promise<void> {\n    await this.setGainStageState(\n      createGainStageState(\n        this.gainStageValue.masterGainDb,\n        this.gainStageValue.animationBandOffsetsDb,\n        values,\n      ),\n    )\n  }\n"
replace(path, needle, insert)

# App integration.
path = 'src/app/App.tsx'
replace(path, "import {\n  type ProfileState,", "import CalibrationPanel, {\n  type CalibrationDraft,\n} from '../features/calibration/CalibrationPanel'\nimport {\n  createCalibrationProfileRecord,\n  findCalibrationProfile,\n  resolveCalibrationRecordOffsetsDb,\n} from '../features/calibration/calibrationProfile'\nimport {\n  type CalibrationApplicationMode,\n  type ProfileState,")
replace(path, "  createDefaultUiState,\n  createSoundState,", "  createDefaultUiState,\n  createProfileState,\n  createSoundState,")
replace(path, "  readonly profileCount: number\n", "  readonly profileCount: number\n  readonly profileState: ProfileState\n")
replace(path, "  readonly onDeleteProfiles: () => void\n", "  readonly onDeleteProfiles: () => void\n  readonly onSaveCalibrationProfile: (draft: CalibrationDraft) => void\n  readonly onSelectCalibrationProfile: (id: string | null) => void\n  readonly onCalibrationModeChange: (mode: CalibrationApplicationMode) => void\n  readonly onDeleteCalibrationProfile: (id: string) => void\n")
replace(path, "  profileCount,\n  userPresets,", "  profileCount,\n  profileState,\n  userPresets,")
replace(path, "  onDeleteProfiles,\n  onSaveUserPreset,", "  onDeleteProfiles,\n  onSaveCalibrationProfile,\n  onSelectCalibrationProfile,\n  onCalibrationModeChange,\n  onDeleteCalibrationProfile,\n  onSaveUserPreset,")
placeholder = "            <div className=\"calibration-placeholder\">\n              <h3>Playback calibration</h3>\n              <button type=\"button\" disabled>\n                Calibration profiles — coming later\n              </button>\n              <p>\n                Future profiles will describe relative listener + playback-chain\n                correction. This is not a medical hearing test.\n              </p>\n            </div>"
replacement = "            <CalibrationPanel\n              profiles={profileState.profiles}\n              activeProfileId={profileState.activeProfileId}\n              applicationMode={profileState.calibrationMode}\n              sampleRate={audioSnapshot.sampleRate}\n              disabled={controlsDisabled}\n              onSave={onSaveCalibrationProfile}\n              onSelect={onSelectCalibrationProfile}\n              onModeChange={onCalibrationModeChange}\n              onDelete={onDeleteCalibrationProfile}\n            />"
replace(path, placeholder, replacement)
replace(path, "        await engine.setAnimationState(soundStateToAnimationState(initialSound))\n", "        await engine.setAnimationState(soundStateToAnimationState(initialSound))\n        const initialCalibration = findCalibrationProfile(\n          loaded.profiles.profiles,\n          loaded.profiles.activeProfileId,\n        )\n        await engine.setCalibrationBandOffsetsDb(\n          resolveCalibrationRecordOffsetsDb(\n            initialCalibration,\n            loaded.profiles.calibrationMode,\n          ),\n        )\n")
replace(path, "  const persistSound = (next: SoundState): void => {\n    const repository = repositoryRef.current\n    if (repository) {\n      reportPersistenceResult(repository.saveSound(next))\n    }\n  }\n", "  const persistSound = (next: SoundState): void => {\n    const repository = repositoryRef.current\n    if (repository) {\n      reportPersistenceResult(repository.saveSound(next))\n    }\n  }\n\n  const persistProfiles = (next: ProfileState): void => {\n    const repository = repositoryRef.current\n    if (repository) {\n      reportPersistenceResult(repository.saveProfiles(next))\n    }\n  }\n\n  const applyProfileState = (next: ProfileState): void => {\n    const engine = engineRef.current\n    if (!engine) {\n      return\n    }\n    const active = findCalibrationProfile(next.profiles, next.activeProfileId)\n    setControlError(null)\n    void engine\n      .setCalibrationBandOffsetsDb(\n        resolveCalibrationRecordOffsetsDb(active, next.calibrationMode),\n      )\n      .then(() => {\n        setProfileState(next)\n        persistProfiles(next)\n      })\n      .catch(reportControlFailure)\n  }\n")
needle = "  const handleDeleteProfiles = (): void => {\n    const next = createDefaultProfileState()\n    setProfileState(next)\n    const repository = repositoryRef.current\n    if (repository) {\n      reportPersistenceResult(repository.deleteProfiles())\n    }\n  }\n"
replacement = "  const handleSaveCalibrationProfile = (draft: CalibrationDraft): void => {\n    let suffix = profileState.profiles.length + 1\n    let id = `calibration-${suffix}`\n    while (profileState.profiles.some((profile) => profile.id === id)) {\n      suffix += 1\n      id = `calibration-${suffix}`\n    }\n    try {\n      const record = createCalibrationProfileRecord({\n        id,\n        name: draft.name,\n        sampleRateHz: audioSnapshot.sampleRate,\n        referenceBandIndex: draft.referenceBandIndex,\n        rawBandOffsetsDb: draft.rawBandOffsetsDb,\n      })\n      applyProfileState(\n        createProfileState(\n          [...profileState.profiles, record],\n          record.id,\n          'balanced',\n        ),\n      )\n    } catch (error) {\n      setControlError(errorText(error))\n    }\n  }\n\n  const handleSelectCalibrationProfile = (id: string | null): void => {\n    applyProfileState(\n      createProfileState(\n        profileState.profiles,\n        id,\n        id === null ? 'off' : 'balanced',\n      ),\n    )\n  }\n\n  const handleCalibrationModeChange = (\n    mode: CalibrationApplicationMode,\n  ): void => {\n    applyProfileState(\n      createProfileState(\n        profileState.profiles,\n        profileState.activeProfileId,\n        mode,\n      ),\n    )\n  }\n\n  const handleDeleteCalibrationProfile = (id: string): void => {\n    const profiles = profileState.profiles.filter((profile) => profile.id !== id)\n    const deletingActive = profileState.activeProfileId === id\n    applyProfileState(\n      createProfileState(\n        profiles,\n        deletingActive ? null : profileState.activeProfileId,\n        deletingActive ? 'off' : profileState.calibrationMode,\n      ),\n    )\n  }\n\n  const handleDeleteProfiles = (): void => {\n    applyProfileState(createDefaultProfileState())\n  }\n"
replace(path, needle, replacement)
replace(path, "      profileCount={profileState.profiles.length}\n      userPresets={userPresetState.presets}", "      profileCount={profileState.profiles.length}\n      profileState={profileState}\n      userPresets={userPresetState.presets}")
replace(path, "      onDeleteProfiles={handleDeleteProfiles}\n      onSaveUserPreset={handleSaveUserPreset}", "      onDeleteProfiles={handleDeleteProfiles}\n      onSaveCalibrationProfile={handleSaveCalibrationProfile}\n      onSelectCalibrationProfile={handleSelectCalibrationProfile}\n      onCalibrationModeChange={handleCalibrationModeChange}\n      onDeleteCalibrationProfile={handleDeleteCalibrationProfile}\n      onSaveUserPreset={handleSaveUserPreset}")

# Styles: compact editor, deliberately reusing existing card semantics.
p = Path('src/styles/base.css')
text = p.read_text()
text += """

.calibration-panel {
  min-width: 0;
}

.calibration-apply-row,
.calibration-editor {
  display: grid;
  gap: 0.75rem;
}

.calibration-apply-row {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.calibration-apply-row label,
.calibration-editor > label {
  display: grid;
  gap: 0.35rem;
}

.calibration-editor {
  margin: 1rem 0 0;
  padding: 0.9rem;
  border: 1px solid currentColor;
  border-radius: 0.6rem;
}

.calibration-band-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(4.5rem, 1fr));
  gap: 0.5rem;
}

.calibration-band-grid label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.8rem;
}

.calibration-band-grid input {
  min-width: 0;
  width: 100%;
}

@media (max-width: 52rem) {
  .calibration-apply-row {
    grid-template-columns: 1fr;
  }
  .calibration-band-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
"""
p.write_text(text)
