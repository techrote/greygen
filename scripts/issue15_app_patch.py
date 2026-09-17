from pathlib import Path

p = Path('src/app/App.tsx')
text = p.read_text()

def rep(old: str, new: str, count: int = 1) -> None:
    global text
    if text.count(old) < count:
        raise SystemExit(f'missing App pattern: {old[:180]!r}')
    text = text.replace(old, new, count)

rep(
    "import { DEFAULT_ENGINE_PRESET } from '../audio/dsp/engine'\n",
    "import type { CalibrationStimulusChannel } from '../audio/dsp/calibrationStimulus'\nimport { DEFAULT_ENGINE_PRESET } from '../audio/dsp/engine'\n",
)
rep(
    "import type { GuidedCalibrationSaveDraft } from '../features/calibration/GuidedCalibrationWizard'\n",
    "import type {\n  GuidedCalibrationAuditionDraft,\n  GuidedCalibrationSaveDraft,\n} from '../features/calibration/GuidedCalibrationWizard'\n",
)
rep(
    "  createCalibrationProfilePayload,\n  createCalibrationProfileRecord,\n  findCalibrationProfile,\n  resolveCalibrationBandOffsetsDb,\n  resolveCalibrationRecordOffsetsDb,\n} from '../features/calibration/calibrationProfile'\n",
    "  createCalibrationProfilePayload,\n  createCalibrationProfileRecord,\n  duplicateCalibrationProfileRecord,\n  findCalibrationProfile,\n  resolveCalibrationChannelOffsetsDb,\n  resolveCalibrationRecordChannelOffsetsDb,\n  updateCalibrationProfileMetadata,\n} from '../features/calibration/calibrationProfile'\nimport { parseCalibrationProfileExport } from '../features/calibration/profilePortability'\n",
)
# Surface prop shapes
rep(
    "  readonly onDeleteCalibrationProfile?: (id: string) => void\n  readonly onGuidedStimulusBand?: (\n    bandIndex: number,\n    levelOffsetDb: number,\n  ) => void\n",
    "  readonly onDeleteCalibrationProfile?: (id: string) => void\n  readonly onDuplicateCalibrationProfile?: (id: string) => void\n  readonly onRenameCalibrationProfile?: (\n    id: string,\n    name: string,\n    note: string,\n  ) => boolean\n  readonly onImportCalibrationProfile?: (raw: string) => string\n  readonly onGuidedStimulusBand?: (\n    bandIndex: number,\n    levelOffsetDb: number,\n    channel: CalibrationStimulusChannel,\n  ) => void\n",
)
rep(
    "  readonly onGuidedAuditionDraft?: (\n    rawBandOffsetsDb: readonly (number | null)[],\n    referenceBandIndex: number,\n    mode: CalibrationApplicationMode,\n  ) => void\n",
    "  readonly onGuidedAuditionDraft?: (\n    draft: GuidedCalibrationAuditionDraft,\n    mode: CalibrationApplicationMode,\n  ) => void\n",
)
rep(
    "  onDeleteCalibrationProfile = () => {},\n  onGuidedStimulusBand = () => {},\n",
    "  onDeleteCalibrationProfile = () => {},\n  onDuplicateCalibrationProfile = () => {},\n  onRenameCalibrationProfile = () => false,\n  onImportCalibrationProfile = () => 'Import is unavailable.',\n  onGuidedStimulusBand = () => {},\n",
)
# Panel props
rep(
    "              onDelete={onDeleteCalibrationProfile}\n              onGuidedStimulusBand={onGuidedStimulusBand}\n",
    "              onDelete={onDeleteCalibrationProfile}\n              onDuplicate={onDuplicateCalibrationProfile}\n              onRenameNote={onRenameCalibrationProfile}\n              onImport={onImportCalibrationProfile}\n              onGuidedStimulusBand={onGuidedStimulusBand}\n",
)
# bootstrap channel application
rep(
    "        await engine.setCalibrationBandOffsetsDb(\n          resolveCalibrationRecordOffsetsDb(\n            initialCalibration,\n            loaded.profiles.calibrationMode,\n          ),\n        )\n",
    "        const initialChannelCalibration = resolveCalibrationRecordChannelOffsetsDb(\n          initialCalibration,\n          loaded.profiles.calibrationMode,\n        )\n        await engine.setCalibrationChannelOffsetsDb(\n          initialChannelCalibration.leftBandOffsetsDb,\n          initialChannelCalibration.rightBandOffsetsDb,\n        )\n",
)
# applyProfileState
rep(
    "    void engine\n      .setCalibrationBandOffsetsDb(\n        resolveCalibrationRecordOffsetsDb(active, next.calibrationMode),\n      )\n      .then(() => {\n",
    "    const offsets = resolveCalibrationRecordChannelOffsetsDb(\n      active,\n      next.calibrationMode,\n    )\n    void engine\n      .setCalibrationChannelOffsetsDb(\n        offsets.leftBandOffsetsDb,\n        offsets.rightBandOffsetsDb,\n      )\n      .then(() => {\n",
)
# restore saved
rep(
    "    setControlError(null)\n    void engine\n      .setCalibrationBandOffsetsDb(\n        resolveCalibrationRecordOffsetsDb(active, profileState.calibrationMode),\n      )\n      .catch(reportControlFailure)\n",
    "    const offsets = resolveCalibrationRecordChannelOffsetsDb(\n      active,\n      profileState.calibrationMode,\n    )\n    setControlError(null)\n    void engine\n      .setCalibrationChannelOffsetsDb(\n        offsets.leftBandOffsetsDb,\n        offsets.rightBandOffsetsDb,\n      )\n      .catch(reportControlFailure)\n",
)
# stimulus handler
rep(
    "  const handleGuidedStimulusBand = (\n    bandIndex: number,\n    levelOffsetDb: number,\n  ): void => {\n    setControlError(null)\n    void engineRef.current\n      ?.setCalibrationStimulusBand(bandIndex, levelOffsetDb)\n",
    "  const handleGuidedStimulusBand = (\n    bandIndex: number,\n    levelOffsetDb: number,\n    channel: CalibrationStimulusChannel,\n  ): void => {\n    setControlError(null)\n    void engineRef.current\n      ?.setCalibrationStimulusBand(bandIndex, levelOffsetDb, channel)\n",
)
# guided audition whole block header + body
old = """  const handleGuidedAuditionDraft = (\n    rawBandOffsetsDb: readonly (number | null)[],\n    referenceBandIndex: number,\n    mode: CalibrationApplicationMode,\n  ): void => {\n    const engine = engineRef.current\n    if (!engine) {\n      return\n    }\n    try {\n      const profile = createCalibrationProfilePayload({\n        sampleRateHz: audioSnapshot.sampleRate,\n        referenceBandIndex,\n        rawBandOffsetsDb,\n      })\n      setControlError(null)\n      void Promise.all([\n        engine.endCalibrationStimulus(),\n        engine.setCalibrationBandOffsetsDb(\n          resolveCalibrationBandOffsetsDb(profile, mode),\n        ),\n      ]).catch(reportControlFailure)\n    } catch (error) {\n      reportControlFailure(error)\n    }\n  }\n"""
new = """  const handleGuidedAuditionDraft = (\n    draft: GuidedCalibrationAuditionDraft,\n    mode: CalibrationApplicationMode,\n  ): void => {\n    const engine = engineRef.current\n    if (!engine) {\n      return\n    }\n    try {\n      const profile = createCalibrationProfilePayload({\n        sampleRateHz: audioSnapshot.sampleRate,\n        referenceBandIndex: draft.referenceBandIndex,\n        channelMode: draft.channelMode,\n        leftRawBandOffsetsDb: draft.leftRawBandOffsetsDb,\n        rightRawBandOffsetsDb: draft.rightRawBandOffsetsDb,\n      })\n      const offsets = resolveCalibrationChannelOffsetsDb(profile, mode)\n      setControlError(null)\n      void Promise.all([\n        engine.endCalibrationStimulus(),\n        engine.setCalibrationChannelOffsetsDb(\n          offsets.leftBandOffsetsDb,\n          offsets.rightBandOffsetsDb,\n        ),\n      ]).catch(reportControlFailure)\n    } catch (error) {\n      reportControlFailure(error)\n    }\n  }\n"""
rep(old, new)
# Guided save fields
rep(
    "        referenceBandIndex: draft.referenceBandIndex,\n        rawBandOffsetsDb: draft.rawBandOffsetsDb,\n        measurement: draft.measurement,\n",
    "        referenceBandIndex: draft.referenceBandIndex,\n        channelMode: draft.channelMode,\n        leftRawBandOffsetsDb: draft.leftRawBandOffsetsDb,\n        rightRawBandOffsetsDb: draft.rightRawBandOffsetsDb,\n        note: draft.note,\n        measurement: draft.linkedMeasurement,\n        leftMeasurement: draft.leftMeasurement,\n        rightMeasurement: draft.rightMeasurement,\n",
)
# manual save fields
rep(
    "        referenceBandIndex: draft.referenceBandIndex,\n        rawBandOffsetsDb: draft.rawBandOffsetsDb,\n      })\n",
    "        referenceBandIndex: draft.referenceBandIndex,\n        channelMode: draft.channelMode,\n        leftRawBandOffsetsDb: draft.leftRawBandOffsetsDb,\n        rightRawBandOffsetsDb: draft.rightRawBandOffsetsDb,\n        note: draft.note,\n      })\n",
)
# management helpers insert before delete handler
anchor = "  const handleDeleteCalibrationProfile = (id: string): void => {\n"
insert = """  const nextCalibrationProfileId = (): string => {\n    let suffix = profileState.profiles.length + 1\n    let id = `calibration-${suffix}`\n    while (profileState.profiles.some((profile) => profile.id === id)) {\n      suffix += 1\n      id = `calibration-${suffix}`\n    }\n    return id\n  }\n\n  const handleRenameCalibrationProfile = (\n    id: string,\n    name: string,\n    note: string,\n  ): boolean => {\n    const existing = profileState.profiles.find((profile) => profile.id === id)\n    if (!existing) {\n      setControlError('That calibration profile is no longer available.')\n      return false\n    }\n    try {\n      const replacement = updateCalibrationProfileMetadata(existing, { name, note })\n      const next = createProfileState(\n        profileState.profiles.map((profile) =>\n          profile.id === id ? replacement : profile,\n        ),\n        profileState.activeProfileId,\n        profileState.calibrationMode,\n      )\n      setProfileState(next)\n      persistProfiles(next)\n      setControlError(null)\n      return true\n    } catch (error) {\n      setControlError(errorText(error))\n      return false\n    }\n  }\n\n  const handleDuplicateCalibrationProfile = (id: string): void => {\n    const existing = profileState.profiles.find((profile) => profile.id === id)\n    if (!existing) {\n      return\n    }\n    try {\n      const duplicate = duplicateCalibrationProfileRecord(\n        existing,\n        nextCalibrationProfileId(),\n      )\n      const next = createProfileState(\n        [...profileState.profiles, duplicate],\n        profileState.activeProfileId,\n        profileState.calibrationMode,\n      )\n      setProfileState(next)\n      persistProfiles(next)\n      setControlError(null)\n    } catch (error) {\n      setControlError(errorText(error))\n    }\n  }\n\n  const handleImportCalibrationProfile = (raw: string): string => {\n    const result = parseCalibrationProfileExport(raw, nextCalibrationProfileId())\n    if (!result.record) {\n      return result.messages.join(' ') || 'Personal calibration import failed.'\n    }\n    const next = createProfileState(\n      [...profileState.profiles, result.record],\n      profileState.activeProfileId,\n      profileState.calibrationMode,\n    )\n    setProfileState(next)\n    persistProfiles(next)\n    return `Imported “${result.record.name}” locally. It was not selected and audio was not started.`\n  }\n\n"""
rep(anchor, insert + anchor)
# delete all neutral via channel API
rep(
    "    void engine\n      .setCalibrationBandOffsetsDb(\n        resolveCalibrationRecordOffsetsDb(null, 'off'),\n      )\n      .then(() => {\n",
    "    const neutral = resolveCalibrationRecordChannelOffsetsDb(null, 'off')\n    void engine\n      .setCalibrationChannelOffsetsDb(\n        neutral.leftBandOffsetsDb,\n        neutral.rightBandOffsetsDb,\n      )\n      .then(() => {\n",
)
# final GeneratorSurface props
rep(
    "      onDeleteCalibrationProfile={handleDeleteCalibrationProfile}\n      onGuidedStimulusBand={handleGuidedStimulusBand}\n",
    "      onDeleteCalibrationProfile={handleDeleteCalibrationProfile}\n      onDuplicateCalibrationProfile={handleDuplicateCalibrationProfile}\n      onRenameCalibrationProfile={handleRenameCalibrationProfile}\n      onImportCalibrationProfile={handleImportCalibrationProfile}\n      onGuidedStimulusBand={handleGuidedStimulusBand}\n",
)
p.write_text(text)
