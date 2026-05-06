# Smithii Agent Execution Plan

Version: 2.0
Date: 2026-05-06
Status: Phase 8 browser handoff is implemented for Pump Bundle Launch and supported Pump Bundle Swap. Smithii runtime answers for live acceptance have been received; live acceptance is pending local env setup, burner materials, and low-amount mainnet execution. Future Smithii tools are waiting on Smithii answers before any implementation.

---

## 1. Current Reality

This repo has moved past the original draft plan.

Smithii Agent is now a Next.js chat-driven execution layer that collects user intent, validates parameters, shows previews, binds plans, requires explicit confirmation, and prepares browser-only Smithii execution for the live-eligible Pump flows.

The backend must never execute Smithii live transactions and must never receive private keys, seed phrases, private-key arrays, or private-key-shaped fields. Browser-side execution is allowed only for flows whose signer material stays in the browser or wallet adapter.

The old blocker, waiting for a separate Smithii browser-side tx-assembly module, is no longer the main blocker for Pump flows. Smithii provided enough information and the public `@smithii/sdk/pump` path for browser-only Pump Bundle Launch and supported Bundle Swap implementation.

Phase 8 is not beta-ready yet. It remains incomplete until the low-amount mainnet acceptance run passes for:

1. Bundle Swap: SOL-to-token or token-to-SOL.
2. Bundle Launch: Pump create-and-snipe with metadata upload.

---

## 2. Current MVP Scope

### Live-eligible after acceptance

1. Pump Bundle Launch via `@smithii/sdk/pump` `PumpFunClient.createAndSnipeToken`.
2. Pump Bundle Swap via `@smithii/sdk/pump` `PumpFunClient.bundleSellBuy` for SOL-to-token and token-to-SOL.

These are implemented as browser handoff paths. They still need live acceptance before closed beta or production claims.

### Blocked for live execution

- Bundle Swap token-to-token remains blocked because it is not confirmed as supported for the current live path.
- Classic Volume Bot remains blocked because Smithii confirmed the known path is backend-keyed and cannot satisfy the zero-custody requirement.
- Anti-MEV multi-wallet remains blocked because it sends private keys to a backend.
- Launch + Volume sequence remains blocked because Volume Bot is blocked and no zero-custody scheduler contract exists.

### Planning-only future tools

Future Smithii tools, including Maker/Taker, Market Maker, PumpSwap graduated-token swap, Moonit, Bonk, LaunchLab, Bags, Mantis, Token Manager, Multisender, Token Creator, Vesting, Claim, EVM, and SUI tools are not build scope yet.

They must go through:

1. `docs/future-smithii-tool-readiness-matrix.md`
2. `docs/smithii-tool-onboarding-template.md`
3. A focused Smithii question/answer intake
4. A written implementation spec
5. TDD implementation
6. One scoped SMAC for the phase
7. `cleanup-orchestrator` only for confirmed SMAC findings

---

## 3. Non-Negotiable Rules

- Preview first, explicit approval second, live submit third.
- The backend never receives, stores, logs, proxies, or reflects private keys, seed phrases, private-key arrays, or private-key-shaped fields.
- Private-key-shaped request fields are rejected at backend boundaries.
- Browser-held secondary keys may be used only for live-eligible browser SDK flows and only inside the browser runtime.
- Live Smithii SDK calls must not run from server routes.
- Pending plans contain non-secret plan/audit metadata only.
- Success UI and audit logs contain only public or verifiable fields such as wallet pubkey, mint, tx signature, bundle ID, payment signature, plan ID, idempotency key, and normalized error category.
- Unsupported or partially understood flows remain mocked or blocked before confirmation.
- Every new Smithii tool gets one scoped SMAC before merge/live acceptance. Use `cleanup-orchestrator` only for confirmed findings.

---

## 4. Implemented Repo Surface

### App and agent

- Next.js app shell at `src/app/page.tsx` and `src/components/smithii-agent-app.tsx`.
- Chat route at `src/app/api/chat/route.ts` with mock-first tool behavior, private-key rejection, pending plans, and confirmation gates.
- Client chat state helpers for retaining and clearing preview/live state.

### Smithii integration layer

- Live boundary classification: `src/lib/smithii/live-boundary.ts`.
- Browser handoff model and packet preparation: `src/lib/smithii/browser-handoff.ts` and `src/lib/smithii/browser-handoff-ui.ts`.
- Browser live submit preparation: `src/lib/smithii/browser-live-submit.ts`.
- Pump browser executor: `src/lib/smithii/pump-browser-executor.ts`.
- Bundle Launch browser wiring: `src/lib/smithii/bundle-launch-browser-wiring.ts`.
- Bundle Swap browser wiring: `src/lib/smithii/bundle-swap-browser-wiring.ts`.
- SDK assessment and blocked-flow mapping: `src/lib/smithii/sdk-adapter.ts`.
- Non-executing future capability registry: `src/lib/smithii/capability-registry.ts`.

