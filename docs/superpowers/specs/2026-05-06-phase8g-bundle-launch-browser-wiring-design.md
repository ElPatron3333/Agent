# Phase 8G Bundle Launch Browser Wiring Design

Date: 2026-05-06
Branch: `feature/phase8g-bundle-launch-browser-wiring`
Status: approved direction after Phase 8F merge

## Goal

Wire browser-only Bundle Launch packet preparation so the app can assemble the local inputs required by the Phase 8D Pump browser executor without enabling backend execution or submitting real Smithii transactions.

## Scope

This phase covers Bundle Launch packet preparation only:

- Browser-local validation of the active Bundle Launch preview, pending plan, Smithii live boundary, wallet roster, metadata image file, and generated mint keypair.
- A non-secret `BrowserExecutionPlan` for `flow: "bundle_launch"` built from public launch parameters.
- A browser-local executor input compatible with `executePumpBundleLaunchBrowserHandoff(...)`.
- A sanitized UI summary that displays only public packet metadata.
- Tests proving private keys, mint keypair material, image data, and metadata body text do not enter the public plan or UI summary.

This phase does not build:

- Real live execution or a submit button.
- Backend Smithii execution.
- Wallet adapter signing.
- Metadata upload to Smithii.
- A full production image management system.
- Bundle Swap changes beyond preserving Phase 8F behavior.

## Key Constraint

Bundle Launch cannot be prepared from the old preview alone. The Smithii SDK launch path needs:

- `metadata.file: Blob | File`
- token name, symbol, and description
- optional socials
- a generated mint keypair
- dev buy amount
- buyer private keys and buy amounts

The existing preview already contains public launch math, selected wallet pubkeys, modifiers, image filename, and socials. Phase 8G will add structured non-secret launch metadata fields to the preview so the browser packet helper does not parse display strings such as `"Blue Frog / BFROG"`.

## Approach

Add a pure helper in `src/lib/smithii/bundle-launch-browser-wiring.ts`. The helper accepts:

- `activePreview`
- `pendingPlan`
- `smithiiLive`
- `walletRoster`
- `metadataFile` from browser state
- `mintKeypair` from browser state
- `nonce` and optional clock

The helper returns either `{ status: "blocked", reason }` for normal readiness failures or `{ status: "ready", packet }`.

The ready packet contains:

1. A non-secret `BrowserExecutionPlan` whose params include source plan ID, token name/symbol, image filename, dev wallet pubkey, public bundle wallet pubkeys and amounts, and launch modifiers.
2. A browser-local executor input containing SDK metadata, mint keypair, dev amount, buyer `pk` values, and launch flags.

Private keys and mint keypair material are allowed only inside the browser-local executor input. The UI stores and displays only the sanitized summary returned by `bundleLaunchBrowserExecutionSummary(packet)`.

## Preview Metadata Change

Extend Bundle Launch previews with:

- `tokenName: string`
- `tokenSymbol: string`
- `description: string`

Keep the existing `token` display field for current UI compatibility.

This is a non-secret shape change. It is needed because the Smithii metadata upload contract requires name, symbol, and description as separate fields.

## UI Behavior

The existing handoff panel will support two preparation kinds:

- `bundle_launch`: `Prepare browser launch packet`
- `bundle_swap`: `Prepare browser swap packet`

For Bundle Launch, the panel should show a file input for the token metadata image only when the handoff model has launch preparation readiness. The browser generates a mint keypair locally if one is not already present for the current launch scope. Clicking prepare runs local validation and stores only a sanitized summary.

The UI must not:

- import `pump-browser-executor.ts` from `src/app` or `src/components`
- call `executePumpBundleLaunchBrowserHandoff(...)`
- log or render buyer private keys
- log or render mint keypair secret material
- send metadata image bytes to the backend

## Data Flow

1. `/api/chat` returns a Bundle Launch preview with structured non-secret metadata fields.
2. `SmithiiAgentApp` keeps the preview, pending plan, Smithii boundary, wallet roster, selected metadata image file, and generated mint keypair in browser state.
3. The UI model exposes launch preparation copy only for matching Bundle Launch preview/plan pairs in `browser-handoff-ready` mode.
4. The launch wiring helper validates the state and either blocks with a plain-language reason or prepares a local packet.
5. The panel renders only the sanitized summary: flow, plan ID, idempotency key, mint public key, dev amount, buyer count, expected fee, pregenerate flag, cashback flag, and status.

## Validation Rules

The helper blocks when:

- active preview is missing or not `bundle_launch`
- pending plan is missing or not `bundle_launch`
- preview plan ID does not match pending plan ID
- Smithii live mode is not `browser-handoff-ready`
- metadata image file is missing
- generated mint keypair is missing
- dev wallet is missing from browser roster or lacks private-key material
- any preview bundle wallet is missing matching browser roster private-key material
- no bundle buyer wallets are present

The helper maps:

- `metadata.name` from `preview.tokenName`
- `metadata.symbol` from `preview.tokenSymbol`
- `metadata.description` from `preview.description`
- `metadata.file` from browser-only file state
- `metadata.filename` from `preview.imageFileName`
- socials from `preview.socials`, with missing values as `null`
- `devAmount` from `preview.devWalletFeesSol - preview.serviceFeeSol - pregenerateFeeSol`, clamped to 0 for mock math consistency
- `buyers[]` from preview bundle wallets and matching roster private keys
- `isCashbackCoin` from `preview.modifiers.cashbackCoin`
- `isTokenPregenerated` from `preview.modifiers.pregenerateTokenAddress`

Expected fees lamports equal `Math.round(preview.devWalletFeesSol * 1_000_000_000).toString()`, because the connected dev wallet pays Smithii service fee, optional pregenerate fee, and dev buy.

## Testing

Use TDD with focused unit tests:

- Ready Bundle Launch packet creates a non-secret browser plan and browser-local executor input.
- Buyers map selected bundle wallet pubkeys to private keys only inside `executorInput.buyers[].pk`.
- Metadata file and mint keypair are accepted only as browser-local packet material.
- Summary and plan do not include private-key-shaped fields, secret values, image bytes, or metadata description body text.
- Blocked states cover missing preview, missing pending plan, mock boundary, mismatched plan, missing file, missing mint keypair, missing dev wallet material, missing buyer material, and no buyers.
- UI model includes non-secret launch preparation copy.
- App/component static guard confirms no `pump-browser-executor` import and confirms launch preparation wiring.

Full phase verification:

- `pnpm vitest run tests/unit/smithii-bundle-launch-browser-wiring.test.ts tests/unit/smithii-pump-browser-executor.test.ts tests/unit/smithii-browser-handoff-ui.test.ts tests/unit/smithii-agent-app-browser-preparation.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `git diff --check`
- `rg -n "pump-browser-executor" src/app src/components`

## Residual Watch Items

- Real metadata upload and transaction execution still wait for the final live submit phase.
- A DOM interaction test remains deferred until the repo adds a frontend test harness.
- The metadata image file is browser-local only; no persistence is added in this phase.
