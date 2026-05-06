# SMAC Report - Future Smithii Tool Prep

Date: 2026-05-06
Mode: general
Scope: commits `9613372`, `5bb9cb6`, `2757b68`, `7e61a02`
Coverage: mixed coverage; 2 usable domain researcher reports, 1 Skeptic report, and main-thread fallback for failed model-capacity researcher slots
Target files:

- `docs/future-smithii-tool-readiness-matrix.md`
- `docs/smithii-tool-onboarding-template.md`
- `src/lib/smithii/capability-registry.ts`
- `tests/unit/smithii-capability-registry.test.ts`
- `docs/smithii-capability-registry.md`
- `docs/smithii-next-tools-question-pack.md`

## Ranked Findings

### 1. Technical reuse wording can still read like product roadmap

- Verdict: CONFIRMED
- Category: comment-slop
- Impact: MED
- Confidence: 0.92
- Files:
  - `docs/future-smithii-tool-readiness-matrix.md:19`
  - `docs/future-smithii-tool-readiness-matrix.md:76`
  - `docs/smithii-capability-registry.md:24`
  - `docs/smithii-next-tools-question-pack.md:49`

Evidence:

```markdown
| `near-reuse-after-pump-live` | SDK contract is close to current Pump browser flow. | Start only after Pump live acceptance proves runtime assumptions. |
## Technical Reuse Order After Pump Live Acceptance
## Technical Near-Reuse Candidates
This is probably the next product direction, but we do not know the exact Smithii product mapping.
```

The docs now say technical reuse is not product priority, but the heading still says `Order`, the numbered list appears before the strongest caveat in one doc, and `probably the next product direction` is stronger than the user's intended "likely but unconfirmed" wording. This is a docs/process issue, not runtime behavior.

Verifier notes:

- Code match: MATCH.
- Git intent: added during step 4 to clarify product priority after user concern; the remaining wording undermines that goal.
- Test intent: no docs test covers this wording.
- Reachability: process docs are the operator/developer guide for future tool selection.
- Scope safety: wording-only fix.
- Runtime impact: no direct runtime impact, but can mislead the next implementation phase.

### 2. Onboarding exit checklist allows non-build decisions to pass "before coding"

- Verdict: CONFIRMED
- Category: comment-slop
- Impact: MED
- Confidence: 0.86
- File: `docs/smithii-tool-onboarding-template.md:226`

Evidence:

```markdown
Before coding:

- Candidate row exists or is updated in `docs/future-smithii-tool-readiness-matrix.md`.
- Custody decision is not `questions-needed`.
- Runtime config decision is not `questions-needed`.
- Result/error contract is answered enough for user messages and audit fields.
- Acceptance path is answered.
- Unsupported options are listed and blocked.
```

Earlier in the same template, implementation is supposed to start only after the onboarding note reaches `ready-for-spec`. The current checklist only rejects `questions-needed`, so a `blocked-custody`, `mock-only`, or `deferred` note could appear to satisfy the literal checklist.

Verifier notes:

- Code match: MATCH.
- Git intent: added as a reusable template in step 2.
- Test intent: docs-only; no automated coverage.
- Reachability: this is the reusable gate before future implementation specs.
- Scope safety: wording-only fix.
- Runtime impact: prevents skipped-gate process error.

### 3. Unused exported status filter helper

- Verdict: DEAD_CODE
- Category: dead-code
- Impact: LOW
- Confidence: 0.98
- File: `src/lib/smithii/capability-registry.ts:398`

Evidence:

```ts
export function listSmithiiCapabilitiesByStatus(
  status: SmithiiCapabilityStatus,
): SmithiiCapability[] {
  return listSmithiiCapabilities().filter((capability) => capability.status === status);
}
```

Reference search found only the definition. No tests, docs, or runtime code call this helper. It expands the exported API surface before a real caller exists.

Verifier notes:

- Code match: MATCH.
- Git intent: introduced with the non-executing registry in step 3.
- Test intent: tests cover other registry helpers but not this one.
- Reachability: not referenced by `rg` outside the definition.
- Scope safety: safe to remove because there are no call sites.
- Runtime impact: low; cleanup reduces speculative API.

### 4. Typed lookup helper advertises unreachable `undefined`

- Verdict: CONFIRMED
- Category: strong-types
- Impact: LOW
- Confidence: 0.90
- Files:
  - `src/lib/smithii/capability-registry.ts:392`
  - `tests/unit/smithii-capability-registry.test.ts:58`

Evidence:

```ts
export function getSmithiiCapability(
  id: SmithiiCapabilityId,
): SmithiiCapability | undefined {
  return SMITHII_CAPABILITY_REGISTRY[id];
}
```

`id` is already constrained to `SmithiiCapabilityId`, and `SMITHII_CAPABILITY_REGISTRY` satisfies `Record<SmithiiCapabilityId, SmithiiCapability>`, so `undefined` is not reachable for typed callers. The test optional-chain accommodates an impossible case.

Verifier notes:

