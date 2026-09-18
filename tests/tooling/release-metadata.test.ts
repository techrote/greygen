/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PROFILE_STATE_SCHEMA_VERSION,
  SOUND_STATE_SCHEMA_VERSION,
  UI_STATE_SCHEMA_VERSION,
} from '../../src/app/state/appState'
import { DSP_ENGINE_VERSION } from '../../src/audio/dsp/engine'
import { AUDIO_PROTOCOL_VERSION } from '../../src/audio/protocol'
import { GREYGEN_APP_VERSION } from '../../src/version'

interface PackageMetadata {
  readonly version: string
  readonly private: boolean
  readonly dependencies: Readonly<Record<string, string>>
}

interface LockedPackage {
  readonly version?: string
  readonly resolved?: string
  readonly license?: string
}

interface PackageLockMetadata {
  readonly packages: Readonly<Record<string, LockedPackage>>
}

function packageMetadata(): PackageMetadata {
  return JSON.parse(readFileSync('package.json', 'utf8')) as PackageMetadata
}

function packageLockMetadata(): PackageLockMetadata {
  return JSON.parse(
    readFileSync('package-lock.json', 'utf8'),
  ) as PackageLockMetadata
}

describe('v0.1 release metadata', () => {
  it('keeps the package and user-visible application versions synchronized', () => {
    const metadata = packageMetadata()
    expect(GREYGEN_APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(metadata.version).toBe(GREYGEN_APP_VERSION)
    expect(metadata.version).toBe('0.1.0')
    expect(metadata.private).toBe(true)
  })

  it('locks the v0.1 engine and persisted-state compatibility identifiers', () => {
    expect(DSP_ENGINE_VERSION).toBe(1)
    expect(AUDIO_PROTOCOL_VERSION).toBe(6)
    expect(SOUND_STATE_SCHEMA_VERSION).toBe(3)
    expect(PROFILE_STATE_SCHEMA_VERSION).toBe(2)
    expect(UI_STATE_SCHEMA_VERSION).toBe(2)
  })

  it('keeps the shipping runtime dependency surface intentionally minimal', () => {
    const runtimeDependencies = Object.entries(packageMetadata().dependencies)
    expect(runtimeDependencies).toEqual([
      ['react', '19.3.0'],
      ['react-dom', '19.3.0'],
    ])
  })

  it('keeps every locked third-party package attributable to registry metadata', () => {
    const locked = Object.entries(packageLockMetadata().packages).filter(
      ([path]) => path !== '',
    )
    const missingLicense = locked
      .filter(([, metadata]) => !metadata.license?.trim())
      .map(([path]) => path)
    const nonRegistryResolution = locked
      .filter(([, metadata]) => {
        const resolved = metadata.resolved
        return (
          typeof resolved === 'string' &&
          !resolved.startsWith('https://registry.npmjs.org/')
        )
      })
      .map(([path]) => path)

    expect(missingLicense).toEqual([])
    expect(nonRegistryResolution).toEqual([])
  })
})
