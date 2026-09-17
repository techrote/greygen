import { useState } from 'react'
import type { AudioEngineStatus } from '../../audio/AudioEngine'
import { NOMINAL_BAND_CENTERS_HZ } from '../../audio/dsp/filterBank'
import type {
  CalibrationApplicationMode,
  LocalProfileRecord,
} from '../../app/state/appState'
import GuidedCalibrationWizard, {
  type GuidedCalibrationSaveDraft,
} from './GuidedCalibrationWizard'
import {
  CALIBRATION_PROFILE_NAME_MAX_LENGTH,
  DEFAULT_CALIBRATION_REFERENCE_BAND_INDEX,
  parseCalibrationProfileRecord,
} from './calibrationProfile'

export interface CalibrationDraft {
  readonly name: string
  readonly referenceBandIndex: number
  readonly rawBandOffsetsDb: readonly (number | null)[]
}

export interface CalibrationPanelProps {
  readonly profiles: readonly LocalProfileRecord[]
  readonly activeProfileId: string | null
  readonly applicationMode: CalibrationApplicationMode
  readonly sampleRate: number | null
  readonly audioStatus: AudioEngineStatus
  readonly guidedSeed: number
  readonly disabled: boolean
  readonly onSave: (draft: CalibrationDraft) => void
  readonly onSelect: (id: string | null) => void
  readonly onModeChange: (mode: CalibrationApplicationMode) => void
  readonly onDelete: (id: string) => void
  readonly onGuidedStimulusBand: (
    bandIndex: number,
    levelOffsetDb: number,
  ) => void
  readonly onGuidedStimulusSilent: () => void
  readonly onGuidedStimulusEnd: () => void
  readonly onGuidedAuditionDraft: (
    rawBandOffsetsDb: readonly (number | null)[],
    referenceBandIndex: number,
    mode: CalibrationApplicationMode,
  ) => void
  readonly onGuidedRestoreSavedProfile: () => void
  readonly onGuidedSave: (draft: GuidedCalibrationSaveDraft) => void
}

function frequencyLabel(value: number): string {
  return value >= 1000 ? `${value / 1000}k` : `${Math.floor(value)}`
}

