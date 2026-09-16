from pathlib import Path


def replace(path: str, old: str, new: str):
    p = Path(path)
    s = p.read_text()
    assert old in s, f'missing pattern in {path}: {old[:120]!r}'
    p.write_text(s.replace(old, new, 1))

# Stable analyzer reader callback: telemetry renders must not restart the panel loop.
replace(
    'src/app/App.tsx',
    '  lazy,\n  useEffect,\n',
    '  lazy,\n  useCallback,\n  useEffect,\n',
)
replace(
    'src/app/App.tsx',
    '  const matchingUserPreset = findMatchingUserSoundPreset(\n',
    "  const readAnalyzerFrame = useCallback(\n    (): AnalyzerSpectrumFrame | null =>\n      engineRef.current?.readAnalyzerFrame() ?? null,\n    [],\n  )\n\n  const matchingUserPreset = findMatchingUserSoundPreset(\n",
)
replace(
    'src/app/App.tsx',
    '      readAnalyzerFrame={() => engineRef.current?.readAnalyzerFrame() ?? null}\n',
    '      readAnalyzerFrame={readAnalyzerFrame}\n',
)

# MediaQueryList listener identity must remain stable across restarts.
p = Path('src/features/analyzer/AnalyzerPanel.tsx')
s = p.read_text()
s = s.replace(
    '    let loop: BoundedFrameLoop | null = null\n    let media: MediaQueryList | null = null\n',
    "    let loop: BoundedFrameLoop | null = null\n    const media =\n      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null\n",
)
s = s.replace(
    "      media =\n        globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null\n      const fps = media?.matches\n",
    '      const fps = media?.matches\n',
)
s = s.replace(
    "    media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null\n    media?.addEventListener?.('change', motionChanged)\n",
    "    media?.addEventListener?.('change', motionChanged)\n",
)
p.write_text(s)

# Explicit analyser graph teardown before AudioContext close.
replace(
    'src/audio/AudioEngine.ts',
    "    const context = this.context\n    if (context) {\n",
    "    if (this.analyzer) {\n      try {\n        this.analyzer.disconnect()\n      } catch {\n        // Disconnect may throw if the browser already tore the graph down.\n      }\n    }\n\n    const context = this.context\n    if (context) {\n",
)
