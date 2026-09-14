# Autonomous Agent Playbook

Status: mandatory execution policy for implementation issues in this repository.

## Purpose

GitHub issues in Greygen are intended to be executable work packets. An autonomous implementation agent should be able to start from an issue, retrieve this RAG pack, implement the work, prove it, open a PR, respond to failures, and merge after automated checks pass without requiring repeated human decisions for routine engineering choices.

## Required reading order

Before coding an issue, read:

1. the issue body and all issue comments;
2. `README.md`;
3. `docs/RAG/PROJECT_CHARTER.md`;
4. `docs/RAG/ARCHITECTURE.md`;
5. `docs/RAG/DSP_VALIDATION.md` for any audio/DSP/state behavior;
6. `docs/RAG/PSYCHOACOUSTICS_SAFETY.md` for calibration, presets, levels, meters, or user-facing claims;
7. `docs/RAG/UX_STATE.md` for controls/state/persistence/sharing;
8. `docs/RAG/ROADMAP.md` for dependencies and project context;
9. any additional files named by the issue.

If code and docs conflict, do not guess. Determine whether code or docs are stale from repository history/current issue scope and reconcile them in the PR. Canonical RAG changes must be explicit.

## Issue execution loop

For every implementation issue:

1. **Reconcile prerequisites.** Verify required predecessor issues/merged code are present on `main`. If a prerequisite is not merged and work cannot be isolated cleanly, stop implementation and record the dependency rather than duplicating it.
2. **Inspect before editing.** Read relevant code/tests/configuration. Search for existing abstractions before adding parallel ones.
3. **Define evidence.** Translate acceptance criteria into specific tests/measurements before or alongside implementation.
4. **Implement narrowly.** Make the smallest coherent architecture-compliant change that fully satisfies the issue. Do not remove existing capabilities merely to simplify the patch.
5. **Test locally.** Run all relevant checks, not only new tests.
6. **Self-review the diff.** Check correctness, architecture direction, safety wording, accessibility, accidental generated files/secrets, and unnecessary dependency additions.
7. **Update RAG/docs.** If behavior/contract changed, update canonical docs in the same PR.
8. **Open a PR.** PR body must summarize implementation, evidence, risks/limitations, and close the issue (`Closes #N`).
9. **Observe automated checks.** Do not merge merely because code compiles locally. Inspect CI results.
10. **Fix failures.** For any failing required check, inspect the actual logs, correct root cause, push, and re-run/await checks. Do not weaken tests to hide a product defect.
11. **Merge only when green.** When all required automated checks pass and no unresolved blocking review thread remains, merge the PR using the repository's accepted merge method (prefer squash unless repository policy changes). Verify the merge actually completed and that the issue closed.
12. **Post-merge sanity.** If the issue changes build/CI/deployment, confirm the default branch workflow/build remains healthy.

## Permission model

The repository owner has explicitly authorized autonomous issue completion and merging **after automated checks pass**. This is not permission to bypass failed checks, disable safety tests, force-push over unrelated work, or merge known regressions.

If repository settings do not expose auto-merge, wait for checks synchronously and perform a normal merge after they pass.

## Branch and PR convention

Suggested branch names:

`issue-<N>-<short-slug>`

Suggested commit style:

- `feat: ...`
- `fix: ...`
- `test: ...`
- `docs: ...`
- `chore: ...`

Keep generated lockfile changes when they result from intentional dependency changes; do not hand-edit lockfiles.

## CI contract

Once scaffolded, the baseline required suite is expected to include:

- formatting/lint;
- TypeScript typecheck;
- unit tests;
- deterministic DSP validation tests;
- production build;
- Playwright browser smoke/integration tests.

An issue may add stronger checks. New failures caused by the patch are blocking. Pre-existing failures must be investigated; if genuinely unrelated and already documented, record evidence in the PR rather than silently ignoring them.

## Dependency policy

Prefer platform/standard-library capabilities and small, well-maintained dependencies. Before adding a runtime dependency, answer:

- what problem does it solve that existing code/platform cannot reasonably solve?
- does it run on the real-time audio path?
- what is its bundle/performance impact?
- is its license compatible?
- can its behavior be deterministically tested?

Never add a dependency inside the worklet hot loop merely for convenience when a small auditable implementation is straightforward.

## DSP-specific rules

- Never use `Math.random()` in deterministic audio/DSP code.
- Never allocate objects/arrays per sample in the worklet hot loop.
- Never relax a validation threshold solely to green a failing implementation.
- Never label digital measurements as acoustic SPL.
- Never create an unstable filter to preserve a nominal center frequency near Nyquist; degrade explicitly instead.
- Keep nominal shaping separate from safety attenuation.
- Any new stochastic process must have explicit seed/state and bounded behavior.
- Add characterization tests for meaningful algorithm changes.

## Calibration/safety rules

- No medical/diagnostic wording.
- No unbounded correction chasing inaudible bands.
- No automatic master-volume increase to make tests audible.
- Personal calibration remains local/private by default.
- Default application is conservative/Balanced when calibration is introduced.

## UI rules

- New controls must be keyboard accessible.
- Do not rely on color alone for state.
- Preserve an obvious stop/mute path whenever audio can run.
- Errors must be surfaced rather than swallowed.
- Imported/shared state must never auto-start sound.

## Scope handling

An issue's acceptance criteria are minimum completion requirements, not an invitation to redesign unrelated areas. Small enabling refactors are allowed when they reduce duplication or make the required test possible; explain them in the PR.

If a discovered defect materially threatens the current issue's correctness/safety, fix it in-scope when small. If substantial and separable, create a follow-up issue with reproduction/evidence and keep the current PR focused.

## Autonomous decision defaults

When an issue leaves a low-consequence implementation detail open, choose the option that best satisfies:

1. deterministic testability;
2. architectural simplicity;
3. real-time safety/performance;
4. accessibility;
5. maintainability;
6. browser interoperability.

Do not block on cosmetic choices that can be changed later.

## Definition of done

An issue is done only when:

- acceptance criteria are satisfied;
- relevant tests exist and pass;
- full required CI is green;
- documentation/RAG is current;
- PR self-review is complete;
- no blocking review thread remains;
- PR is merged to the intended base branch;
- merge is verified;
- linked issue is closed or explicitly updated if GitHub automation did not close it.
