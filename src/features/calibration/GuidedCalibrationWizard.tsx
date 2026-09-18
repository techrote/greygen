import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { AudioEngineStatus } from '../../audio/AudioEngine'
import type { CalibrationStimulusChannel } from '../../audio/dsp/calibrationStimulus'
import { NOMINAL_BAND_CENTERS_HZ } from '../../audio/dsp/filterBank'
import type { CalibrationApplicationMode } from '../../app/state/appState'
import {
  CALIBRATION_PROFILE_NAME_MAX_LENGTH,
  CALIBRATION_PROFILE_NOTE_MAX_LENGTH,
  type CalibrationChannelMode,
  type CalibrationMeasurementMetadata,
} from './calibrationProfile'
import {
  activeGuidedCalibrationState,
  createGuidedChannelCalibrationState,
  guidedChannelCalibrationResult,
  guidedChannelOverallProgress,
  retestGuidedChannelBand,
  skipGuidedChannelBand,
  submitGuidedChannelJudgement,
  type GuidedCalibrationChannel,
  type GuidedChannelCalibrationResult,
  type GuidedChannelCalibrationState,
} from './guidedChannelCalibration'
import {
  type CalibrationJudgement,
  currentGuidedCalibrationCorrectionDb,
} from './guidedCalibration'

export interface GuidedCalibrationAuditionDraft {
  readonly referenceBandIndex: number
  readonly channelMode: CalibrationChannelMode
  readonly leftRawBandOffsetsDb: readonly (number | null)[]
  readonly rightRawBandOffsetsDb: readonly (number | null)[]
}

export interface GuidedCalibrationSaveDraft
  extends GuidedCalibrationAuditionDraft {
  readonly name: string
  readonly note: string
  readonly linkedMeasurement: CalibrationMeasurementMetadata | null
  readonly leftMeasurement: CalibrationMeasurementMetadata | null
  readonly rightMeasurement: CalibrationMeasurementMetadata | null
}

export interface GuidedCalibrationWizardProps {
  readonly audioStatus: AudioEngineStatus
  readonly seed: number
  readonly disabled: boolean
  readonly onStimulusBand: (
    bandIndex: number,
    levelOffsetDb: number,
    channel: CalibrationStimulusChannel,
  ) => void
  readonly onStimulusSilent: () => void
  readonly onStimulusEnd: () => void
  readonly onAuditionDraft: (
    draft: GuidedCalibrationAuditionDraft,
    mode: CalibrationApplicationMode,
  ) => void
  readonly onRestoreSavedProfile: () => void
  readonly onSave: (draft: GuidedCalibrationSaveDraft) => void
}

function frequencyLabel(value: number): string {
  return value >= 1000 ? `${value / 1000} kHz` : `${Math.floor(value)} Hz`
}

