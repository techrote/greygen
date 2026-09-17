from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old in text:
        p.write_text(text.replace(old, new, 1))


p = Path('src/features/calibration/GuidedCalibrationWizard.tsx')
text = p.read_text()
text = text.replace(
    "if (!wizard || wizard.phase !== 'review') {",
    "if (wizard?.phase !== 'review') {",
)
text = text.replace(
    "      !wizard ||\n      wizard.phase !== 'review' ||\n",
    "      wizard?.phase !== 'review' ||\n",
)
p.write_text(text)

p = Path('src/features/calibration/guidedChannelCalibration.ts')
text = p.read_text()
text = text.replace(
    "if (!state.linked || state.linked.stage !== 'review') {",
    "if (state.linked?.stage !== 'review') {",
)
text = text.replace(
    "    !state.left ||\n    state.left.stage !== 'review' ||\n    !state.right ||\n    state.right.stage !== 'review'\n",
    "    state.left?.stage !== 'review' ||\n    state.right?.stage !== 'review'\n",
)
p.write_text(text)

p = Path('src/features/calibration/CalibrationPanel.tsx')
text = p.read_text()
text = text.replace(
    "  }, [activeRecord?.id, activeRecord?.name, activeParsed?.note])\n",
    "  }, [activeRecord?.name, activeParsed?.note])\n",
)
p.write_text(text)

# Preserve word boundaries when pasted notes/names contain newlines or tabs.
p = Path('src/features/calibration/calibrationProfile.ts')
text = p.read_text()
old = """function sanitizeText(value: string, maxLength: number): string {
  const normalized = Array.from(value.normalize('NFKC'))
    .filter((character) => {
"""
new = """function sanitizeText(value: string, maxLength: number): string {
  const normalizedWhitespace = value.normalize('NFKC').replace(/\\s+/g, ' ')
  const normalized = Array.from(normalizedWhitespace)
    .filter((character) => {
"""
if old in text:
    text = text.replace(old, new, 1)
p.write_text(text)

# Protocol v6 initialize includes the independent-channel calibration document.
p = Path('tests/audio/protocol.test.ts')
text = p.read_text()
if "from '../../src/audio/dsp/channelCalibration'" not in text:
    text = text.replace(
        "import { createAnimationState } from '../../src/audio/dsp/animation'\n",
        "import { createAnimationState } from '../../src/audio/dsp/animation'\nimport { createChannelCalibrationState } from '../../src/audio/dsp/channelCalibration'\n",
        1,
    )
text = text.replace(
    "  deserializeAnimationState,\n  deserializeGainStageState,\n",
    "  deserializeAnimationState,\n  deserializeChannelCalibrationState,\n  deserializeGainStageState,\n",
    1,
)
text = text.replace(
    "  serializeAnimationState,\n  serializeGainStageState,\n",
    "  serializeAnimationState,\n  serializeChannelCalibrationState,\n  serializeGainStageState,\n",
    1,
)
text = text.replace(
    "    const gainStage = createGainStageState(-18, offsets, offsets)\n    const stereoWidth = createStereoWidthState(0.73)\n",
    "    const gainStage = createGainStageState(-18, offsets, offsets)\n    const channelCalibration = createChannelCalibrationState(offsets, offsets)\n    const stereoWidth = createStereoWidthState(0.73)\n",
    1,
)
text = text.replace(
    "    const serializedStereo = JSON.parse(\n",
    "    const serializedChannelCalibration = JSON.parse(\n      JSON.stringify(serializeChannelCalibrationState(channelCalibration)),\n    ) as unknown\n    const serializedStereo = JSON.parse(\n",
    1,
)
text = text.replace(
    "      gainStage: serializedGain,\n      stereoWidth: serializedStereo,\n",
    "      gainStage: serializedGain,\n      channelCalibration: serializedChannelCalibration,\n      stereoWidth: serializedStereo,\n",
    1,
)
text = text.replace(
    "    expect(deserializeGainStageState(parsed.gainStage)).toEqual(gainStage)\n    expect(deserializeStereoWidthState(parsed.stereoWidth)).toEqual(stereoWidth)\n",
    "    expect(deserializeGainStageState(parsed.gainStage)).toEqual(gainStage)\n    expect(deserializeChannelCalibrationState(parsed.channelCalibration)).toEqual(\n      channelCalibration,\n    )\n    expect(deserializeStereoWidthState(parsed.stereoWidth)).toEqual(stereoWidth)\n",
    1,
)
p.write_text(text)

# Payload v3 stores linked guided evidence under linkedMeasurement.
p = Path('tests/app/calibration-profile-guided.test.ts')
text = p.read_text()
text = text.replace(
    "stores validated guided evidence in payload schema v2",
    "stores validated guided evidence in payload schema v3",
)
text = text.replace(
    "    const measurement = payload.measurement as Record<string, unknown>\n",
    "    const measurement = payload.linkedMeasurement as Record<string, unknown>\n",
    1,
)
text = text.replace(
    "        measurement: {\n          ...measurement,\n          bandEvidence: evidence,\n        } as never,\n",
    "        linkedMeasurement: {\n          ...measurement,\n          bandEvidence: evidence,\n        } as never,\n",
    1,
)
p.write_text(text)

# Stimulus schema v2 adds explicit channel targeting.
p = Path('tests/dsp/calibration-stimulus.test.ts')
text = p.read_text()
text = text.replace(
    "      schemaVersion: 1,\n      mode: 'inactive',\n      bandIndex: 5,\n      levelOffsetDb: 0,\n",
    "      schemaVersion: 2,\n      mode: 'inactive',\n      bandIndex: 5,\n      levelOffsetDb: 0,\n      channel: 'both',\n",
    1,
)
p.write_text(text)