- Code match: MATCH.
- Git intent: introduced with registry helper API in step 3.
- Test intent: tests only call valid IDs.
- Reachability: currently test-only, but this is a public helper for future code.
- Scope safety: safe if return type becomes `SmithiiCapability` and the test optional chain is removed.
- Runtime impact: low; strengthens contract.

### 5. Question pack omits top-level links to matrix and registry docs

- Verdict: CONFIRMED
- Category: comment-slop
- Impact: LOW
- Confidence: 0.90
- File: `docs/smithii-next-tools-question-pack.md:5`

Evidence:

```markdown
Related registry: `src/lib/smithii/capability-registry.ts`
Related onboarding template: `docs/smithii-tool-onboarding-template.md`
```

The pack references the typed registry and onboarding template but not the readiness matrix or registry documentation, even though those docs define status labels and the non-executing nature of the registry.

Verifier notes:

- Code match: MATCH.
- Git intent: introduced during step 4.
- Test intent: docs-only.
- Reachability: this file is meant to be sent to Smithii and used for answer intake.
- Scope safety: safe to add links.
- Runtime impact: none, but improves traceability.

## Disagreements

- The Skeptic correctly defended that the registry is metadata only. There is no runtime code importing the registry to enable execution, and tests assert `executionEnabledByRegistry: false` for every entry.
- The Skeptic also defended that multiple docs are not automatically duplicate sources of truth. The matrix, onboarding template, registry doc, and question pack have different roles. The confirmed docs findings are about wording clarity, not duplicate-source removal.

## Design Choices

- Keeping a technical near-reuse list is a valid planning aid as long as it is clearly not a product roadmap.
- Keeping Pump Bundle Launch and Pump Bundle Swap marked as `implemented-awaiting-live-acceptance` is appropriate; this does not authorize future tools to skip onboarding.
- No automated sync between the matrix and registry is required yet. It is a watch item for future PRs, not a cleanup backlog item in this narrow step.

## Dead Code

- `listSmithiiCapabilitiesByStatus` is high-confidence dead exported API surface in the current tree.

## Disputed Findings

None promoted. Potential findings about accidental live execution were rejected: the registry has no SDK imports, no client constructors, no signer calls, and no live submit wiring.

## Coverage Gaps

- Two spawned domain researchers errored with model-capacity failures.
- One spawned security researcher also failed before returning usable output.
- Missing domains were completed in main-thread fallback with direct reads/searches. This report should not be treated as full six-researcher multi-agent coverage.
- Verification was primarily main-thread synthesis plus one Skeptic report.

## Run Stats

- Domain researcher roles requested: 5
- Usable domain researcher reports: 2
- Skeptic reports: 1
- Main-thread fallback roles: 3
- Confirmed findings: 4
- Confirmed dead-code findings: 1
- Partial findings: 0
- Disputed findings: 0
- Design choices: 3
- Cleanup backlog items: 4 packages, with docs items batched together
- Verification already run during audit: `pnpm test -- --run tests/unit/smithii-capability-registry.test.ts`

## Confirmed Cleanup Backlog

### 1. Clarify future-tool docs are not roadmap authorization

- Category: comment-slop
- Exact files in scope:
  - `docs/future-smithii-tool-readiness-matrix.md`
  - `docs/smithii-capability-registry.md`
  - `docs/smithii-next-tools-question-pack.md`
- Recommended write owner or work package: future-tool docs clarity package
- Verification command or check: `git diff --check`; `rg -n "Technical Reuse Order|probably the next|Related readiness matrix|not a product roadmap" docs/future-smithii-tool-readiness-matrix.md docs/smithii-capability-registry.md docs/smithii-next-tools-question-pack.md`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, batch with question-pack cross-link cleanup

### 2. Tighten onboarding template's build gate

- Category: comment-slop
- Exact files in scope:
  - `docs/smithii-tool-onboarding-template.md`
- Recommended write owner or work package: onboarding gate clarity package
- Verification command or check: `git diff --check`; inspect `docs/smithii-tool-onboarding-template.md` for `ready-for-spec` as the required coding gate
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, docs-only

### 3. Remove unused registry status filter helper

- Category: dead-code
- Exact files in scope:
  - `src/lib/smithii/capability-registry.ts`
- Recommended write owner or work package: registry helper API cleanup
- Verification command or check: `rg -n "listSmithiiCapabilitiesByStatus" src tests docs`; `pnpm test -- --run tests/unit/smithii-capability-registry.test.ts`; `pnpm exec tsc --noEmit`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, batch with typed lookup cleanup

### 4. Strengthen typed registry lookup return type

- Category: strong-types
- Exact files in scope:
  - `src/lib/smithii/capability-registry.ts`
  - `tests/unit/smithii-capability-registry.test.ts`
- Recommended write owner or work package: registry helper API cleanup
- Verification command or check: `pnpm test -- --run tests/unit/smithii-capability-registry.test.ts`; `pnpm exec tsc --noEmit`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, batch with dead helper removal
