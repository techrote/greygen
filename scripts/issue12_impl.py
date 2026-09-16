from pathlib import Path


def replace(path: str, old: str, new: str):
    p = Path(path)
    s = p.read_text()
    assert old in s, f'missing pattern in {path}: {old[:80]!r}'
    p.write_text(s.replace(old, new, 1))

# DSP engine version: explicit diagnostic identity.
replace('src/audio/dsp/engine.ts',
"export const DEFAULT_ENGINE_SEED = 0x4752_4559\nexport const DEFAULT_ENGINE_PRESET: SpectralPresetId = 'grey'\n",
"export const DSP_ENGINE_VERSION = 1 as const\nexport const DEFAULT_ENGINE_SEED = 0x4752_4559\nexport const DEFAULT_ENGINE_PRESET: SpectralPresetId = 'grey'\n")

# AudioEngine: optional native analyser tap outside worklet.
replace('src/audio/AudioEngine.ts',
"export interface AudioWorkletNodePort {\n  readonly port: WorkletMessagePort\n  connect(destination: unknown): unknown\n  disconnect(): void\n",
"export interface AnalyzerNodePort {\n  fftSize: number\n  minDecibels: number\n  maxDecibels: number\n  smoothingTimeConstant: number\n  readonly frequencyBinCount: number\n  connect(destination: unknown): unknown\n  disconnect(): void\n  getFloatFrequencyData(target: Float32Array): void\n}\n\nexport interface AnalyzerSpectrumFrame {\n  readonly sampleRate: number\n  readonly fftSize: number\n  readonly minDb: number\n  readonly maxDb: number\n  readonly values: Float32Array\n}\n\nexport interface AudioWorkletNodePort {\n  readonly port: WorkletMessagePort\n  connect(destination: unknown): unknown\n  disconnect(): void\n")
replace('src/audio/AudioEngine.ts',
"  readonly state: string\n  resume(): Promise<void>\n",
"  readonly state: string\n  createAnalyser?(): AnalyzerNodePort\n  resume(): Promise<void>\n")
replace('src/audio/AudioEngine.ts',
"  private context: AudioContextPort | null = null\n  private node: AudioWorkletNodePort | null = null\n",
"  private context: AudioContextPort | null = null\n  private node: AudioWorkletNodePort | null = null\n  private analyzer: AnalyzerNodePort | null = null\n  private analyzerBuffer: Float32Array | null = null\n")
replace('src/audio/AudioEngine.ts',
"      node.port.start?.()\n      node.connect(context.destination)\n\n      const response = await this.request(\n",
"      node.port.start?.()\n      if (context.createAnalyser) {\n        const analyzer = context.createAnalyser()\n        analyzer.fftSize = 2048\n        analyzer.minDecibels = -120\n        analyzer.maxDecibels = 0\n        analyzer.smoothingTimeConstant = 0.72\n        this.analyzer = analyzer\n        this.analyzerBuffer = new Float32Array(analyzer.frequencyBinCount)\n        node.connect(analyzer)\n        analyzer.connect(context.destination)\n      } else {\n        node.connect(context.destination)\n      }\n\n      const response = await this.request(\n")
replace('src/audio/AudioEngine.ts',
"  async requestStatus(): Promise<StatusMessage> {\n",
"  readAnalyzerFrame(): AnalyzerSpectrumFrame | null {\n    const analyzer = this.analyzer\n    const buffer = this.analyzerBuffer\n    const context = this.context\n    if (!analyzer || !buffer || !context || this.snapshotValue.status !== 'running') {\n      return null\n    }\n    analyzer.getFloatFrequencyData(buffer)\n    return {\n      sampleRate: context.sampleRate,\n      fftSize: analyzer.fftSize,\n      minDb: analyzer.minDecibels,\n      maxDb: analyzer.maxDecibels,\n      values: buffer,\n    }\n  }\n\n  async requestStatus(): Promise<StatusMessage> {\n")
replace('src/audio/AudioEngine.ts',
"      this.context !== null ||\n      this.node !== null ||\n      this.pendingRequests.size > 0\n",
"      this.context !== null ||\n      this.node !== null ||\n      this.analyzer !== null ||\n      this.pendingRequests.size > 0\n")
replace('src/audio/AudioEngine.ts',
"    const context = this.context\n",
"    if (this.analyzer) {\n      try {\n        this.analyzer.disconnect()\n      } catch {\n        // Browser graph may already be torn down.\n      }\n    }\n\n    const context = this.context\n",)
replace('src/audio/AudioEngine.ts',
"    this.node = null\n    this.context = null\n",
"    this.node = null\n    this.analyzer = null\n    this.analyzerBuffer = null\n    this.context = null\n")

