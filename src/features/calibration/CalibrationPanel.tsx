import { useEffect, useState } from 'react'
import type { AudioEngineStatus } from '../../audio/AudioEngine'
import type { CalibrationStimulusChannel } from '../../audio/dsp/calibrationStimulus'
import { NOMINAL_BAND_CENTERS_HZ } from '../../audio/dsp/filterBank'
import type {
  CalibrationApplicationMode,
  LocalProfileRecord,
} from '../../app/state/appState'
import GuidedCalibrationWizard, {
  type GuidedCalibrationAuditionDraft,
  type GuidedCalibrationSaveDraft,
} from './GuidedCalibrationWizard'
import {
  CALIBRATION_PROFILE_NAME_MAX_LENGTH,
  CALIBRATION_PROFILE_NOTE_MAX_LENGTH,
  DEFAULT_CALIBRATION_REFERENCE_BAND_INDEX,
  calibrationProfileIsGuided,
  parseCalibrationProfileRecord,
  type CalibrationChannelMode,
} from './calibrationProfile'
import { serializeCalibrationProfileExport } from './profilePortability'

export interface CalibrationDraft {
  readonly name: string
  readonly note: string
  readonly channelMode: CalibrationChannelMode
  readonly referenceBandIndex: number
  readonly leftRawBandOffsetsDb: readonly (number | null)[]
  readonly rightRawBandOffsetsDb: readonly (number | null)[]
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
  readonly onDuplicate: (id: string) => void
  readonly onRenameNote: (id: string, name: string, note: string) => boolean
  readonly onImport: (raw: string) => string
  readonly onGuidedStimulusBand: (
    bandIndex: number,
    levelOffsetDb: number,
    channel: CalibrationStimulusChannel,
  ) => void
  readonly onGuidedStimulusSilent: () => void
  readonly onGuidedStimulusEnd: () => void
  readonly onGuidedAuditionDraft: (
    draft: GuidedCalibrationAuditionDraft,
    mode: CalibrationApplicationMode,
  ) => void
  readonly onGuidedRestoreSavedProfile: () => void
  readonly onGuidedSave: (draft: GuidedCalibrationSaveDraft) => void
}

function frequencyLabel(value: number): string {
  return value >= 1000 ? `${value / 1000}k` : `${Math.floor(value)}`
}

