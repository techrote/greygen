import { type KeyboardEvent, useState } from 'react'
import type { AudioEngineStatus } from '../../audio/AudioEngine'
import { NOMINAL_BAND_CENTERS_HZ } from '../../audio/dsp/filterBank'
import type { CalibrationApplicationMode } from '../../app/state/appState'
import type { CalibrationMeasurementMetadata } from './calibrationProfile'
import {
  type CalibrationJudgement,
  createGuidedCalibrationMeasurement,
  createGuidedCalibrationState,
  currentGuidedCalibrationCorrectionDb,
  guidedCalibrationProgress,
  guidedCalibrationRawOffsetsDb,
  retestCalibrationBand,
  skipCurrentCalibrationBand,
  submitCalibrationJudgement,
  type GuidedCalibrationState,
} from './guidedCalibration'

export interface GuidedCalibrationSaveDraft {
  readonly name: string
  readonly referenceBandIndex: number
  readonly rawBandOffsetsDb: readonly (number | null)[]
  readonly measurement: CalibrationMeasurementMetadata
}

export interface GuidedCalibrationWizardProps {
  readonly audioStatus: AudioEngineStatus
  readonly seed: number
  readonly disabled: boolean
  readonly onStimulusBand: (bandIndex: number, levelOffsetDb: number) => void
  readonly onStimulusSilent: () => void
  readonly onStimulusEnd: () => void
  readonly onAuditionDraft: (
    rawBandOffsetsDb: readonly (number | null)[],
    referenceBandIndex: number,
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
  const [comfortableConfirmed, setComfortableConfirmed] = useState(false)
  const [wizard, setWizard] = useState<GuidedCalibrationState | null>(null)
  const [heardReference, setHeardReference] = useState(false)
  const [heardTest, setHeardTest] = useState(false)
  const [lastAudition, setLastAudition] = useState<'reference' | 'test' | null>(
    null,
  )
  const [auditionMode, setAuditionMode] =
    useState<CalibrationApplicationMode>('off')
  const [profileName, setProfileName] = useState('')

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
    setWizard(createGuidedCalibrationState(seed))
    setAuditionMode('off')
    setProfileName('')
    resetAuditionFlags()
  }

  const abort = (): void => {
    onStimulusEnd()
    onRestoreSavedProfile()
    setWizard(null)
    setAuditionMode('off')
    setProfileName('')
    setComfortableConfirmed(false)
    resetAuditionFlags()
  }

  const enterReviewIfNeeded = (next: GuidedCalibrationState): void => {
    if (next.stage === 'review') {
      const raw = guidedCalibrationRawOffsetsDb(next)
      onStimulusEnd()
      onAuditionDraft(raw, next.referenceBandIndex, 'off')
      setAuditionMode('off')
    }
  }

  const submitJudgement = (judgement: CalibrationJudgement): void => {
    if (!wizard || wizard.stage !== 'matching' || !heardReference || !heardTest) {
      return
    }
    onStimulusSilent()
    const next = submitCalibrationJudgement(wizard, judgement)
    setWizard(next)
    resetAuditionFlags()
    enterReviewIfNeeded(next)
  }

  const skip = (): void => {
    if (!wizard || wizard.stage !== 'matching') {
      return
    }
    onStimulusSilent()
    const next = skipCurrentCalibrationBand(wizard)
    setWizard(next)
    resetAuditionFlags()
    enterReviewIfNeeded(next)
  }

  const alternateStimulus = (): void => {
    if (!wizard?.current || audioStatus !== 'running') {
      return
    }
    if (lastAudition === 'reference') {
      const correction = currentGuidedCalibrationCorrectionDb(wizard) ?? 0
      onStimulusBand(wizard.current.bandIndex, correction)
      setHeardTest(true)
      setLastAudition('test')
      return
    }
    onStimulusBand(wizard.referenceBandIndex, 0)
    setHeardReference(true)
    setLastAudition('reference')
  }

  const silence = (): void => {
    if (!wizard || wizard.stage !== 'matching') {
      return
    }
    onStimulusSilent()
    setLastAudition(null)
  }

  const startRetest = (bandIndex: number): void => {
    if (!wizard || wizard.stage !== 'review') {
      return
    }
    onRestoreSavedProfile()
    onStimulusSilent()
    setWizard(retestCalibrationBand(wizard, bandIndex))
    setAuditionMode('off')
    resetAuditionFlags()
  }

  const changeAuditionMode = (mode: CalibrationApplicationMode): void => {
    if (!wizard || wizard.stage !== 'review') {
      return
    }
    const raw = guidedCalibrationRawOffsetsDb(wizard)
    onAuditionDraft(raw, wizard.referenceBandIndex, mode)
    setAuditionMode(mode)
  }

