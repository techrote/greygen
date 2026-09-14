import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ENGINE_SEED,
  GreygenDspEngine,
} from '../../src/audio/dsp/engine'
import {
  ANIMATION_BAND_OFFSET_LIMIT_DB,
  CALIBRATION_BAND_OFFSET_LIMIT_DB,
  FINAL_GUARD_LIMIT_LINEAR,
  MASTER_GAIN_MAX_DB,
  createGainStageState,
} from '../../src/audio/dsp/gainSafety'
import {
  USER_BAND_OFFSET_MAX_DB,
  createSpectrumState,
} from '../../src/audio/dsp/spectra'

function filled(value: number): Float64Array {
  return new Float64Array(10).fill(value)
}

function render(
  sampleRate = 48_000,
  seed = DEFAULT_ENGINE_SEED,
  preset: 'white' | 'pink' | 'brown' | 'grey' = 'grey',
): Float32Array {
  const engine = new GreygenDspEngine({
    sampleRate,
    seed,
    spectrumState: createSpectrumState(preset),
  })
  const output = new Float32Array(4096)
  engine.renderMono(output)
  return output
}

function extremeEngine(sampleRate: number): GreygenDspEngine {
  return new GreygenDspEngine({
    sampleRate,
    spectrumState: createSpectrumState(
      'white',
      filled(USER_BAND_OFFSET_MAX_DB),
    ),
    gainStageState: createGainStageState(
      MASTER_GAIN_MAX_DB,
      filled(ANIMATION_BAND_OFFSET_LIMIT_DB),
      filled(CALIBRATION_BAND_OFFSET_LIMIT_DB),
    ),
  })
}

describe('GreygenDspEngine', () => {
  it('renders exactly repeatable output from the same seed and state', () => {
    expect(render()).toEqual(render())
  })

  it('changes deterministic output when the spectral target changes', () => {
    expect(render(48_000, DEFAULT_ENGINE_SEED, 'white')).not.toEqual(
      render(48_000, DEFAULT_ENGINE_SEED, 'brown'),
    )
  })

  it('reset reproduces the original sequence including startup smoothing', () => {
    const engine = new GreygenDspEngine({ sampleRate: 48_000 })
    const first = new Float32Array(4096)
    const second = new Float32Array(4096)

    engine.renderMono(first)
    engine.reset()
    engine.renderMono(second)

    expect(second).toEqual(first)
  })

  it('exposes runtime high-band degradation from the validated filter bank', () => {
    expect(new GreygenDspEngine({ sampleRate: 48_000 }).highBandMode).toBe(
      'degraded-high-shelf',
    )
    expect(new GreygenDspEngine({ sampleRate: 96_000 }).highBandMode).toBe(
      'bounded-bandpass',
    )
  })

  it.each([44_100, 48_000, 96_000])(
    'keeps maximum accepted gain layers finite and legal at %i Hz',
    (sampleRate) => {
      const engine = extremeEngine(sampleRate)
      const output = new Float32Array(1 << 17)
      engine.renderMono(output)
      const telemetry = engine.consumeTelemetry()

      expect(output.every(Number.isFinite)).toBe(true)
      expect(
        output.every(
          (sample) => Math.abs(sample) <= FINAL_GUARD_LIMIT_LINEAR + 1e-7,
        ),
      ).toBe(true)
      expect(engine.safetyPreGainTargetLinear).toBeGreaterThan(0)
      expect(engine.safetyPreGainTargetLinear).toBeLessThan(0.02)
      expect(telemetry.safetyPreGainLinear).toBe(
        engine.appliedSafetyPreGainLinear,
      )
      expect(telemetry.masterGainLinear).toBe(engine.appliedMasterGainLinear)
      expect(Number.isFinite(telemetry.peakDbfs)).toBe(true)
      expect(Number.isFinite(telemetry.rmsDbfs)).toBe(true)
    },
  )

  it.each(['white', 'pink', 'brown', 'grey'] as const)(
    '%s at 0 dB master does not rely on the emergency guard in a long fixture',
    (preset) => {
      const engine = new GreygenDspEngine({
        sampleRate: 48_000,
        seed: 0x51_6a_fe_02,
        spectrumState: createSpectrumState(preset),
        gainStageState: createGainStageState(MASTER_GAIN_MAX_DB),
      })
      const output = new Float32Array(1 << 18)
      engine.renderMono(output)
      const telemetry = engine.consumeTelemetry()

      expect(telemetry.guardInterventions).toBe(0)
      expect(telemetry.peakLinear).toBeLessThan(FINAL_GUARD_LIMIT_LINEAR)
    },
  )

  it('smooths an extreme control transition instead of applying a one-sample jump', () => {
    const changed = new GreygenDspEngine({
      sampleRate: 48_000,
      seed: 0x22_44_66_88,
      spectrumState: createSpectrumState('white'),
    })
    const control = new GreygenDspEngine({
      sampleRate: 48_000,
      seed: 0x22_44_66_88,
      spectrumState: createSpectrumState('white'),
    })
    const warmChanged = new Float32Array(8192)
    const warmControl = new Float32Array(8192)
    changed.renderMono(warmChanged)
    control.renderMono(warmControl)
    expect(warmChanged).toEqual(warmControl)

    changed.setSpectrumState(
      createSpectrumState('white', filled(USER_BAND_OFFSET_MAX_DB)),
    )
    changed.setGainStageState(
      createGainStageState(
        MASTER_GAIN_MAX_DB,
        filled(ANIMATION_BAND_OFFSET_LIMIT_DB),
        filled(CALIBRATION_BAND_OFFSET_LIMIT_DB),
      ),
    )

    const transitioned = new Float32Array(256)
    const unchanged = new Float32Array(256)
    changed.renderMono(transitioned)
    control.renderMono(unchanged)

    expect(Math.abs(transitioned[0] - unchanged[0])).toBeLessThan(0.01)
    expect(transitioned.every(Number.isFinite)).toBe(true)
  })

  it.each([44_100, 48_000, 96_000])(
    'survives repeated rapid extreme updates at %i Hz',
    (sampleRate) => {
      const engine = new GreygenDspEngine({ sampleRate, seed: 0xca_fe_ba_be })
      const block = new Float32Array(256)

      for (let iteration = 0; iteration < 20; iteration += 1) {
        const high = iteration % 2 === 0
        engine.setSpectrumState(
          createSpectrumState(
            high ? 'white' : 'brown',
            filled(high ? USER_BAND_OFFSET_MAX_DB : -24),
          ),
        )
        engine.setGainStageState(
          createGainStageState(
            high ? MASTER_GAIN_MAX_DB : -60,
            filled(high ? ANIMATION_BAND_OFFSET_LIMIT_DB : 0),
            filled(high ? CALIBRATION_BAND_OFFSET_LIMIT_DB : 0),
          ),
        )
        engine.renderMono(block)
        expect(block.every(Number.isFinite)).toBe(true)
        expect(
          block.every(
            (sample) => Math.abs(sample) <= FINAL_GUARD_LIMIT_LINEAR + 1e-7,
          ),
        ).toBe(true)
      }
    },
  )
})