# UI state schema v2 persists analyzer visibility with deterministic v1 migration.
replace('src/app/state/appState.ts',
"export const UI_STATE_SCHEMA_VERSION = 1 as const\n",
"export const UI_STATE_SCHEMA_VERSION = 2 as const\n")
replace('src/app/state/appState.ts',
"export interface UiState {\n  readonly schemaVersion: typeof UI_STATE_SCHEMA_VERSION\n  readonly futureFeaturesVisible: boolean\n}\n",
"export interface UiState {\n  readonly schemaVersion: typeof UI_STATE_SCHEMA_VERSION\n  readonly futureFeaturesVisible: boolean\n  readonly analyzerVisible: boolean\n}\n")
replace('src/app/state/appState.ts',
"export function createDefaultUiState(): UiState {\n  return Object.freeze({\n    schemaVersion: UI_STATE_SCHEMA_VERSION,\n    futureFeaturesVisible: true,\n  })\n}\n",
"export function createDefaultUiState(): UiState {\n  return createUiState(true, false)\n}\n")
old_ui = """export function createUiState(futureFeaturesVisible: boolean): UiState {
  return Object.freeze({
    schemaVersion: UI_STATE_SCHEMA_VERSION,
    futureFeaturesVisible,
  })
}
"""
new_ui = """export function createUiState(
  futureFeaturesVisible: boolean,
  analyzerVisible = false,
): UiState {
  return Object.freeze({
    schemaVersion: UI_STATE_SCHEMA_VERSION,
    futureFeaturesVisible,
    analyzerVisible,
  })
}
"""
replace('src/app/state/appState.ts', old_ui, new_ui)
replace('src/app/state/appState.ts',
"  if (value.schemaVersion > UI_STATE_SCHEMA_VERSION) {\n",
"  if (value.schemaVersion === 1) {\n    if (typeof value.futureFeaturesVisible !== 'boolean') {\n      return {\n        state: createDefaultUiState(),\n        code: 'recovered',\n        messages: Object.freeze([\n          'Invalid legacy UI preference was replaced with the default presentation.',\n        ]),\n      }\n    }\n    return {\n      state: createUiState(value.futureFeaturesVisible, false),\n      code: 'migrated',\n      messages: Object.freeze([\n        'UI state schema v1 was migrated to v2 with the analyzer closed.',\n      ]),\n    }\n  }\n  if (value.schemaVersion > UI_STATE_SCHEMA_VERSION) {\n")
replace('src/app/state/appState.ts',
"  if (typeof value.futureFeaturesVisible !== 'boolean') {\n",
"  if (\n    typeof value.futureFeaturesVisible !== 'boolean' ||\n    typeof value.analyzerVisible !== 'boolean'\n  ) {\n")
replace('src/app/state/appState.ts',
"    state: createUiState(value.futureFeaturesVisible),\n",
"    state: createUiState(value.futureFeaturesVisible, value.analyzerVisible),\n")
replace('src/app/state/appState.ts',
"  return JSON.stringify(createUiState(state.futureFeaturesVisible))\n",
"  return JSON.stringify(\n    createUiState(state.futureFeaturesVisible, state.analyzerVisible),\n  )\n")

