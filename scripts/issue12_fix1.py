from pathlib import Path


def replace(path: str, old: str, new: str):
    p = Path(path)
    s = p.read_text()
    assert old in s, f'missing pattern in {path}: {old[:100]!r}'
    p.write_text(s.replace(old, new, 1))

replace(
    'src/app/state/appState.ts',
    '    state: createUiState(value.futureFeaturesVisible, value.analyzerVisible),\n',
    '    state: createUiState(\n      value.futureFeaturesVisible,\n      value.analyzerVisible as boolean,\n    ),\n',
)

replace(
    'tests/app-shell.test.tsx',
    "import { createAnimationState } from '../src/audio/dsp/animation'\n",
    "import { createAnimationState } from '../src/audio/dsp/animation'\nimport { createDefaultSoundState } from '../src/app/state/appState'\n",
)
replace(
    'tests/app-shell.test.tsx',
    "    spectrumState: createSpectrumState('grey'),\n    stereoWidth: 0.5,\n",
    "    spectrumState: createSpectrumState('grey'),\n    soundState: createDefaultSoundState(),\n    stereoWidth: 0.5,\n",
)
replace(
    'tests/app-shell.test.tsx',
    "    futureFeaturesVisible: true,\n    profileCount: 0,\n",
    "    futureFeaturesVisible: true,\n    analyzerVisible: false,\n    profileCount: 0,\n",
)
replace(
    'tests/app-shell.test.tsx',
    "    onToggleFutureFeatures: noop,\n    onResetSound: noop,\n",
    "    onToggleFutureFeatures: noop,\n    onToggleAnalyzer: noop,\n    readAnalyzerFrame: () => null,\n    onResetSound: noop,\n",
)
