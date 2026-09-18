import { createServer } from 'vite'

const PRESET_IDS = new Set(['white', 'pink', 'brown', 'grey'])
const ANIMATION_MODES = new Set(['off', 'drift', 'breathe', 'wander', 'orbit'])

const HELP = `Greygen DSP characterization

Usage:
  npm run characterize -- [options]

Options:
  --sample-rate <hz>       Runtime sample rate (default: 48000)
  --frames <count>         Rendered frames per measurement (default: 262144)
  --seed <uint32>          Engine seed; decimal or 0x-prefixed hexadecimal
  --preset <id>            white | pink | brown | grey (default: grey)
  --width <0..1>           Stereo width (default: 0.5)
  --animation <mode>       off | drift | breathe | wander | orbit (default: off)
  --animation-depth <db>   Animation depth in dB (default: 4)
  --animation-speed <x>    Animation speed multiplier (default: 1)
  --no-energy-preserving   Disable animation mean-band-power normalization
  --json                   Emit versioned JSON instead of human-readable text
  --help                   Show this help

The wall-time/realtime-factor fields are informational machine-local benchmark data.
All DSP measurements are offline and require no browser or audio device.
`

function takeValue(args, index, flag) {
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

function parseNumber(value, flag) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be a finite number`)
  }
  return parsed
}

function parseSeed(value) {
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/iu.test(value)) {
    throw new Error('--seed must be a decimal or 0x-prefixed unsigned integer')
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff_ffff) {
    throw new Error('--seed must fit in an unsigned 32-bit integer')
  }
  return parsed
}

function parseArgs(args) {
  const options = {
    sampleRate: undefined,
    frameCount: undefined,
    seed: undefined,
    presetId: undefined,
    stereoWidth: undefined,
    animationMode: undefined,
    animationDepthDb: undefined,
    animationSpeed: undefined,
    animationEnergyPreserving: true,
    json: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    switch (argument) {
      case '--help':
      case '-h':
        return 'help'
      case '--json':
        options.json = true
        break
      case '--no-energy-preserving':
        options.animationEnergyPreserving = false
        break
      case '--sample-rate':
        options.sampleRate = parseNumber(
          takeValue(args, index, argument),
          argument,
        )
        index += 1
        break
      case '--frames':
        options.frameCount = parseNumber(
          takeValue(args, index, argument),
          argument,
        )
        index += 1
        break
      case '--seed':
        options.seed = parseSeed(takeValue(args, index, argument))
        index += 1
        break
      case '--preset': {
        const value = takeValue(args, index, argument)
        if (!PRESET_IDS.has(value)) {
          throw new Error('--preset must be white, pink, brown, or grey')
        }
        options.presetId = value
        index += 1
        break
      }
      case '--width':
        options.stereoWidth = parseNumber(
          takeValue(args, index, argument),
          argument,
        )
        index += 1
        break
      case '--animation': {
        const value = takeValue(args, index, argument)
        if (!ANIMATION_MODES.has(value)) {
          throw new Error(
            '--animation must be off, drift, breathe, wander, or orbit',
          )
        }
        options.animationMode = value
        index += 1
        break
      }
      case '--animation-depth':
        options.animationDepthDb = parseNumber(
          takeValue(args, index, argument),
          argument,
        )
        index += 1
        break
      case '--animation-speed':
        options.animationSpeed = parseNumber(
          takeValue(args, index, argument),
          argument,
        )
        index += 1
        break
      default:
        throw new Error(`unknown option: ${argument}`)
    }
  }

  return options
}

async function loadCharacterizationModule() {
  const server = await createServer({
    root: process.cwd(),
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: {
      middlewareMode: true,
    },
  })

  try {
    const module = await server.ssrLoadModule(
      '/src/audio/analysis/characterization.ts',
    )
    return {
      module,
      close: () => server.close(),
    }
  } catch (error) {
    await server.close()
    throw error
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed === 'help') {
    process.stdout.write(HELP)
    return
  }

  const loaded = await loadCharacterizationModule()
  try {
    const report = loaded.module.characterizeDsp({
      sampleRate: parsed.sampleRate,
      frameCount: parsed.frameCount,
      seed: parsed.seed,
      presetId: parsed.presetId,
      stereoWidth: parsed.stereoWidth,
      animationMode: parsed.animationMode,
      animationDepthDb: parsed.animationDepthDb,
      animationSpeed: parsed.animationSpeed,
      animationEnergyPreserving: parsed.animationEnergyPreserving,
      environment: {
        runtime: `node ${process.version}`,
        platform: process.platform,
        architecture: process.arch,
      },
    })

    if (parsed.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    } else {
      process.stdout.write(loaded.module.formatCharacterizationReport(report))
    }
  } finally {
    await loaded.close()
  }
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`characterize: ${message}\n`)
  process.exitCode = 1
}