# Analyzer model and lazy panel.
Path('src/features/analyzer').mkdir(parents=True, exist_ok=True)
Path('src/features/analyzer/analyzerModel.ts').write_text(r'''import type { AudioEngineSnapshot } from '../../audio/AudioEngine'
import { DSP_ENGINE_VERSION } from '../../audio/dsp/engine'
import { AUDIO_PROTOCOL_VERSION } from '../../audio/protocol'
import type { SoundState } from '../../app/state/appState'

export const ANALYZER_MAX_BARS = 64
export const ANALYZER_MAX_FPS = 15
export const ANALYZER_REDUCED_MOTION_MAX_FPS = 4

export interface SpectrumBar {
  readonly startHz: number
  readonly endHz: number
  readonly db: number
  readonly level: number
}

export interface DiagnosticRow {
  readonly label: string
  readonly value: string
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

export function clampAnalyzerDb(value: number, minDb: number, maxDb: number): number {
  const lo = Math.min(minDb, maxDb)
  const hi = Math.max(minDb, maxDb)
  return Math.min(hi, Math.max(lo, finiteOr(value, lo)))
}

export function buildSpectrumBars(
  values: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  minDb: number,
  maxDb: number,
  maxBars = ANALYZER_MAX_BARS,
): readonly SpectrumBar[] {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isInteger(fftSize) || fftSize < 2 || maxBars < 1) {
    return Object.freeze([])
  }
  const binCount = values.length
  if (binCount === 0) return Object.freeze([])
  const count = Math.min(maxBars, binCount)
  const hzPerBin = sampleRate / fftSize
  const bars: SpectrumBar[] = []
  for (let bar = 0; bar < count; bar += 1) {
    const start = Math.floor((bar * binCount) / count)
    const end = Math.max(start + 1, Math.floor(((bar + 1) * binCount) / count))
    let peak = minDb
    for (let index = start; index < Math.min(end, binCount); index += 1) {
      peak = Math.max(peak, clampAnalyzerDb(values[index] ?? minDb, minDb, maxDb))
    }
    const bounded = clampAnalyzerDb(peak, minDb, maxDb)
    const range = Math.max(1e-9, maxDb - minDb)
    bars.push(Object.freeze({
      startHz: start * hzPerBin,
      endHz: Math.min(sampleRate / 2, end * hzPerBin),
      db: bounded,
      level: Math.min(1, Math.max(0, (bounded - minDb) / range)),
    }))
  }
  return Object.freeze(bars)
}

export function formatDiagnosticDb(value: number | null | undefined, unit = 'dB'): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} ${unit}` : `— ${unit}`
}

export function buildDiagnostics(
  snapshot: AudioEngineSnapshot,
  sound: SoundState,
  modified: boolean,
): readonly DiagnosticRow[] {
  const telemetry = snapshot.telemetry
  return Object.freeze([
    { label: 'Lifecycle', value: snapshot.status },
    { label: 'Sample rate', value: snapshot.sampleRate ? `${snapshot.sampleRate.toLocaleString()} Hz` : '—' },
    { label: 'DSP engine', value: `v${DSP_ENGINE_VERSION}` },
    { label: 'Audio protocol', value: `v${AUDIO_PROTOCOL_VERSION}` },
    { label: 'Seed', value: `0x${sound.seed.toString(16).padStart(8, '0').toUpperCase()}` },
    { label: 'Spectral target', value: `${sound.targetId}${modified ? ' · Modified' : ''}` },
    { label: '16 kHz mode', value: snapshot.highBandMode ?? '—' },
    { label: 'Peak', value: formatDiagnosticDb(telemetry?.peakDbfs, 'dBFS') },
    { label: 'RMS', value: formatDiagnosticDb(telemetry?.rmsDbfs, 'dBFS') },
    { label: 'Safety pre-gain', value: formatDiagnosticDb(telemetry?.safetyPreGainDb) },
    { label: 'Safety target', value: formatDiagnosticDb(telemetry?.safetyPreGainTargetDb) },
    { label: 'Guard interventions', value: telemetry ? telemetry.guardInterventions.toLocaleString() : '—' },
    { label: 'Stereo correlation', value: telemetry ? telemetry.stereoCorrelation.toFixed(3) : snapshot.stereoCorrelation.toFixed(3) },
    { label: 'Telemetry sequence', value: telemetry ? telemetry.sequence.toLocaleString() : '—' },
    { label: 'Rendered frames', value: telemetry ? telemetry.frameCount.toLocaleString() : '—' },
  ])
}
''')

