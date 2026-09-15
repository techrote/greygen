from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    if old not in source:
        raise SystemExit(f'missing pattern in {path}: {old[:100]!r}')
    file.write_text(source.replace(old, new, 1))


# AudioEngine: own animation state and route it through protocol v4.
path = 'src/audio/AudioEngine.ts'
replace_once(
    path,
    "import { DEFAULT_ENGINE_PRESET, DEFAULT_ENGINE_SEED } from './dsp/engine'\n",
    "import { type AnimationState, createAnimationState } from './dsp/animation'\nimport { DEFAULT_ENGINE_PRESET, DEFAULT_ENGINE_SEED } from './dsp/engine'\n",
)
replace_once(
    path,
    "  serializeGainStageState,\n  serializeSpectrumState,\n  serializeStereoWidthState,\n",
    "  serializeAnimationState,\n  serializeGainStageState,\n  serializeSpectrumState,\n  serializeStereoWidthState,\n",
)
replace_once(
    path,
    "function canonicalStereoWidth(state: StereoWidthState): StereoWidthState {\n  return createStereoWidthState(state.width)\n}\n",
    "function canonicalStereoWidth(state: StereoWidthState): StereoWidthState {\n  return createStereoWidthState(state.width)\n}\n\nfunction canonicalAnimation(state: AnimationState): AnimationState {\n  return createAnimationState(\n    state.mode,\n    state.seed,\n    state.depthDb,\n    state.speed,\n    state.energyPreserving,\n  )\n}\n",
)
replace_once(
    path,
    "  private stereoWidthValue: StereoWidthState\n",
    "  private stereoWidthValue: StereoWidthState\n  private animationValue: AnimationState\n",
)
replace_once(
    path,
    "    stereoWidthState: StereoWidthState = createStereoWidthState(\n      DEFAULT_STEREO_WIDTH,\n    ),\n  ) {",
    "    stereoWidthState: StereoWidthState = createStereoWidthState(\n      DEFAULT_STEREO_WIDTH,\n    ),\n    animationState: AnimationState = createAnimationState(),\n  ) {",
)
replace_once(
    path,
    "    this.stereoWidthValue = canonicalStereoWidth(stereoWidthState)\n    const capability",
    "    this.stereoWidthValue = canonicalStereoWidth(stereoWidthState)\n    this.animationValue = canonicalAnimation(animationState)\n    const capability",
)
replace_once(
    path,
    "          stereoWidth: serializeStereoWidthState(this.stereoWidthValue),\n        },",
    "          stereoWidth: serializeStereoWidthState(this.stereoWidthValue),\n          animation: serializeAnimationState(this.animationValue),\n        },",
)
anchor = "  async resetSeed(seed: number): Promise<void> {"
method = """  async setAnimationState(state: AnimationState): Promise<void> {
    const canonical = canonicalAnimation(state)
    this.animationValue = canonical

    if (!this.node) {
      return
    }

    const response = await this.request(
      {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-animation',
        requestId: this.allocateRequestId(),
        animation: serializeAnimationState(canonical),
      },
      'ack',
    )
    if (response.type !== 'ack' || response.command !== 'set-animation') {
      throw new Error('Unexpected set-animation acknowledgement')
    }
  }

"""
replace_once(path, anchor, method + anchor)

