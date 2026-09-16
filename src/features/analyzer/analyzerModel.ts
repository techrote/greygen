import type { AudioEngineSnapshot } from '../../audio/AudioEngine'
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

export function clampAnalyzerDb(
  value: number,
  minDb: number,
  maxDb: number,
): number {
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
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isInteger(fftSize) ||
    fftSize < 2 ||
    maxBars < 1
  ) {
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
      peak = Math.max(
        peak,
        clampAnalyzerDb(values[index] ?? minDb, minDb, maxDb),
      )
    }
    const bounded = clampAnalyzerDb(peak, minDb, maxDb)
    const range = Math.max(1e-9, maxDb - minDb)
    bars.push(
      Object.freeze({
        startHz: start * hzPerBin,
        endHz: Math.min(sampleRate / 2, end * hzPerBin),
        db: bounded,
        level: Math.min(1, Math.max(0, (bounded - minDb) / range)),
      }),
    )
  }
  return Object.freeze(bars)
}

export function formatDiagnosticDb(
  value: number | null | undefined,
  unit = 'dB',
): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(1)} ${unit}`
    : `— ${unit}`
}

export function buildDiagnostics(
  snapshot: AudioEngineSnapshot,
  sound: SoundState,
  modified: boolean,
): readonly DiagnosticRow[] {
  const telemetry = snapshot.telemetry
  return Object.freeze([
    { label: 'Lifecycle', value: snapshot.status },
    {
      label: 'Sample rate',
      value: snapshot.sampleRate
        ? `${snapshot.sampleRate.toLocaleString()} Hz`
        : '—',
    },
    { label: 'DSP engine', value: `v${DSP_ENGINE_VERSION}` },
    { label: 'Audio protocol', value: `v${AUDIO_PROTOCOL_VERSION}` },
    {
      label: 'Seed',
      value: `0x${sound.seed.toString(16).padStart(8, '0').toUpperCase()}`,
    },
    {
      label: 'Spectral target',
      value: `${sound.targetId}${modified ? ' · Modified' : ''}`,
    },
    { label: '16 kHz mode', value: snapshot.highBandMode ?? '—' },
    { label: 'Peak', value: formatDiagnosticDb(telemetry?.peakDbfs, 'dBFS') },
    { label: 'RMS', value: formatDiagnosticDb(telemetry?.rmsDbfs, 'dBFS') },
    {
      label: 'Safety pre-gain',
      value: formatDiagnosticDb(telemetry?.safetyPreGainDb),
    },
    {
      label: 'Safety target',
      value: formatDiagnosticDb(telemetry?.safetyPreGainTargetDb),
    },
    {
      label: 'Guard interventions',
      value: telemetry ? telemetry.guardInterventions.toLocaleString() : '—',
    },
    {
      label: 'Stereo correlation',
      value: telemetry
        ? telemetry.stereoCorrelation.toFixed(3)
        : snapshot.stereoCorrelation.toFixed(3),
    },
    {
      label: 'Telemetry sequence',
      value: telemetry ? telemetry.sequence.toLocaleString() : '—',
    },
    {
      label: 'Rendered frames',
      value: telemetry ? telemetry.frameCount.toLocaleString() : '—',
    },
  ])
}
