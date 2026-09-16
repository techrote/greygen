import { useEffect, useMemo, useState } from 'react'
import type {
  AnalyzerSpectrumFrame,
  AudioEngineSnapshot,
} from '../../audio/AudioEngine'
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

export default function AnalyzerPanel({
  audioSnapshot,
  soundState,
  modified,
  readSpectrum,
}: AnalyzerPanelProps) {
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
      if (
        document.visibilityState === 'hidden' ||
        audioSnapshot.status !== 'running'
      )
        return
      media =
        globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
      const fps = media?.matches
        ? ANALYZER_REDUCED_MOTION_MAX_FPS
        : ANALYZER_MAX_FPS
      loop = new BoundedFrameLoop(
        {
          request: (callback) => requestAnimationFrame(callback),
          cancel: (handle) => cancelAnimationFrame(handle),
        },
        fps,
        () => {
          const frame = readSpectrum()
          if (!frame) return
          setBars(
            buildSpectrumBars(
              frame.values,
              frame.sampleRate,
              frame.fftSize,
              frame.minDb,
              frame.maxDb,
            ),
          )
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
      <div
        className="spectrum-visual"
        role="img"
        aria-label="Live digital output spectrum from 0 Hz to Nyquist; exact diagnostics follow below."
      >
        {bars.length > 0 ? (
          bars.map((bar, index) => (
            <span
              className="spectrum-bar"
              key={`${index}-${bar.startHz}`}
              style={{ blockSize: `${Math.max(2, bar.level * 100)}%` }}
              title={`${Math.round(bar.startHz)}–${Math.round(bar.endHz)} Hz: ${bar.db.toFixed(1)} dBFS`}
            />
          ))
        ) : (
          <p className="analyzer-empty">
            Start audio to sample the live digital spectrum.
          </p>
        )}
      </div>
      <p className="analyzer-note">
        Spectrum uses the browser's main-thread AnalyserNode. Display sampling
        is bounded and pauses while this panel is closed or the document is
        hidden.
      </p>
      <dl className="diagnostics-grid" aria-label="Runtime diagnostics">
        {diagnostics.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="analyzer-private-note">
        Diagnostics contain generic sound/runtime state only. Private
        playback/calibration profile data is not included.
      </p>
    </div>
  )
}
