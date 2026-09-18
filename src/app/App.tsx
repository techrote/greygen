import {
  Suspense,
  type ChangeEvent,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  ANIMATION_DEPTH_MAX_DB,
  ANIMATION_DEPTH_MIN_DB,
  ANIMATION_MODES,
  ANIMATION_SPEED_MAX,
  ANIMATION_SPEED_MIN,
  type AnimationMode,
  type AnimationState,
  animationModeLabel,
  createAnimationState,
} from '../audio/dsp/animation'
import type {
  AnalyzerSpectrumFrame,
  AudioEngine,
  AudioEngineSnapshot,
  AudioEngineStatus,
} from '../audio/AudioEngine'
import { createBrowserAudioEngine } from '../audio/browserAudioRuntime'
import type { CalibrationStimulusChannel } from '../audio/dsp/calibrationStimulus'
import { DEFAULT_ENGINE_PRESET } from '../audio/dsp/engine'
import {
  DEFAULT_MASTER_GAIN_DB,
  MASTER_GAIN_MAX_DB,
  MASTER_GAIN_MIN_DB,
} from '../audio/dsp/gainSafety'
import type { SpectralPresetId, SpectrumState } from '../audio/dsp/spectra'
import {
  DEFAULT_STEREO_WIDTH,
  STEREO_WIDTH_MAX,
  STEREO_WIDTH_MIN,
  stereoWidthLabel,
  stereoWidthToCorrelation,
} from '../audio/dsp/stereo'
import {
  createSoundShareUrl,
  parseSoundShareUrl,
  stripSoundShareFragment,
} from '../features/sharing/shareState'
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
import CalibrationPanel, {
  type CalibrationDraft,
} from '../features/calibration/CalibrationPanel'
import type {
  GuidedCalibrationAuditionDraft,
  GuidedCalibrationSaveDraft,
} from '../features/calibration/GuidedCalibrationWizard'
import {
  createCalibrationProfilePayload,
  createCalibrationProfileRecord,
  duplicateCalibrationProfileRecord,
  findCalibrationProfile,
  resolveCalibrationChannelOffsetsDb,
  resolveCalibrationRecordChannelOffsetsDb,
  updateCalibrationProfileMetadata,
} from '../features/calibration/calibrationProfile'
import { parseCalibrationProfileExport } from '../features/calibration/profilePortability'
import {
  type CalibrationApplicationMode,
  type ProfileState,
  type SoundState,
  type UiState,
  createDefaultProfileState,
  createDefaultSoundState,
  createDefaultUiState,
  createProfileState,
  createSoundState,
  createUiState,
  soundStateToAnimationState,
  soundStateToSpectrumState,
} from './state/appState'
import {
  USER_PRESET_NAME_MAX_LENGTH,
  type UserPresetLibraryState,
  type UserSoundPreset,
  createDefaultUserPresetLibraryState,
  deleteUserSoundPreset,
  findMatchingUserSoundPreset,
  findUserSoundPreset,
  saveUserSoundPreset,
} from './state/userPresetState'
import type {
  AppStateRepository,
  PersistenceResult,
  StorageDiagnostic,
} from './storage/AppStateRepository'
import { createBrowserAppStateRepository } from './storage/browserStateRepository'

const AnalyzerPanel = lazy(() => import('../features/analyzer/AnalyzerPanel'))

const STEREO_WIDTH_STEP = 0.01
const ANIMATION_DEPTH_STEP_DB = 0.5
const ANIMATION_SPEED_STEP = 0.25

