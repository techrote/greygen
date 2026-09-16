from pathlib import Path

path = Path('src/app/App.tsx')
text = path.read_text()
replacements = [
    ('  readonly profileState: ProfileState\n', '  readonly profileState?: ProfileState\n'),
    ('  readonly onSaveCalibrationProfile: (draft: CalibrationDraft) => void\n', '  readonly onSaveCalibrationProfile?: (draft: CalibrationDraft) => void\n'),
    ('  readonly onSelectCalibrationProfile: (id: string | null) => void\n', '  readonly onSelectCalibrationProfile?: (id: string | null) => void\n'),
    ('  readonly onCalibrationModeChange: (mode: CalibrationApplicationMode) => void\n', '  readonly onCalibrationModeChange?: (mode: CalibrationApplicationMode) => void\n'),
    ('  readonly onDeleteCalibrationProfile: (id: string) => void\n', '  readonly onDeleteCalibrationProfile?: (id: string) => void\n'),
    ('  profileState,\n  userPresets,', '  profileState = createDefaultProfileState(),\n  userPresets,'),
    ('  onSaveCalibrationProfile,\n  onSelectCalibrationProfile,\n  onCalibrationModeChange,\n  onDeleteCalibrationProfile,', '  onSaveCalibrationProfile = () => {},\n  onSelectCalibrationProfile = () => {},\n  onCalibrationModeChange = () => {},\n  onDeleteCalibrationProfile = () => {},'),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f'missing App compatibility pattern: {old!r}')
    text = text.replace(old, new, 1)
path.write_text(text)