Path('src/features/analyzer/analyzerLoop.ts').write_text(r'''export interface FrameScheduler {
  request(callback: FrameRequestCallback): number
  cancel(handle: number): void
}

export class BoundedFrameLoop {
  private handle: number | null = null
  private lastSampleAt = Number.NEGATIVE_INFINITY

  constructor(
    private readonly scheduler: FrameScheduler,
    private readonly maxFps: number,
    private readonly sample: () => void,
  ) {}

  start(): void {
    if (this.handle !== null) return
    this.handle = this.scheduler.request(this.tick)
  }

  stop(): void {
    if (this.handle !== null) {
      this.scheduler.cancel(this.handle)
      this.handle = null
    }
  }

  private readonly tick = (time: number): void => {
    this.handle = null
    const interval = 1000 / Math.max(1, this.maxFps)
    if (time - this.lastSampleAt >= interval) {
      this.lastSampleAt = time
      this.sample()
    }
    this.start()
  }
}
''')

Path('src/features/analyzer/AnalyzerPanel.tsx').write_text(r'''import { useEffect, useMemo, useState } from 'react'
import type { AnalyzerSpectrumFrame, AudioEngineSnapshot } from '../../audio/AudioEngine'
import type { SoundState } from '../../app/state/appState'
import { BoundedFrameLoop } from './analyzerLoop'
import {
  ANALYZER_MAX_FPS,
  ANALYZER_REDUCED_MOTION_MAX_FPS,
  buildDiagnostics,
  buildSpectrumBars,
  type SpectrumBar,
} from './analyzerModel'

export interface AnalyzerPanelProps {
  readonly audioSnapshot: AudioEngineSnapshot
  readonly soundState: SoundState
  readonly modified: boolean
  readonly readSpectrum: () => AnalyzerSpectrumFrame | null
}

export default function AnalyzerPanel({ audioSnapshot, soundState, modified, readSpectrum }: AnalyzerPanelProps) {
  const [bars, setBars] = useState<readonly SpectrumBar[]>([])
  const [sampleCount, setSampleCount] = useState(0)
  const diagnostics = useMemo(
    () => buildDiagnostics(audioSnapshot, soundState, modified),
    [audioSnapshot, soundState, modified],
  )

  useEffect(() => {
    let loop: BoundedFrameLoop | null = null
    let media: MediaQueryList | null = null

    const stop = (): void => {
      loop?.stop()
      loop = null
    }
    const start = (): void => {
      stop()
      if (document.visibilityState === 'hidden' || audioSnapshot.status !== 'running') return
      media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
      const fps = media?.matches ? ANALYZER_REDUCED_MOTION_MAX_FPS : ANALYZER_MAX_FPS
      loop = new BoundedFrameLoop(
        { request: (callback) => requestAnimationFrame(callback), cancel: (handle) => cancelAnimationFrame(handle) },
        fps,
        () => {
          const frame = readSpectrum()
          if (!frame) return
          setBars(buildSpectrumBars(frame.values, frame.sampleRate, frame.fftSize, frame.minDb, frame.maxDb))
          setSampleCount((value) => value + 1)
        },
      )
      loop.start()
    }
    const visibilityChanged = (): void => start()
    const motionChanged = (): void => start()
    document.addEventListener('visibilitychange', visibilityChanged)
    media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
    media?.addEventListener?.('change', motionChanged)
    start()
    return () => {
      stop()
      document.removeEventListener('visibilitychange', visibilityChanged)
      media?.removeEventListener?.('change', motionChanged)
    }
  }, [audioSnapshot.status, readSpectrum])

  return (
    <div className="analyzer-panel" data-sample-count={sampleCount}>
      <div className="spectrum-visual" role="img" aria-label="Live digital output spectrum from 0 Hz to Nyquist; exact diagnostics follow below.">
        {bars.length > 0 ? bars.map((bar, index) => (
          <span
            className="spectrum-bar"
            key={`${index}-${bar.startHz}`}
            style={{ blockSize: `${Math.max(2, bar.level * 100)}%` }}
            title={`${Math.round(bar.startHz)}–${Math.round(bar.endHz)} Hz: ${bar.db.toFixed(1)} dBFS`}
          />
        )) : <p className="analyzer-empty">Start audio to sample the live digital spectrum.</p>}
      </div>
      <p className="analyzer-note">Spectrum uses the browser's main-thread AnalyserNode. Display sampling is bounded and pauses while this panel is closed or the document is hidden.</p>
      <dl className="diagnostics-grid" aria-label="Runtime diagnostics">
        {diagnostics.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
      </dl>
      <p className="analyzer-private-note">Diagnostics contain generic sound/runtime state only. Private playback/calibration profile data is not included.</p>
    </div>
  )
}
''')

