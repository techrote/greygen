from pathlib import Path

p = Path('src/features/calibration/CalibrationPanel.tsx')
text = p.read_text()
old = '<details className="manual-calibration-details">'
if old not in text:
    raise SystemExit('manual details pattern missing')
text = text.replace(old, '<details className="manual-calibration-details" open>', 1)
p.write_text(text)

p = Path('src/features/calibration/GuidedCalibrationWizard.tsx')
text = p.read_text()
old = '        aria-labelledby="guided-heading"\n        onKeyDown={handleKeyboard}\n'
if old not in text:
    raise SystemExit('active wizard section pattern missing')
text = text.replace(
    old,
    '        aria-labelledby="guided-heading"\n        tabIndex={0}\n        onKeyDown={handleKeyboard}\n',
)
p.write_text(text)
