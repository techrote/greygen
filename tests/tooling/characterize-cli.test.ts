import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('characterization CLI', () => {
  it('emits parseable versioned JSON without browser or audio hardware', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/characterize.mjs',
        '--sample-rate',
        '48000',
        '--frames',
        '2048',
        '--seed',
        '0x12345678',
        '--preset',
        'pink',
        '--width',
        '0.5',
        '--json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30_000,
      },
    )

    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toBe('')

    const report = JSON.parse(result.stdout) as {
      schemaVersion: number
      input: { sampleRate: number; frameCount: number; presetId: string }
      environment: { runtime: string; platform: string; architecture: string }
      benchmark: { informationalOnly: boolean }
    }

    expect(report.schemaVersion).toBe(1)
    expect(report.input).toMatchObject({
      sampleRate: 48_000,
      frameCount: 2048,
      presetId: 'pink',
    })
    expect(report.environment.runtime).toContain('node v')
    expect(report.environment.platform.length).toBeGreaterThan(0)
    expect(report.environment.architecture.length).toBeGreaterThan(0)
    expect(report.benchmark.informationalOnly).toBe(true)
  })

  it('rejects malformed and out-of-range CLI values with a non-zero exit', () => {
    const malformed = spawnSync(
      process.execPath,
      ['scripts/characterize.mjs', '--seed', '-1'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30_000,
      },
    )
    expect(malformed.status).toBe(1)
    expect(malformed.stderr).toContain('--seed must be')

    const outOfRange = spawnSync(
      process.execPath,
      ['scripts/characterize.mjs', '--width', '1.1'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30_000,
      },
    )
    expect(outOfRange.status).toBe(1)
    expect(outOfRange.stderr).toContain('stereo width')
  })

  it('prints help without starting the characterization runtime', () => {
    const result = spawnSync(process.execPath, ['scripts/characterize.mjs', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 10_000,
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('npm run characterize -- [options]')
    expect(result.stdout).toContain('require no browser or audio device')
  })
})