export default function CalibrationPanel({
  profiles,
  activeProfileId,
  applicationMode,
  sampleRate,
  audioStatus,
  guidedSeed,
  disabled,
  onSave,
  onSelect,
  onModeChange,
  onDelete,
  onGuidedStimulusBand,
  onGuidedStimulusSilent,
  onGuidedStimulusEnd,
  onGuidedAuditionDraft,
  onGuidedRestoreSavedProfile,
  onGuidedSave,
}: CalibrationPanelProps) {
  const calibrationProfiles = profiles.filter(
    (record) => parseCalibrationProfileRecord(record).profile !== null,
  )
  const [name, setName] = useState('')
  const [referenceBandIndex, setReferenceBandIndex] = useState(
    DEFAULT_CALIBRATION_REFERENCE_BAND_INDEX,
  )
  const [offsetDrafts, setOffsetDrafts] = useState<readonly string[]>(() =>
    Object.freeze(Array(10).fill('0')),
  )

  const setOffset = (index: number, value: string): void => {
    const next = Array.from(offsetDrafts)
    next[index] = value
    setOffsetDrafts(Object.freeze(next))
  }

  const save = (): void => {
    const raw = offsetDrafts.map((value) => {
      const trimmed = value.trim()
      if (trimmed.length === 0) {
        return null
      }
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? parsed : null
    })
    if (raw[referenceBandIndex] === null) {
      raw[referenceBandIndex] = 0
    }
    onSave({ name, referenceBandIndex, rawBandOffsetsDb: raw })
    setName('')
  }

  return (
    <section
      className="calibration-panel"
      aria-labelledby="calibration-heading"
    >
      <div className="section-heading-row">
        <div>
          <p className="label">Private local profile</p>
          <h3 id="calibration-heading">Playback calibration</h3>
        </div>
        <span className="profile-count">
          {calibrationProfiles.length} saved
        </span>
      </div>
      <p>
        Relative listener + playback-chain compensation only. This is not a
        medical hearing test, and these values are never included in normal
        sound share links.
      </p>

      <div className="calibration-apply-row">
        <label htmlFor="calibration-profile-select">
          Active profile
          <select
            id="calibration-profile-select"
            value={activeProfileId ?? ''}
            disabled={disabled}
            onChange={(event) => onSelect(event.currentTarget.value || null)}
          >
            <option value="">None</option>
            {calibrationProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="calibration-mode">
          Application
          <select
            id="calibration-mode"
            value={applicationMode}
            disabled={disabled || !activeProfileId}
            onChange={(event) =>
              onModeChange(
                event.currentTarget.value as CalibrationApplicationMode,
              )
            }
          >
            <option value="off">Off</option>
            <option value="balanced">Balanced</option>
            <option value="full">Full</option>
          </select>
        </label>
      </div>
      <p className="status-note">
        Balanced is the conservative default. Full is explicit opt-in and still
        obeys global correction/headroom bounds. Profile changes use the
        existing smoothed gain path.
      </p>

      {calibrationProfiles.length > 0 ? (
        <ul className="saved-preset-list" aria-label="Calibration profiles">
          {calibrationProfiles.map((profile) => {
            const parsed = parseCalibrationProfileRecord(profile).profile
            const guided = parsed?.measurement !== null
            return (
              <li key={profile.id} className="saved-preset-item">
                <strong>{profile.name}</strong>
                <span>
                  {parsed?.sampleRateHz
                    ? `${parsed.sampleRateHz.toLocaleString()} Hz capture`
                    : 'sample rate unspecified'}
                  {guided ? ' · guided' : ' · manual'}
                </span>
                <button
                  type="button"
                  className="danger-action"
                  aria-label={`Delete calibration profile ${profile.name}`}
                  onClick={() => onDelete(profile.id)}
                >
                  Delete
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <GuidedCalibrationWizard
        audioStatus={audioStatus}
        seed={guidedSeed}
        disabled={disabled}
        onStimulusBand={onGuidedStimulusBand}
        onStimulusSilent={onGuidedStimulusSilent}
        onStimulusEnd={onGuidedStimulusEnd}
        onAuditionDraft={onGuidedAuditionDraft}
        onRestoreSavedProfile={onGuidedRestoreSavedProfile}
        onSave={onGuidedSave}
      />

      <details className="manual-calibration-details">
        <summary>Manual profile editor</summary>
        <fieldset className="calibration-editor" disabled={disabled}>
          <legend>Create manual relative profile</legend>
          <p className="status-note">
            Advanced/manual path. Blank a non-reference band to mark it
            unknown/skipped. Do not raise the system level aggressively to
            force an inaudible band to appear.
          </p>
          <label htmlFor="calibration-profile-name">
            Profile name
            <input
              id="calibration-profile-name"
              type="text"
              maxLength={CALIBRATION_PROFILE_NAME_MAX_LENGTH}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </label>
          <label htmlFor="calibration-reference-band">
            Reference band
            <select
              id="calibration-reference-band"
              value={referenceBandIndex}
              onChange={(event) =>
                setReferenceBandIndex(Number(event.currentTarget.value))
              }
            >
              {NOMINAL_BAND_CENTERS_HZ.map((frequency, index) => (
                <option value={index} key={frequency}>
                  {frequencyLabel(frequency)} Hz
                </option>
              ))}
            </select>
          </label>
          <div className="calibration-band-grid">
            {NOMINAL_BAND_CENTERS_HZ.map((frequency, index) => (
              <label key={frequency} htmlFor={`calibration-band-${index}`}>
                {frequencyLabel(frequency)}
                <input
                  id={`calibration-band-${index}`}
                  type="number"
                  min={-24}
                  max={24}
                  step={0.5}
                  value={offsetDrafts[index]}
                  required={index === referenceBandIndex}
                  aria-label={`${frequencyLabel(frequency)} calibration relative correction; blank means skipped`}
                  onChange={(event) =>
                    setOffset(index, event.currentTarget.value)
                  }
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="secondary-action"
            disabled={name.trim().length === 0}
            onClick={save}
          >
            Save local profile
          </button>
          <p className="status-note">
            {sampleRate
              ? `Current runtime sample rate ${sampleRate.toLocaleString()} Hz will be recorded as context.`
              : 'Audio is not running, so this manual profile will record sample rate as unspecified.'}
          </p>
        </fieldset>
      </details>
    </section>
  )
}
