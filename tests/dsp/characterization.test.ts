import { describe, expect, it } from 'vitest'
import {
  CHARACTERIZATION_REPORT_SCHEMA_VERSION,
  characterizeDsp,
  formatCharacterizationReport,
} from '../../src/audio/analysis/characterization'

function deterministicClock(): () => number {
  let calls = 0
  return () => {
    calls += 1
    return calls === 1 ? 100 : 125
  }
}

const environment = {
  runtime: 'test-runtime',
  platform: 'test-platform',
  architecture: 'test-arch',
} as const

describe('DSP characterization report', () => {
  it('matches the existing spectral, stereo, safety, and neutral-bank contracts', () => {
    const report = characterizeDsp({
      sampleRate: 48_000,
      frameCount: 1 << 18,
      seed: 0x51_0f_aa_17,
      environment,
      now: deterministicClock(),
    })

    expect(report.schemaVersion).toBe(CHARACTERIZATION_REPORT_SCHEMA_VERSION)
    expect(report.spectral.presets).toHaveLength(3)
    for (const preset of report.spectral.presets) {
      expect(Math.abs(preset.errorDbPerOctave)).toBeLessThan(0.5)
      expect(Number.isFinite(preset.rSquared)).toBe(true)
    }

    expect(report.filterBank.highBandMode).toBe('degraded-high-shelf')
    expect(report.filterBank.neutralMaximumAbsoluteSampleError).toBeLessThan(
      1e-10,
    )
    expect(report.filterBank.neutralMaximumMagnitudeDeviationDb).toBeLessThan(
      1e-8,
    )
    expect(report.filterBank.bands).toHaveLength(10)

    expect(
      Math.abs(
        report.output.stereoCorrelation - report.input.targetStereoCorrelation,
      ),
    ).toBeLessThan(0.03)
    expect(Math.abs(report.output.stereoRmsBalanceDb)).toBeLessThanOrEqual(0.25)
    expect(report.safety.guardInterventions).toBe(0)
    expect(report.benchmark.wallTimeMs).toBe(25)
    expect(report.benchmark.informationalOnly).toBe(true)
  })

  it.each([44_100, 48_000, 96_000])(
    'supports offline characterization at %i Hz without browser or audio-device state',
    (sampleRate) => {
      const report = characterizeDsp({
        sampleRate,
        frameCount: 8192,
        seed: 0x1234_5678,
        environment,
        now: deterministicClock(),
      })

      expect(report.input.sampleRate).toBe(sampleRate)
      expect(Number.isFinite(report.output.left.rms)).toBe(true)
      expect(Number.isFinite(report.output.right.rms)).toBe(true)
      expect(Number.isFinite(report.safety.targetPreGainDb)).toBe(true)
      expect(report.filterBank.highBandMode).toBe(
        sampleRate === 96_000 ? 'bounded-bandpass' : 'degraded-high-shelf',
      )
    },
  )

  it('reports bounded, energy-preserving animation statistics when enabled', () => {
    const report = characterizeDsp({
      sampleRate: 48_000,
      frameCount: 32_768,
      seed: 0xffff_ffff,
      animationMode: 'orbit',
      animationDepthDb: 12,
      animationSpeed: 4,
      animationEnergyPreserving: true,
      environment,
      now: deterministicClock(),
    })

    expect(report.animation.enabled).toBe(true)
    expect(report.animation.maximumAbsoluteOffsetDb).toBeLessThanOrEqual(12)
    expect(report.animation.maximumAbsoluteBandPowerErrorDb).toBeLessThan(1e-9)
    expect(Number.isFinite(report.output.stereoCorrelation)).toBe(true)
  })

  it('is deterministic apart from caller-supplied benchmark/environment metadata', () => {
    const options = {
      sampleRate: 48_000,
      frameCount: 16_384,
      seed: 0x89ab_cdef,
      presetId: 'pink' as const,
      stereoWidth: 1,
      environment,
    }
    const first = characterizeDsp({ ...options, now: deterministicClock() })
    const second = characterizeDsp({ ...options, now: deterministicClock() })

    expect(second).toEqual(first)
  })

  it('rejects adversarial numeric boundaries rather than emitting invalid JSON data', () => {
    expect(() => characterizeDsp({ sampleRate: 0 })).toThrow(/sampleRate/u)
    expect(() => characterizeDsp({ sampleRate: Number.NaN })).toThrow(
      /sampleRate/u,
    )
    expect(() => characterizeDsp({ frameCount: 2047 })).toThrow(/frameCount/u)
    expect(() => characterizeDsp({ frameCount: 2048.5 })).toThrow(/frameCount/u)
    expect(() => characterizeDsp({ seed: -1 })).toThrow(/unsigned 32-bit/u)
    expect(() => characterizeDsp({ seed: 0x1_0000_0000 })).toThrow(
      /unsigned 32-bit/u,
    )
    expect(() => characterizeDsp({ stereoWidth: 1.0001 })).toThrow(
      /stereo width/u,
    )
    expect(() => characterizeDsp({ animationDepthDb: 12.001 })).toThrow(
      /depthDb/u,
    )
  })

  it('formats a compact human-readable report with units and benchmark caveat', () => {
    const report = characterizeDsp({
      sampleRate: 48_000,
      frameCount: 8192,
      environment,
      now: deterministicClock(),
    })
    const text = formatCharacterizationReport(report)

    expect(text).toContain('Greygen DSP characterization')
    expect(text).toContain('dB/oct')
    expect(text).toContain('guard interventions')
    expect(text).toContain('informational only')
    expect(text).not.toContain('dB SPL')
  })
})