### Live acceptance support

- Live acceptance runbook: `docs/phase8-live-acceptance-runbook.md`.
- Runtime request packet: `docs/smithii-live-acceptance-runtime-request.md`.
- Preflight CLI: `scripts/phase8-live-preflight.mjs` via `pnpm phase8:live-preflight`.
- Required env placeholders in `.env.example`.

### Future-tool readiness

- Future tool matrix: `docs/future-smithii-tool-readiness-matrix.md`.
- Tool onboarding template: `docs/smithii-tool-onboarding-template.md`.
- Non-executing registry docs: `docs/smithii-capability-registry.md`.
- Next tools Smithii question pack: `docs/smithii-next-tools-question-pack.md`.

### Verification coverage

- Unit coverage exists for chat route safety, audit sanitization, pending plans, live boundaries, browser handoff, browser submit preparation, Pump executor mapping, Bundle Launch wiring, Bundle Swap wiring, capability registry, SDK adapter assessment, wallet roster, global settings, and Phase 8 preflight.
- Latest full verification before this plan refresh: `pnpm lint`, `pnpm test`, and `pnpm exec tsc --noEmit` passed.

---

## 5. Live Acceptance Gate

Phase 8 cannot be called complete until both live-eligible Pump flows pass the runbook.

### Required runtime config

Set these locally before running the app for live acceptance:

```env
NEXT_PUBLIC_SOLANA_RPC_URL=
NEXT_PUBLIC_SMITHII_PROXY_URL=
NEXT_PUBLIC_SMITHII_JITO_UUID=
SMITHII_PLAN_SIGNING_SECRET=
```

Smithii resolved the previous missing-Jito blocker for the internal acceptance pass. The exact Jito UUID must stay in the local ignored env file, not in tracked docs.

For the acceptance pass, Smithii confirmed:

- The current browser SDK pattern exposes the Jito UUID as a public runtime value.
- External/third-party integrations must use their own Jito UUID; do not reuse the acceptance UUID as a shared public credential.
- `NEXT_PUBLIC_SMITHII_PROXY_URL=https://proxy-production-708c.up.railway.app`
- No proxy path suffix should be added; the SDK appends required routes internally.

Before partner/customer rollout, still confirm whether production UUIDs are isolated, domain-bound, rate-limited, and independently rotatable.

### Required local materials

- Burner connected wallet in Phantom or Solflare.
- Burner buyer wallet CSV with a `privateKey` column, stored outside tracked repo paths or inside a git-ignored local path such as `.smithii-local/`.
- Low-risk Pump token mint for the swap test.
- Launch image file for the Bundle Launch test.
- Enough SOL for tiny test amounts plus fees.

### Preflight command

```text
pnpm phase8:live-preflight -- --wallet-csv <abs-path-to-burner-wallets.csv> --swap-mint <approved-low-risk-pump-token-mint> --launch-image <abs-path-to-launch-image.png>
```

### Acceptance order

1. Run preflight.
2. Start the app locally.
3. Run Bundle Swap live acceptance with one burner buyer wallet and tiny SOL amount.
4. Verify returned tx signature on chain.
5. Run Bundle Launch live acceptance with one burner buyer wallet and tiny buy amount.
6. Verify metadata upload, create transaction, returned mint, and on-chain confirmation.
7. Record the attempt in `docs/phase8-live-acceptance-attempt-2026-05-06.md` or a new dated attempt note.

Pass criteria are defined in `docs/phase8-live-acceptance-runbook.md`.

---

## 6. Current Blockers

### Blocking Phase 8 live acceptance

1. Configure the local ignored env file with the Smithii-provided acceptance Jito UUID and confirmed proxy URL.
2. Operator-provided burner wallet materials and approved low-risk target mint/image.
3. Manual low-amount mainnet execution and result recording.

### Blocking closed beta

1. Bundle Swap live acceptance passed.
2. Bundle Launch live acceptance passed.
3. Unsupported flows still blocked after live acceptance.
4. No secret-bearing UI, backend, audit, or log regression.
5. One scoped SMAC for the completed live-acceptance phase, followed by cleanup only for confirmed findings.

### Blocking future Smithii tools