# App lazy analyzer integration.
replace('src/app/App.tsx',
"import { type ChangeEvent, useEffect, useRef, useState } from 'react'\n",
"import { Suspense, type ChangeEvent, lazy, useEffect, useRef, useState } from 'react'\n")
replace('src/app/App.tsx',
"import type {\n  AudioEngine,\n  AudioEngineSnapshot,\n  AudioEngineStatus,\n} from '../audio/AudioEngine'\n",
"import type {\n  AnalyzerSpectrumFrame,\n  AudioEngine,\n  AudioEngineSnapshot,\n  AudioEngineStatus,\n} from '../audio/AudioEngine'\n")
replace('src/app/App.tsx',
"const STEREO_WIDTH_STEP = 0.01\n",
"const AnalyzerPanel = lazy(() => import('../features/analyzer/AnalyzerPanel'))\n\nconst STEREO_WIDTH_STEP = 0.01\n")
replace('src/app/App.tsx',
"  readonly spectrumState: SpectrumState\n  readonly stereoWidth: number\n",
"  readonly spectrumState: SpectrumState\n  readonly soundState: SoundState\n  readonly stereoWidth: number\n")
replace('src/app/App.tsx',
"  readonly futureFeaturesVisible: boolean\n  readonly profileCount: number\n",
"  readonly futureFeaturesVisible: boolean\n  readonly analyzerVisible: boolean\n  readonly profileCount: number\n")
replace('src/app/App.tsx',
"  readonly onToggleFutureFeatures: () => void\n",
"  readonly onToggleFutureFeatures: () => void\n  readonly onToggleAnalyzer: () => void\n  readonly readAnalyzerFrame: () => AnalyzerSpectrumFrame | null\n")
replace('src/app/App.tsx',
"  spectrumState,\n  stereoWidth,\n",
"  spectrumState,\n  soundState,\n  stereoWidth,\n")
replace('src/app/App.tsx',
"  futureFeaturesVisible,\n  profileCount,\n",
"  futureFeaturesVisible,\n  analyzerVisible,\n  profileCount,\n")
replace('src/app/App.tsx',
"  onToggleFutureFeatures,\n  onResetSound,\n",
"  onToggleFutureFeatures,\n  onToggleAnalyzer,\n  readAnalyzerFrame,\n  onResetSound,\n")
transport_end = """      </section>

      <section className="generator-card" aria-labelledby="spectrum-heading">
"""
analyzer_section = """      </section>

      <section className="analyzer-card" aria-labelledby="analyzer-heading">
        <div className="section-heading-row">
          <div>
            <p className="label">Inspect</p>
            <h2 id="analyzer-heading">Analyzer &amp; diagnostics</h2>
          </div>
          <button
            className="secondary-action panel-toggle"
            type="button"
            aria-expanded={analyzerVisible}
            aria-controls="analyzer-panel-region"
            onClick={onToggleAnalyzer}
          >
            {analyzerVisible ? 'Close analyzer' : 'Open analyzer'}
          </button>
        </div>
        <p className="status-note">
          Optional live digital spectrum plus runtime diagnostics. Opening this panel does not change the sound.
        </p>
        {analyzerVisible ? (
          <div id="analyzer-panel-region">
            <Suspense fallback={<p className="status-note">Loading analyzer…</p>}>
              <AnalyzerPanel
                audioSnapshot={audioSnapshot}
                soundState={soundState}
                modified={modified}
                readSpectrum={readAnalyzerFrame}
              />
            </Suspense>
          </div>
        ) : null}
      </section>

      <section className="generator-card" aria-labelledby="spectrum-heading">
"""
replace('src/app/App.tsx', transport_end, analyzer_section)
replace('src/app/App.tsx',
"  const handleToggleFutureFeatures = (): void => {\n    const next = createUiState(!uiState.futureFeaturesVisible)\n",
"  const handleToggleFutureFeatures = (): void => {\n    const next = createUiState(\n      !uiState.futureFeaturesVisible,\n      uiState.analyzerVisible,\n    )\n")
replace('src/app/App.tsx',
"  const handleResetSound = (): void => {\n",
"  const handleToggleAnalyzer = (): void => {\n    const next = createUiState(\n      uiState.futureFeaturesVisible,\n      !uiState.analyzerVisible,\n    )\n    setUiState(next)\n    const repository = repositoryRef.current\n    if (repository) {\n      reportPersistenceResult(repository.saveUi(next))\n    }\n  }\n\n  const handleResetSound = (): void => {\n")
replace('src/app/App.tsx',
"      spectrumState={spectrumState}\n      stereoWidth={soundState.stereoWidth}\n",
"      spectrumState={spectrumState}\n      soundState={soundState}\n      stereoWidth={soundState.stereoWidth}\n")
replace('src/app/App.tsx',
"      futureFeaturesVisible={uiState.futureFeaturesVisible}\n      profileCount={profileState.profiles.length}\n",
"      futureFeaturesVisible={uiState.futureFeaturesVisible}\n      analyzerVisible={uiState.analyzerVisible}\n      profileCount={profileState.profiles.length}\n")
replace('src/app/App.tsx',
"      onToggleFutureFeatures={handleToggleFutureFeatures}\n      onResetSound={handleResetSound}\n",
"      onToggleFutureFeatures={handleToggleFutureFeatures}\n      onToggleAnalyzer={handleToggleAnalyzer}\n      readAnalyzerFrame={() => engineRef.current?.readAnalyzerFrame() ?? null}\n      onResetSound={handleResetSound}\n")