# App state: SoundState v3 owns generic animation settings and migrates old sound to Off.
path = 'src/app/state/appState.ts'
replace_once(
    path,
    "import {\n  DEFAULT_ENGINE_PRESET,\n  DEFAULT_ENGINE_SEED,\n} from '../../audio/dsp/engine'\n",
    "import {\n  ANIMATION_DEPTH_MAX_DB,\n  ANIMATION_DEPTH_MIN_DB,\n  ANIMATION_SPEED_MAX,\n  ANIMATION_SPEED_MIN,\n  type AnimationState,\n  createAnimationState,\n  isAnimationMode,\n} from '../../audio/dsp/animation'\nimport {\n  DEFAULT_ENGINE_PRESET,\n  DEFAULT_ENGINE_SEED,\n} from '../../audio/dsp/engine'\n",
)
replace_once(
    path,
    "export const SOUND_STATE_SCHEMA_VERSION = 2 as const",
    "export const SOUND_STATE_SCHEMA_VERSION = 3 as const",
)
replace_once(
    path,
    "  readonly masterGainDb: number\n  readonly stereoWidth: number\n}",
    "  readonly masterGainDb: number\n  readonly stereoWidth: number\n  readonly animation: AnimationState\n}",
)
replace_once(
    path,
    "interface LegacySoundStateV1 {\n  readonly schemaVersion: 1\n  readonly seed?: unknown\n  readonly targetId?: unknown\n  readonly userBandOffsetsDb?: unknown\n  readonly masterGainDb?: unknown\n}\n",
    "interface LegacySoundStateV1 {\n  readonly schemaVersion: 1\n  readonly seed?: unknown\n  readonly targetId?: unknown\n  readonly userBandOffsetsDb?: unknown\n  readonly masterGainDb?: unknown\n}\n\ninterface LegacySoundStateV2 {\n  readonly schemaVersion: 2\n  readonly seed?: unknown\n  readonly targetId?: unknown\n  readonly userBandOffsetsDb?: unknown\n  readonly masterGainDb?: unknown\n  readonly stereoWidth?: unknown\n}\n",
)
replace_once(
    path,
    "  masterGainDb: number,\n  stereoWidth: number,\n): SoundState {",
    "  masterGainDb: number,\n  stereoWidth: number,\n  animationState: AnimationState,\n): SoundState {",
)
replace_once(
    path,
    "  const stereo = createStereoWidthState(stereoWidth)\n\n  return Object.freeze({",
    "  const stereo = createStereoWidthState(stereoWidth)\n  const animation = createAnimationState(\n    animationState.mode,\n    animationState.seed,\n    animationState.depthDb,\n    animationState.speed,\n    animationState.energyPreserving,\n  )\n\n  return Object.freeze({",
)
replace_once(
    path,
    "    masterGainDb,\n    stereoWidth: stereo.width,\n  })",
    "    masterGainDb,\n    stereoWidth: stereo.width,\n    animation,\n  })",
)
replace_once(
    path,
    "    DEFAULT_MASTER_GAIN_DB,\n    DEFAULT_STEREO_WIDTH,\n  )",
    "    DEFAULT_MASTER_GAIN_DB,\n    DEFAULT_STEREO_WIDTH,\n    createAnimationState(),\n  )",
)
replace_once(
    path,
    "  readonly masterGainDb: number\n  readonly stereoWidth?: number\n}): SoundState {",
    "  readonly masterGainDb: number\n  readonly stereoWidth?: number\n  readonly animation?: AnimationState\n}): SoundState {",
)
replace_once(
    path,
    "    input.masterGainDb,\n    input.stereoWidth ?? DEFAULT_STEREO_WIDTH,\n  )",
    "    input.masterGainDb,\n    input.stereoWidth ?? DEFAULT_STEREO_WIDTH,\n    input.animation ?? createAnimationState(),\n  )",
)
replace_once(
    path,
    "export function soundStateToSpectrumState(state: SoundState): SpectrumState {\n  return createSpectrumState(state.targetId, state.userBandOffsetsDb)\n}\n",
    "export function soundStateToSpectrumState(state: SoundState): SpectrumState {\n  return createSpectrumState(state.targetId, state.userBandOffsetsDb)\n}\n\nexport function soundStateToAnimationState(state: SoundState): AnimationState {\n  return createAnimationState(\n    state.animation.mode,\n    state.animation.seed,\n    state.animation.depthDb,\n    state.animation.speed,\n    state.animation.energyPreserving,\n  )\n}\n",
)
# Insert animation recovery immediately before canonical return.
old = """  } else if (value.stereoWidth !== undefined) {
    messages.push('Invalid stereo width was replaced with the Normal default.')
  }

  return {
    state: canonicalSoundState(
      seed,
      targetId,
      offsets,
      masterGainDb,
      stereoWidth,
    ),
"""
new = """  } else if (value.stereoWidth !== undefined) {
    messages.push('Invalid stereo width was replaced with the Normal default.')
  }

  const defaultAnimation = createAnimationState()
  let animation = defaultAnimation
  if (isRecord(value.animation)) {
    const mode = isAnimationMode(value.animation.mode)
      ? value.animation.mode
      : defaultAnimation.mode
    const animationSeed = isAudioSeed(value.animation.seed)
      ? value.animation.seed
      : defaultAnimation.seed
    const depthDb =
      typeof value.animation.depthDb === 'number' &&
      Number.isFinite(value.animation.depthDb)
        ? clamp(
            value.animation.depthDb,
            ANIMATION_DEPTH_MIN_DB,
            ANIMATION_DEPTH_MAX_DB,
          )
        : defaultAnimation.depthDb
    const speed =
      typeof value.animation.speed === 'number' &&
      Number.isFinite(value.animation.speed)
        ? clamp(
            value.animation.speed,
            ANIMATION_SPEED_MIN,
            ANIMATION_SPEED_MAX,
          )
        : defaultAnimation.speed
    const energyPreserving =
      typeof value.animation.energyPreserving === 'boolean'
        ? value.animation.energyPreserving
        : defaultAnimation.energyPreserving
    if (
      mode !== value.animation.mode ||
      animationSeed !== value.animation.seed ||
      depthDb !== value.animation.depthDb ||
      speed !== value.animation.speed ||
      energyPreserving !== value.animation.energyPreserving
    ) {
      messages.push('Invalid animation settings were recovered to supported bounds.')
    }
    animation = createAnimationState(
      mode,
      animationSeed,
      depthDb,
      speed,
      energyPreserving,
    )
  } else if (value.animation !== undefined) {
    messages.push('Invalid animation state was replaced with Off defaults.')
  }

  return {
    state: canonicalSoundState(
      seed,
      targetId,
      offsets,
      masterGainDb,
      stereoWidth,
      animation,
    ),
"""
replace_once(path, old, new)
# Add v2 migration before v1 migration.
anchor = "export function migrateSoundStateV1(\n"
method = """export function migrateSoundStateV2(
  legacy: LegacySoundStateV2,
): StateParseResult<SoundState> {
  const normalized = normalizeSoundRecord({
    schemaVersion: SOUND_STATE_SCHEMA_VERSION,
    seed: legacy.seed,
    targetId: legacy.targetId,
    userBandOffsetsDb: legacy.userBandOffsetsDb,
    masterGainDb: legacy.masterGainDb,
    stereoWidth: legacy.stereoWidth,
    animation: createAnimationState('off'),
  })
  return {
    state: normalized.state,
    code: 'migrated',
    messages: Object.freeze([
      'Sound state schema v2 was migrated to v3 with spectral animation Off to preserve the previous renderer.',
      ...normalized.messages,
    ]),
  }
}

"""
replace_once(path, anchor, method + anchor)
replace_once(
    path,
    "    stereoWidth: 0,\n  })\n",
    "    stereoWidth: 0,\n    animation: createAnimationState('off'),\n  })\n",
)
# second occurrence for v0
source = Path(path).read_text()
needle = "    stereoWidth: 0,\n  })\n"
if needle not in source:
    raise SystemExit('missing second legacy stereoWidth migration')
