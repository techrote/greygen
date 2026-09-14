# References and Provenance Guardrails

Status: curated external references for implementation agents. These are references, not material to copy wholesale.

## Browser audio

- MDN — AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- MDN — AudioWorkletNode: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode
- MDN — AudioWorkletProcessor: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor
- MDN — Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- Web Audio specification: https://webaudio.github.io/web-audio-api/

Key implementation implications verified during planning:

- custom AudioWorklet processing runs on the browser audio rendering thread rather than the main UI thread;
- normal browser use of `audioWorklet` requires a secure context, while localhost is treated appropriately for development;
- current engines commonly process 128-frame render quanta, but code should not assume future block sizes are forever fixed if the API exposes actual lengths.

## Psychoacoustic background

- ISO 226:2023 public scope/abstract: https://www.iso.org/standard/83117.html

Use the public standard description to understand what equal-loudness contours mean and what conditions they cover. Do not copy paid numerical tables into Greygen without a documented reuse license.

## Product-class reference

- myNoise Grey Noise generator: https://mynoise.net/NoiseMachines/greyNoiseGenerator.php
- myNoise calibration page: https://mynoise.net/calibration.php

These pages motivated the product class and help identify useful interaction patterns such as ten-band shaping, stereo width, animation, and listener/playback compensation. They are **not** source material for code/assets/preset-value copying.

## Clean-room rule

Implementation agents must not:

- copy JavaScript/CSS/HTML or assets from the reference site;
- scrape/download reference-site audio for product use;
- reproduce branding or distinctive copyrighted artwork;
- transcribe proprietary preset/calibration values;
- present Greygen as affiliated with or endorsed by myNoise;
- copy ISO numerical tables from non-licensed sources.

Agents may use standard DSP literature/algorithms where license/provenance permits and should cite unusual formulas/algorithms in source comments or docs when attribution improves auditability.

## Preferred research pattern

When a DSP choice is uncertain:

1. define the measurable requirement first;
2. consult primary standards/specifications or reputable technical references;
3. implement a small clean-room prototype;
4. compare candidates using Greygen's deterministic validation harness;
5. record the decision and evidence in the PR/RAG rather than relying on reputation or subjective claims alone.
