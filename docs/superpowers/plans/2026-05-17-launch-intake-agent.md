# Launch Intake Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deterministic structured Bundle Launch intake for Pump.fun launches with dev amount, exact wallet mapping, per-wallet bundle buys, required uploaded image, optional socials with `skip`, and the existing browser-only handoff.

**Architecture:** Add a pure `launch-intake` module for parsing, wallet resolution, missing-field prompts, and preview conversion. Wire it into `mock-chat` as `launch_intake` only for rich Pump.fun launch instructions while preserving the legacy `bundle_launch` flow. The client sends only public wallet rows and an uploaded image filename to `/api/chat`; private keys and the actual image file stay in browser state.

**Tech Stack:** TypeScript, Next.js App Router, React, Vitest, existing Smithii mock and browser-handoff modules.

**Dirty Worktree Rule:** Do not commit during this implementation. Preserve all existing uncommitted work.

---

## File Structure

- Create `src/lib/agent/launch-intake.ts`: parser, `LaunchIntakeDraft`, wallet resolution, prompts, preview conversion.
- Modify `src/lib/agent/mock-chat.ts`: structured launch routing and preview fields `devAmountSol`, `socialsSkipped`, and `socials.github`.
- Modify `src/app/api/chat/route.ts`: validate `launch_intake`, `launchWalletRows`, and `launchImageFileName` while keeping private-key rejection.
- Modify `src/components/smithii-agent-app.tsx`: send public wallet rows and image filename, add intake image upload, keep that file for browser handoff, show wallet row numbers.
- Modify `src/components/previews/bundle-launch-preview.tsx`: show dev amount, image, GitHub, socials skipped/provided, and per-wallet buys; do not show unknown fees.
- Modify `src/lib/smithii/bundle-launch-browser-wiring.ts`: use `activePreview.devAmountSol` for Smithii `devAmount`.

## Success Criteria

- Preview is prepared only after wallet references resolve, every bundle wallet has a positive buy, an uploaded image filename exists, and socials are provided or skipped.
- Dev amount is `devAmountSol`; the dev wallet is not a bundle buyer and does not count toward requested bundle wallets.
- Requested bundle count matches explicit bundle allocations; missing buys are requested and never defaulted.
- Wallet indexes map to one-based imported wallet table order and the agent restates the mapping.
- Exact public keys resolve only when they match imported public wallet rows.
- `/api/chat` still rejects private-key-shaped fields anywhere in the body.
- Live execution remains gated by browser handoff, connected wallet, prepared packet, and explicit approval.

---

### Task 1: Pure Launch Intake Parser

**Files:**
- Create: `src/lib/agent/launch-intake.ts`
- Create: `tests/unit/launch-intake.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests with public wallet rows `DevPubkey111`, `BuyerPubkey222`, and `BuyerPubkey333`. Cover image-required blocking, ready conversion with GitHub social, and missing bundle buy prompt. Required assertions: dev wallet resolves to `DevPubkey111`, dev amount is `0.5`, ready conversion returns explicit buys for `BuyerPubkey222` and `BuyerPubkey333`, and missing buys prompt asks `What should wallet 3 buy?`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/unit/launch-intake.test.ts`

Expected: FAIL with missing `src/lib/agent/launch-intake` module.

- [ ] **Step 3: Implement module**

Export `LaunchIntakeDraft`, `advanceLaunchIntake`, and `launchIntakePreviewInput`. Draft data includes launchpad, token metadata, image filename, dev wallet, dev amount, requested bundle count, bundle allocations, socials, `socialsSkipped`, and `walletIndexesUsed`. `launchIntakePreviewInput` throws `Launch intake is incomplete.` until all required fields and resolved pubkeys exist.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run tests/unit/launch-intake.test.ts`

Expected: PASS.

### Task 2: Intake Validation Edge Cases

**Files:**
- Modify: `src/lib/agent/launch-intake.ts`
- Modify: `tests/unit/launch-intake.test.ts`

- [ ] **Step 1: Add failing validation tests**

Add tests for exact public-key resolution, unknown wallet index, missing socials decision, and dev wallet duplication. Expected prompts: unknown index says only 3 wallets are loaded, missing socials says `Social links are optional. Send website, Telegram, X, GitHub, or reply skip.`, and dev duplication says the dev wallet cannot also be a bundle wallet.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/unit/launch-intake.test.ts`

Expected: FAIL on the newly added validation cases.

- [ ] **Step 3: Implement validation**

Resolve exact pubkeys only when they match `walletRows`, return the exact index error, require socials or `skip`, reject dev-wallet bundle allocations, and ask missing buys by one-based imported wallet order.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run tests/unit/launch-intake.test.ts`

Expected: PASS.

### Task 3: Mock Chat Integration

**Files:**
- Modify: `src/lib/agent/mock-chat.ts`
- Modify: `tests/unit/mock-agent.test.ts`

- [ ] **Step 1: Add failing chat tests**

Add tests for a rich Pump.fun launch message before image upload and after image upload. The first returns `draft?.tool === "launch_intake"`, no preview, and the image-required prompt. The second returns a Bundle Launch preview with `devAmountSol: 0.5`, exact bundle wallet buys, `imageFileName: "shitcoin.png"`, `socialsEnabled: false`, and `socialsSkipped: true`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/unit/mock-agent.test.ts -t structured`

