# Smithii SDK Spike

Date: 2026-05-04
Branch: feature/smithii-sdk-spike
Package: @smithii/sdk ^0.2.0

## SDK Surface Checked

The Smithii package exposes the subpaths we need to evaluate for the MVP:

- @smithii/sdk/pump
- @smithii/sdk/pumpswap
- @smithii/sdk/anti-mev
- @smithii/sdk/core
- @smithii/sdk/payment

For our Smithii Pro MVP, the useful surface is mostly @smithii/sdk/pump and @smithii/sdk/anti-mev. The SDK is helpful for matching Smithii's argument shapes, but it does not remove the zero-custody constraint from our architecture.

## Bundle Launch

Smithii SDK method: PumpFunClient.createAndSnipeToken from @smithii/sdk/pump.

This maps directly to our Bundle Launch preview shape for Pump.fun. The SDK requires buyer private keys in buyers[].pk, so this can only be wired from a browser/client-side execution path where the user's keys never touch our backend.

The adapter maps:

- token metadata response to metadata
- generated mint keypair to mintKeypair
- bundle wallet SOL amounts to buyers[].amount
- browser-held buyer keys to buyers[].pk
- pregenerate token address to isTokenPregenerated
- Cashback Coin to isCashbackCoin

No backend execution should be added for this flow unless Smithii provides a signer-only or server-issued plan flow that does not require private keys.

## Bundle Swap

Smithii SDK method: PumpFunClient.bundleSellBuy from @smithii/sdk/pump.

This maps to Bundle Swap for:

- SOL to token as action = buy
- token to SOL as action = sell
- pumpfun_bonding as pool = pump
- pumpswap_amm as pool = pump-amm

The SDK requires wallet private keys in privKeys[], so this is also browser-only for the MVP. The adapter blocks server runtime use when private keys are present.

The SDK method does not expose token-to-token bundle swaps. Our mock preview can still collect and preview token-to-token intent, but live SDK execution needs a separate Smithii-supported path or a different swap backend before it can be enabled.

## Volume Bot

Smithii SDK method evaluated: AntiMEVClient.runSingle from @smithii/sdk/anti-mev.

This method is signer-based and does not take private keys directly. It can represent part of our Volume Bot input:

- tokenAddress maps directly
- makers maps to antiMEVUses
- orderAmount maps to fixed/random amount
- delaySeconds maps to fixed/random delay

Coverage is partial and needs Smithii confirmation. The SDK v0.2.0 type surface does not show where these MVP Volume Bot fields map:

- onPurchase
- sellTiming
- sellMode
- sellStrategy

AntiMEVClient.runMultiple is blocked for this MVP because it sends privateKeys[] to the Smithii backend. That violates our backend private-key rule.

## Integration Gate

Do not wire live Smithii execution yet. The next live integration step needs Smithii confirmation for:

1. Whether AntiMEVClient.runSingle is the same product surface as Smithii Pro Volume Bot or only Anti-MEV volume.
2. Where auto-sell, return-to-wallet, sell timing, and sell strategy map in SDK v0.2.0.
3. Whether Smithii has a zero-custody multi-wallet Volume Bot flow, or whether runMultiple is intentionally backend-keyed.

Until that is answered, the correct integration state is a thin typed adapter plus mock-first previews and explicit confirmation gates.
