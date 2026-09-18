# Greygen v0.1 release checklist

This checklist separates **repository readiness** from **public tag/release authorization**. Completing issue #20 may make the repository release-ready without pretending that unavailable physical-browser or assistive-technology checks were performed.

## 1. Establish the release candidate

- [ ] `main` contains the merged issue-#20 PR and issues #1-#20 are closed.
- [ ] Issues #21 and #22 remain explicitly post-MVP and do not block v0.1.
- [ ] `package.json` and `src/version.ts` both identify `0.1.0`.
- [ ] `CHANGELOG.md` contains the v0.1 release notes.
- [ ] `docs/RELEASE_AUDIT.md` reflects the final dependency/provenance/privacy review.
- [ ] No unreviewed feature work is bundled into the release candidate.

## 2. Reproduce from a clean checkout

Use the repository-pinned Node/npm versions and the committed lockfile:

```bash
git clone https://github.com/techrote/greygen.git
cd greygen
git checkout main
corepack enable
nvm use
npm ci
```

If `nvm` is not installed, install/use Node `24.21.x`; `package.json` pins npm `11.19.0` through `packageManager`.

Then run the same repository gates used for the release candidate:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run characterize -- --sample-rate 44100
npm run characterize -- --sample-rate 48000
npm run characterize -- --sample-rate 96000
npm run build
npm run verify:pwa
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
npm run build:pages
npm run verify:pwa:pages
```

On headless Linux without an audio output, provide an OS-level virtual PulseAudio sink as `.github/workflows/ci.yml` does. Do not replace the native Web Audio/AudioWorklet path with a synthetic test implementation.

- [ ] All commands above pass without weakening a DSP, safety, privacy, or accessibility assertion.
- [ ] Default-branch GitHub Actions CI is green at the exact commit proposed for tagging.
- [ ] Characterization still reports the expected 44.1/48 kHz degraded high shelf and 96 kHz bounded bandpass topology.
- [ ] Ordinary reference characterization does not show persistent final-guard use.

## 3. Inspect the static release artifact

Root-host artifact:

```bash
rm -rf dist
npm run build
npm run verify:pwa
```

GitHub Pages artifact:

```bash
rm -rf dist
npm run build:pages
npm run verify:pwa:pages
```

The `dist/` directory is the complete static artifact. It must contain `index.html`, emitted application assets, the emitted AudioWorklet asset, `manifest.webmanifest`, the Greygen icon, and generated `sw.js` whose precache includes the exact emitted worklet version set.

For an archival static artifact, create the archive **after** verification. Example on a Unix-like shell:

```bash
rm -f greygen-v0.1.0-static.zip
(cd dist && zip -r ../greygen-v0.1.0-static.zip .)
```

A Windows PowerShell equivalent is:

```powershell
Remove-Item greygen-v0.1.0-static.zip -ErrorAction SilentlyContinue
Compress-Archive -Path dist\* -DestinationPath greygen-v0.1.0-static.zip
```

- [ ] Archive contents are the verified `dist/` tree, not source files, local storage, calibration exports, or test artifacts.
- [ ] No repository secret is required to build the static artifact.

## 4. Manual product gates before a public tag

These are deliberately not faked by CI.

### Current Safari hardware

On current Safari for macOS or Safari on iOS/iPadOS when available:

- [ ] Load the HTTPS build and confirm it initially remains Ready/silent.
- [ ] Start audio explicitly and confirm audible output.
- [ ] Change one band and stereo width.
- [ ] Background/foreground or otherwise trigger an interruption and confirm explicit recovery behavior.
- [ ] Stop and restart audio.
- [ ] Confirm reload/share/profile operations do not auto-start sound.

Record browser, OS, device, and any defect in the release notes/issue if a failure occurs.

### Desktop assistive technology

Use current NVDA + Chromium/Firefox on Windows **or** VoiceOver + Safari on macOS:

- [ ] Start/Stop and audio status are understandable.
- [ ] One preset and at least two band ranges announce frequency/current value.
- [ ] Saved profile selection and calibration mode are usable.
- [ ] Guided calibration reference/test/judgement/skip/silence/Abort and focus return work.
- [ ] One malformed/import notice and one destructive confirmation are understandable.
- [ ] At narrow/zoomed layout, the fixed Stop control remains reachable.

Record AT/browser/OS versions and defects. A high-severity failure blocks a public tag.

### Acoustic/product sanity

- [ ] Start at a comfortable system/device level; no test requires raising master automatically.
- [ ] White/Pink/Brown/Grey sound changes are plausible and control transitions do not click obviously.
- [ ] Analyzer can open/read/close without muting or disconnecting output.
- [ ] Guided calibration can be silenced/aborted immediately and preserves master level.
- [ ] Personal-profile export is visibly distinct from normal sound sharing.

## 5. Privacy, provenance, and license gate

- [ ] Normal share URLs contain SoundState only and no personal profile names/notes/evidence/corrections.
- [ ] No analytics, tracking backend, account service, or calibration-upload path was added after the audit.
- [ ] Service-worker caches contain application assets, not local user/profile data.
- [ ] No myNoise code/audio/artwork/branding/preset/calibration data was introduced.
- [ ] No unlicensed ISO numerical table was introduced.
- [ ] README still states that Greygen is independent/clean-room and non-medical.
- [ ] Source-license status is still accurate. If the owner has not selected a source license, **do not add or advertise one** during release packaging.

## 6. Deployment gate

For GitHub Pages, first confirm the one-time repository setting:

**Settings → Pages → Build and deployment → GitHub Actions**.

Then run the repository's **Deploy GitHub Pages** workflow. It builds with `/greygen/` and verifies the PWA artifact before deployment.

- [ ] HTTPS deployment loads at the intended base path.
- [ ] First online load installs the application shell.
- [ ] A subsequent fully offline reload reaches Ready/silent.
- [ ] Explicit Start works after returning online/offline as supported by the cached worklet asset.
- [ ] An update waits for the explicit Reload update action rather than silently mixing app/worklet versions.

## 7. Tag/release authorization

Do **not** create the public v0.1 tag until sections 1-6 are complete, including the manual gates that are actually available to the release operator.

When authorized:

```bash
git checkout main
git pull --ff-only
git status --short
git tag -a v0.1.0 -m "Greygen v0.1.0"
git push origin v0.1.0
```

If using GitHub Releases, create release `v0.1.0` from that exact tag, copy the `CHANGELOG.md` v0.1 section, and optionally attach `greygen-v0.1.0-static.zip` produced from the verified build above.

- [ ] Tag resolves to the same commit whose default-branch CI was green.
- [ ] Release notes do not claim physical Safari, screen-reader, medical/acoustic, license, or performance evidence that was not actually obtained.
- [ ] Attached static archive hash is recorded if an archive is published.

## Blocking policy

A known high-severity DSP, gain-safety, privacy, autoplay, calibration, accessibility/Stop, version-coherence, or provenance defect blocks the tag. Fix the defect through the normal issue/PR/CI process; do not waive a deterministic threshold merely to finish release paperwork.

Lower-severity known limitations may be released only when they are accurately documented and do not contradict the v0.1 support/safety/privacy contract.