function formatCorrection(value: number | null): string {
  if (value === null) {
    return 'Skipped'
  }
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)} dB`
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

function channelLabel(channel: GuidedCalibrationChannel): string {
  switch (channel) {
    case 'linked':
      return 'Linked / both channels'
    case 'left':
      return 'Left channel only'
    case 'right':
      return 'Right channel only'
  }
}

function stimulusChannel(
  channel: GuidedCalibrationChannel,
): CalibrationStimulusChannel {
  return channel === 'linked' ? 'both' : channel
}

function auditionDraft(
  result: GuidedChannelCalibrationResult,
): GuidedCalibrationAuditionDraft {
  return {
    referenceBandIndex: result.referenceBandIndex,
    channelMode: result.mode,
    leftRawBandOffsetsDb: result.leftRawBandOffsetsDb,
    rightRawBandOffsetsDb: result.rightRawBandOffsetsDb,
  }
}

export default function GuidedCalibrationWizard({
  audioStatus,
  seed,
  disabled,
  onStimulusBand,
  onStimulusSilent,
  onStimulusEnd,
  onAuditionDraft,
  onRestoreSavedProfile,
  onSave,
}: GuidedCalibrationWizardProps) {
  const introRegionRef = useRef<HTMLElement>(null)
  const activeRegionRef = useRef<HTMLElement>(null)
  const previousWizardActiveRef = useRef(false)
  const previousPhaseRef = useRef<GuidedChannelCalibrationState['phase'] | null>(
    null,
  )
  const [comfortableConfirmed, setComfortableConfirmed] = useState(false)
  const [channelMode, setChannelMode] =
    useState<CalibrationChannelMode>('linked')
  const [wizard, setWizard] = useState<GuidedChannelCalibrationState | null>(
    null,
  )
  const [heardReference, setHeardReference] = useState(false)
  const [heardTest, setHeardTest] = useState(false)
  const [lastAudition, setLastAudition] = useState<'reference' | 'test' | null>(
    null,
  )
  const [auditionMode, setAuditionMode] =
    useState<CalibrationApplicationMode>('off')
  const [profileName, setProfileName] = useState('')
  const [profileNote, setProfileNote] = useState('')

  useEffect(() => {
    const wasActive = previousWizardActiveRef.current
    const isActive = wizard !== null
    const previousPhase = previousPhaseRef.current
    const nextPhase = wizard?.phase ?? null

    if (isActive && (!wasActive || previousPhase !== nextPhase)) {
      activeRegionRef.current?.focus()
    } else if (!isActive && wasActive) {
      introRegionRef.current?.focus()
    }

    previousWizardActiveRef.current = isActive
    previousPhaseRef.current = nextPhase
  }, [wizard])

  const resetAuditionFlags = (): void => {
    setHeardReference(false)
    setHeardTest(false)
    setLastAudition(null)
  }

  const start = (): void => {
    if (!comfortableConfirmed || audioStatus !== 'running' || disabled) {
      return
    }
    onStimulusSilent()
    setWizard(createGuidedChannelCalibrationState(seed, channelMode))
    setAuditionMode('off')
    setProfileName('')
    setProfileNote('')
    resetAuditionFlags()
  }

  const abort = (): void => {
    onStimulusEnd()
    onRestoreSavedProfile()
    setWizard(null)
    setAuditionMode('off')
    setProfileName('')
    setProfileNote('')
    setComfortableConfirmed(false)
    resetAuditionFlags()
  }

  const enterReviewIfNeeded = (next: GuidedChannelCalibrationState): void => {
    if (next.phase !== 'review') {
      return
    }
    const result = guidedChannelCalibrationResult(next)
    onStimulusEnd()
    onAuditionDraft(auditionDraft(result), 'off')
    setAuditionMode('off')
  }

  const submitJudgement = (judgement: CalibrationJudgement): void => {
    const active = wizard ? activeGuidedCalibrationState(wizard) : null
    if (
      !wizard ||
      active?.stage !== 'matching' ||
      !heardReference ||
      !heardTest
    ) {
      return
    }
    onStimulusSilent()
    const next = submitGuidedChannelJudgement(wizard, judgement)
    setWizard(next)
    resetAuditionFlags()
    enterReviewIfNeeded(next)
  }

  const skip = (): void => {
    const active = wizard ? activeGuidedCalibrationState(wizard) : null
    if (!wizard || active?.stage !== 'matching') {
      return
    }
    onStimulusSilent()
    const next = skipGuidedChannelBand(wizard)
    setWizard(next)
    resetAuditionFlags()
    enterReviewIfNeeded(next)
  }

  const alternateStimulus = (): void => {
    if (!wizard || wizard.phase === 'review' || audioStatus !== 'running') {
      return
    }
    const active = activeGuidedCalibrationState(wizard)
    if (!active?.current) {
      return
    }
    const channel = stimulusChannel(wizard.phase)
    if (lastAudition === 'reference') {
      const correction = currentGuidedCalibrationCorrectionDb(active) ?? 0
      onStimulusBand(active.current.bandIndex, correction, channel)
      setHeardTest(true)
      setLastAudition('test')
      return
    }
    onStimulusBand(active.referenceBandIndex, 0, channel)
    setHeardReference(true)
    setLastAudition('reference')
  }

  const silence = (): void => {
    if (!wizard || wizard.phase === 'review') {
      return
    }
    onStimulusSilent()
    setLastAudition(null)
  }

  const startRetest = (
    channel: GuidedCalibrationChannel,
    bandIndex: number,
  ): void => {
    if (wizard?.phase !== 'review') {
      return
    }
    onRestoreSavedProfile()
    onStimulusSilent()
    setWizard(retestGuidedChannelBand(wizard, channel, bandIndex))
    setAuditionMode('off')
    resetAuditionFlags()
  }

  const changeAuditionMode = (mode: CalibrationApplicationMode): void => {
    if (wizard?.phase !== 'review') {
      return
    }
    const result = guidedChannelCalibrationResult(wizard)
    onAuditionDraft(auditionDraft(result), mode)
    setAuditionMode(mode)
  }

  const save = (): void => {
    if (wizard?.phase !== 'review' || profileName.trim().length === 0) {
      return
    }
    const result = guidedChannelCalibrationResult(wizard)
    onStimulusEnd()
    onSave({
      ...auditionDraft(result),
      name: profileName,
      note: profileNote,
      linkedMeasurement:
        result.linkedMeasurement as CalibrationMeasurementMetadata | null,
      leftMeasurement:
        result.leftMeasurement as CalibrationMeasurementMetadata | null,
      rightMeasurement:
        result.rightMeasurement as CalibrationMeasurementMetadata | null,
    })
    setWizard(null)
    setAuditionMode('off')
    setProfileName('')
    setProfileNote('')
    setComfortableConfirmed(false)
    resetAuditionFlags()
  }

  const handleKeyboard = (event: KeyboardEvent<HTMLElement>): void => {
    if (!wizard) {
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      abort()
      return
    }
    if (isTextEntryTarget(event.target) || wizard.phase === 'review') {
      return
    }
    if (event.key === ' ') {
      event.preventDefault()
      alternateStimulus()
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault()
      silence()
    } else if (event.key.toLowerCase() === 'k') {
      event.preventDefault()
      skip()
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      submitJudgement('quieter')
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      submitJudgement('equal')
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      submitJudgement('louder')
    }
  }

  if (!wizard) {
    return (
      <section
        ref={introRegionRef}
        className="guided-calibration"
        aria-labelledby="guided-heading"
        tabIndex={-1}
      >
        <h4 id="guided-heading">Guided perceived-level calibration</h4>
        <p>
          Match narrow-band noise against a 1 kHz reference. Results describe
          your current listener + playback chain; this is not a medical hearing
          test or an acoustic level measurement.
        </p>
        <fieldset className="calibration-channel-mode" disabled={disabled}>
          <legend>Channel mode</legend>
          <label>
            <input
              type="radio"
              name="guided-channel-mode"
              value="linked"
              checked={channelMode === 'linked'}
              onChange={() => setChannelMode('linked')}
            />
            Linked / symmetric
          </label>
          <label>
            <input
              type="radio"
              name="guided-channel-mode"
              value="independent"
              checked={channelMode === 'independent'}
              onChange={() => setChannelMode('independent')}
            />
            Independent left / right
          </label>
        </fieldset>
        <p className="status-note">
          Independent mode measures each playback channel separately. A left /
          right difference may come from the listener, transducer, fit,
          coupling, room, or device and is not interpreted as hearing loss.
          Linked mode is always available as the conservative fallback.
        </p>
        <ul className="calibration-safety-list">
          <li>Set a comfortable listening level before beginning.</li>
          <li>
            Skip anything you cannot comfortably match; never turn the system up
            aggressively to force an inaudible band to appear.
          </li>
          <li>
            The 31 Hz and 16 kHz regions can be limited by playback hardware,
            coupling, room, or listener factors.
          </li>
        </ul>
        <label className="calibration-comfort-check">
          <input
            id="calibration-comfort-confirm"
            type="checkbox"
            checked={comfortableConfirmed}
            disabled={disabled || audioStatus !== 'running'}
            onChange={(event) =>
              setComfortableConfirmed(event.currentTarget.checked)
            }
          />
          I have set a comfortable overall listening level.
        </label>
        <button
          type="button"
          className="primary-action"
          disabled={
            disabled || audioStatus !== 'running' || !comfortableConfirmed
          }
          onClick={start}
        >
          Begin guided calibration
        </button>
        {audioStatus !== 'running' ? (
          <p className="status-note">
            Start audio first, set the master/device level comfortably, then
            confirm above. The wizard never starts audio or raises master level
            for you.
          </p>
        ) : null}
      </section>
    )
  }

  const progress = guidedChannelOverallProgress(wizard)
  const active = activeGuidedCalibrationState(wizard)

  if (
    wizard.phase !== 'review' &&
    active?.stage === 'matching' &&
    active.current
  ) {
    const correction = currentGuidedCalibrationCorrectionDb(active) ?? 0
    const frequency = NOMINAL_BAND_CENTERS_HZ[active.current.bandIndex]
    const extreme =
      active.current.bandIndex === 0 ||
      active.current.bandIndex === NOMINAL_BAND_CENTERS_HZ.length - 1
    const canJudge = heardReference && heardTest
    return (
      <section
        ref={activeRegionRef}
        id="guided-keyboard-control"
        className="guided-calibration guided-calibration-active"
        aria-labelledby="guided-heading"
        aria-describedby="guided-keyboard-help"
        data-channel={wizard.phase}
        tabIndex={-1}
        onKeyDown={handleKeyboard}
      >
        <div className="section-heading-row">
          <div>
            <p className="label">
              {channelLabel(wizard.phase)} · Match{' '}
              {Math.min(progress.completed + 1, progress.total)} of{' '}
              {progress.total}
            </p>
            <h4 id="guided-heading">{frequencyLabel(frequency)} test band</h4>
          </div>
          <output aria-live="polite" aria-atomic="true">
            {formatCorrection(correction)}
          </output>
        </div>
        <p>
          Space alternates reference/test in{' '}
          {channelLabel(wizard.phase).toLowerCase()}. After hearing both, choose
          how the test sounds relative to the 1 kHz reference. The probe is
          bounded to ±24 dB and master is never changed automatically.
        </p>
        {extreme ? (
          <p className="calibration-caveat" role="note">
            This extreme band is especially sensitive to hardware, coupling,
            room, and listener limits. Skip it rather than increasing overall
            volume aggressively.
          </p>
        ) : null}
        <div className="calibration-audition-row">
          <button
            type="button"
            className="primary-action"
            disabled={audioStatus !== 'running'}
            onClick={alternateStimulus}
          >
            {lastAudition === 'reference'
              ? `Hear test ${frequencyLabel(frequency)}`
              : 'Hear 1 kHz reference'}
          </button>
          <button type="button" className="secondary-action" onClick={silence}>
            Silence calibration
          </button>
        </div>
        <p className="status-note" aria-live="polite" aria-atomic="true">
          Heard reference: {heardReference ? 'yes' : 'no'} · Heard test:{' '}
          {heardTest ? 'yes' : 'no'}
        </p>
        <div className="calibration-judgement-row">
          <button
            type="button"
            className="secondary-action"
            disabled={!canJudge}
            onClick={() => submitJudgement('quieter')}
          >
            Test is quieter
          </button>
          <button
            type="button"
            className="secondary-action"
            disabled={!canJudge}
            onClick={() => submitJudgement('equal')}
          >
            About equal
          </button>
          <button
            type="button"
            className="secondary-action"
            disabled={!canJudge}
            onClick={() => submitJudgement('louder')}
          >
            Test is louder
          </button>
        </div>
        <div className="calibration-exit-row">
          <button type="button" className="secondary-action" onClick={skip}>
            Skip / cannot comfortably match
          </button>
          <button type="button" className="danger-action" onClick={abort}>
            Abort calibration
          </button>
        </div>
        <p className="status-note" id="guided-keyboard-help">
          Keyboard: Space alternate · ← quieter · ↓ equal · → louder · K skip ·
          S silence · Esc abort.
        </p>
      </section>
    )
  }

  const result = guidedChannelCalibrationResult(wizard)
  const leftResults = new Map(
    wizard.mode === 'linked'
      ? wizard.linked?.results.map((entry) => [entry.bandIndex, entry])
      : wizard.left?.results.map((entry) => [entry.bandIndex, entry]),
  )
  const rightResults = new Map(
    wizard.right?.results.map((entry) => [entry.bandIndex, entry]) ?? [],
  )

  return (
    <section
      ref={activeRegionRef}
      className="guided-calibration guided-calibration-active"
      aria-labelledby="guided-heading"
      tabIndex={-1}
      onKeyDown={handleKeyboard}
    >
      <div className="section-heading-row">
        <div>
          <p className="label">Review before saving</p>
          <h4 id="guided-heading">Guided calibration result</h4>
        </div>
        <span>{result.mode === 'linked' ? 'Linked' : 'Independent L/R'}</span>
      </div>
      <p>
        These are relative digital corrections from this listener + playback
        chain. Skipped bands remain unknown and will not be fabricated. L/R
        asymmetry is not a diagnosis. Nothing is saved until you explicitly save
        below.
      </p>
      <ul className="calibration-review-grid">
        {NOMINAL_BAND_CENTERS_HZ.map((frequency, bandIndex) => {
          const isReference = bandIndex === result.referenceBandIndex
          const leftEvidence = leftResults.get(bandIndex)
          const rightEvidence = rightResults.get(bandIndex)
          return (
            <li className="calibration-review-band" key={frequency}>
              <strong>{frequencyLabel(frequency)}</strong>
              {result.mode === 'linked' ? (
                <span>
                  {formatCorrection(result.leftRawBandOffsetsDb[bandIndex])}
                </span>
              ) : (
                <span>
                  L {formatCorrection(result.leftRawBandOffsetsDb[bandIndex])} ·
                  R {formatCorrection(result.rightRawBandOffsetsDb[bandIndex])}
                </span>
              )}
              <small>
                {isReference
                  ? 'Reference'
                  : result.mode === 'linked'
                    ? `${leftEvidence?.confidence ?? 'unknown'} confidence · ${leftEvidence?.retests ?? 0} retests`
                    : `L ${leftEvidence?.confidence ?? 'unknown'} · R ${rightEvidence?.confidence ?? 'unknown'}`}
              </small>
              {!isReference ? (
                <div className="calibration-review-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() =>
                      startRetest(
                        result.mode === 'linked' ? 'linked' : 'left',
                        bandIndex,
                      )
                    }
                  >
                    Retest {result.mode === 'linked' ? '' : 'L'}
                  </button>
                  {result.mode === 'independent' ? (
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => startRetest('right', bandIndex)}
                    >
                      Retest R
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      <label htmlFor="guided-audition-mode">
        Audition unsaved result
        <select
          id="guided-audition-mode"
          value={auditionMode}
          onChange={(event) =>
            changeAuditionMode(
              event.currentTarget.value as CalibrationApplicationMode,
            )
          }
        >
          <option value="off">Off</option>
          <option value="balanced">Balanced</option>
          <option value="full">Full</option>
        </select>
      </label>
      <p className="status-note">
        Balanced uses the locked conservative transform. Full is explicit and
        still bounded by correction, inter-channel, and headroom safety.
      </p>
      <label htmlFor="guided-profile-name">
        Local profile name
        <input
          id="guided-profile-name"
          type="text"
          value={profileName}
          maxLength={CALIBRATION_PROFILE_NAME_MAX_LENGTH}
          onChange={(event) => setProfileName(event.currentTarget.value)}
        />
      </label>
      <label htmlFor="guided-profile-note">
        Device / headphone / speaker note (optional)
        <input
          id="guided-profile-note"
          type="text"
          value={profileNote}
          maxLength={CALIBRATION_PROFILE_NOTE_MAX_LENGTH}
          onChange={(event) => setProfileNote(event.currentTarget.value)}
        />
      </label>
      <div className="calibration-exit-row">
        <button
          type="button"
          className="primary-action"
          disabled={profileName.trim().length === 0}
          onClick={save}
        >
          Save local profile in Balanced mode
        </button>
        <button type="button" className="danger-action" onClick={abort}>
          Cancel without saving
        </button>
      </div>
    </section>
  )
}
