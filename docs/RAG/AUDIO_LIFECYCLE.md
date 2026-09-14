# Browser Audio Lifecycle and Worklet Protocol

Status: canonical contract for issue #5 browser audio integration.

## Boundary

Greygen keeps browser lifecycle/adaptation separate from the pure DSP implementation:

```text
React UI
  -> AudioEngine (main thread lifecycle/state)
    -> versioned MessagePort protocol
      -> AudioWorkletProcessor adapter
        -> GreygenDspEngine (pure TypeScript)
          -> seeded PRNG + spectral target/filter bank
```

`src/audio/dsp/engine.ts` is the reusable render engine used by Node/Vitest fixtures and by the worklet processor. It has no DOM, `AudioContext`, or `AudioWorklet` dependency. The worklet adapter does not duplicate spectral or random-generation logic.

The main thread never renders audio blocks.

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

## Protocol v1

`src/audio/protocol.ts` owns the shared structured-clone message contract. Every message carries `version: 1`; request/response traffic uses a positive integer `requestId`.

Main-thread commands:

- `initialize` — seed + serialized spectral state;
- `set-spectrum` — replace spectral target/user offsets;
- `reset-seed` — deterministically restart the source stream;
- `request-status` — low-rate explicit status/telemetry request;
- `stop` — stop processor output and acknowledge cleanup.

Processor responses:

- `ready` — initialization handshake including runtime sample rate and high-band mode;
- `ack` — command acknowledgement;
- `status` — sample rate, target id, high-band mode, and rendered-frame count;
- `stopped` — stop acknowledgement;
- `error` — invalid-message or DSP-engine failure.

Runtime parsers validate protocol version, request ids, uint32 seed bounds, preset ids, spectral offset shape/ranges, high-band mode, sample rate, and rendered-frame counters before data crosses the architectural boundary.

The protocol deliberately does not add meters, stereo controls, calibration fields, or animation fields before their owning issues. Those features extend the versioned union rather than inventing side-channel messages.

## Worklet hot path

`greygen-processor.ts` holds one `GreygenDspEngine` instance. `process()`:

1. obtains the browser-provided mono output buffer;
2. calls `engine.renderMono(output)`;
3. increments a primitive rendered-frame counter;
4. returns.

No logging, DOM/network access, Promise work, `MessagePort` traffic, object/array creation, or main-thread processing occurs per sample. Control messages are handled outside the sample loop.

Mono output is intentional in issue #5. Power-preserving stereo decorrelation belongs to issue #9.

## Worklet asset loading

The browser runtime imports the TypeScript processor with Vite's worker-URL transform (`?worker&url`) and passes the emitted URL to `audioWorklet.addModule()`. This makes both development and production builds resolve a compiled JavaScript worklet asset rather than attempting to load repository TypeScript directly.

The processor name is versioned (`greygen-processor-v1`) alongside protocol v1.

## Conservative bootstrap output level

Issue #5 connects the worklet through a main-thread `GainNode` fixed at `0.05` linear (about -26 dB) before `AudioDestinationNode`.

This is a temporary conservative bootstrap attenuation so the first live-audio milestone does not emit near-full-scale stochastic noise by default. It is **not** the final gain-safety design, limiter, meter stage, or master-level model. Issue #6 replaces/extends this with the documented nominal/safety/master/guard stages and telemetry.

No code should reinterpret this bootstrap gain as acoustic SPL or a universal safe listening level.

## Suspend/interruption behavior

`AudioEngine` listens for context `statechange` events. Both browser `suspended` and platform/browser `interrupted` states map to the recoverable Greygen `suspended` state. Greygen does not automatically resume them; the user receives an explicit Resume action.

A processor exception raises `processorerror`; because that node will thereafter output silence, Greygen closes the failed graph and exposes a recoverable error requiring a fresh start.

## Cleanup invariant

Stop, error cleanup, component unmount/HMR disposal, and failed startup all tear down the same owned resources:

- reject/clear pending protocol requests;
- detach processor/context event handlers;
- close the MessagePort when available;
- disconnect worklet and gain nodes;
- close the `AudioContext` when it is not already closed;
- clear facade references.

A missing stop acknowledgement does not block cleanup.

## Testability

`AudioEngine` depends on a small `AudioEngineRuntime` port rather than constructing browser globals internally. Unit tests use deterministic fake contexts/nodes/ports to prove:

- no context creation before explicit Start;
- start/handshake/running transitions;
- control/status round trips;
- interruption and explicit resume;
- capability failures;
- module-load failures;
- processor errors;
- stop/disconnect/context-close cleanup.

Playwright additionally exercises the production Vite worklet URL and real Chromium AudioWorklet path on localhost, plus a feature-override unsupported state.

## Platform references

- https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- https://developer.mozilla.org/en-US/docs/Web/API/Worklet/addModule
- https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state
- https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode/processorerror_event
- https://vite.dev/guide/features.html#web-workers