# Styles + import.
Path('src/styles/analyzer.css').write_text(r'''.analyzer-card {
  border: 1px solid var(--line);
  border-radius: 1rem;
  padding: 1rem;
  background: var(--surface);
}

.analyzer-panel { display: grid; gap: 1rem; }
.spectrum-visual {
  min-block-size: 12rem;
  block-size: clamp(12rem, 24vw, 18rem);
  display: flex;
  align-items: end;
  gap: 2px;
  padding: .75rem;
  border: 1px solid var(--line);
  border-radius: .75rem;
  overflow: hidden;
}
.spectrum-bar { flex: 1 1 0; min-inline-size: 1px; background: currentColor; opacity: .72; }
.analyzer-empty { margin: auto; text-align: center; }
.analyzer-note, .analyzer-private-note { margin: 0; font-size: .875rem; opacity: .82; }
.diagnostics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: .55rem; margin: 0; }
.diagnostics-grid div { border: 1px solid var(--line); border-radius: .6rem; padding: .55rem .65rem; min-inline-size: 0; }
.diagnostics-grid dt { font-size: .75rem; opacity: .72; }
.diagnostics-grid dd { margin: .15rem 0 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { .spectrum-bar { transition: none; } }
''')
replace('src/main.tsx', "import './styles/presets.css'\n", "import './styles/presets.css'\nimport './styles/analyzer.css'\n")

