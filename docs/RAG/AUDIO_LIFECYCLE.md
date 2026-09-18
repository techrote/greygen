# Browser Audio Lifecycle and Worklet Protocol

Status: canonical contract for browser audio integration, reconciled through issue #19 cross-browser/conformance hardening.

## Boundary

Greygen keeps browser lifecycle/adaptation separate from the pure DSP implementation:

```text
React UI
  -> AudioEngine (main-thread lifecycle/state)
    -> versioned MessagePort protocol
      -> AudioWorkletProcessor adapter
        -> GreygenDspEngine (pure TypeScript)
          -> seeded sources + spectral shaping + stereo mix
             + output-channel calibration + gain safety + meters
```

`src/audio/dsp/engine.ts` is the reusable render engine used by Node/Vitest fixtures and by the worklet processor. It has no DOM, `AudioContext`, storage, URL, clipboard, or network dependency. The worklet adapter does not duplicate DSP logic.

The browser graph is normally:

```text
AudioWorkletNode -> AnalyserNode -> AudioDestination
```

The analyzer is optional instrumentation on the main thread. It does not own transport, master gain, safety, or DSP state. If a browser context does not expose `createAnalyser`, the worklet connects directly to the destination.

## Lifecycle states

`AudioEngine` exposes explicit snapshot states:

- `ready` — capability checks passed, but no `AudioContext` exists;
- `starting` — an explicit user action is creating/resuming the context, loading the worklet module, and completing the processor handshake;
- `running` — processor handshake completed and the browser context reports `running`;
- `suspended` — the context reports `suspended` or `interrupted`; another explicit Resume action is available;
- `error` — a recoverable runtime failure occurred, with a typed/actionable error;
- `stopped` — owned nodes are disconnected and the context is closed;
- `unsupported` — the environment is missing a required capability or secure context.

Constructing `AudioEngine` never creates an `AudioContext`. `startFromUserGesture()` is the only ordinary entry point that creates one, and `resumeFromUserGesture()` is the explicit resume path. Persistence restore, local preset load, normal share import, calibration profile import/selection/management, and service-worker reload do not call either method automatically.

Repeated Start after Stop creates a fresh browser graph. Greygen does not retain an old context/node/port/analyzer as a reusable hidden transport.

## Capability and error model

Capability checks distinguish:

- insecure context;
- missing `AudioContext` (with `webkitAudioContext` accepted as the Safari compatibility constructor);
- missing `AudioWorkletNode`;
- a created context that does not expose `audioWorklet`.

Runtime failures distinguish at least:

- context resume failure;
- worklet module load failure;
- processor-node construction failure;
- `processorerror`;
- invalid/incompatible protocol traffic;
- request timeout/control-send failure.

Errors are surfaced in `AudioEngineSnapshot.error`; they are not swallowed. A failed graph is cleaned up before the recoverable error state is presented.

## Protocol v6

`src/audio/protocol.ts` owns the shared structured-clone contract. The current protocol version is **6** and the registered processor name is `greygen-processor-v6`.

Request/response commands use positive integer `requestId` values. Main-thread commands include:

- `initialize` — seed, spectrum, gain stage, output-channel calibration, stereo width, and animation state;
- `set-spectrum`;
- `set-gain-stage`;
- `set-channel-calibration`;
- `set-stereo-width`;
- `set-animation`;
- `set-calibration-stimulus` — including `both | left | right` output routing;
- `reset-seed`;
- `request-status`;
- `stop`.

Processor responses include:

- `ready` — initialization handshake including sample rate, target, high-band mode, stereo width, and animation state;
- `ack` — command acknowledgement;
- `status` — runtime sample rate/target/high-band/stereo/animation/frame state;
- `telemetry` — unsolicited bounded-rate digital Peak/RMS/safety/master/guard/stereo data;
- `stopped`;
- `error`.

Runtime parsers validate the protocol envelope and the typed state payloads before they cross the architectural boundary. Telemetry is intentionally not request-scoped and therefore does not consume request ids.

Saved application/share/profile serialization remains outside this protocol. Browser-local or imported data reaches audio only through validated `AudioEngine` control methods after the relevant state layer has accepted it.

## Worklet hot path

`greygen-processor.ts` holds one `GreygenDspEngine` instance. A newly constructed processor emits zeros until a valid `initialize` message resets the engine to the requested state, preventing constructor defaults from leaking into the destination during the node-to-handshake interval.

Once initialized, `process()`:

1. obtains browser-owned output buffers;
2. calls `engine.renderStereo(left, right)` when a stereo output is supplied, or the mono fallback when only one channel is available;
3. updates primitive frame counters;
4. emits telemetry only when the bounded interval is reached;
5. returns `true` until stopped.

After an acknowledged `stop`, the processor zeros any final supplied output buffer and returns `false` so the browser may retire it. Before initialization it also zeros supplied buffers but remains alive for the handshake.

