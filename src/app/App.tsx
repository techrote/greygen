import { useEffect, useRef, useState } from 'react'
import type {
  AudioEngine,
  AudioEngineSnapshot,
  AudioEngineStatus,
} from '../audio/AudioEngine'
import { createBrowserAudioEngine } from '../audio/browserAudioRuntime'

const INITIAL_AUDIO_SNAPSHOT: AudioEngineSnapshot = {
  status: 'ready',
  capability: 'supported',
  error: null,
  sampleRate: null,
  targetId: 'grey',
  highBandMode: null,
}

function statusLabel(status: AudioEngineStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready'
    case 'starting':
      return 'Starting…'
    case 'running':
      return 'Running'
    case 'suspended':
      return 'Suspended'
    case 'error':
      return 'Error'
    case 'stopped':
      return 'Stopped'
    case 'unsupported':
      return 'Unsupported'
  }
}

function primaryActionLabel(status: AudioEngineStatus): string {
  switch (status) {
    case 'running':
      return 'Stop audio'
    case 'suspended':
      return 'Resume audio'
    case 'error':
      return 'Retry audio'
    case 'starting':
      return 'Starting…'
    default:
      return 'Start audio'
  }
}

function statusDetail(snapshot: AudioEngineSnapshot): string {
  switch (snapshot.status) {
    case 'ready':
      return 'Audio stays silent until you choose Start.'
    case 'starting':
      return 'Creating the browser audio context and loading the processor.'
    case 'running':
      return `Audio engine active${snapshot.sampleRate ? ` at ${snapshot.sampleRate.toLocaleString()} Hz` : ''}. Output is intentionally conservative until gain-safety work lands.`
    case 'suspended':
      return 'Audio is paused by the browser or operating system. Resume requires another explicit action.'
    case 'error':
    case 'unsupported':
      return snapshot.error?.message ?? 'Browser audio is unavailable.'
    case 'stopped':
      return 'Audio context closed. Start creates a fresh context.'
  }
}

export default function App() {
  const engineRef = useRef<AudioEngine | null>(null)
  const [engineReady, setEngineReady] = useState(false)
  const [audioSnapshot, setAudioSnapshot] = useState<AudioEngineSnapshot>(
    INITIAL_AUDIO_SNAPSHOT,
  )

  useEffect(() => {
    const engine = createBrowserAudioEngine()
    engineRef.current = engine
    const unsubscribe = engine.subscribe(setAudioSnapshot)
    setAudioSnapshot(engine.getSnapshot())
    setEngineReady(true)

    return () => {
      unsubscribe()
      engineRef.current = null
      void engine.dispose()
    }
  }, [])

  const handlePrimaryAction = async (): Promise<void> => {
    const engine = engineRef.current
    if (!engine) {
      return
    }

    switch (audioSnapshot.status) {
      case 'running':
        await engine.stop()
        return
      case 'suspended':
        await engine.resumeFromUserGesture()
        return
      default:
        await engine.startFromUserGesture()
    }
  }

  const handleStop = async (): Promise<void> => {
    await engineRef.current?.stop()
  }

  const primaryDisabled =
    !engineReady ||
    audioSnapshot.status === 'starting' ||
    audioSnapshot.status === 'unsupported'

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Local-first spectral noise</p>
        <h1>Greygen</h1>
        <p className="lede">
          A browser-based calibrated spectral-noise generator and psychoacoustic
          playground, built around deterministic and measurable DSP.
        </p>
      </header>

      <section className="status-card" aria-labelledby="audio-status-heading">
        <div className="status-row">
          <div>
            <p className="label" id="audio-status-heading">
              Audio status
            </p>
            <p className="status-value" aria-live="polite">
              {statusLabel(audioSnapshot.status)}
            </p>
          </div>
          <span
            className="status-dot"
            data-status={audioSnapshot.status}
            aria-hidden="true"
          />
        </div>

        <div className="transport-actions">
          <button
            type="button"
            disabled={primaryDisabled}
            aria-describedby="audio-status-note"
            onClick={() => void handlePrimaryAction()}
          >
            {primaryActionLabel(audioSnapshot.status)}
          </button>
          {audioSnapshot.status === 'suspended' ? (
            <button
              className="secondary-action"
              type="button"
              onClick={() => void handleStop()}
            >
              Stop audio
            </button>
          ) : null}
        </div>

        <p className="scaffold-note" id="audio-status-note">
          {statusDetail(audioSnapshot)}
        </p>
      </section>
    </main>
  )
}
