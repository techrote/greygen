from pathlib import Path

p = Path('src/features/calibration/GuidedCalibrationWizard.tsx')
text = p.read_text()
text = text.replace("if (!wizard || wizard.phase !== 'review') {", "if (wizard?.phase !== 'review') {")
text = text.replace("      !wizard ||\n      wizard.phase !== 'review' ||\n", "      wizard?.phase !== 'review' ||\n")
p.write_text(text)

p = Path('src/features/calibration/guidedChannelCalibration.ts')
text = p.read_text()
text = text.replace("if (!state.linked || state.linked.stage !== 'review') {", "if (state.linked?.stage !== 'review') {")
text = text.replace("    !state.left ||\n    state.left.stage !== 'review' ||\n    !state.right ||\n    state.right.stage !== 'review'\n", "    state.left?.stage !== 'review' ||\n    state.right?.stage !== 'review'\n")
p.write_text(text)

p = Path('src/features/calibration/CalibrationPanel.tsx')
text = p.read_text()
text = text.replace(
    "  }, [activeRecord?.id, activeRecord?.name, activeParsed?.note])\n",
    "  }, [activeRecord?.name, activeParsed?.note])\n",
)
p.write_text(text)
