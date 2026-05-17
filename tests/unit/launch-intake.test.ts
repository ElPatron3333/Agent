import { describe, expect, it } from "vitest";

import {
  advanceLaunchIntake,
  launchIntakePreviewInput,
} from "../../src/lib/agent/launch-intake";
import type { PublicWalletRow } from "../../src/lib/wallet-roster";

const walletRows: PublicWalletRow[] = [
  row("imported-1", "DevPubkey111", "dev"),
  row("imported-2", "BuyerPubkey222", "bundle"),
  row("imported-3", "BuyerPubkey333", "bundle"),
];

describe("structured Bundle Launch intake", () => {
  it("blocks preview until a browser-uploaded image exists", () => {
    const result = advanceLaunchIntake({
      draft: null,
      message:
        "launch a coin called Shitcoin on Pumpfun, bundle it with 2 wallets. Wallet 1 is dev and uses 0.5 SOL. Wallet 2 buys 2 SOL. Wallet 3 buys 1 SOL. Description: Test launch. Skip socials.",
      walletRows,
      uploadedImageFileName: null,
    });

    expect(result.ready).toBe(false);
    expect(result.prompt).toBe(
      "I have the launch details, but I need the token image before I can prepare the preview. Upload the image, then I will continue.",
    );
    expect(result.draft.data.devWallet).toMatchObject({
      kind: "index",
      index: 1,
      resolvedPubkey: "DevPubkey111",
    });
    expect(result.draft.data.devAmountSol).toBe(0.5);
  });

  it("converts ready intake to explicit preview input with GitHub socials", () => {
    const result = advanceLaunchIntake({
      draft: null,
      message:
        "launch a token called Shitcoin symbol SHIT on Pump.fun. Description: Test launch. Bundle it with 2 wallets. Wallet 1 is dev and creates with 0.5 SOL. Wallet 2 buys 2 SOL. Wallet 3 buys 1 SOL. Website https://shit.example GitHub https://github.com/example/shitcoin",
      walletRows,
      uploadedImageFileName: "shitcoin.png",
    });

    expect(result.ready).toBe(true);
    expect(result.prompt).toContain(
      "Wallet indexes were mapped to the imported wallet table order.",
    );
    expect(launchIntakePreviewInput(result.draft)).toEqual({
      tokenName: "Shitcoin",
      symbol: "SHIT",
      description: "Test launch.",
      imageFileName: "shitcoin.png",
      devWalletPubkey: "DevPubkey111",
      devAmountSol: 0.5,
      bundleWallets: [
        { pubkey: "BuyerPubkey222", buyAmountSol: 2 },
        { pubkey: "BuyerPubkey333", buyAmountSol: 1 },
      ],
      socialsSkipped: false,
      socials: {
        website: "https://shit.example",
        github: "https://github.com/example/shitcoin",
      },
    });
  });

  it("asks for missing buys instead of inventing defaults", () => {
    const result = advanceLaunchIntake({
      draft: null,
      message:
        "launch a coin called Shitcoin on Pumpfun, bundle it with 2 wallets. Wallet 1 is dev and uses 0.5 SOL. Wallet 2 buys 2 SOL. Description: Test launch. Skip socials.",
      walletRows,
      uploadedImageFileName: "shitcoin.png",
    });

    expect(result.ready).toBe(false);
    expect(result.prompt).toBe(
      "I found 2 bundle wallets requested, but only 1 buy amount. What should wallet 3 buy?",
    );
  });

  it("resolves exact public keys against imported wallets", () => {
    const result = advanceLaunchIntake({
      draft: null,
      message:
        "launch token called Key Coin symbol KEY on Pumpfun. Description: Key test. Bundle it with 1 wallets. dev wallet is DevPubkey111 and uses 0.2 SOL. BuyerPubkey222 buys 0.4 SOL. Skip socials.",
      walletRows,
      uploadedImageFileName: "key.png",
    });

    expect(result.ready).toBe(true);
    expect(launchIntakePreviewInput(result.draft)).toMatchObject({
      devWalletPubkey: "DevPubkey111",
      bundleWallets: [{ pubkey: "BuyerPubkey222", buyAmountSol: 0.4 }],
    });
  });

  it("rejects an unknown wallet index", () => {
    const result = advanceLaunchIntake({
      draft: null,
      message:
        "launch token called Short symbol SHORT on Pumpfun. Description: Short. Bundle it with 1 wallets. Wallet 1 is dev and uses 0.2 SOL. Wallet 4 buys 0.4 SOL. Skip socials.",
      walletRows,
      uploadedImageFileName: "short.png",
    });

    expect(result.ready).toBe(false);
    expect(result.prompt).toBe(
      "Wallet 4 maps to the imported wallet table, but only 3 wallets are loaded. Import the wallet CSV or reference an exact wallet address.",
    );
  });

  it("asks for socials when the user omitted a socials decision", () => {
    const result = advanceLaunchIntake({
      draft: null,
      message:
        "launch token called Social Coin symbol SOC on Pumpfun. Description: Social test. Bundle it with 1 wallets. Wallet 1 is dev and uses 0.2 SOL. Wallet 2 buys 0.4 SOL.",
      walletRows,
      uploadedImageFileName: "social.png",
    });

    expect(result.ready).toBe(false);
    expect(result.prompt).toBe(
      "Social links are optional. Send website, Telegram, X, GitHub, or reply skip.",
    );
  });

  it("rejects the dev wallet as a bundle buyer", () => {
    const result = advanceLaunchIntake({
      draft: null,
      message:
        "launch token called Dup Coin symbol DUP on Pumpfun. Description: Dup test. Bundle it with 1 wallets. Wallet 1 is dev and uses 0.2 SOL. Wallet 1 buys 0.4 SOL. Skip socials.",
      walletRows,
      uploadedImageFileName: "dup.png",
    });

    expect(result.ready).toBe(false);
    expect(result.prompt).toBe(
      "The dev wallet cannot also be a bundle wallet. Which bundle wallet should buy 0.4 SOL instead?",
    );
  });
  it("continues missing token details from direct prompt replies", () => {
    const started = advanceLaunchIntake({
      draft: null,
      message:
        "launch on Pumpfun, bundle it with 1 wallets. Wallet 1 is dev and uses 0.2 SOL. Wallet 2 buys 0.4 SOL. Skip socials.",
      walletRows,
      uploadedImageFileName: "direct.png",
    });

    expect(started.prompt).toBe("What token name should I use?");

    const named = advanceLaunchIntake({
      draft: started.draft,
      message: "Direct Coin",
      walletRows,
      uploadedImageFileName: "direct.png",
    });

    expect(named.prompt).toBe("What description should I use?");
    expect(named.draft.data.tokenName).toBe("Direct Coin");
    expect(named.draft.data.symbol).toBe("DCOIN");

    const described = advanceLaunchIntake({
      draft: named.draft,
      message: "A direct launch description.",
      walletRows,
      uploadedImageFileName: "direct.png",
    });

    expect(described.ready).toBe(true);
    expect(launchIntakePreviewInput(described.draft)).toMatchObject({
      tokenName: "Direct Coin",
      description: "A direct launch description.",
    });
  });

  it("continues missing wallet details from direct prompt replies", () => {
    const started = advanceLaunchIntake({
      draft: null,
      message:
        "launch token called Step Coin symbol STEP on Pumpfun. Description: Step test. Skip socials.",
      walletRows,
      uploadedImageFileName: "step.png",
    });

    expect(started.prompt).toBe(
      "Which imported wallet is the dev wallet? Use wallet number or public key.",
    );

    const devWallet = advanceLaunchIntake({
      draft: started.draft,
      message: "wallet 1",
      walletRows,
      uploadedImageFileName: "step.png",
    });
    expect(devWallet.prompt).toBe(
      "How much SOL should the dev wallet use for token creation?",
    );

    const devAmount = advanceLaunchIntake({
      draft: devWallet.draft,
      message: "0.2 SOL",
      walletRows,
      uploadedImageFileName: "step.png",
    });
    expect(devAmount.prompt).toBe("How many bundle wallets should buy?");

    const bundleCount = advanceLaunchIntake({
      draft: devAmount.draft,
      message: "1",
      walletRows,
      uploadedImageFileName: "step.png",
    });
    expect(bundleCount.prompt).toBe(
      "I found 1 bundle wallets requested, but only 0 buy amounts. What should wallet 2 buy?",
    );

    const buyAmount = advanceLaunchIntake({
      draft: bundleCount.draft,
      message: "0.4 SOL",
      walletRows,
      uploadedImageFileName: "step.png",
    });

    expect(buyAmount.ready).toBe(true);
    expect(launchIntakePreviewInput(buyAmount.draft)).toMatchObject({
      devWalletPubkey: "DevPubkey111",
      devAmountSol: 0.2,
      bundleWallets: [{ pubkey: "BuyerPubkey222", buyAmountSol: 0.4 }],
    });
  });

  it("excludes an exact-pubkey dev wallet from missing buy prompts", () => {
    const result = advanceLaunchIntake({
      draft: null,
      message:
        "launch token called Exact Dev symbol XDEV on Pumpfun. Description: Exact dev. Bundle it with 2 wallets. dev wallet is DevPubkey111 and uses 0.2 SOL. Wallet 2 buys 0.4 SOL. Skip socials.",
      walletRows,
      uploadedImageFileName: "exact-dev.png",
    });

    expect(result.ready).toBe(false);
    expect(result.prompt).toBe(
      "I found 2 bundle wallets requested, but only 1 buy amount. What should wallet 3 buy?",
    );
  });

  it("blocks duplicate resolved bundle wallet allocations", () => {
    const result = advanceLaunchIntake({
      draft: null,
      message:
        "launch token called Duplicate Buyer symbol DBUY on Pumpfun. Description: Duplicate buyer. Bundle it with 2 wallets. Wallet 1 is dev and uses 0.2 SOL. Wallet 2 buys 0.4 SOL. BuyerPubkey222 buys 0.5 SOL. Skip socials.",
      walletRows,
      uploadedImageFileName: "duplicate-buyer.png",
    });

    expect(result.ready).toBe(false);
    expect(result.prompt).toBe(
      "Bundle wallet BuyerPubkey222 was provided more than once. Which imported wallet should buy 0.5 SOL instead?",
    );
  });

  it("asks for more imported bundle wallets when requested count exceeds available rows", () => {
    const result = advanceLaunchIntake({
      draft: null,
      message:
        "launch token called Too Many symbol MANY on Pumpfun. Description: Too many. Bundle it with 3 wallets. Wallet 1 is dev and uses 0.2 SOL. Wallet 2 buys 0.4 SOL. Wallet 3 buys 0.5 SOL. Skip socials.",
      walletRows,
      uploadedImageFileName: "too-many.png",
    });

    expect(result.ready).toBe(false);
    expect(result.prompt).toBe(
      "I found 3 bundle wallets requested, but only 2 imported bundle wallets are available after excluding the dev wallet. Import more bundle wallets before I can prepare the preview.",
    );
  });
});

function row(
  id: string,
  pubkey: string,
  role: PublicWalletRow["role"],
): PublicWalletRow {
  return { id, pubkey, role, solBalance: 0, tokenBalance: 0, pctOfSupply: 0 };
}
