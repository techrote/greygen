# PWA, Offline, and Static Deployment

Status: canonical offline/deployment contract introduced by issue #17.

## Scope

Greygen remains a static, local-first client application. The PWA layer adds install metadata, an offline application shell, and a GitHub Pages deployment path. It does not add a backend, telemetry, network persistence, or a second state store.

Current sound, local user presets, private playback/calibration profiles, and UI preferences remain in the existing versioned browser-local persistence layer. Normal share URLs remain fragment-based SoundState only. Service-worker caches contain application assets, not user state or calibration data.

## Secure-context requirement

Production audio requires a secure context because Greygen uses `AudioWorklet`. GitHub Pages provides HTTPS. Local development continues to use localhost, which browsers treat as a secure-equivalent development origin for the required APIs.

A static deployment on another host must provide HTTPS and preserve the configured Vite base path.

## Build and base paths

Two production builds are intentional:

```bash
npm run build
npm run verify:pwa

npm run build:pages
npm run verify:pwa:pages
```

`npm run build` targets `/`. `npm run build:pages` targets `/greygen/`, the repository path used by `https://techrote.github.io/greygen/`.

The manifest uses deployment-relative `./` values for `id`, `scope`, and `start_url`. Runtime service-worker registration resolves `sw.js` from Vite's `import.meta.env.BASE_URL`, so root and repository-subpath deployments use the same application code.

The browser AudioWorklet module continues to use Vite's `?worker&url` asset pipeline. The emitted worklet URL therefore receives the same production base path as the main application.

## Offline cache model

The build emits `sw.js` from the exact production bundle. Its precache contains:

- `index.html`;
- emitted JavaScript/CSS/application assets;
- the emitted AudioWorklet processor asset;
- `manifest.webmanifest`;
- the app icon.

The cache name includes a deterministic revision derived from the emitted bundle contents and public PWA assets. A change to the main-thread bundle, worklet payload/protocol, manifest, icon, or other precached asset therefore produces a different cache identity.

Installation must finish `cache.addAll(...)` before the worker becomes install-complete. This makes the cached application shell an atomic version set rather than allowing the main-thread application and AudioWorklet processor to drift independently.

Once a worker controls a page, navigation and same-origin application assets use that worker's revisioned cache first. This is deliberate: a reload must not combine a newly published `index.html` with an older controlling worker/worklet set before the user accepts an update. Registration still performs normal service-worker update discovery; a newer completed worker waits for the explicit update action described below.

Cache lookup for in-scope assets ignores HTTP `Vary` metadata. The key is already constrained to same-origin requests under the service-worker scope and to the active revisioned cache. This avoids an offline miss when a static server changes request-dependent `Vary` headers between precache population and browser module requests, while query strings and paths remain distinct cache keys.

URL fragments are not sent in HTTP requests, so normal share-state fragments remain available to the application on offline navigation without entering the service-worker cache key.

## Update activation

A newly installed first worker may activate normally. An updated worker waits while an existing version controls the page. Greygen surfaces a visible `A Greygen update is ready` notice with an explicit `Reload update` action.

Only that action sends `SKIP_WAITING`. The page reloads once on `controllerchange`. The newly activated worker deletes prior Greygen shell caches and claims clients. This avoids silent mid-session replacement of the main/worklet protocol pair and avoids unconditional reload loops.

If service-worker registration itself is unavailable or rejected, PWA behavior degrades as progressive enhancement: the normal online application remains usable and the existing audio capability checks continue to govern audio support.

## Offline/autoplay semantics

Offline reload does not create an autoplay exception. Persisted state may restore requested sound/UI values, but lifecycle state remains Ready and silent until the user explicitly chooses **Start audio**. Share imports and private calibration imports retain their existing no-autostart semantics.

## Validation contract

CI verifies:

- unit/adversarial tests for deterministic cache revisioning, worklet-version invalidation, unsafe/duplicate precache paths, required navigation shell, Vary-independent scoped cache lookup, and root/subpath service-worker URL resolution;
- the built manifest and icon;
- root and `/greygen/` production base paths;
- presence of the actual emitted AudioWorklet asset in the generated service-worker precache;
- Chromium online-first installation followed by a fully offline reload;
- Ready/silent lifecycle after that offline reload.

`npm run verify:pwa` and `npm run verify:pwa:pages` inspect the built artifact rather than only source configuration.

## GitHub Pages deployment

`.github/workflows/deploy-pages.yml` is intentionally manual until Pages is enabled for the repository. It uses only `GITHUB_TOKEN`-provided repository permissions (`contents: read`, `pages: write`, `id-token: write`) and requires no repository secrets.

One repository setting cannot be safely fabricated by the implementation agent: in **Settings → Pages → Build and deployment**, select **GitHub Actions** as the publishing source. After that one-time enablement, run **Deploy GitHub Pages** from the Actions tab. The workflow builds with `/greygen/`, verifies the PWA artifact, uploads `dist`, and deploys to the `github-pages` environment.

Keeping the workflow manual before enablement prevents an otherwise-correct `main` push from becoming red merely because the repository-level Pages source has not yet been selected. A later release/operator decision may add automatic push deployment after the Pages setting is confirmed.

## Privacy and provenance

The PWA contains only Greygen's own generated application code/assets and the original Greygen SVG icon. It does not cache or import myNoise code, recordings, artwork, presets, or standards tables. It adds no analytics, third-party CDN requirement, backend call, or calibration upload path.
