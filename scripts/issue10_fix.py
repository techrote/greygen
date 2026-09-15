from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    if old not in source:
        raise SystemExit(f'missing pattern in {path}: {old[:100]!r}')
    file.write_text(source.replace(old, new, 1))


# Type narrowing already excludes Off before the mode switch.
replace_once(
    'src/audio/dsp/animation.ts',
    "        case 'orbit':\n          raw = 0.48 * Math.sin(this.phase - position * TWO_PI)\n          break\n        case 'off':\n          raw = 0\n",
    "        case 'orbit':\n          raw = 0.48 * Math.sin(this.phase - position * TWO_PI)\n          break\n",
)

# Reset-seed message must preserve the parsed seed value explicitly.
replace_once(
    'src/audio/protocol.ts',
    "        type: 'reset-seed',\n        requestId: value.requestId,\n        seed,\n",
    "        type: 'reset-seed',\n        requestId: value.requestId,\n        seed: value.seed,\n",
)

# Static app surface fixtures now supply the active animation controls.
path = 'tests/app-shell.test.tsx'
replace_once(
    path,
    "} from '../src/app/App'\nimport { createSpectrumState }",
    "} from '../src/app/App'\nimport { createAnimationState } from '../src/audio/dsp/animation'\nimport { createSpectrumState }",
)
replace_once(
    path,
    "    stereoWidth: 0.5,\n    engineReady: true,",
    "    stereoWidth: 0.5,\n    animation: createAnimationState(),\n    engineReady: true,",
)
replace_once(
    path,
    "    onStereoWidthChange: noop,\n    onToggleFutureFeatures: noop,",
    "    onStereoWidthChange: noop,\n    onAnimationModeChange: noop,\n    onAnimationDepthChange: noop,\n    onAnimationSpeedChange: noop,\n    onAnimationEnergyChange: noop,\n    onToggleFutureFeatures: noop,",
)

# AudioEngine mock protocol gains the animation state and command.
path = 'tests/audio/AudioEngine.test.ts'
replace_once(
    path,
    "} from '../../src/audio/AudioEngine'\nimport { createGainStageState }",
    "} from '../../src/audio/AudioEngine'\nimport { createAnimationState } from '../../src/audio/dsp/animation'\nimport { createGainStageState }",
)
replace_once(
    path,
    "  type TelemetryMessage,\n  type WorkletToMainMessage,\n} from '../../src/audio/protocol'",
    "  type TelemetryMessage,\n  type WorkletToMainMessage,\n  serializeAnimationState,\n} from '../../src/audio/protocol'",
)
replace_once(
    path,
    "  private stereoWidth = 0.5\n",
    "  private stereoWidth = 0.5\n  private animation = serializeAnimationState(createAnimationState())\n",
)
replace_once(
    path,
    "        this.stereoWidth = message.stereoWidth.width\n        response = {",
    "        this.stereoWidth = message.stereoWidth.width\n        this.animation = message.animation\n        response = {",
)
replace_once(
    path,
    "          stereoWidth: this.stereoWidth,\n        }\n        break\n      case 'set-spectrum':",
    "          stereoWidth: this.stereoWidth,\n          animation: this.animation,\n        }\n        break\n      case 'set-spectrum':",
)
replace_once(
    path,
    "      case 'reset-seed':\n",
    "      case 'set-animation':\n        this.animation = message.animation\n        response = {\n          version: AUDIO_PROTOCOL_VERSION,\n          type: 'ack',\n          requestId: message.requestId,\n          command: 'set-animation',\n        }\n        break\n      case 'reset-seed':\n",
)
replace_once(
    path,
    "          stereoWidth: this.stereoWidth,\n          renderedFrames: 256,",
    "          stereoWidth: this.stereoWidth,\n          animation: this.animation,\n          renderedFrames: 256,",
)
replace_once(
    path,
    "round-trips spectrum, gain controls, stereo width, seed, and status through protocol v3",
    "round-trips spectrum, gain controls, stereo width, animation, seed, and status through protocol v4",
)
replace_once(
    path,
    "    await engine.setStereoWidth(0.82)\n    await engine.resetSeed(1234)",
    "    await engine.setStereoWidth(0.82)\n    await engine.setAnimationState(createAnimationState('orbit', 99, 6, 1.5, true))\n    await engine.resetSeed(1234)",
)
replace_once(
    path,
    "      stereoWidth: 0.82,\n      renderedFrames: 256,",
    "      stereoWidth: 0.82,\n      animation: { mode: 'orbit', seed: 99, depthDb: 6, speed: 1.5 },\n      renderedFrames: 256,",
)