# Tests.
Path('tests/app/analyzer-model.test.ts').write_text(r'''import { describe, expect, it } from 'vitest'
import { createDefaultSoundState } from '../../src/app/state/appState'
import { INITIAL_AUDIO_SNAPSHOT } from '../../src/app/App'
import { buildDiagnostics, buildSpectrumBars, clampAnalyzerDb } from '../../src/features/analyzer/analyzerModel'

describe('analyzer model', () => {
  it('clamps non-finite and out-of-range spectrum values', () => {
    expect(clampAnalyzerDb(Number.NaN, -120, 0)).toBe(-120)
    expect(clampAnalyzerDb(20, -120, 0)).toBe(0)
    expect(clampAnalyzerDb(-140, -120, 0)).toBe(-120)
  })

  it('builds bounded frequency bars without exposing bins past Nyquist', () => {
    const values = Float32Array.from({ length: 1024 }, (_, index) => -120 + (index % 120))
    const bars = buildSpectrumBars(values, 48000, 2048, -120, 0, 64)
    expect(bars).toHaveLength(64)
    expect(bars[0]?.startHz).toBe(0)
    expect(bars.at(-1)?.endHz).toBeLessThanOrEqual(24000)
    expect(bars.every((bar) => bar.level >= 0 && bar.level <= 1)).toBe(true)
  })

  it('formats private-safe runtime diagnostics', () => {
    const rows = buildDiagnostics(INITIAL_AUDIO_SNAPSHOT, createDefaultSoundState(), false)
    expect(rows.some((row) => row.label === 'DSP engine')).toBe(true)
    expect(rows.some((row) => row.label === 'Audio protocol')).toBe(true)
    expect(rows.some((row) => row.label === 'Seed')).toBe(true)
    expect(rows.map((row) => row.label).join(' ')).not.toMatch(/profile|calibration/i)
  })
})
''')
Path('tests/app/analyzer-loop.test.ts').write_text(r'''import { describe, expect, it } from 'vitest'
import { BoundedFrameLoop, type FrameScheduler } from '../../src/features/analyzer/analyzerLoop'

describe('BoundedFrameLoop', () => {
  it('has only one pending frame and cancels it on stop', () => {
    let next = 1
    const callbacks = new Map<number, FrameRequestCallback>()
    const cancelled: number[] = []
    const scheduler: FrameScheduler = {
      request(callback) { const id = next++; callbacks.set(id, callback); return id },
      cancel(handle) { cancelled.push(handle); callbacks.delete(handle) },
    }
    let samples = 0
    const loop = new BoundedFrameLoop(scheduler, 10, () => { samples += 1 })
    loop.start(); loop.start()
    expect(callbacks.size).toBe(1)
    const [firstId, callback] = [...callbacks.entries()][0] ?? []
    expect(firstId).toBeTruthy()
    callbacks.delete(firstId as number)
    callback?.(100)
    expect(samples).toBe(1)
    expect(callbacks.size).toBe(1)
    loop.stop()
    expect(callbacks.size).toBe(0)
    expect(cancelled).toHaveLength(1)
  })
})
''')
Path('e2e/analyzer.spec.ts').write_text(r'''import { expect, test } from '@playwright/test'

test('analyzer opens lazily, reports deterministic diagnostics, and closes cleanly', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Analyzer & diagnostics' })).toBeVisible()
  await expect(page.locator('.analyzer-panel')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open analyzer' }).click()
  await expect(page.locator('.analyzer-panel')).toBeVisible()
  await expect(page.getByRole('definition').filter({ hasText: 'v4' }).first()).toBeVisible()
  await expect(page.getByText('Private playback/calibration profile data is not included.')).toBeVisible()
  await page.getByRole('button', { name: 'Close analyzer' }).click()
  await expect(page.locator('.analyzer-panel')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('running analyzer samples live spectrum and closing stops the render surface', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open analyzer' }).click()
  await page.getByRole('button', { name: 'Start audio' }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await expect.poll(async () => Number(await page.locator('.analyzer-panel').getAttribute('data-sample-count'))).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Close analyzer' }).click()
  await expect(page.locator('.analyzer-panel')).toHaveCount(0)
  await page.getByRole('button', { name: 'Stop audio' }).click()
})
''')

# Docs.
Path('docs/RAG/ANALYZER_DIAGNOSTICS.md').write_text(r'''# Analyzer and Diagnostics

Status: canonical analyzer/runtime-inspection contract through issue #12.

## Architecture

The live spectrum is intentionally **not** computed in the AudioWorklet. The production browser graph inserts a native `AnalyserNode` after the worklet and before `AudioDestination`. The worklet's existing bounded telemetry protocol is unchanged, so opening the analyzer adds no FFT work, allocations, or extra messages to the real-time callback.

The analyzer UI is code-split with `React.lazy` and mounted only while its panel is open. Its display loop is bounded to 15 samples/second, or 4 samples/second under `prefers-reduced-motion: reduce`. It stops on unmount and does not run while the document is hidden or audio is not Running.

## Spectrum semantics

- FFT size: 2048 via native `AnalyserNode`.
- Display range: -120..0 dBFS.
- Native analyzer smoothing: 0.72.
- Browser frequency bins are reduced to at most 64 visual bars on the main thread.
- The visualization is supplementary; exact runtime diagnostics remain textual.
- No acoustic dB SPL, phon, medical, or hearing-threshold claim is made.

## Diagnostics

The panel exposes generic bug-report/runtime state only: lifecycle, sample rate, DSP engine version, audio protocol version, sound seed, spectral target/Modified state, high-band mode, Peak/RMS, safety pre-gain/current target, guard interventions, stereo correlation, telemetry sequence, and rendered frame count.

Private ProfileState/calibration names, notes, curves, and device metadata are structurally absent from analyzer props and diagnostics formatting.

## Performance evidence

Issue #12 does not modify `greygen-processor.ts`, the DSP render loop, or telemetry cadence. Analyzer FFT computation is delegated to the browser's `AnalyserNode` outside the worklet callback. Therefore worklet callback computation/message traffic is identical with analyzer closed or open; only main-thread graph analysis + bounded UI sampling are added.

## Lifecycle

The analyser node is created only with the browser audio graph and disconnected during AudioEngine cleanup. The display loop owns at most one pending `requestAnimationFrame`; unmount/close cancels it and removes visibility/reduced-motion listeners. Reopening constructs a fresh panel loop without retaining the previous one.
''')