1. Smithii answers to `docs/smithii-next-tools-question-pack.md`.
2. Exact product-to-SDK/API mapping for Maker/Taker if that remains the likely next product.
3. Zero-custody confirmation for any candidate tool.
4. Runtime config, result/error contract, idempotency/replay behavior, fees/limits, and low-amount test path.

---

## 7. Roadmap From Here

### Step A - Current repo sync

1. Update this plan to match current repo reality.
2. Commit the plan update.
3. Push `main` to GitHub.

### Step B - Wait for Smithii runtime answer

Do not implement speculative tool behavior while waiting. The only useful waiting tasks are documentation corrections, repository sync, or direct verification if something changes locally.

### Step C - Run Phase 8 live acceptance

Once Smithii and the operator provide the missing runtime values/materials:

1. Run `pnpm phase8:live-preflight`.
2. Run Bundle Swap low-amount mainnet acceptance.
3. Run Bundle Launch low-amount mainnet acceptance.
4. Record results and blockers.
5. Run one scoped SMAC for the live-acceptance phase.
6. Use `cleanup-orchestrator` only for confirmed SMAC findings.

### Step D - Closed beta decision

Closed beta can start only after both live-eligible flows pass acceptance and the post-phase audit/cleanup is complete.

### Step E - Next Smithii tool

After Smithii answers the next-tools packet:

1. Rank candidates by Smithii availability and zero-custody fit.
2. Fill a copied onboarding note from `docs/smithii-tool-onboarding-template.md`.
3. Move only a `ready-for-spec` candidate into implementation planning.
4. Write a spec.
5. Implement with tests first.
6. Run one scoped SMAC and cleanup confirmed findings.

---

## 8. Work That Should Not Start Yet

- Do not wire Maker/Taker, Bags, Bonk, LaunchLab, Moonit, Market Maker, Mantis, Token Manager, Multisender, Token Creator, Vesting, Claim, EVM, or SUI execution until Smithii answers and the candidate reaches `ready-for-spec`.
- Do not enable Classic Volume Bot live execution under the current backend-keyed model.
- Do not enable Anti-MEV multi-wallet live execution while it requires backend private-key submission.
- Do not enable Launch + Volume scheduling until both child flows are live-eligible and sequencing ownership is answered.
- Do not store Jito UUIDs, private keys, burner wallet paths, launch images, or live artifacts in persistent memory.
- Do not run repeated SMACs for every small cleanup. Run one scoped SMAC per phase or when a meaningful risk boundary changes.

---

## 9. Source Of Truth Documents

- Phase 8 readiness: `docs/phase8c-readiness-matrix.md`
- Phase 8 answer intake: `docs/phase8c-answer-intake-2026-05-06.md`
- Phase 8 runbook: `docs/phase8-live-acceptance-runbook.md`
- Runtime request: `docs/smithii-live-acceptance-runtime-request.md`
- Future tool matrix: `docs/future-smithii-tool-readiness-matrix.md`
- Future tool onboarding: `docs/smithii-tool-onboarding-template.md`
- Future tool registry: `src/lib/smithii/capability-registry.ts`
- Registry docs: `docs/smithii-capability-registry.md`
- Next Smithii questions: `docs/smithii-next-tools-question-pack.md`
- SMAC reports: `docs/smac-reports/`

---

## 10. Verification Standard

For code changes, run the narrowest useful targeted tests first, then the relevant full checks before claiming completion.

Current baseline commands:

```text
pnpm test
pnpm exec tsc --noEmit
pnpm lint
git diff --check
```

Run `pnpm build` before deployment, beta claims, or changes that materially affect Next.js runtime/build behavior.

For live execution phases, also run:

```text
pnpm phase8:live-preflight -- --wallet-csv <path> --swap-mint <mint> --launch-image <path>
```

Then follow `docs/phase8-live-acceptance-runbook.md` manually.

---

## 11. Glossary

- Agent backend: Next.js route handlers. Never sees private keys.
- Browser handoff: browser-only Smithii SDK execution path prepared from a non-secret pending plan.
- Pending plan: server-issued, session-bound, non-secret plan/audit metadata used to bind preview and confirmation.
- Browser-held secondary keys: burner wallet keys imported into the browser runtime for live-eligible bundle flows only.
- Live-eligible: implemented but still requiring runtime config and live acceptance before beta.
- Blocked: intentionally unavailable for live execution until Smithii provides a zero-custody contract.
- SMAC: scoped audit run at phase boundaries.
- Cleanup-orchestrator: cleanup executor used only for confirmed SMAC findings.

---

End of plan.