Path(path).write_text(source.replace(needle, "    stereoWidth: 0,\n    animation: createAnimationState('off'),\n  })\n", 1))
# Migration messages mention v3.
source = Path(path).read_text().replace(
    'was migrated to v2 with Mono width to preserve the previous renderer.',
    'was migrated to v3 with Mono width and animation Off to preserve the previous renderer.',
)
Path(path).write_text(source)
replace_once(
    path,
    "  if (value.schemaVersion === 1) {\n    return migrateSoundStateV1(value as unknown as LegacySoundStateV1)\n  }\n",
    "  if (value.schemaVersion === 1) {\n    return migrateSoundStateV1(value as unknown as LegacySoundStateV1)\n  }\n  if (value.schemaVersion === 2) {\n    return migrateSoundStateV2(value as unknown as LegacySoundStateV2)\n  }\n",
)

# App UI/state integration.
path = 'src/app/App.tsx'
replace_once(
    path,
    "import type {\n  AudioEngine,",
    "import {\n  ANIMATION_DEPTH_MAX_DB,\n  ANIMATION_DEPTH_MIN_DB,\n  ANIMATION_MODES,\n  ANIMATION_SPEED_MAX,\n  ANIMATION_SPEED_MIN,\n  type AnimationMode,\n  type AnimationState,\n  animationModeLabel,\n  createAnimationState,\n} from '../audio/dsp/animation'\nimport type {\n  AudioEngine,",
)
replace_once(
    path,
    "  soundStateToSpectrumState,\n} from './state/appState'",
    "  soundStateToAnimationState,\n  soundStateToSpectrumState,\n} from './state/appState'",
)
replace_once(
    path,
    "const STEREO_WIDTH_STEP = 0.01\n",
    "const STEREO_WIDTH_STEP = 0.01\nconst ANIMATION_DEPTH_STEP_DB = 0.5\nconst ANIMATION_SPEED_STEP = 0.25\n",
)
replace_once(
    path,
    "  readonly stereoWidth: number\n  readonly engineReady: boolean",
    "  readonly stereoWidth: number\n  readonly animation: AnimationState\n  readonly engineReady: boolean",
)
replace_once(
    path,
    "  readonly onStereoWidthChange: (width: number) => void\n  readonly onToggleFutureFeatures",
    "  readonly onStereoWidthChange: (width: number) => void\n  readonly onAnimationModeChange: (mode: AnimationMode) => void\n  readonly onAnimationDepthChange: (depthDb: number) => void\n  readonly onAnimationSpeedChange: (speed: number) => void\n  readonly onAnimationEnergyChange: (enabled: boolean) => void\n  readonly onToggleFutureFeatures",
)
replace_once(
    path,
    "  stereoWidth,\n  engineReady,",
    "  stereoWidth,\n  animation,\n  engineReady,",
)
replace_once(
    path,
    "  onStereoWidthChange,\n  onToggleFutureFeatures,",
    "  onStereoWidthChange,\n  onAnimationModeChange,\n  onAnimationDepthChange,\n  onAnimationSpeedChange,\n  onAnimationEnergyChange,\n  onToggleFutureFeatures,",
)
# Add select guard after preset handler.
replace_once(
    path,
    "  const handlePresetChange = (event: ChangeEvent<HTMLSelectElement>): void => {\n    if (isPresetId(event.currentTarget.value)) {\n      onPresetChange(event.currentTarget.value)\n    }\n  }\n",
    "  const handlePresetChange = (event: ChangeEvent<HTMLSelectElement>): void => {\n    if (isPresetId(event.currentTarget.value)) {\n      onPresetChange(event.currentTarget.value)\n    }\n  }\n\n  const handleAnimationModeChange = (\n    event: ChangeEvent<HTMLSelectElement>,\n  ): void => {\n    const mode = event.currentTarget.value as AnimationMode\n    if (ANIMATION_MODES.includes(mode)) {\n      onAnimationModeChange(mode)\n    }\n  }\n",
)
old = """            <fieldset disabled>
              <legend>Spectral animation</legend>
              <select
                value="off"
                aria-label="Spectral animation, unavailable until animation engine is implemented"
                onChange={() => undefined}
              >
                <option value="off">Off — coming in issue #10</option>
              </select>
              <p>
                No fake motion: deterministic bounded animation is not active
                yet.
              </p>
            </fieldset>
"""
new = """            <fieldset className="animation-controls" disabled={controlsDisabled}>
              <legend>Spectral animation</legend>
              <label htmlFor="animation-mode">Mode</label>
              <select
                id="animation-mode"
                value={animation.mode}
                aria-label={`Spectral animation mode, ${animationModeLabel(animation.mode)}`}
                onChange={handleAnimationModeChange}
              >
                {ANIMATION_MODES.map((mode) => (
                  <option value={mode} key={mode}>
                    {animationModeLabel(mode)}
                  </option>
                ))}
              </select>
              <label htmlFor="animation-depth">Depth</label>
              <input
                id="animation-depth"
                type="range"
                min={ANIMATION_DEPTH_MIN_DB}
                max={ANIMATION_DEPTH_MAX_DB}
                step={ANIMATION_DEPTH_STEP_DB}
                value={animation.depthDb}
                aria-label={`Animation depth, ${animation.depthDb.toFixed(1)} dB`}
                aria-valuetext={`${animation.depthDb.toFixed(1)} dB`}
                onChange={(event) =>
                  onAnimationDepthChange(Number(event.currentTarget.value))
                }
              />
              <output htmlFor="animation-depth">
                {animation.depthDb.toFixed(1)} dB
              </output>
              <label htmlFor="animation-speed">Speed</label>
              <input
                id="animation-speed"
                type="range"
                min={ANIMATION_SPEED_MIN}
                max={ANIMATION_SPEED_MAX}
                step={ANIMATION_SPEED_STEP}
                value={animation.speed}
                aria-label={`Animation speed, ${animation.speed.toFixed(2)} times`}
                aria-valuetext={`${animation.speed.toFixed(2)}×`}
                onChange={(event) =>
                  onAnimationSpeedChange(Number(event.currentTarget.value))
                }
              />
              <output htmlFor="animation-speed">
                {animation.speed.toFixed(2)}×
              </output>
              <label className="animation-energy-toggle">
                <input
                  id="animation-energy"
                  type="checkbox"
                  checked={animation.energyPreserving}
                  onChange={(event) =>
                    onAnimationEnergyChange(event.currentTarget.checked)
                  }
                />
                Preserve mean band power
              </label>
              <p>
                Seeded motion is bounded and returns smoothly to the underlying
                spectrum when switched Off.
              </p>
            </fieldset>
"""
replace_once(path, old, new)
# Bootstrap animation before enabling controls.
replace_once(
    path,
    "        await engine.setStereoWidth(loaded.sound.stereoWidth)\n",
    "        await engine.setStereoWidth(loaded.sound.stereoWidth)\n        await engine.setAnimationState(soundStateToAnimationState(loaded.sound))\n",
)
# Preserve animation in all existing createSoundState calls by inserting after stereoWidth lines.
source = Path(path).read_text()
source = source.replace(
    "      stereoWidth: soundState.stereoWidth,\n    })",
    "      stereoWidth: soundState.stereoWidth,\n      animation: soundState.animation,\n    })",
)
source = source.replace(
    "      stereoWidth: width,\n    })",
    "      stereoWidth: width,\n      animation: soundState.animation,\n    })",
)
Path(path).write_text(source)
# Add animation commit handlers before toggle future features.
anchor = "  const handleToggleFutureFeatures = (): void => {"
method = """  const commitAnimationState = (animation: AnimationState): void => {
    const engine = engineRef.current
    if (!engine) {
      return
    }
    const next = createSoundState({
      seed: soundState.seed,
      targetId: soundState.targetId,
      userBandOffsetsDb: soundState.userBandOffsetsDb,
      masterGainDb: soundState.masterGainDb,
      stereoWidth: soundState.stereoWidth,
      animation,
    })
    setControlError(null)
    setSoundState(next)
    void engine
      .setAnimationState(animation)
      .then(() => persistSound(next))
      .catch(reportControlFailure)
  }

  const handleAnimationModeChange = (mode: AnimationMode): void => {
    commitAnimationState(
      createAnimationState(
        mode,
        soundState.animation.seed,
        soundState.animation.depthDb,
        soundState.animation.speed,
        soundState.animation.energyPreserving,
      ),
    )
  }

  const handleAnimationDepthChange = (depthDb: number): void => {
    commitAnimationState(
      createAnimationState(
        soundState.animation.mode,
        soundState.animation.seed,
        depthDb,
        soundState.animation.speed,
        soundState.animation.energyPreserving,
      ),
    )
  }

  const handleAnimationSpeedChange = (speed: number): void => {
    commitAnimationState(
      createAnimationState(
        soundState.animation.mode,
        soundState.animation.seed,
        soundState.animation.depthDb,
        speed,
        soundState.animation.energyPreserving,
      ),
    )
  }

  const handleAnimationEnergyChange = (enabled: boolean): void => {
    commitAnimationState(
      createAnimationState(
        soundState.animation.mode,
        soundState.animation.seed,
        soundState.animation.depthDb,
        soundState.animation.speed,
        enabled,
      ),
    )
  }

"""
replace_once(path, anchor, method + anchor)
replace_once(
    path,
    "      engine.setStereoWidth(next.stereoWidth),\n    ])",
    "      engine.setStereoWidth(next.stereoWidth),\n      engine.setAnimationState(soundStateToAnimationState(next)),\n    ])",
)
replace_once(
    path,
    "      stereoWidth={soundState.stereoWidth}\n      engineReady={engineReady}",
    "      stereoWidth={soundState.stereoWidth}\n      animation={soundState.animation}\n      engineReady={engineReady}",
)
replace_once(
    path,
    "      onStereoWidthChange={handleStereoWidthChange}\n      onToggleFutureFeatures",
    "      onStereoWidthChange={handleStereoWidthChange}\n      onAnimationModeChange={handleAnimationModeChange}\n      onAnimationDepthChange={handleAnimationDepthChange}\n      onAnimationSpeedChange={handleAnimationSpeedChange}\n      onAnimationEnergyChange={handleAnimationEnergyChange}\n      onToggleFutureFeatures",
)
