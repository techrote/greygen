import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import type {
  AudioEngine,
  AudioEngineSnapshot,
  AudioEngineStatus,
} from '../audio/AudioEngine'
import { createBrowserAudioEngine } from '../audio/browserAudioRuntime'
import { DEFAULT_ENGINE_PRESET } from '../audio/dsp/engine'
import {
  DEFAULT_MASTER_GAIN_DB,
  MASTER_GAIN_MAX_DB,
  MASTER_GAIN_MIN_DB,
} from '../audio/dsp/gainSafety'
import {
  type SpectralPresetId,
  type SpectrumState,
  createSpectrumState,
} from '../audio/dsp/spectra'
import {
  BAND_STEP_DB,
  GENERATOR_BANDS,
  GENERATOR_PRESETS,
  MASTER_STEP_DB,
  USER_BAND_UI_MAX_DB,
  USER_BAND_UI_MIN_DB,
  applyNamedPreset,
  bandAccessibleName,
  formatSignedDb,
  isModifiedPreset,
  resetAllUserBandOffsets,
  resetUserBandOffset,
  setUserBandOffset,
} from '../features/generator/uiModel'

export const INITIAL_AUDIO_SNAPSHOT: AudioEngineSnapshot = {
  status: 'ready',
  capability: 'supported',
  error: null,
  sampleRate: null,
  targetId: DEFAULT_ENGINE_PRESET,
  highBandMode: null,
  masterGainDb: DEFAULT_MASTER_GAIN_DB,
  telemetry: null,
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
      return `Audio engine active${snapshot.sampleRate ? ` at ${snapshot.sampleRate.toLocaleString()} Hz` : ''}. Digital gain safety and post-guard meters are active.`
    case 'suspended':
      return 'Audio is paused by the browser or operating system. Resume requires another explicit action.'
    case 'error':
    case 'unsupported':
      return snapshot.error?.message ?? 'Browser audio is unavailable.'
    case 'stopped':
      return 'Audio context closed. Start creates a fresh context.'
  }
}

function formatDb(value: number): string {
  return `${value.toFixed(1)} dB`
}

function formatDbfs(value: number): string {
  return `${value.toFixed(1)} dBFS`
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'The control update failed.'
}

function isPresetId(value: string): value is SpectralPresetId {
  return GENERATOR_PRESETS.some((preset) => preset.id === value)
}

export interface GeneratorSurfaceProps {
  readonly audioSnapshot: AudioEngineSnapshot
  readonly spectrumState: SpectrumState
  readonly engineReady: boolean
  readonly controlError: string | null
  readonly onPrimaryAction: () => void
  readonly onStop: () => void
  readonly onPresetChange: (targetId: SpectralPresetId) => void
  readonly onBandChange: (index: number, valueDb: number) => void
  readonly onBandReset: (index: number) => void
  readonly onBandsReset: () => void
  readonly onMasterChange: (valueDb: number) => void
}

