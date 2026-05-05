# Phase 8E Browser Handoff UI Shell Design

Date: 2026-05-06
Branch: `feature/phase8e-browser-handoff-ui-shell`
Status: approved for implementation

## Goal

Add a non-executing browser handoff UI shell for Smithii Pump Bundle Launch and supported Bundle Swap previews, so the app clearly exposes the next browser-only integration boundary without enabling live transactions.

## Scope

This phase builds a client-side shell for previews whose Smithii live boundary is already marked `browser-handoff-ready`:

- Bundle Launch through `PumpFunClient.uploadMetadata(...)` then `PumpFunClient.createAndSnipeToken(...)`.
- Bundle Swap SOL-to-token and token-to-SOL through `PumpFunClient.bundleSellBuy(...)`.

This phase does not build:

- A live execute button.
- A private-key input modal.
- Wallet adapter signing.
- Calls to `executePumpBundleLaunchBrowserHandoff(...)` or `executePumpBundleSwapBrowserHandoff(...)`.
- Backend Smithii live execution.
- Token-to-token, Volume Bot, or Launch + Volume live execution.

## Architecture

Create a focused UI model helper in `src/lib/smithii/browser-handoff-ui.ts`. The helper accepts the current `ActivePreview`, `PendingPlan`, and `SmithiiLiveBoundary`, then returns a non-secret model that the React app can render. Keeping this derivation outside the component makes the security-sensitive visibility rules easy to test without a browser renderer.

Modify `src/components/smithii-agent-app.tsx` only to render the helper output in the existing confirmation/live-boundary area. The panel stays informational and disabled: it can say the flow is handoff-ready, list the SDK method and browser-held materials required, and show that execution is not wired in this package.

## Data Flow

1. Chat flow prepares a preview and returns `smithiiLive` from `liveBoundaryForPreview(...)`.
2. `SmithiiAgentApp` stores `activePreview`, `pendingPlan`, and `smithiiLive` as it does today.
3. The new helper derives a `BrowserHandoffUiModel` only when:
   - an active preview exists,
   - a pending plan exists,
   - the live boundary mode is `browser-handoff-ready`, and
   - the preview kind is `bundle_launch` or a supported `bundle_swap`.
4. The component renders the model in a small panel with status, SDK method, active plan, required materials, and disabled action text.
5. Unsupported or blocked flows render no handoff shell and keep the existing live-boundary blocker text.

## Security Boundaries

- The helper and UI model must not include private-key-shaped field names or values such as `pk`, `privKeys`, `privateKey`, `privateKeys`, `secretKey`, `mnemonic`, or `seedPhrase`.
- The helper must use neutral labels such as `browser-held wallet material` instead of SDK argument names that imply secret fields.
- The React component must not add inputs for secrets in this phase.
- The React component must not import or call `pump-browser-executor.ts`.
- Backend routes remain untouched and must not import the browser handoff UI helper or executor.

## UI Behavior

For Bundle Launch, the panel shows:

- Status: `Ready for browser handoff setup`.
- Flow: `Bundle Launch`.
- SDK method from `SmithiiLiveBoundary.sdkMethod`.
- Active plan ID from `PendingPlan.id`.
- Disabled action label: `Browser handoff not wired`.
- Required materials: user-safe labels for metadata image, generated mint keypair, dev wallet signer, and browser-held bundle wallet material.

For Bundle Swap, the panel shows:

- Status: `Ready for browser handoff setup`.
- Flow: `Bundle Swap`.
- SDK method from `SmithiiLiveBoundary.sdkMethod`.
- Active plan ID from `PendingPlan.id`.
- Disabled action label: `Browser handoff not wired`.
- Required materials: user-safe labels for token mint, connected wallet signer, browser-held participating wallet material, and per-wallet amounts.

For blocked flows, the panel does not render. The existing confirmation gate continues to show why live execution is blocked.

## Testing

Use TDD with `tests/unit/smithii-browser-handoff-ui.test.ts`.

Required coverage:

- Bundle Launch with a browser-ready boundary returns a UI model.
- Supported Bundle Swap with a browser-ready boundary returns a UI model.
- Token-to-token Bundle Swap, Volume Bot, Launch + Volume, missing preview, missing pending plan, or mock boundary return `null`.
- The serialized UI model does not contain private-key-shaped field names.
- `src/app` does not import `pump-browser-executor` after the UI shell is added.

Full phase verification remains:

- `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts tests/unit/smithii-live-boundary.test.ts tests/unit/client-chat-state.test.ts`
- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `git diff --check`
