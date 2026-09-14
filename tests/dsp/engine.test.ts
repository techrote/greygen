import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ENGINE_SEED,
  GreygenDspEngine,
} from '../../src/audio/dsp/engine'
import { createSpectrumState } from '../../src/audio/dsp/spectra'

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

describe('GreygenDspEngine', () => {
  it('renders exactly repeatable output from the same seed and state', () => {
    expect(render()).toEqual(render())
  })

  it('changes deterministic output when the spectral target changes', () => {
    expect(render(48_000, DEFAULT_ENGINE_SEED, 'white')).not.toEqual(
      render(48_000, DEFAULT_ENGINE_SEED, 'brown'),
    )
  })

  it('reset reproduces the original sequence without allocating a new engine', () => {
    const engine = new GreygenDspEngine({ sampleRate: 48_000 })
    const first = new Float32Array(1024)
    const second = new Float32Array(1024)

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
})
