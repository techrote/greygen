from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing pattern in {path}: {old[:180]!r}')
    p.write_text(text.replace(old, new, 1))

path = 'src/app/App.tsx'
replace(
    path,
    "import CalibrationPanel, {\n  type CalibrationDraft,\n} from '../features/calibration/CalibrationPanel'\n",
    "import CalibrationPanel, {\n  type CalibrationDraft,\n} from '../features/calibration/CalibrationPanel'\nimport type { GuidedCalibrationSaveDraft } from '../features/calibration/GuidedCalibrationWizard'\n",
)
replace(
    path,
    "  createCalibrationProfileRecord,\n  findCalibrationProfile,\n  resolveCalibrationRecordOffsetsDb,\n} from '../features/calibration/calibrationProfile'\n",
    "  createCalibrationProfilePayload,\n  createCalibrationProfileRecord,\n  findCalibrationProfile,\n  resolveCalibrationBandOffsetsDb,\n  resolveCalibrationRecordOffsetsDb,\n} from '../features/calibration/calibrationProfile'\n",
)
replace(
    path,
    "  readonly onDeleteCalibrationProfile?: (id: string) => void\n  readonly onSaveUserPreset: (name: string) => boolean\n",
    "  readonly onDeleteCalibrationProfile?: (id: string) => void\n  readonly onGuidedStimulusBand?: (bandIndex: number, levelOffsetDb: number) => void\n  readonly onGuidedStimulusSilent?: () => void\n  readonly onGuidedStimulusEnd?: () => void\n  readonly onGuidedAuditionDraft?: (\n    rawBandOffsetsDb: readonly (number | null)[],\n    referenceBandIndex: number,\n    mode: CalibrationApplicationMode,\n  ) => void\n  readonly onGuidedRestoreSavedProfile?: () => void\n  readonly onGuidedSave?: (draft: GuidedCalibrationSaveDraft) => void\n  readonly onSaveUserPreset: (name: string) => boolean\n",
)
replace(
    path,
    "  onDeleteCalibrationProfile = () => {},\n  onSaveUserPreset,\n",
    "  onDeleteCalibrationProfile = () => {},\n  onGuidedStimulusBand = () => {},\n  onGuidedStimulusSilent = () => {},\n  onGuidedStimulusEnd = () => {},\n  onGuidedAuditionDraft = () => {},\n  onGuidedRestoreSavedProfile = () => {},\n  onGuidedSave = () => {},\n  onSaveUserPreset,\n",
)
replace(
    path,
    "              sampleRate={audioSnapshot.sampleRate}\n              disabled={controlsDisabled}\n              onSave={onSaveCalibrationProfile}\n",
    "              sampleRate={audioSnapshot.sampleRate}\n              audioStatus={audioSnapshot.status}\n              guidedSeed={(soundState.seed ^ 0x4341_4c31) >>> 0}\n              disabled={controlsDisabled}\n              onSave={onSaveCalibrationProfile}\n",
)
replace(
    path,
    "              onModeChange={onCalibrationModeChange}\n              onDelete={onDeleteCalibrationProfile}\n            />\n",
    "              onModeChange={onCalibrationModeChange}\n              onDelete={onDeleteCalibrationProfile}\n              onGuidedStimulusBand={onGuidedStimulusBand}\n              onGuidedStimulusSilent={onGuidedStimulusSilent}\n              onGuidedStimulusEnd={onGuidedStimulusEnd}\n              onGuidedAuditionDraft={onGuidedAuditionDraft}\n              onGuidedRestoreSavedProfile={onGuidedRestoreSavedProfile}\n              onGuidedSave={onGuidedSave}\n            />\n",
)