function parseOffsetDrafts(
  drafts: readonly string[],
  referenceBandIndex: number,
): readonly (number | null)[] {
  const raw = drafts.map((value) => {
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
  return Object.freeze(raw)
}

function OffsetGrid({
  prefix,
  label,
  values,
  referenceBandIndex,
  onChange,
}: {
  readonly prefix: string
  readonly label: string
  readonly values: readonly string[]
  readonly referenceBandIndex: number
  readonly onChange: (index: number, value: string) => void
}) {
  return (
    <fieldset className="calibration-channel-grid">
      <legend>{label}</legend>
      <div className="calibration-band-grid">
        {NOMINAL_BAND_CENTERS_HZ.map((frequency, index) => (
          <label key={frequency} htmlFor={`${prefix}-${index}`}>
            {frequencyLabel(frequency)}
            <input
              id={`${prefix}-${index}`}
              type="number"
              min={-24}
              max={24}
              step={0.5}
              value={values[index]}
              required={index === referenceBandIndex}
              aria-label={`${label} ${frequencyLabel(frequency)} calibration relative correction; blank means skipped`}
              onChange={(event) => onChange(index, event.currentTarget.value)}
            />
          </label>
        ))}
      </div>
    </fieldset>
  )
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
  onDuplicate,
  onRenameNote,
  onImport,
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
  const activeRecord =
    calibrationProfiles.find((profile) => profile.id === activeProfileId) ??
    null
  const activeParsed = activeRecord
    ? parseCalibrationProfileRecord(activeRecord).profile
    : null

  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [channelMode, setChannelMode] =
    useState<CalibrationChannelMode>('linked')
  const [referenceBandIndex, setReferenceBandIndex] = useState(
    DEFAULT_CALIBRATION_REFERENCE_BAND_INDEX,
  )
  const [leftOffsetDrafts, setLeftOffsetDrafts] = useState<readonly string[]>(
    () => Object.freeze(Array(10).fill('0')),
  )
  const [rightOffsetDrafts, setRightOffsetDrafts] = useState<readonly string[]>(
    () => Object.freeze(Array(10).fill('0')),
  )
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editNote, setEditNote] = useState('')
  const [exportText, setExportText] = useState('')
  const [importText, setImportText] = useState('')
  const [portabilityNotice, setPortabilityNotice] = useState<string | null>(
    null,
  )

  useEffect(() => {
    setEditName(activeRecord?.name ?? '')
    setEditNote(activeParsed?.note ?? '')
    setPendingDeleteId(null)
  }, [activeRecord?.name, activeParsed?.note])

  const setOffset = (
    side: 'left' | 'right',
    index: number,
    value: string,
  ): void => {
    const current = side === 'left' ? leftOffsetDrafts : rightOffsetDrafts
    const next = Array.from(current)
    next[index] = value
    if (side === 'left') {
      setLeftOffsetDrafts(Object.freeze(next))
    } else {
      setRightOffsetDrafts(Object.freeze(next))
    }
  }

  const save = (): void => {
    const left = parseOffsetDrafts(leftOffsetDrafts, referenceBandIndex)
    const right =
      channelMode === 'linked'
        ? left
        : parseOffsetDrafts(rightOffsetDrafts, referenceBandIndex)
    onSave({
      name,
      note,
      channelMode,
      referenceBandIndex,
      leftRawBandOffsetsDb: left,
      rightRawBandOffsetsDb: right,
    })
    setName('')
    setNote('')
  }

  const exportActive = (): void => {
    if (!activeRecord) {
      return
    }
    try {
      setExportText(serializeCalibrationProfileExport(activeRecord))
      setPortabilityNotice(
        'Personal calibration export prepared locally. It contains playback/calibration data and is separate from normal sound sharing.',
      )
    } catch (error) {
      setPortabilityNotice(
        error instanceof Error ? error.message : 'Profile export failed.',
      )
    }
  }

  const importProfile = (): void => {
    const message = onImport(importText)
    setPortabilityNotice(message)
    if (message.startsWith('Imported')) {
      setImportText('')
    }
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
        <button
          type="button"
          className="secondary-action"
          disabled={!activeProfileId || applicationMode === 'off'}
          onClick={() => onModeChange('off')}
        >
          Bypass profile
        </button>
      </div>
      <p className="status-note">
        Balanced is the conservative default. Full is explicit opt-in.
        Independent profiles are limited to a bounded per-band L/R correction
        difference and all profile changes use smoothed gain paths.
      </p>

      {activeRecord && activeParsed ? (
        <fieldset className="profile-metadata-editor" disabled={disabled}>
          <legend>Edit active profile metadata</legend>
          <label htmlFor="active-calibration-name">
            Name
            <input
              id="active-calibration-name"
              value={editName}
              maxLength={CALIBRATION_PROFILE_NAME_MAX_LENGTH}
              onChange={(event) => setEditName(event.currentTarget.value)}
            />
          </label>
          <label htmlFor="active-calibration-note">
            Device / headphone / speaker note
            <input
              id="active-calibration-note"
              value={editNote}
              maxLength={CALIBRATION_PROFILE_NOTE_MAX_LENGTH}
              onChange={(event) => setEditNote(event.currentTarget.value)}
            />
          </label>
          <div className="calibration-exit-row">
            <button
              type="button"
              className="secondary-action"
              disabled={editName.trim().length === 0}
              onClick={() => onRenameNote(activeRecord.id, editName, editNote)}
            >
              Save name / note
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => onDuplicate(activeRecord.id)}
            >
              Duplicate profile
            </button>
          </div>
          <p className="status-note">
            {activeParsed.channelMode === 'linked'
              ? 'Linked / symmetric profile.'
              : 'Independent L/R profile. Channel differences are playback-chain data, not a hearing-loss interpretation.'}
          </p>
        </fieldset>
      ) : null}

      {calibrationProfiles.length > 0 ? (
        <ul className="saved-preset-list" aria-label="Calibration profiles">
          {calibrationProfiles.map((profile) => {
            const parsed = parseCalibrationProfileRecord(profile).profile
            const guided = parsed ? calibrationProfileIsGuided(parsed) : false
            const armed = pendingDeleteId === profile.id
            return (
              <li key={profile.id} className="saved-preset-item">
                <strong>{profile.name}</strong>
                <span>
                  {parsed?.channelMode === 'independent'
                    ? 'independent L/R'
                    : 'linked'}
                  {' · '}
                  {parsed?.sampleRateHz
                    ? `${parsed.sampleRateHz.toLocaleString()} Hz capture`
                    : 'sample rate unspecified'}
                  {guided ? ' · guided' : ' · manual'}
                </span>
                {parsed?.note ? <small>{parsed.note}</small> : null}
                {armed ? (
                  <div className="calibration-exit-row">
                    <button
                      type="button"
                      className="danger-action"
                      aria-label={`Confirm delete calibration profile ${profile.name}`}
                      onClick={() => {
                        onDelete(profile.id)
                        setPendingDeleteId(null)
                      }}
                    >
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => setPendingDeleteId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="danger-action"
                    aria-label={`Delete calibration profile ${profile.name}`}
                    onClick={() => setPendingDeleteId(profile.id)}
                  >
                    Delete…
                  </button>
                )}
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

      <details className="manual-calibration-details" open>
        <summary>Manual profile editor</summary>
        <fieldset className="calibration-editor" disabled={disabled}>
          <legend>Create manual relative profile</legend>
          <p className="status-note">
            Advanced/manual path. Blank a non-reference band to mark it
            unknown/skipped. Independent L/R values are bounded when applied;
            asymmetry is not interpreted diagnostically.
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
          <label htmlFor="calibration-profile-note">
            Device / headphone / speaker note (optional)
            <input
              id="calibration-profile-note"
              type="text"
              maxLength={CALIBRATION_PROFILE_NOTE_MAX_LENGTH}
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
            />
          </label>
          <label htmlFor="manual-channel-mode">
            Channel mode
            <select
              id="manual-channel-mode"
              value={channelMode}
              onChange={(event) =>
                setChannelMode(
                  event.currentTarget.value as CalibrationChannelMode,
                )
              }
            >
              <option value="linked">Linked / symmetric</option>
              <option value="independent">Independent left / right</option>
            </select>
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
          <OffsetGrid
            prefix="calibration-left-band"
            label={
              channelMode === 'linked' ? 'Linked correction' : 'Left correction'
            }
            values={leftOffsetDrafts}
            referenceBandIndex={referenceBandIndex}
            onChange={(index, value) => setOffset('left', index, value)}
          />
          {channelMode === 'independent' ? (
            <OffsetGrid
              prefix="calibration-right-band"
              label="Right correction"
              values={rightOffsetDrafts}
              referenceBandIndex={referenceBandIndex}
              onChange={(index, value) => setOffset('right', index, value)}
            />
          ) : null}
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

      <details className="profile-portability-details">
        <summary>Personal profile export / import</summary>
        <p className="calibration-caveat" role="note">
          This explicit export contains personal playback/calibration data,
          including the profile name, optional device note, correction curves,
          and measurement evidence. It is never inserted into ordinary sound
          share URLs.
        </p>
        <button
          type="button"
          className="secondary-action"
          disabled={!activeRecord}
          onClick={exportActive}
        >
          Prepare active profile export
        </button>
        <label htmlFor="calibration-export-json">
          Personal calibration export JSON
          <textarea
            id="calibration-export-json"
            rows={5}
            readOnly
            value={exportText}
          />
        </label>
        <label htmlFor="calibration-import-json">
          Import personal calibration JSON
          <textarea
            id="calibration-import-json"
            rows={5}
            value={importText}
            onChange={(event) => setImportText(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="secondary-action"
          disabled={importText.trim().length === 0}
          onClick={importProfile}
        >
          Validate &amp; import locally
        </button>
        <p className="status-note">
          Import saves a local profile but does not select it and never starts
          audio.
        </p>
        {portabilityNotice ? (
          <p className="share-notice" role="status">
            {portabilityNotice}
          </p>
        ) : null}
      </details>
    </section>
  )
}