The #19 hot-path audit confirms that the processor and pure engine reuse browser-owned output buffers plus preallocated band/scratch/smoother storage. There is no deliberate object/array allocation inside the per-sample render loops. Control-message canonicalization may allocate outside rendering, and telemetry constructs a message at the bounded nominal 10 Hz cadence; neither is per-sample churn. See `CONFORMANCE.md` for the performance evidence policy.

## Worklet asset loading

The browser runtime imports the TypeScript processor with Vite's worker-URL transform (`?worker&url`) and passes the emitted compiled asset URL to `audioWorklet.addModule()`. Development and production therefore load emitted JavaScript rather than repository TypeScript.

Issue #17's production service worker caches the exact emitted worklet asset in the same revisioned application version set as the shell. A cached/offline app still requires an explicit Start gesture before creating/resuming browser audio.

## Stereo, calibration, and output ownership

Master level, deterministic safety pre-gain, final guard, metering, stereo width/correlation, animation, and output-channel calibration are all owned by the pure DSP engine rather than a hidden main-thread gain stage.

The internal decorrelation streams A/B are not left/right ears. The DSP forms output-channel band components first and then applies left/right calibration to the corresponding output components. Worst-channel requested demand drives the shared safety attenuation. Exact stage ordering is canonical in `ARCHITECTURE.md`, `CALIBRATION_PROFILES.md`, and `GAIN_SAFETY.md`.

All displayed runtime level telemetry is digital (for example dBFS or gain dB), not acoustic SPL.

## Analyzer graph invariant

`readAnalyzerFrame()` is observational. It calls the browser `AnalyserNode` into a reusable `Float32Array`; it must not disconnect, reconnect, rebuild, or otherwise mutate the live output graph.

The #19 conformance audit found and fixed a defect where analyzer sampling called `AnalyserNode.disconnect()`, which could sever `AnalyserNode -> AudioDestination` after the first spectrum read. Disconnection now belongs only to lifecycle cleanup. Instrumented unit tests assert repeated reads leave the graph connected and repeated start/stop releases each analyzer exactly once; the cross-browser production journey also exercises live analyzer sampling.

The analyzer display loop is separately bounded and cleaned up by the analyzer component. See `ANALYZER_DIAGNOSTICS.md`.

## Suspend/interruption behavior

`AudioEngine` listens for context `statechange` events. Both browser `suspended` and platform/browser `interrupted` states map to Greygen's recoverable `suspended` state. Greygen does not automatically resume them; the user receives an explicit Resume action and Stop remains available.

A processor exception raises `processorerror`; because that node can no longer be trusted to produce correct output, Greygen closes the failed graph and exposes a recoverable error requiring a fresh start.

## Cleanup invariant

Stop, error cleanup, component disposal, failed startup, and replacement of stale owned resources converge on the same cleanup path:

- reject and clear pending protocol requests and their timers;
- detach processor and context event handlers;
- clear the processor port message handler and close the MessagePort when available;
- disconnect the worklet node;
- disconnect the analyzer, if present;
- close the `AudioContext` when it is not already closed;
- clear facade references, analyzer buffer, and stale telemetry.

A missing stop acknowledgement does not block cleanup. Issue #19 adds an adversarial fixture that performs five start/stop cycles and requires every created context, worklet node, analyzer, and message port to be released exactly once.

## Cross-browser evidence

Chromium runs the complete Playwright browser suite. Firefox and Playwright WebKit run the production-build cross-browser core, including persisted state/no-autostart behavior, a real `AudioWorklet`, repeated Start/Stop, analyzer sampling/teardown, share privacy, and uncaught-error checks. Headless Linux CI provides an OS-level PulseAudio null sink so browser-native audio graphs have an output endpoint; this does not substitute a fake Web Audio implementation or claim acoustic validation.

Playwright WebKit is Safari-class engine evidence, not a replacement for a release-time check on current physical Safari/macOS or iOS/iPadOS. Exact matrix scope and limitations are canonical in `CONFORMANCE.md`.

## Testability

`AudioEngine` depends on a small `AudioEngineRuntime` port rather than constructing every browser global internally. Deterministic tests cover, among other cases:

- no context creation before explicit Start;
- start/handshake/running transitions;
- spectrum/gain/stereo/animation/channel-calibration/status protocol paths;
- unsolicited telemetry propagation;
- interruption and explicit resume;
- capability/module/processor failures;
- analyzer reads that do not mutate the graph;
- repeated resource cleanup;
- stop/disconnect/context-close behavior.

The pure DSP suite remains the authority for audio correctness; browser tests prove lifecycle/adaptation rather than replacing deterministic spectral/safety validation.

## Platform references

- https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- https://developer.mozilla.org/en-US/docs/Web/API/Worklet/addModule
- https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state
- https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode/processorerror_event
- https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
- https://vite.dev/guide/features.html#web-workers