anchor = "  const handleSaveCalibrationProfile = (draft: CalibrationDraft): void => {\n"
helpers = """  const restoreSavedCalibration = (): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    const active = findCalibrationProfile(
      profileState.profiles,
      profileState.activeProfileId,
    )
    setControlError(null)
    void engine
      .setCalibrationBandOffsetsDb(
        resolveCalibrationRecordOffsetsDb(active, profileState.calibrationMode),
      )
      .catch(reportControlFailure)
  }

  const handleGuidedStimulusBand = (
    bandIndex: number,
    levelOffsetDb: number,
  ): void => {
    setControlError(null)
    void engineRef.current
      ?.setCalibrationStimulusBand(bandIndex, levelOffsetDb)
      .catch(reportControlFailure)
  }

  const handleGuidedStimulusSilent = (): void => {
    setControlError(null)
    void engineRef.current
      ?.silenceCalibrationStimulus()
      .catch(reportControlFailure)
  }

  const handleGuidedStimulusEnd = (): void => {
    setControlError(null)
    void engineRef.current?.endCalibrationStimulus().catch(reportControlFailure)
  }

  const handleGuidedAuditionDraft = (
    rawBandOffsetsDb: readonly (number | null)[],
    referenceBandIndex: number,
    mode: CalibrationApplicationMode,
  ): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    try {
      const profile = createCalibrationProfilePayload({
        sampleRateHz: audioSnapshot.sampleRate,
        referenceBandIndex,
        rawBandOffsetsDb,
      })
      setControlError(null)
      void Promise.all([
        engine.endCalibrationStimulus(),
        engine.setCalibrationBandOffsetsDb(
          resolveCalibrationBandOffsetsDb(profile, mode),
        ),
      ]).catch(reportControlFailure)
    } catch (error) {
      reportControlFailure(error)
    }
  }

  const handleGuidedSave = (draft: GuidedCalibrationSaveDraft): void => {
    let suffix = profileState.profiles.length + 1
    let id = `calibration-${suffix}`
    while (profileState.profiles.some((profile) => profile.id === id)) {
      suffix += 1
      id = `calibration-${suffix}`
    }
    try {
      const record = createCalibrationProfileRecord({
        id,
        name: draft.name,
        sampleRateHz: audioSnapshot.sampleRate,
        referenceBandIndex: draft.referenceBandIndex,
        rawBandOffsetsDb: draft.rawBandOffsetsDb,
        measurement: draft.measurement,
      })
      handleGuidedStimulusEnd()
      applyProfileState(
        createProfileState(
          [...profileState.profiles, record],
          record.id,
          'balanced',
        ),
      )
    } catch (error) {
      setControlError(errorText(error))
    }
  }

"""
replace(path, anchor, helpers + anchor)
replace(
    path,
    "      onDeleteCalibrationProfile={handleDeleteCalibrationProfile}\n      onSaveUserPreset={handleSaveUserPreset}\n",
    "      onDeleteCalibrationProfile={handleDeleteCalibrationProfile}\n      onGuidedStimulusBand={handleGuidedStimulusBand}\n      onGuidedStimulusSilent={handleGuidedStimulusSilent}\n      onGuidedStimulusEnd={handleGuidedStimulusEnd}\n      onGuidedAuditionDraft={handleGuidedAuditionDraft}\n      onGuidedRestoreSavedProfile={restoreSavedCalibration}\n      onGuidedSave={handleGuidedSave}\n      onSaveUserPreset={handleSaveUserPreset}\n",
)

# Guided wizard styling.
p = Path('src/styles/base.css')
text = p.read_text()
text += """

.guided-calibration {
  display: grid;
  gap: 0.8rem;
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid currentColor;
  border-radius: 0.7rem;
}

.guided-calibration h4 {
  margin: 0;
}

.guided-calibration-active {
  outline: 2px solid transparent;
}

.calibration-safety-list {
  margin: 0;
  padding-left: 1.25rem;
}

.calibration-comfort-check {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
}

.calibration-audition-row,
.calibration-judgement-row,
.calibration-exit-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.calibration-caveat {
  padding: 0.75rem;
  border: 1px solid currentColor;
  border-radius: 0.55rem;
}

.calibration-review-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.55rem;
}

.calibration-review-band {
  display: grid;
  gap: 0.3rem;
  padding: 0.65rem;
  border: 1px solid currentColor;
  border-radius: 0.5rem;
}

.manual-calibration-details {
  margin-top: 1rem;
}

.manual-calibration-details > summary {
  cursor: pointer;
  font-weight: 700;
}

@media (max-width: 52rem) {
  .calibration-review-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
"""
p.write_text(text)