export const INITIAL_AUDIO_SNAPSHOT: AudioEngineSnapshot = {
  status: 'ready',
  capability: 'supported',
  error: null,
  sampleRate: null,
  targetId: DEFAULT_ENGINE_PRESET,
  highBandMode: null,
  masterGainDb: DEFAULT_MASTER_GAIN_DB,
  stereoWidth: DEFAULT_STEREO_WIDTH,
  stereoCorrelation: stereoWidthToCorrelation(DEFAULT_STEREO_WIDTH),
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

function diagnosticsNotice(
  diagnostics: readonly StorageDiagnostic[],
): string | null {
  if (diagnostics.length === 0) {
    return null
  }
  return diagnostics.map((entry) => entry.message).join(' ')
}

export interface GeneratorSurfaceProps {
  readonly audioSnapshot: AudioEngineSnapshot
  readonly spectrumState: SpectrumState
  readonly soundState: SoundState
  readonly stereoWidth: number
  readonly animation: AnimationState
  readonly engineReady: boolean
  readonly controlError: string | null
  readonly storageNotice: string | null
  readonly futureFeaturesVisible: boolean
  readonly analyzerVisible: boolean
  readonly profileCount: number
  readonly profileState?: ProfileState
  readonly userPresets: readonly UserSoundPreset[]
  readonly matchedUserPresetName: string | null
  readonly shareUrl: string
  readonly shareNotice: string | null
  readonly onPrimaryAction: () => void
  readonly onStop: () => void
  readonly onPresetChange: (targetId: SpectralPresetId) => void
  readonly onBandChange: (index: number, valueDb: number) => void
  readonly onBandReset: (index: number) => void
  readonly onBandsReset: () => void
  readonly onMasterChange: (valueDb: number) => void
  readonly onStereoWidthChange: (width: number) => void
  readonly onAnimationModeChange: (mode: AnimationMode) => void
  readonly onAnimationDepthChange: (depthDb: number) => void
  readonly onAnimationSpeedChange: (speed: number) => void
  readonly onAnimationEnergyChange: (enabled: boolean) => void
  readonly onToggleFutureFeatures: () => void
  readonly onToggleAnalyzer: () => void
  readonly readAnalyzerFrame: () => AnalyzerSpectrumFrame | null
  readonly onResetSound: () => void
  readonly onDeleteProfiles: () => void
  readonly onSaveCalibrationProfile?: (draft: CalibrationDraft) => void
  readonly onSelectCalibrationProfile?: (id: string | null) => void
  readonly onCalibrationModeChange?: (mode: CalibrationApplicationMode) => void
  readonly onDeleteCalibrationProfile?: (id: string) => void
  readonly onDuplicateCalibrationProfile?: (id: string) => void
  readonly onRenameCalibrationProfile?: (
    id: string,
    name: string,
    note: string,
  ) => boolean
  readonly onImportCalibrationProfile?: (raw: string) => string
  readonly onGuidedStimulusBand?: (
    bandIndex: number,
    levelOffsetDb: number,
    channel: CalibrationStimulusChannel,
  ) => void
  readonly onGuidedStimulusSilent?: () => void
  readonly onGuidedStimulusEnd?: () => void
  readonly onGuidedAuditionDraft?: (
    draft: GuidedCalibrationAuditionDraft,
    mode: CalibrationApplicationMode,
  ) => void
  readonly onGuidedRestoreSavedProfile?: () => void
  readonly onGuidedSave?: (draft: GuidedCalibrationSaveDraft) => void
  readonly onSaveUserPreset: (name: string) => boolean
  readonly onLoadUserPreset: (id: string) => void
  readonly onDeleteUserPreset: (id: string) => void
  readonly onCopyShareUrl: () => void
  readonly onImportShareUrl: (href: string) => void
}

export function GeneratorSurface({
  audioSnapshot,
  spectrumState,
  soundState,
  stereoWidth,
  animation,
  engineReady,
  controlError,
  storageNotice,
  futureFeaturesVisible,
  analyzerVisible,
  profileCount,
  profileState = createDefaultProfileState(),
  userPresets,
  matchedUserPresetName,
  shareUrl,
  shareNotice,
  onPrimaryAction,
  onStop,
  onPresetChange,
  onBandChange,
  onBandReset,
  onBandsReset,
  onMasterChange,
  onStereoWidthChange,
  onAnimationModeChange,
  onAnimationDepthChange,
  onAnimationSpeedChange,
  onAnimationEnergyChange,
  onToggleFutureFeatures,
  onToggleAnalyzer,
  readAnalyzerFrame,
  onResetSound,
  onDeleteProfiles,
  onSaveCalibrationProfile = () => {},
  onSelectCalibrationProfile = () => {},
  onCalibrationModeChange = () => {},
  onDeleteCalibrationProfile = () => {},
  onDuplicateCalibrationProfile = () => {},
  onRenameCalibrationProfile = () => false,
  onImportCalibrationProfile = () => 'Import is unavailable.',
  onGuidedStimulusBand = () => {},
  onGuidedStimulusSilent = () => {},
  onGuidedStimulusEnd = () => {},
  onGuidedAuditionDraft = () => {},
  onGuidedRestoreSavedProfile = () => {},
  onGuidedSave = () => {},
  onSaveUserPreset,
  onLoadUserPreset,
  onDeleteUserPreset,
  onCopyShareUrl,
  onImportShareUrl,
}: GeneratorSurfaceProps) {
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [shareImportDraft, setShareImportDraft] = useState('')
  const primaryActionRef = useRef<HTMLButtonElement>(null)
  const previousAudioStatusRef = useRef(audioSnapshot.status)
  const telemetry = audioSnapshot.telemetry

  useEffect(() => {
    const previousStatus = previousAudioStatusRef.current
    if (previousStatus === 'starting' && audioSnapshot.status !== 'starting') {
      primaryActionRef.current?.focus()
    }
    previousAudioStatusRef.current = audioSnapshot.status
  }, [audioSnapshot.status])
  const modified =
    matchedUserPresetName === null && isModifiedPreset(spectrumState)
  const selectedPreset = GENERATOR_PRESETS.find(
    (preset) => preset.id === spectrumState.targetId,
  )
  const primaryDisabled =
    !engineReady ||
    audioSnapshot.status === 'starting' ||
    audioSnapshot.status === 'unsupported'
  const controlsDisabled = !engineReady
  const highBandDegraded = audioSnapshot.highBandMode === 'degraded-high-shelf'
  const widthLabel = stereoWidthLabel(stereoWidth)
  const widthPercent = Math.round(stereoWidth * 100)
  const targetCorrelation = stereoWidthToCorrelation(stereoWidth)

  const handlePresetChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    if (isPresetId(event.currentTarget.value)) {
      onPresetChange(event.currentTarget.value)
    }
  }

  const handleSavePreset = (): void => {
    if (onSaveUserPreset(presetNameDraft)) {
      setPresetNameDraft('')
    }
  }

  const handleAnimationModeChange = (
    event: ChangeEvent<HTMLSelectElement>,
  ): void => {
    const mode = event.currentTarget.value as AnimationMode
    if (ANIMATION_MODES.includes(mode)) {
      onAnimationModeChange(mode)
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

      <section
        className="transport-card"
        aria-labelledby="audio-status-heading"
      >
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
              ref={primaryActionRef}
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
          Optional live digital spectrum plus runtime diagnostics. Opening this
          panel does not change the sound.
        </p>
        {analyzerVisible ? (
          <div id="analyzer-panel-region">
            <Suspense
              fallback={<p className="status-note">Loading analyzer…</p>}
            >
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
        <div className="section-heading-row">
          <div>
            <p className="label">Spectrum</p>
            <h2 id="spectrum-heading">Ten-band shape</h2>
          </div>
          <div className="preset-state" aria-live="polite">
            <strong>
              {matchedUserPresetName ??
                selectedPreset?.label ??
                spectrumState.targetId}
            </strong>
            {matchedUserPresetName ? (
              <span>Saved preset</span>
            ) : modified ? (
              <span>Modified</span>
            ) : (
              <span>Preset</span>
            )}
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

        <fieldset className="band-scroll">
          <legend className="sr-only">Ten frequency bands</legend>
          <div className="band-bank">
            {GENERATOR_BANDS.map((band) => {
              const valueDb = spectrumState.userBandOffsetsDb[band.index]
              const isHighBand = band.index === GENERATOR_BANDS.length - 1
              return (
                <div
                  className="band-control"
                  data-degraded={
                    isHighBand && highBandDegraded ? 'true' : 'false'
                  }
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
                      onBandChange(
                        band.index,
                        Number(event.currentTarget.value),
                      )
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
        </fieldset>

        {highBandDegraded ? (
          <p className="runtime-note" role="status">
            At {audioSnapshot.sampleRate?.toLocaleString() ?? 'this'} Hz, the
            16k control is a stable high shelf above about 11.3 kHz rather than
            a bounded 16 kHz band.
          </p>
        ) : null}
      </section>

      <section
        className="preset-library-card"
        aria-labelledby="preset-library-heading"
      >
        <div className="section-heading-row">
          <div>
            <p className="label">Library &amp; sharing</p>
            <h2 id="preset-library-heading">Presets &amp; share links</h2>
          </div>
          <span className="profile-count">
            {userPresets.length} saved{' '}
            {userPresets.length === 1 ? 'preset' : 'presets'}
          </span>
        </div>

        <form
          className="preset-save-row"
          onSubmit={(event) => {
            event.preventDefault()
            handleSavePreset()
          }}
        >
          <label htmlFor="user-preset-name">
            Save current sound
            <input
              id="user-preset-name"
              type="text"
              maxLength={USER_PRESET_NAME_MAX_LENGTH}
              value={presetNameDraft}
              disabled={controlsDisabled}
              autoComplete="off"
              onChange={(event) =>
                setPresetNameDraft(event.currentTarget.value)
              }
            />
          </label>
          <button
            className="secondary-action"
            type="submit"
            disabled={controlsDisabled || presetNameDraft.trim().length === 0}
          >
            Save preset
          </button>
        </form>

        {userPresets.length > 0 ? (
          <ul className="saved-preset-list" aria-label="Saved sound presets">
            {userPresets.map((preset) => (
              <li className="saved-preset-item" key={preset.id}>
                <strong className="saved-preset-name">{preset.name}</strong>
                <button
                  className="secondary-action"
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => onLoadUserPreset(preset.id)}
                >
                  Load
                </button>
                <button
                  className="danger-action"
                  type="button"
                  aria-label={`Delete saved preset ${preset.name}`}
                  onClick={() => onDeleteUserPreset(preset.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="status-note">No local sound presets saved yet.</p>
        )}

        <div className="share-copy-row">
          <label htmlFor="share-url">
            Current sound share link
            <input id="share-url" type="text" readOnly value={shareUrl} />
          </label>
          <button
            className="secondary-action"
            type="button"
            disabled={!engineReady || shareUrl.length === 0}
            onClick={onCopyShareUrl}
          >
            Copy share link
          </button>
        </div>

        <form
          className="share-load-row"
          onSubmit={(event) => {
            event.preventDefault()
            onImportShareUrl(shareImportDraft)
          }}
        >
          <label htmlFor="share-import-url">
            Load shared sound URL
            <input
              id="share-import-url"
              type="text"
              value={shareImportDraft}
              disabled={controlsDisabled}
              autoComplete="off"
              onChange={(event) =>
                setShareImportDraft(event.currentTarget.value)
              }
            />
          </label>
          <button
            className="secondary-action"
            type="submit"
            disabled={controlsDisabled || shareImportDraft.trim().length === 0}
          >
            Load shared sound
          </button>
        </form>

        <p className="share-privacy-note">
          Normal share links contain only versioned sound settings. Local preset
          names, playback/calibration profiles, profile notes, and UI
          preferences are excluded. Loading a link never starts audio.
        </p>
        {shareNotice ? (
          <p className="share-notice" role="status">
            {shareNotice}
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
          onChange={(event) =>
            onMasterChange(Number(event.currentTarget.value))
          }
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

      <section className="stereo-card" aria-labelledby="stereo-heading">
        <div className="section-heading-row">
          <div>
            <p className="label">Spatial</p>
            <h2 id="stereo-heading">Stereo width</h2>
          </div>
          <output className="stereo-readout" htmlFor="stereo-width">
            <strong>{widthLabel}</strong>
            <span>{widthPercent}%</span>
          </output>
        </div>
        <label className="sr-only" htmlFor="stereo-width">
          Stereo width
        </label>
        <input
          id="stereo-width"
          className="stereo-range"
          type="range"
          min={STEREO_WIDTH_MIN}
          max={STEREO_WIDTH_MAX}
          step={STEREO_WIDTH_STEP}
          value={stereoWidth}
          disabled={controlsDisabled}
          aria-label={`Stereo width, ${widthLabel}, ${widthPercent} percent`}
          aria-valuetext={`${widthLabel}, ${widthPercent} percent, target correlation ${targetCorrelation.toFixed(3)}`}
          onChange={(event) =>
            onStereoWidthChange(Number(event.currentTarget.value))
          }
        />
        <div className="range-scale" aria-hidden="true">
          <span>Mono</span>
          <span>Normal</span>
          <span>Wide</span>
        </div>
        <div className="stereo-detail-row">
          <span>Target correlation ρ {targetCorrelation.toFixed(3)}</span>
          {audioSnapshot.status === 'running' ? (
            <span>Applied ρ {audioSnapshot.stereoCorrelation.toFixed(3)}</span>
          ) : null}
        </div>
        <p className="status-note">
          Width changes correlation between two deterministic noise streams
          while preserving expected per-channel power. This control does not
          enter an anti-phase region.
        </p>
      </section>

      <section className="future-card" aria-labelledby="future-heading">
        <div className="section-heading-row">
          <div>
            <p className="label">Next layers</p>
            <h2 id="future-heading">Movement &amp; calibration</h2>
          </div>
          <button
            className="secondary-action panel-toggle"
            type="button"
            aria-expanded={futureFeaturesVisible}
            onClick={onToggleFutureFeatures}
          >
            {futureFeaturesVisible
              ? 'Hide roadmap controls'
              : 'Show roadmap controls'}
          </button>
        </div>
        {futureFeaturesVisible ? (
          <div className="future-grid future-grid-two">
            <fieldset
              className="animation-controls"
              disabled={controlsDisabled}
            >
              <legend>Spectral animation</legend>
              <label htmlFor="animation-mode">Mode</label>
              <select
                id="animation-mode"
                value={animation.mode}
                aria-label={`Spectral animation mode, ${animationModeLabel(animation.mode)}`}
                onChange={handleAnimationModeChange}
              >
                {ANIMATION_MODES.map((mode) => (
                  <option value={mode} key={mode}>
                    {animationModeLabel(mode)}
                  </option>
                ))}
              </select>
              <label htmlFor="animation-depth">Depth</label>
              <input
                id="animation-depth"
                type="range"
                min={ANIMATION_DEPTH_MIN_DB}
                max={ANIMATION_DEPTH_MAX_DB}
                step={ANIMATION_DEPTH_STEP_DB}
                value={animation.depthDb}
                aria-label={`Animation depth, ${animation.depthDb.toFixed(1)} dB`}
                aria-valuetext={`${animation.depthDb.toFixed(1)} dB`}
                onChange={(event) =>
                  onAnimationDepthChange(Number(event.currentTarget.value))
                }
              />
              <output htmlFor="animation-depth">
                {animation.depthDb.toFixed(1)} dB
              </output>
              <label htmlFor="animation-speed">Speed</label>
              <input
                id="animation-speed"
                type="range"
                min={ANIMATION_SPEED_MIN}
                max={ANIMATION_SPEED_MAX}
                step={ANIMATION_SPEED_STEP}
                value={animation.speed}
                aria-label={`Animation speed, ${animation.speed.toFixed(2)} times`}
                aria-valuetext={`${animation.speed.toFixed(2)}×`}
                onChange={(event) =>
                  onAnimationSpeedChange(Number(event.currentTarget.value))
                }
              />
              <output htmlFor="animation-speed">
                {animation.speed.toFixed(2)}×
              </output>
              <label className="animation-energy-toggle">
                <input
                  id="animation-energy"
                  type="checkbox"
                  checked={animation.energyPreserving}
                  onChange={(event) =>
                    onAnimationEnergyChange(event.currentTarget.checked)
                  }
                />
                Preserve mean band power
              </label>
              <p>
                Seeded motion is bounded and returns smoothly to the underlying
                spectrum when switched Off.
              </p>
            </fieldset>
            <CalibrationPanel
              profiles={profileState.profiles}
              activeProfileId={profileState.activeProfileId}
              applicationMode={profileState.calibrationMode}
              sampleRate={audioSnapshot.sampleRate}
              audioStatus={audioSnapshot.status}
              guidedSeed={(soundState.seed ^ 0x4341_4c31) >>> 0}
              disabled={controlsDisabled}
              onSave={onSaveCalibrationProfile}
              onSelect={onSelectCalibrationProfile}
              onModeChange={onCalibrationModeChange}
              onDelete={onDeleteCalibrationProfile}
              onDuplicate={onDuplicateCalibrationProfile}
              onRenameNote={onRenameCalibrationProfile}
              onImport={onImportCalibrationProfile}
              onGuidedStimulusBand={onGuidedStimulusBand}
              onGuidedStimulusSilent={onGuidedStimulusSilent}
              onGuidedStimulusEnd={onGuidedStimulusEnd}
              onGuidedAuditionDraft={onGuidedAuditionDraft}
              onGuidedRestoreSavedProfile={onGuidedRestoreSavedProfile}
              onGuidedSave={onGuidedSave}
            />
          </div>
        ) : null}
      </section>

      <section className="state-card" aria-labelledby="local-state-heading">
        <div className="section-heading-row">
          <div>
            <p className="label">Local state</p>
            <h2 id="local-state-heading">Persistence &amp; privacy</h2>
          </div>
          <span className="profile-count">
            {profileCount} private {profileCount === 1 ? 'profile' : 'profiles'}
          </span>
        </div>
        <p className="status-note">
          Sound settings and presentation preferences are stored locally.
          Personal playback/calibration profiles use a separate private storage
          domain and are never deleted by a sound reset.
        </p>
        {storageNotice ? (
          <p className="storage-notice" role="status">
            {storageNotice}
          </p>
        ) : null}
        <div className="state-actions">
          <button
            className="secondary-action"
            type="button"
            disabled={!engineReady}
            onClick={onResetSound}
          >
            Reset sound settings
          </button>
          <button
            className="danger-action"
            type="button"
            disabled={profileCount === 0}
            onClick={onDeleteProfiles}
          >
            Delete local profiles
          </button>
        </div>
      </section>
    </main>
  )
}

export default function App() {
  const engineRef = useRef<AudioEngine | null>(null)
  const repositoryRef = useRef<AppStateRepository | null>(null)
  const [engineReady, setEngineReady] = useState(false)
  const [audioSnapshot, setAudioSnapshot] = useState<AudioEngineSnapshot>(
    INITIAL_AUDIO_SNAPSHOT,
  )
  const [soundState, setSoundState] = useState<SoundState>(() =>
    createDefaultSoundState(),
  )
  const [profileState, setProfileState] = useState<ProfileState>(() =>
    createDefaultProfileState(),
  )
  const [userPresetState, setUserPresetState] =
    useState<UserPresetLibraryState>(() =>
      createDefaultUserPresetLibraryState(),
    )
  const [uiState, setUiState] = useState<UiState>(() => createDefaultUiState())
  const [controlError, setControlError] = useState<string | null>(null)
  const [storageNotice, setStorageNotice] = useState<string | null>(null)
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const [bootShare] = useState(() =>
    typeof globalThis.location === 'undefined'
      ? null
      : parseSoundShareUrl(globalThis.location.href),
  )

  useEffect(() => {
    let cancelled = false
    const repository = createBrowserAppStateRepository()
    repositoryRef.current = repository
    const loaded = repository.load()
    let initialSound = loaded.sound
    setProfileState(loaded.profiles)
    setUserPresetState(loaded.userPresets)
    setUiState(loaded.ui)
    setStorageNotice(diagnosticsNotice(loaded.diagnostics))

    if (bootShare) {
      if (bootShare.state) {
        initialSound = bootShare.state
        const detail =
          bootShare.messages.length > 0
            ? ` ${bootShare.messages.join(' ')}`
            : ''
        setShareNotice(
          `Shared sound loaded. Audio remains Ready until you choose Start.${detail}`,
        )
        if (typeof globalThis.location !== 'undefined') {
          try {
            globalThis.history?.replaceState(
              null,
              '',
              stripSoundShareFragment(globalThis.location.href),
            )
          } catch {
            // URL cleanup is cosmetic; successful import remains authoritative.
          }
        }
      } else if (bootShare.code !== 'absent') {
        setShareNotice(bootShare.messages.join(' '))
      }
    }
    setSoundState(initialSound)

    const engine = createBrowserAudioEngine()
    engineRef.current = engine
    const unsubscribe = engine.subscribe(setAudioSnapshot)
    setAudioSnapshot(engine.getSnapshot())

    const bootstrap = async (): Promise<void> => {
      try {
        await engine.resetSeed(initialSound.seed)
        await engine.setSpectrumState(soundStateToSpectrumState(initialSound))
        await engine.setMasterGainDb(initialSound.masterGainDb)
        await engine.setStereoWidth(initialSound.stereoWidth)
        await engine.setAnimationState(soundStateToAnimationState(initialSound))
        const initialCalibration = findCalibrationProfile(
          loaded.profiles.profiles,
          loaded.profiles.activeProfileId,
        )
        const initialChannelCalibration =
          resolveCalibrationRecordChannelOffsetsDb(
            initialCalibration,
            loaded.profiles.calibrationMode,
          )
        await engine.setCalibrationChannelOffsetsDb(
          initialChannelCalibration.leftBandOffsetsDb,
          initialChannelCalibration.rightBandOffsetsDb,
        )

        if (
          initialSound !== loaded.sound ||
          loaded.diagnostics.some((entry) => entry.code === 'migrated')
        ) {
          const result = repository.saveSound(initialSound)
          if (!result.ok && result.diagnostic && !cancelled) {
            setStorageNotice(result.diagnostic.message)
          }
        }
      } catch (error) {
        if (!cancelled) {
          setControlError(
            `Stored sound state could not be applied: ${errorText(error)}`,
          )
        }
      } finally {
        if (!cancelled) {
          setAudioSnapshot(engine.getSnapshot())
          setEngineReady(true)
        }
      }
    }
    void bootstrap()

    const handleShareHashChange = (): void => {
      if (typeof globalThis.location === 'undefined') {
        return
      }
      const shared = parseSoundShareUrl(globalThis.location.href)
      if (shared.code === 'absent') {
        return
      }
      if (!shared.state) {
        if (!cancelled) {
          setShareNotice(
            shared.messages.join(' ') ||
              'Shared sound payload could not be loaded safely.',
          )
        }
        return
      }

      const next = shared.state
      const detail =
        shared.messages.length > 0 ? ` ${shared.messages.join(' ')}` : ''
      setControlError(null)
      setSoundState(next)
      void Promise.all([
        engine.resetSeed(next.seed),
        engine.setSpectrumState(soundStateToSpectrumState(next)),
        engine.setMasterGainDb(next.masterGainDb),
        engine.setStereoWidth(next.stereoWidth),
        engine.setAnimationState(soundStateToAnimationState(next)),
      ])
        .then(() => {
          if (cancelled) {
            return
          }
          const result = repository.saveSound(next)
          if (!result.ok && result.diagnostic) {
            setStorageNotice(result.diagnostic.message)
          }
          setShareNotice(
            `Shared sound loaded. Loading did not start audio.${detail}`,
          )
          try {
            globalThis.history?.replaceState(
              null,
              '',
              stripSoundShareFragment(globalThis.location.href),
            )
          } catch {
            // URL cleanup is cosmetic; successful import remains authoritative.
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setControlError(
              `Shared sound state could not be applied: ${errorText(error)}`,
            )
          }
        })
    }

    globalThis.addEventListener?.('hashchange', handleShareHashChange)

    return () => {
      cancelled = true
      globalThis.removeEventListener?.('hashchange', handleShareHashChange)
      unsubscribe()
      repositoryRef.current = null
      engineRef.current = null
      void engine.dispose()
    }
  }, [bootShare])

  const reportControlFailure = (error: unknown): void => {
    setControlError(errorText(error))
  }

  const reportPersistenceResult = (result: PersistenceResult): void => {
    if (!result.ok && result.diagnostic) {
      setStorageNotice(
        `${result.diagnostic.message} This session remains usable, but the change may not survive reload.`,
      )
    }
  }

  const persistUserPresets = (next: UserPresetLibraryState): void => {
    const repository = repositoryRef.current
    if (repository) {
      reportPersistenceResult(repository.saveUserPresets(next))
    }
  }

  const persistSound = (next: SoundState): void => {
    const repository = repositoryRef.current
    if (repository) {
      reportPersistenceResult(repository.saveSound(next))
    }
  }

  const persistProfiles = (next: ProfileState): void => {
    const repository = repositoryRef.current
    if (repository) {
      reportPersistenceResult(repository.saveProfiles(next))
    }
  }

  const applyProfileState = (next: ProfileState): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    const active = findCalibrationProfile(next.profiles, next.activeProfileId)
    setControlError(null)
    const offsets = resolveCalibrationRecordChannelOffsetsDb(
      active,
      next.calibrationMode,
    )
    void engine
      .setCalibrationChannelOffsetsDb(
        offsets.leftBandOffsetsDb,
        offsets.rightBandOffsetsDb,
      )
      .then(() => {
        setProfileState(next)
        persistProfiles(next)
      })
      .catch(reportControlFailure)
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

  const commitSpectrumState = (nextSpectrum: SpectrumState): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }

    const next = createSoundState({
      seed: soundState.seed,
      targetId: nextSpectrum.targetId,
      userBandOffsetsDb: nextSpectrum.userBandOffsetsDb,
      masterGainDb: soundState.masterGainDb,
      stereoWidth: soundState.stereoWidth,
      animation: soundState.animation,
    })
    setControlError(null)
    setSoundState(next)
    void engine
      .setSpectrumState(nextSpectrum)
      .then(() => persistSound(next))
      .catch(reportControlFailure)
  }

  const handlePresetChange = (targetId: SpectralPresetId): void => {
    commitSpectrumState(applyNamedPreset(targetId))
  }

  const spectrumState = soundStateToSpectrumState(soundState)

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
    const next = createSoundState({
      seed: soundState.seed,
      targetId: soundState.targetId,
      userBandOffsetsDb: soundState.userBandOffsetsDb,
      masterGainDb: valueDb,
      stereoWidth: soundState.stereoWidth,
      animation: soundState.animation,
    })
    setControlError(null)
    void engine
      .setMasterGainDb(valueDb)
      .then(() => {
        setSoundState(next)
        persistSound(next)
      })
      .catch(reportControlFailure)
  }

  const handleStereoWidthChange = (width: number): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    const next = createSoundState({
      seed: soundState.seed,
      targetId: soundState.targetId,
      userBandOffsetsDb: soundState.userBandOffsetsDb,
      masterGainDb: soundState.masterGainDb,
      stereoWidth: width,
      animation: soundState.animation,
    })
    setControlError(null)
    setSoundState(next)
    void engine
      .setStereoWidth(width)
      .then(() => persistSound(next))
      .catch(reportControlFailure)
  }

  const commitAnimationState = (animation: AnimationState): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    const next = createSoundState({
      seed: soundState.seed,
      targetId: soundState.targetId,
      userBandOffsetsDb: soundState.userBandOffsetsDb,
      masterGainDb: soundState.masterGainDb,
      stereoWidth: soundState.stereoWidth,
      animation,
    })
    setControlError(null)
    setSoundState(next)
    void engine
      .setAnimationState(animation)
      .then(() => persistSound(next))
      .catch(reportControlFailure)
  }

  const handleAnimationModeChange = (mode: AnimationMode): void => {
    commitAnimationState(
      createAnimationState(
        mode,
        soundState.animation.seed,
        soundState.animation.depthDb,
        soundState.animation.speed,
        soundState.animation.energyPreserving,
      ),
    )
  }

  const handleAnimationDepthChange = (depthDb: number): void => {
    commitAnimationState(
      createAnimationState(
        soundState.animation.mode,
        soundState.animation.seed,
        depthDb,
        soundState.animation.speed,
        soundState.animation.energyPreserving,
      ),
    )
  }

  const handleAnimationSpeedChange = (speed: number): void => {
    commitAnimationState(
      createAnimationState(
        soundState.animation.mode,
        soundState.animation.seed,
        soundState.animation.depthDb,
        speed,
        soundState.animation.energyPreserving,
      ),
    )
  }

  const handleAnimationEnergyChange = (enabled: boolean): void => {
    commitAnimationState(
      createAnimationState(
        soundState.animation.mode,
        soundState.animation.seed,
        soundState.animation.depthDb,
        soundState.animation.speed,
        enabled,
      ),
    )
  }

  const applySoundSnapshot = (next: SoundState, notice: string): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    setControlError(null)
    setSoundState(next)
    void Promise.all([
      engine.resetSeed(next.seed),
      engine.setSpectrumState(soundStateToSpectrumState(next)),
      engine.setMasterGainDb(next.masterGainDb),
      engine.setStereoWidth(next.stereoWidth),
      engine.setAnimationState(soundStateToAnimationState(next)),
    ])
      .then(() => {
        persistSound(next)
        setShareNotice(notice)
      })
      .catch(reportControlFailure)
  }

  const handleSaveUserPreset = (name: string): boolean => {
    try {
      const saved = saveUserSoundPreset(userPresetState, name, soundState)
      setUserPresetState(saved.state)
      persistUserPresets(saved.state)
      setShareNotice(`Saved local sound preset “${saved.preset.name}”.`)
      return true
    } catch (error) {
      setShareNotice(errorText(error))
      return false
    }
  }

  const handleLoadUserPreset = (id: string): void => {
    const preset = findUserSoundPreset(userPresetState, id)
    if (!preset) {
      setShareNotice('That saved preset is no longer available.')
      return
    }
    applySoundSnapshot(
      preset.sound,
      `Loaded local sound preset “${preset.name}”. Loading did not start audio.`,
    )
  }

  const handleDeleteUserPreset = (id: string): void => {
    const preset = findUserSoundPreset(userPresetState, id)
    const next = deleteUserSoundPreset(userPresetState, id)
    setUserPresetState(next)
    persistUserPresets(next)
    if (preset) {
      setShareNotice(`Deleted local sound preset “${preset.name}”.`)
    }
  }

  const handleCopyShareUrl = (): void => {
    if (typeof globalThis.location === 'undefined') {
      return
    }
    const url = createSoundShareUrl(globalThis.location.href, soundState)
    const clipboard = globalThis.navigator?.clipboard
    if (!clipboard?.writeText) {
      setShareNotice(
        'Clipboard access is unavailable. Select and copy the visible share link manually.',
      )
      return
    }
    void clipboard
      .writeText(url)
      .then(() =>
        setShareNotice('Share link copied. It contains sound settings only.'),
      )
      .catch(() =>
        setShareNotice(
          'Clipboard write was blocked. Select and copy the visible share link manually.',
        ),
      )
  }

  const handleImportShareUrl = (href: string): void => {
    if (typeof globalThis.location === 'undefined') {
      return
    }
    const parsed = parseSoundShareUrl(href, globalThis.location.href)
    if (!parsed.state) {
      setShareNotice(
        parsed.messages.join(' ') ||
          'No shared sound payload was found in that URL.',
      )
      return
    }
    const detail =
      parsed.messages.length > 0 ? ` ${parsed.messages.join(' ')}` : ''
    applySoundSnapshot(
      parsed.state,
      `Shared sound loaded. Loading did not start audio.${detail}`,
    )
  }

  const handleToggleFutureFeatures = (): void => {
    const next = createUiState(
      !uiState.futureFeaturesVisible,
      uiState.analyzerVisible,
    )
    setUiState(next)
    const repository = repositoryRef.current
    if (repository) {
      reportPersistenceResult(repository.saveUi(next))
    }
  }

  const handleToggleAnalyzer = (): void => {
    const next = createUiState(
      uiState.futureFeaturesVisible,
      !uiState.analyzerVisible,
    )
    setUiState(next)
    const repository = repositoryRef.current
    if (repository) {
      reportPersistenceResult(repository.saveUi(next))
    }
  }

  const handleResetSound = (): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    const next = createDefaultSoundState()
    setControlError(null)
    setSoundState(next)
    void Promise.all([
      engine.resetSeed(next.seed),
      engine.setSpectrumState(soundStateToSpectrumState(next)),
      engine.setMasterGainDb(next.masterGainDb),
      engine.setStereoWidth(next.stereoWidth),
      engine.setAnimationState(soundStateToAnimationState(next)),
    ])
      .then(() => {
        const repository = repositoryRef.current
        if (repository) {
          reportPersistenceResult(repository.resetSound())
        }
      })
      .catch(reportControlFailure)
  }

  const restoreSavedCalibration = (): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    const active = findCalibrationProfile(
      profileState.profiles,
      profileState.activeProfileId,
    )
    const offsets = resolveCalibrationRecordChannelOffsetsDb(
      active,
      profileState.calibrationMode,
    )
    setControlError(null)
    void engine
      .setCalibrationChannelOffsetsDb(
        offsets.leftBandOffsetsDb,
        offsets.rightBandOffsetsDb,
      )
      .catch(reportControlFailure)
  }

  const handleGuidedStimulusBand = (
    bandIndex: number,
    levelOffsetDb: number,
    channel: CalibrationStimulusChannel,
  ): void => {
    setControlError(null)
    void engineRef.current
      ?.setCalibrationStimulusBand(bandIndex, levelOffsetDb, channel)
      .catch(reportControlFailure)
  }

  const handleGuidedStimulusSilent = (): void => {
    setControlError(null)
    void engineRef.current
      ?.silenceCalibrationStimulus()
      .catch(reportControlFailure)
  }

  const handleGuidedStimulusEnd = (): void => {
    setControlError(null)
    void engineRef.current?.endCalibrationStimulus().catch(reportControlFailure)
  }

  const handleGuidedAuditionDraft = (
    draft: GuidedCalibrationAuditionDraft,
    mode: CalibrationApplicationMode,
  ): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    try {
      const profile = createCalibrationProfilePayload({
        sampleRateHz: audioSnapshot.sampleRate,
        referenceBandIndex: draft.referenceBandIndex,
        channelMode: draft.channelMode,
        leftRawBandOffsetsDb: draft.leftRawBandOffsetsDb,
        rightRawBandOffsetsDb: draft.rightRawBandOffsetsDb,
      })
      const offsets = resolveCalibrationChannelOffsetsDb(profile, mode)
      setControlError(null)
      void Promise.all([
        engine.endCalibrationStimulus(),
        engine.setCalibrationChannelOffsetsDb(
          offsets.leftBandOffsetsDb,
          offsets.rightBandOffsetsDb,
        ),
      ]).catch(reportControlFailure)
    } catch (error) {
      reportControlFailure(error)
    }
  }

  const handleGuidedSave = (draft: GuidedCalibrationSaveDraft): void => {
    let suffix = profileState.profiles.length + 1
    let id = `calibration-${suffix}`
    while (profileState.profiles.some((profile) => profile.id === id)) {
      suffix += 1
      id = `calibration-${suffix}`
    }
    try {
      const record = createCalibrationProfileRecord({
        id,
        name: draft.name,
        sampleRateHz: audioSnapshot.sampleRate,
        referenceBandIndex: draft.referenceBandIndex,
        channelMode: draft.channelMode,
        leftRawBandOffsetsDb: draft.leftRawBandOffsetsDb,
        rightRawBandOffsetsDb: draft.rightRawBandOffsetsDb,
        note: draft.note,
        measurement: draft.linkedMeasurement,
        leftMeasurement: draft.leftMeasurement,
        rightMeasurement: draft.rightMeasurement,
      })
      handleGuidedStimulusEnd()
      applyProfileState(
        createProfileState(
          [...profileState.profiles, record],
          record.id,
          'balanced',
        ),
      )
    } catch (error) {
      setControlError(errorText(error))
    }
  }

  const handleSaveCalibrationProfile = (draft: CalibrationDraft): void => {
    let suffix = profileState.profiles.length + 1
    let id = `calibration-${suffix}`
    while (profileState.profiles.some((profile) => profile.id === id)) {
      suffix += 1
      id = `calibration-${suffix}`
    }
    try {
      const record = createCalibrationProfileRecord({
        id,
        name: draft.name,
        sampleRateHz: audioSnapshot.sampleRate,
        referenceBandIndex: draft.referenceBandIndex,
        channelMode: draft.channelMode,
        leftRawBandOffsetsDb: draft.leftRawBandOffsetsDb,
        rightRawBandOffsetsDb: draft.rightRawBandOffsetsDb,
        note: draft.note,
      })
      applyProfileState(
        createProfileState(
          [...profileState.profiles, record],
          record.id,
          'balanced',
        ),
      )
    } catch (error) {
      setControlError(errorText(error))
    }
  }

  const handleSelectCalibrationProfile = (id: string | null): void => {
    applyProfileState(
      createProfileState(
        profileState.profiles,
        id,
        id === null ? 'off' : 'balanced',
      ),
    )
  }

  const handleCalibrationModeChange = (
    mode: CalibrationApplicationMode,
  ): void => {
    applyProfileState(
      createProfileState(
        profileState.profiles,
        profileState.activeProfileId,
        mode,
      ),
    )
  }

  const nextCalibrationProfileId = (): string => {
    let suffix = profileState.profiles.length + 1
    let id = `calibration-${suffix}`
    while (profileState.profiles.some((profile) => profile.id === id)) {
      suffix += 1
      id = `calibration-${suffix}`
    }
    return id
  }

  const handleRenameCalibrationProfile = (
    id: string,
    name: string,
    note: string,
  ): boolean => {
    const existing = profileState.profiles.find((profile) => profile.id === id)
    if (!existing) {
      setControlError('That calibration profile is no longer available.')
      return false
    }
    try {
      const replacement = updateCalibrationProfileMetadata(existing, {
        name,
        note,
      })
      const next = createProfileState(
        profileState.profiles.map((profile) =>
          profile.id === id ? replacement : profile,
        ),
        profileState.activeProfileId,
        profileState.calibrationMode,
      )
      setProfileState(next)
      persistProfiles(next)
      setControlError(null)
      return true
    } catch (error) {
      setControlError(errorText(error))
      return false
    }
  }

  const handleDuplicateCalibrationProfile = (id: string): void => {
    const existing = profileState.profiles.find((profile) => profile.id === id)
    if (!existing) {
      return
    }
    try {
      const duplicate = duplicateCalibrationProfileRecord(
        existing,
        nextCalibrationProfileId(),
      )
      const next = createProfileState(
        [...profileState.profiles, duplicate],
        profileState.activeProfileId,
        profileState.calibrationMode,
      )
      setProfileState(next)
      persistProfiles(next)
      setControlError(null)
    } catch (error) {
      setControlError(errorText(error))
    }
  }

  const handleImportCalibrationProfile = (raw: string): string => {
    const result = parseCalibrationProfileExport(
      raw,
      nextCalibrationProfileId(),
    )
    if (!result.record) {
      return result.messages.join(' ') || 'Personal calibration import failed.'
    }
    const next = createProfileState(
      [...profileState.profiles, result.record],
      profileState.activeProfileId,
      profileState.calibrationMode,
    )
    setProfileState(next)
    persistProfiles(next)
    return `Imported “${result.record.name}” locally. It was not selected and audio was not started.`
  }

  const handleDeleteCalibrationProfile = (id: string): void => {
    const profiles = profileState.profiles.filter(
      (profile) => profile.id !== id,
    )
    const deletingActive = profileState.activeProfileId === id
    applyProfileState(
      createProfileState(
        profiles,
        deletingActive ? null : profileState.activeProfileId,
        deletingActive ? 'off' : profileState.calibrationMode,
      ),
    )
  }

  const handleDeleteProfiles = (): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    const next = createDefaultProfileState()
    setControlError(null)
    const neutral = resolveCalibrationRecordChannelOffsetsDb(null, 'off')
    void engine
      .setCalibrationChannelOffsetsDb(
        neutral.leftBandOffsetsDb,
        neutral.rightBandOffsetsDb,
      )
      .then(() => {
        setProfileState(next)
        const repository = repositoryRef.current
        if (repository) {
          reportPersistenceResult(repository.deleteProfiles())
        }
      })
      .catch(reportControlFailure)
  }

  const readAnalyzerFrame = useCallback(
    (): AnalyzerSpectrumFrame | null =>
      engineRef.current?.readAnalyzerFrame() ?? null,
    [],
  )

  const matchingUserPreset = findMatchingUserSoundPreset(
    userPresetState,
    soundState,
  )
  const shareUrl =
    typeof globalThis.location === 'undefined'
      ? ''
      : createSoundShareUrl(globalThis.location.href, soundState)

  return (
    <GeneratorSurface
      audioSnapshot={audioSnapshot}
      spectrumState={spectrumState}
      soundState={soundState}
      stereoWidth={soundState.stereoWidth}
      animation={soundState.animation}
      engineReady={engineReady}
      controlError={controlError}
      storageNotice={storageNotice}
      futureFeaturesVisible={uiState.futureFeaturesVisible}
      analyzerVisible={uiState.analyzerVisible}
      profileCount={profileState.profiles.length}
      profileState={profileState}
      userPresets={userPresetState.presets}
      matchedUserPresetName={matchingUserPreset?.name ?? null}
      shareUrl={shareUrl}
      shareNotice={shareNotice}
      onPrimaryAction={handlePrimaryAction}
      onStop={handleStop}
      onPresetChange={handlePresetChange}
      onBandChange={handleBandChange}
      onBandReset={handleBandReset}
      onBandsReset={handleBandsReset}
      onMasterChange={handleMasterChange}
      onStereoWidthChange={handleStereoWidthChange}
      onAnimationModeChange={handleAnimationModeChange}
      onAnimationDepthChange={handleAnimationDepthChange}
      onAnimationSpeedChange={handleAnimationSpeedChange}
      onAnimationEnergyChange={handleAnimationEnergyChange}
      onToggleFutureFeatures={handleToggleFutureFeatures}
      onToggleAnalyzer={handleToggleAnalyzer}
      readAnalyzerFrame={readAnalyzerFrame}
      onResetSound={handleResetSound}
      onDeleteProfiles={handleDeleteProfiles}
      onSaveCalibrationProfile={handleSaveCalibrationProfile}
      onSelectCalibrationProfile={handleSelectCalibrationProfile}
      onCalibrationModeChange={handleCalibrationModeChange}
      onDeleteCalibrationProfile={handleDeleteCalibrationProfile}
      onDuplicateCalibrationProfile={handleDuplicateCalibrationProfile}
      onRenameCalibrationProfile={handleRenameCalibrationProfile}
      onImportCalibrationProfile={handleImportCalibrationProfile}
      onGuidedStimulusBand={handleGuidedStimulusBand}
      onGuidedStimulusSilent={handleGuidedStimulusSilent}
      onGuidedStimulusEnd={handleGuidedStimulusEnd}
      onGuidedAuditionDraft={handleGuidedAuditionDraft}
      onGuidedRestoreSavedProfile={restoreSavedCalibration}
      onGuidedSave={handleGuidedSave}
      onSaveUserPreset={handleSaveUserPreset}
      onLoadUserPreset={handleLoadUserPreset}
      onDeleteUserPreset={handleDeleteUserPreset}
      onCopyShareUrl={handleCopyShareUrl}
      onImportShareUrl={handleImportShareUrl}
    />
  )
}
