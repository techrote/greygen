from pathlib import Path

path = Path('src/audio/AudioEngine.ts')
text = path.read_text()
text = text.replace('  private calibrationStimulusValue: CalibrationStimulusState\n', '')
text = text.replace('    this.calibrationStimulusValue = createCalibrationStimulusState()\n', '')
text = text.replace('    this.calibrationStimulusValue = canonical\n', '')
path.write_text(text)