# README and canonical docs targeted additions.
replace('README.md',
"lifecycle transport, digital Peak/RMS/headroom telemetry, and explicit runtime 16 kHz degradation state.",
"lifecycle transport, digital Peak/RMS/headroom telemetry, an optional lazily loaded live spectrum/runtime diagnostics panel, and explicit runtime 16 kHz degradation state.")
replace('README.md',
"13. `docs/RAG/PSYCHOACOUSTICS_SAFETY.md`\n14. `docs/RAG/UX_STATE.md`\n15. `docs/RAG/AGENT_PLAYBOOK.md`\n16. `docs/RAG/ROADMAP.md`\n",
"13. `docs/RAG/ANALYZER_DIAGNOSTICS.md`\n14. `docs/RAG/PSYCHOACOUSTICS_SAFETY.md`\n15. `docs/RAG/UX_STATE.md`\n16. `docs/RAG/AGENT_PLAYBOOK.md`\n17. `docs/RAG/ROADMAP.md`\n")
replace('docs/RAG/ARCHITECTURE.md',
"## Future continuous spectral engine\n",
"## Analyzer / diagnostics\n\nThe browser graph may insert a native AnalyserNode after the worklet and before destination. Spectrum FFT/display work remains outside the worklet hot loop; existing worklet telemetry stays bounded. The analyzer UI is lazily loaded, visibility-aware, reduced-motion-aware, and private-profile-blind. `ANALYZER_DIAGNOSTICS.md` is canonical for details.\n\n## Future continuous spectral engine\n")
replace('docs/RAG/UX_STATE.md',
"Advanced controls belong in a collapsible/secondary surface.\n",
"Advanced controls belong in a collapsible/secondary surface. The analyzer/diagnostics panel is secondary, defaults closed for new/legacy state, and persists its open/closed presentation preference locally.\n")
replace('docs/RAG/UX_STATE.md',
"### UiState\n\nLocal only: open panels, visual preferences, analyzer visibility, and other non-audio presentation state.\n",
"### UiState\n\nLocal only: open panels, visual preferences, analyzer visibility, and other non-audio presentation state. UI schema v2 adds persisted analyzer visibility; v1 migrates deterministically with the analyzer closed.\n")

# Append issue-specific validation note to DSP contract without changing thresholds.
p = Path('docs/RAG/DSP_VALIDATION.md')
s = p.read_text()
s += "\n## Runtime analyzer validation\n\nThe optional live analyzer must keep FFT/render work outside the AudioWorklet. Prefer native browser analysis, bound UI sampling, stop loops/listeners on unmount/hidden state, and retain textual numeric diagnostics. Analyzer instrumentation must not relax or replace deterministic offline DSP validation.\n"
p.write_text(s)

# ROADMAP: mark #12 implemented if matching text exists, otherwise append status note.
p = Path('docs/RAG/ROADMAP.md')
s = p.read_text()
s += "\n### Implemented: issue #12 analyzer/diagnostics\n\nNative main-thread AnalyserNode spectrum, bounded/lazy diagnostics UI, reduced-motion/visibility lifecycle, and private-safe runtime diagnostics are implemented and test-gated.\n"
p.write_text(s)
