import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  GeneratorSurface,
  INITIAL_AUDIO_SNAPSHOT,
  default as App,
} from '../src/app/App'
import { createSpectrumState } from '../src/audio/dsp/spectra'
import { AUDIO_PROTOCOL_VERSION } from '../src/audio/protocol'

const noop = (): void => undefined

function surfaceProps() {
  return {
    audioSnapshot: INITIAL_AUDIO_SNAPSHOT,
    spectrumState: createSpectrumState('grey'),
    stereoWidth: 0.5,
    engineReady: true,
    controlError: null,
    storageNotice: null,
    futureFeaturesVisible: true,
    profileCount: 0,
    onPrimaryAction: noop,
    onStop: noop,
    onPresetChange: noop,
    onBandChange: noop,
    onBandReset: noop,
    onBandsReset: noop,
    onMasterChange: noop,
    onStereoWidthChange: noop,
    onToggleFutureFeatures: noop,
    onResetSound: noop,
    onDeleteProfiles: noop,
  }
}

describe('Greygen primary generator surface', () => {
  it('renders the complete friendly control surface while remaining silent initially', () => {
    const markup = renderToStaticMarkup(<App />)

    expect(markup).toContain('Greygen')
    expect(markup).toContain('Audio stays silent until you choose Start')
    expect(markup).toContain('Ten-band shape')
    expect(markup).toContain('Master level')
    expect(markup).toContain('Stereo width')
    expect(markup).toContain('Normal')
    expect(markup).toContain('Target correlation')
    expect(markup).toContain('Spectral animation')
    expect(markup).toContain('Playback calibration')
    expect(markup).toContain('Persistence &amp; privacy')
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Start audio<\/button>/)
    expect(markup.match(/class="band-control"/g)).toHaveLength(10)
  })

  it('renders deterministic meters, stereo state, modified state, and runtime high-band degradation', () => {
    const offsets = new Float64Array(10)
    offsets[2] = 3
    const markup = renderToStaticMarkup(
      <GeneratorSurface
        {...surfaceProps()}
        stereoWidth={1}
        audioSnapshot={{
          ...INITIAL_AUDIO_SNAPSHOT,
          status: 'running',
          sampleRate: 48_000,
          targetId: 'pink',
          highBandMode: 'degraded-high-shelf',
          masterGainDb: -18,
          stereoWidth: 1,
          stereoCorrelation: 0,
          telemetry: {
            version: AUDIO_PROTOCOL_VERSION,
            type: 'telemetry',
            sequence: 4,
            frameCount: 4800,
            peakDbfs: -6,
            rmsDbfs: -18.25,
            safetyPreGainDb: -4,
            safetyPreGainTargetDb: -4,
            masterGainDb: -18,
            guardInterventions: 0,
            stereoWidth: 1,
            stereoCorrelation: 0,
          },
        }}
        spectrumState={createSpectrumState('pink', offsets)}
      />,
    )

    expect(markup).toContain('Pink')
    expect(markup).toContain('Modified')
    expect(markup).toContain('-6.0 dBFS')
    expect(markup).toContain('-18.3 dBFS')
    expect(markup).toContain('-4.0 dB')
    expect(markup).toContain('High shelf')
    expect(markup).toContain('16k control is a stable high shelf')
    expect(markup).toContain('Wide')
    expect(markup).toContain('100%')
    expect(markup).toContain('Applied ρ 0.000')
    expect(markup).toContain('not acoustic dB SPL')
    expect(markup).toContain('not a medical hearing test')
  })

  it('renders explicit suspended and actionable error states', () => {
    const suspended = renderToStaticMarkup(
      <GeneratorSurface
        {...surfaceProps()}
        audioSnapshot={{ ...INITIAL_AUDIO_SNAPSHOT, status: 'suspended' }}
      />,
    )
    expect(suspended).toContain('Resume audio')
    expect(suspended).toContain('Stop audio')

    const failed = renderToStaticMarkup(
      <GeneratorSurface
        {...surfaceProps()}
        audioSnapshot={{
          ...INITIAL_AUDIO_SNAPSHOT,
          status: 'error',
          error: {
            code: 'node-create-failed',
            message: 'Fixture processor creation failed.',
            recoverable: true,
          },
        }}
      />,
    )
    expect(failed).toContain('Retry audio')
    expect(failed).toContain('Fixture processor creation failed.')
  })

  it('keeps sound reset and private-profile deletion visibly distinct', () => {
    const markup = renderToStaticMarkup(
      <GeneratorSurface
        {...surfaceProps()}
        profileCount={2}
        storageNotice="Stored sound was recovered safely."
        futureFeaturesVisible={false}
      />,
    )

    expect(markup).toContain('2 private profiles')
    expect(markup).toContain('Reset sound settings')
    expect(markup).toContain('Delete local profiles')
    expect(markup).toContain('never deleted by a sound reset')
    expect(markup).toContain('Stored sound was recovered safely.')
    expect(markup).toContain('Show roadmap controls')
    expect(markup).not.toContain('Power-preserving stereo arrives')
  })
})