export function GeneratorSurface({
  audioSnapshot,
  spectrumState,
  engineReady,
  controlError,
  onPrimaryAction,
  onStop,
  onPresetChange,
  onBandChange,
  onBandReset,
  onBandsReset,
  onMasterChange,
}: GeneratorSurfaceProps) {
  const telemetry = audioSnapshot.telemetry
  const modified = isModifiedPreset(spectrumState)
  const selectedPreset = GENERATOR_PRESETS.find(
    (preset) => preset.id === spectrumState.targetId,
  )
  const primaryDisabled =
    !engineReady ||
    audioSnapshot.status === 'starting' ||
    audioSnapshot.status === 'unsupported'
  const controlsDisabled = !engineReady
  const highBandDegraded =
    audioSnapshot.highBandMode === 'degraded-high-shelf'

  const handlePresetChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    if (isPresetId(event.currentTarget.value)) {
      onPresetChange(event.currentTarget.value)
    }
  }

  return (
    <main className="app-shell">
      <header className="hero compact-hero">
        <div>
          <p className="eyebrow">Local-first spectral noise</p>
          <h1>Greygen</h1>
        </div>
        <p className="lede">
          Shape deterministic noise across ten spectral regions. Digital safety
          stays separate from the sound you ask for.
        </p>
      </header>

      <section className="transport-card" aria-labelledby="audio-status-heading">
        <div className="status-row">
          <div>
            <p className="label" id="audio-status-heading">
              Audio
            </p>
            <div className="status-title-row">
              <p className="status-value" aria-live="polite">
                {statusLabel(audioSnapshot.status)}
              </p>
              <span
                className="status-dot"
                data-status={audioSnapshot.status}
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="transport-actions compact-actions">
            <button
              className="primary-action"
              type="button"
              disabled={primaryDisabled}
              aria-describedby="audio-status-note"
              onClick={onPrimaryAction}
            >
              {primaryActionLabel(audioSnapshot.status)}
            </button>
            {audioSnapshot.status === 'suspended' ? (
              <button
                className="secondary-action"
                type="button"
                onClick={onStop}
              >
                Stop audio
              </button>
            ) : null}
          </div>
        </div>

        <p className="status-note" id="audio-status-note">
          {statusDetail(audioSnapshot)}
        </p>

        {controlError ? (
          <p className="control-error" role="alert">
            Control update failed: {controlError}
          </p>
        ) : null}

        <dl className="meter-strip" aria-label="Digital output meters">
          <div>
            <dt>Peak</dt>
            <dd>{telemetry ? formatDbfs(telemetry.peakDbfs) : '— dBFS'}</dd>
          </div>
          <div>
            <dt>RMS</dt>
            <dd>{telemetry ? formatDbfs(telemetry.rmsDbfs) : '— dBFS'}</dd>
          </div>
          <div>
            <dt>Safety pre-gain</dt>
            <dd>{telemetry ? formatDb(telemetry.safetyPreGainDb) : '— dB'}</dd>
          </div>
          <div>
            <dt>Master</dt>
            <dd>{formatDb(audioSnapshot.masterGainDb)}</dd>
          </div>
          {telemetry && telemetry.guardInterventions > 0 ? (
            <div className="guard-active">
              <dt>Guard active</dt>
              <dd>{telemetry.guardInterventions}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="generator-card" aria-labelledby="spectrum-heading">
        <div className="section-heading-row">
          <div>
            <p className="label">Spectrum</p>
            <h2 id="spectrum-heading">Ten-band shape</h2>
          </div>
          <div className="preset-state" aria-live="polite">
            <strong>{selectedPreset?.label ?? spectrumState.targetId}</strong>
            {modified ? <span>Modified</span> : <span>Preset</span>}
          </div>
        </div>

        <div className="preset-row">
          <label htmlFor="spectral-preset">Noise colour</label>
          <select
            id="spectral-preset"
            value={spectrumState.targetId}
            disabled={controlsDisabled}
            onChange={handlePresetChange}
          >
            {GENERATOR_PRESETS.map((preset) => (
              <option value={preset.id} key={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <button
            className="secondary-action reset-all"
            type="button"
            disabled={controlsDisabled || !modified}
            onClick={onBandsReset}
          >
            Reset band offsets
          </button>
        </div>

        <div className="band-scroll" tabIndex={0} aria-label="Ten frequency bands">
          <div className="band-bank">
            {GENERATOR_BANDS.map((band) => {
              const valueDb = spectrumState.userBandOffsetsDb[band.index]
              const isHighBand = band.index === GENERATOR_BANDS.length - 1
              return (
                <div
                  className="band-control"
                  data-degraded={isHighBand && highBandDegraded ? 'true' : 'false'}
                  key={band.frequencyHz}
                >
                  <label htmlFor={`band-${band.index}`}>{band.label}</label>
                  <input
                    id={`band-${band.index}`}
                    className="vertical-range"
                    type="range"
                    min={USER_BAND_UI_MIN_DB}
                    max={USER_BAND_UI_MAX_DB}
                    step={BAND_STEP_DB}
                    value={valueDb}
                    disabled={controlsDisabled}
                    aria-label={bandAccessibleName(band, valueDb)}
                    aria-valuetext={formatSignedDb(valueDb)}
                    onChange={(event) =>
                      onBandChange(band.index, Number(event.currentTarget.value))
                    }
                  />
                  <output htmlFor={`band-${band.index}`}>
                    {formatSignedDb(valueDb)}
                  </output>
                  <button
                    className="band-reset"
                    type="button"
                    disabled={controlsDisabled || valueDb === 0}
                    aria-label={`Reset ${band.label} band to 0 dB`}
                    onClick={() => onBandReset(band.index)}
                  >
                    0
                  </button>
                  {isHighBand && highBandDegraded ? (
                    <span className="band-mode-note">High shelf</span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        {highBandDegraded ? (
          <p className="runtime-note" role="status">
            At {audioSnapshot.sampleRate?.toLocaleString() ?? 'this'} Hz, the
            16k control is a stable high shelf above about 11.3 kHz rather than
            a bounded 16 kHz band.
          </p>
        ) : null}
      </section>

      <section className="output-card" aria-labelledby="output-heading">
        <div className="section-heading-row">
          <div>
            <p className="label">Output</p>
            <h2 id="output-heading">Master level</h2>
          </div>
          <output className="master-readout" htmlFor="master-gain">
            {formatSignedDb(audioSnapshot.masterGainDb)}
          </output>
        </div>
        <label className="sr-only" htmlFor="master-gain">
          Master digital level
        </label>
        <input
          id="master-gain"
          className="master-range"
          type="range"
          min={MASTER_GAIN_MIN_DB}
          max={MASTER_GAIN_MAX_DB}
          step={MASTER_STEP_DB}
          value={audioSnapshot.masterGainDb}
          disabled={controlsDisabled}
          aria-label={`Master digital level, ${formatSignedDb(audioSnapshot.masterGainDb)}`}
          aria-valuetext={formatSignedDb(audioSnapshot.masterGainDb)}
          onChange={(event) => onMasterChange(Number(event.currentTarget.value))}
        />
        <div className="range-scale" aria-hidden="true">
          <span>-60 dB</span>
          <span>0 dB</span>
        </div>
        <p className="status-note">
          This is digital level, not acoustic dB SPL. Greygen cannot know your
          amplifier, headphones, speakers, room, or listening exposure.
        </p>
      </section>

      <section className="future-card" aria-labelledby="future-heading">
        <div>
          <p className="label">Next layers</p>
          <h2 id="future-heading">Width, movement &amp; calibration</h2>
        </div>
        <div className="future-grid">
          <fieldset disabled>
            <legend>Stereo width</legend>
            <input
              type="range"
              min="0"
              max="100"
              value="0"
              readOnly
              aria-label="Stereo width, unavailable until stereo engine is implemented"
            />
            <p>Mono for now. Power-preserving stereo arrives in issue #9.</p>
          </fieldset>
          <fieldset disabled>
            <legend>Spectral animation</legend>
            <select
              value="off"
              aria-label="Spectral animation, unavailable until animation engine is implemented"
              onChange={() => undefined}
            >
              <option value="off">Off — coming in issue #10</option>
            </select>
            <p>No fake motion: deterministic bounded animation is not active yet.</p>
          </fieldset>
          <div className="calibration-placeholder">
            <h3>Playback calibration</h3>
            <button type="button" disabled>
              Calibration profiles — coming later
            </button>
            <p>
              Future profiles will describe relative listener + playback-chain
              correction. This is not a medical hearing test.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function App() {
  const engineRef = useRef<AudioEngine | null>(null)
  const [engineReady, setEngineReady] = useState(false)
  const [audioSnapshot, setAudioSnapshot] = useState<AudioEngineSnapshot>(
    INITIAL_AUDIO_SNAPSHOT,
  )
  const [spectrumState, setSpectrumState] = useState<SpectrumState>(() =>
    createSpectrumState(DEFAULT_ENGINE_PRESET),
  )
  const [controlError, setControlError] = useState<string | null>(null)

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

  const reportControlFailure = (error: unknown): void => {
    setControlError(errorText(error))
  }

  const handlePrimaryAction = (): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    setControlError(null)

    const operation =
      audioSnapshot.status === 'running'
        ? engine.stop()
        : audioSnapshot.status === 'suspended'
          ? engine.resumeFromUserGesture()
          : engine.startFromUserGesture()
    void operation.catch(reportControlFailure)
  }

  const handleStop = (): void => {
    setControlError(null)
    void engineRef.current?.stop().catch(reportControlFailure)
  }

  const commitSpectrumState = (next: SpectrumState): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    setControlError(null)
    setSpectrumState(next)
    void engine.setSpectrumState(next).catch(reportControlFailure)
  }

  const handlePresetChange = (targetId: SpectralPresetId): void => {
    commitSpectrumState(applyNamedPreset(targetId))
  }

  const handleBandChange = (index: number, valueDb: number): void => {
    commitSpectrumState(setUserBandOffset(spectrumState, index, valueDb))
  }

  const handleBandReset = (index: number): void => {
    commitSpectrumState(resetUserBandOffset(spectrumState, index))
  }

  const handleBandsReset = (): void => {
    commitSpectrumState(resetAllUserBandOffsets(spectrumState))
  }

  const handleMasterChange = (valueDb: number): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    setControlError(null)
    void engine.setMasterGainDb(valueDb).catch(reportControlFailure)
  }

  return (
    <GeneratorSurface
      audioSnapshot={audioSnapshot}
      spectrumState={spectrumState}
      engineReady={engineReady}
      controlError={controlError}
      onPrimaryAction={handlePrimaryAction}
      onStop={handleStop}
      onPresetChange={handlePresetChange}
      onBandChange={handleBandChange}
      onBandReset={handleBandReset}
      onBandsReset={handleBandsReset}
      onMasterChange={handleMasterChange}
    />
  )
}