  const save = (): void => {
    if (!wizard || wizard.stage !== 'review' || profileName.trim().length === 0) {
      return
    }
    onStimulusEnd()
    onSave({
      name: profileName,
      referenceBandIndex: wizard.referenceBandIndex,
      rawBandOffsetsDb: guidedCalibrationRawOffsetsDb(wizard),
      measurement:
        createGuidedCalibrationMeasurement(wizard) as CalibrationMeasurementMetadata,
    })
    setWizard(null)
    setAuditionMode('off')
    setProfileName('')
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
    if (isTextEntryTarget(event.target)) {
      return
    }
    if (wizard.stage === 'matching') {
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
  }

  if (!wizard) {
    return (
      <section className="guided-calibration" aria-labelledby="guided-heading">
        <h4 id="guided-heading">Guided perceived-level calibration</h4>
        <p>
          Match narrow-band noise against a 1 kHz reference. Results describe
          your current listener + playback chain; this is not a medical hearing
          test or an acoustic level measurement.
        </p>
        <ul className="calibration-safety-list">
          <li>Set a comfortable listening level before beginning.</li>
          <li>
            Skip anything you cannot comfortably match; never turn the system
            up aggressively to force an inaudible band to appear.
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
            disabled ||
            audioStatus !== 'running' ||
            !comfortableConfirmed
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

  const progress = guidedCalibrationProgress(wizard)

  if (wizard.stage === 'matching' && wizard.current) {
    const correction = currentGuidedCalibrationCorrectionDb(wizard) ?? 0
    const frequency = NOMINAL_BAND_CENTERS_HZ[wizard.current.bandIndex]
    const extreme =
      wizard.current.bandIndex === 0 ||
      wizard.current.bandIndex === NOMINAL_BAND_CENTERS_HZ.length - 1
    const canJudge = heardReference && heardTest
    return (
      <section
        className="guided-calibration guided-calibration-active"
        aria-labelledby="guided-heading"
        onKeyDown={handleKeyboard}
      >
        <div className="section-heading-row">
          <div>
            <p className="label">
              Match {Math.min(progress.completed + 1, progress.total)} of{' '}
              {progress.total}
            </p>
            <h4 id="guided-heading">{frequencyLabel(frequency)} test band</h4>
          </div>
          <output aria-live="polite">{formatCorrection(correction)}</output>
        </div>
        <p>
          Space alternates reference/test. After hearing both, choose how the
          test sounds relative to the 1 kHz reference. The probe is bounded to
          ±24 dB and the master control is never changed automatically.
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
          <button
            type="button"
            className="secondary-action"
            onClick={silence}
          >
            Silence calibration
          </button>
        </div>
        <p className="status-note" aria-live="polite">
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
        <p className="status-note">
          Keyboard: Space alternate · ← quieter · ↓ equal · → louder · K skip ·
          S silence · Esc abort.
        </p>
      </section>
    )
  }

  const raw = guidedCalibrationRawOffsetsDb(wizard)
  const resultsByBand = new Map(
    wizard.results.map((result) => [result.bandIndex, result]),
  )
  return (
    <section
      className="guided-calibration guided-calibration-active"
      aria-labelledby="guided-heading"
      onKeyDown={handleKeyboard}
    >
      <div className="section-heading-row">
        <div>
          <p className="label">Review before saving</p>
          <h4 id="guided-heading">Guided calibration result</h4>
        </div>
        <span>{progress.total} bands completed</span>
      </div>
      <p>
        These are relative digital corrections from this listener + playback
        chain. Skipped bands remain unknown and will not be fabricated. Nothing
        is saved until you explicitly save below.
      </p>
      <div className="calibration-review-grid" role="list">
        {NOMINAL_BAND_CENTERS_HZ.map((frequency, bandIndex) => {
          const result = resultsByBand.get(bandIndex)
          const isReference = bandIndex === wizard.referenceBandIndex
          return (
            <div className="calibration-review-band" role="listitem" key={frequency}>
              <strong>{frequencyLabel(frequency)}</strong>
              <span>{formatCorrection(raw[bandIndex])}</span>
              <small>
                {isReference
                  ? 'Reference'
                  : result
                    ? `${result.confidence} confidence · ${result.retests} retest${result.retests === 1 ? '' : 's'}`
                    : 'No result'}
              </small>
              {!isReference ? (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => startRetest(bandIndex)}
                >
                  Retest
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
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
        still bounded by the correction/headroom safety pipeline.
      </p>
      <label htmlFor="guided-profile-name">
        Local profile name
        <input
          id="guided-profile-name"
          type="text"
          value={profileName}
          maxLength={120}
          onChange={(event) => setProfileName(event.currentTarget.value)}
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
