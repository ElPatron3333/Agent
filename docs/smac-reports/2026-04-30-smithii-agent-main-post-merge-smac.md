# Smithii Agent Main Post-Merge SMAC

Date: 2026-04-30
Branch: `main`
Mode: `general`
Scope: focused audit of the last update before Phase 4: Phase 3 fast-forward merge, `493e473` verification-ignore commit, `.worktrees` test/lint isolation, repo hygiene, and Phase 4 readiness.

## Summary

SMAC found 2 findings: 1 confirmed low-severity cleanup item, 1 partial watch item, 0 disputed. No runtime or Phase 4 gate blocker was found. `main` is synced with `origin/main`, includes the Phase 3 commits, and passes `pnpm test`, `pnpm lint`, and `pnpm build`.

The only confirmed cleanup item is repository hygiene: `.remember/` is currently excluded only in `.git/info/exclude`, not in shared `.gitignore`. This does not affect app behavior, but adding it to `.gitignore` would protect future clones from accidentally staging local handoff memory.

## Ranked Findings

### 1. CONFIRMED: `.remember/` is only locally excluded

Score: 0.9
Severity: Low
Category: repo hygiene

Evidence:
- `.git/info/exclude:7` ignores `.remember/`.
- `.gitignore` has shared ignores for local mock state and worktrees at `.gitignore:48` and `.gitignore:51`, but no `.remember/` entry.
- `.remember/remember.md:1` is a local handoff note, not runtime app code.
- `git check-ignore -v .remember/remember.md` reports `.git/info/exclude:7:.remember/`, so the current protection is local-only.

Impact:
Future clones or sessions that use the remember skill could create `.remember/` as an untracked file unless they also configure local excludes. This is a low-risk hygiene issue, not a runtime defect.

Skeptic check:
The skeptic classified `.remember` as environment noise because it is local session memory and is already ignored in this working copy. That reduces priority, but shared ignore is still safer if `.remember/` is always local state.

Recommendation:
Add `.remember/` to `.gitignore` near the other local-state ignores.

### 2. PARTIAL: local plan signing fallback remains a mock-first watch item

Score: 0.6
Severity: Low/Medium
Category: security posture

Evidence:
- `src/app/api/chat/route.ts` falls back to `smithii-agent-local-plan-signing-secret` when `SMITHII_PLAN_SIGNING_SECRET` is absent.
- README and AGENTS state the current app is local/mock-first and real Smithii execution is blocked.

Impact:
If deployed without a real signing secret, pending-plan signatures would use a known fallback. This is not a regression from the last update and is already bounded by mock-first scope.

Skeptic check:
The repo is explicitly local-first and not production-ready; this is a design watch item until production deployment or live execution is introduced.

Recommendation:
Before any preview/prod deployment, require `SMITHII_PLAN_SIGNING_SECRET` outside local development and document it in `.env.example`.

## Design Choices

- `.worktrees/` is intentionally ignored in `.gitignore`, ESLint, and Vitest so local linked worktrees do not duplicate tests or lint generated `.next` output.
- `.smithii-local/` remains local mock state and is correctly shared-ignored.
- The PR creation failure was process/tooling state: `gh` was unavailable and the connector returned GitHub 404 for the private repo. The branch was fast-forward merged locally instead.
- Phase 3 is merged into `main`: `feature/phase3-bundle-launch` is an ancestor of `main`, and `main` is synced with `origin/main`.

## Disputed Findings

No findings were fully disputed.

## Dead Code

No dead code found in this scoped audit.

## Coverage Gaps

- No browser/E2E Phase 3 walkthrough was run; readiness is based on unit/route tests plus build/lint.
- Two spawned researchers timed out before returning, but 4 domain researchers plus 1 skeptic returned usable output for this narrow scope.
- Verification was mostly direct/single-thread because the actual confirmed issue is local repo hygiene, not runtime behavior.

## Run Stats

- Domain researchers dispatched: 5
- Domain researchers usable: 4
- Skeptics dispatched: 1
- Skeptics usable: 1
- Verifiers usable: direct synthesis verification
- Confirmed findings: 1
- Partial findings: 1
- Disputed findings: 0
- Design choices: 4
- Dead-code findings: 0

## Verification

- `pnpm test` -> 7 files / 55 tests passed.
- `pnpm lint` -> passed.
- `pnpm build` -> passed.
- `git status --short --branch` -> clean, `main...origin/main`.
- `git check-ignore -v` confirms `.worktrees/`, `.smithii-local/`, and `.remember/` are ignored in the current working copy.

## Confirmed Cleanup Backlog

### 1. Shared-ignore local remember state

Category: error-handling
Files in scope:
- `.gitignore`

Recommended owner:
Repo hygiene owner.

Verification:
Run `git check-ignore -v .remember/remember.md` and `git status --short --branch`.

Dependencies:
None.

Batch safety:
Safe to batch alone. This should be a one-line `.gitignore` update.