Expected: FAIL because structured intake is not wired.

- [ ] **Step 3: Implement mock chat wiring**

Import the intake module, extend `Draft`, extend `MockChatInput` with `launchWalletRows?: PublicWalletRow[]` and `launchImageFileName?: string | null`, handle existing `launch_intake` drafts before legacy launch collection, route only rich Pump.fun/per-wallet launch messages into intake, and convert ready intake into `prepareBundleLaunch` plus an `ActivePreview` with `devAmountSol`.

- [ ] **Step 4: Verify GREEN and legacy safety**

Run: `pnpm vitest run tests/unit/mock-agent.test.ts -t "structured|starts a bundle launch draft|prefills launch draft"`

Expected: PASS.

### Task 4: Route Boundary Validation

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `tests/unit/chat-route.test.ts`

- [ ] **Step 1: Add failing route tests**

Add one structured launch route test with public `launchWalletRows` and `launchImageFileName: "shitcoin.png"`; expect status `200`, no private-key alias fields, and `activePreview.kind === "bundle_launch"` with `devAmountSol: 0.5`. Add one malformed public row test expecting `Invalid launch wallet rows.`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/unit/chat-route.test.ts -t launch`

Expected: FAIL on structured route support while private-key rejection still passes.

- [ ] **Step 3: Implement route validation**

Parse `launchWalletRows` as public rows, parse `launchImageFileName` as `string | null`, parse `launch_intake` draft data with positive amounts and GitHub socials, and pass parsed values into `handleMockChat`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run tests/unit/chat-route.test.ts -t launch`

Expected: PASS.

### Task 5: UI Intake Upload, Preview, And Browser Handoff

**Files:**
- Modify: `src/components/smithii-agent-app.tsx`
- Modify: `src/components/previews/bundle-launch-preview.tsx`
- Modify: `src/lib/smithii/bundle-launch-browser-wiring.ts`
- Modify: `tests/unit/smithii-agent-app-browser-preparation.test.ts`
- Modify: `tests/unit/smithii-bundle-launch-browser-wiring.test.ts`

- [ ] **Step 1: Add failing source and wiring tests**

Require these app source strings: `launchWalletRows: publicWalletRows`, `launchImageFileName: launchIntakeImageFile?.name ?? null`, `selectLaunchIntakeImageFile`, `Launch image`, `walletIndexLabel(index)`, and `activePreview.devAmountSol`. Update the browser wiring fixture to include `devAmountSol: 0.5` and expect packet/summary `devAmount: 0.5`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/unit/smithii-agent-app-browser-preparation.test.ts tests/unit/smithii-bundle-launch-browser-wiring.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement UI and handoff changes**

Add `launchIntakeImageFile` state, send public wallet rows plus image filename, add `selectLaunchIntakeImageFile`, render a compact `Launch image` file input in `Agent Console`, add a wallet table `#` column with `walletIndexLabel(index)`, reuse the selected intake image for Bundle Launch handoff when it matches `activePreview.imageFileName`, add preview rows for dev amount and GitHub/socials skipped, and set browser launch `devAmount` from `preview.devAmountSol`.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run tests/unit/smithii-agent-app-browser-preparation.test.ts tests/unit/smithii-bundle-launch-browser-wiring.test.ts`

Expected: PASS.

### Task 6: Final Verification

**Files:**
- No planned source edits after this task.

- [ ] **Step 1:** Run `pnpm vitest run tests/unit/launch-intake.test.ts tests/unit/mock-agent.test.ts tests/unit/chat-route.test.ts tests/unit/smithii-agent-app-browser-preparation.test.ts tests/unit/smithii-bundle-launch-browser-wiring.test.ts` and expect PASS.
- [ ] **Step 2:** Run `pnpm test` and expect PASS.
- [ ] **Step 3:** Run `pnpm exec tsc --noEmit` and expect PASS.
- [ ] **Step 4:** Run `pnpm lint` and expect PASS.
- [ ] **Step 5:** Run `git diff --check` and expect no output with exit code 0.

## Self-Review

- Spec coverage: Tasks 1-5 cover dedicated intake state, parser behavior, wallet resolution, image gating, socials decision, public route validation, UI upload, row numbering, preview summary, private-key boundary, and browser handoff dev amount.
- Placeholder scan: The plan contains no `TBD`, `TODO`, `implement later`, or unnamed validation steps.
- Type consistency: `launch_intake`, `LaunchIntakeDraft`, `launchWalletRows`, `launchImageFileName`, `devAmountSol`, `socialsSkipped`, and `github` are used consistently across tasks.
