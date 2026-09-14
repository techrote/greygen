# Browser Audio Lifecycle and Worklet Protocol

Status: canonical contract for browser audio integration after issues #5–#6.

## Boundary

Greygen keeps browser lifecycle/adaptation separate from the pure DSP implementation:

```text
React UI
  -> AudioEngine (main-thread lifecycle/state)
    -> versioned MessagePort protocol
      -> AudioWorkletProcessor adapter
        -> GreygenDspEngine (pure TypeScript)
          -> source + spectral shaping + gain safety + meters
```

`src/audio/dsp/engine.ts` is the reusable render engine used by Node/Vitest fixtures and by the worklet processor. It has no DOM, `AudioContext`, or `AudioWorklet` dependency. The worklet adapter does not duplicate DSP logic.

The main thread never renders audio blocks and no longer applies a separate output `GainNode`; issue #6 moved master/safety/guard semantics into the pure engine. See `GAIN_SAFETY.md`.

## Lifecycle states

`AudioEngine` exposes explicit snapshot states:

- `ready` — capability checks passed, but no `AudioContext` exists;
- `starting` — an explicit user action is creating/resuming the context, loading the worklet module, and completing the processor handshake;
- `running` — processor handshake completed and the browser context reports `running`;
- `suspended` — the context reports `suspended` or `interrupted`; another explicit Resume action is available;
- `error` — a recoverable runtime failure occurred, with a typed/actionable error;
- `stopped` — nodes are disconnected and the context is closed;
- `unsupported` — the environment is missing a required capability or secure context.

Constructing `AudioEngine` never creates an `AudioContext`. `startFromUserGesture()` is the only ordinary entry point that creates a context, and `resumeFromUserGesture()` is the explicit resume path. Imported/persisted state must not call either method automatically.

## Capability and error model

Capability checks distinguish:

- insecure context;
- missing `AudioContext`;
- missing `AudioWorkletNode`;
- a context that does not expose `audioWorklet`.

Runtime failures distinguish at least:

- context resume failure;
- worklet module load failure;
- processor-node construction failure;
- `processorerror`;
- invalid/incompatible protocol traffic;
- request timeout/control-send failure.

Errors are surfaced in `AudioEngineSnapshot.error`; they are not swallowed. The UI states what the user can do next rather than silently leaving a dead transport.

## Protocol v2

`src/audio/protocol.ts` owns the shared structured-clone message contract. Issue #6 advances the version to `2`; request/response traffic uses a positive integer `requestId`.

Main-thread commands:

- `initialize` — seed + serialized spectral state + serialized gain-stage state;
- `set-spectrum` — replace spectral target/user offsets;
- `set-gain-stage` — replace master/animation-placeholder/calibration-placeholder gain state;
- `reset-seed` — deterministically restart the source stream;
- `request-status` — explicit low-rate runtime-status request;
- `stop` — stop processor output and acknowledge cleanup.

Processor responses:

- `ready` — initialization handshake including runtime sample rate and high-band mode;
- `ack` — command acknowledgement;
- `status` — sample rate, target id, high-band mode, and rendered-frame count;
- `telemetry` — unsolicited bounded-rate digital peak/RMS/safety/master/guard data;
- `stopped` — stop acknowledgement;
- `error` — invalid-message or DSP-engine failure.

Runtime parsers validate protocol version, request ids, uint32 seed bounds, spectral/gain-state shape and ranges, high-band mode, sample rate, frame counters, and all telemetry numbers before data crosses the architectural boundary.

Telemetry is intentionally not request-scoped and therefore does not consume request ids. Later features extend the typed union rather than inventing ad-hoc side channels.

## Worklet hot path

`greygen-processor.ts` holds one `GreygenDspEngine` instance. A newly constructed processor remains alive but emits zeros until a valid `initialize` message has reset the engine to the requested seed, spectrum, and gain state. This prevents constructor defaults from leaking into the destination during the node-to-handshake interval.

Once initialized, `process()`:

1. obtains the browser-provided mono output buffer;
2. calls `engine.renderMono(output)`;
3. increments primitive frame counters;
4. emits telemetry only when the bounded interval is reached;
5. returns `true`.

After an acknowledged `stop`, the processor zeros any final supplied output buffer and returns `false` so the browser may retire the processor. Before initialization it zeros the supplied buffer but returns `true`, allowing the handshake to complete.

No logging, DOM/network access, Promise work, or deliberate object/array creation occurs per sample. The only regular `MessagePort` emission is telemetry at nominally 10 Hz, not once per render quantum.

Mono output remains intentional. Power-preserving stereo decorrelation belongs to issue #9.

## Worklet asset loading

The browser runtime imports the TypeScript processor with Vite's worker-URL transform (`?worker&url`) and passes the emitted URL to `audioWorklet.addModule()`. Development and production therefore load compiled JavaScript rather than repository TypeScript.

The processor name is versioned (`greygen-processor-v2`) alongside protocol v2.

## Output-level ownership

The temporary issue #5 main-thread `GainNode` has been removed. The default conservative `0.05` linear level survives as the issue #6 **master-gain default inside the pure DSP engine**, where it is smoothed and metered.

Safety pre-gain, master gain, final guard, and dBFS meters are defined in `GAIN_SAFETY.md`. None of those values is an acoustic SPL measurement or a universal safe-listening guarantee.

## Suspend/interruption behavior

`AudioEngine` listens for context `statechange` events. Both browser `suspended` and platform/browser `interrupted` states map to the recoverable Greygen `suspended` state. Greygen does not automatically resume them; the user receives an explicit Resume action.

A processor exception raises `processorerror`; because that node will thereafter output silence, Greygen closes the failed graph and exposes a recoverable error requiring a fresh start.

## Cleanup invariant

Stop, error cleanup, component unmount/HMR disposal, and failed startup all tear down the same owned resources:

- reject/clear pending protocol requests;
- detach processor/context event handlers;
- close the MessagePort when available;
- disconnect the worklet node;
- close the `AudioContext` when it is not already closed;
- clear facade references and stale telemetry.

A missing stop acknowledgement does not block cleanup.

## Testability

`AudioEngine` depends on a small `AudioEngineRuntime` port rather than constructing browser globals internally. Unit tests use deterministic fake contexts/nodes/ports to prove:

- no context creation before explicit Start;
- start/handshake/running transitions;
- spectrum/gain/control/status round trips;
- unsolicited telemetry propagation;
- interruption and explicit resume;
- capability failures;
- module-load failures;
- processor errors;
- stop/disconnect/context-close cleanup.

Playwright exercises the production Vite worklet URL and real Chromium AudioWorklet path on localhost, waits for actual dBFS telemetry, verifies clean Stop/close, and covers a feature-override unsupported state.

## Platform references

- https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- https://developer.mozilla.org/en-US/docs/Web/API/Worklet/addModule
- https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state
- https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode/processorerror_event
- https://vite.dev/guide/features.html#web-workers
