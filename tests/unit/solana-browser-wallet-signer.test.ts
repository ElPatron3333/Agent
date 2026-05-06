import { describe, expect, it } from "vitest";

import {
  connectInjectedSolanaWallet,
  injectedSolanaProviderFromWindow,
  type InjectedSolanaProvider,
} from "../../src/lib/solana/browser-wallet-signer";

describe("browser wallet signer adapter", () => {
  it("connects an injected provider and exposes signer methods", async () => {
    const provider = browserProvider({ publicKey: "Wallet111" });

    const connected = await connectInjectedSolanaWallet(provider);

    expect(connected.status).toBe("connected");
    if (connected.status !== "connected") {
      throw new Error(connected.reason);
    }
    expect(connected.walletLabel).toBe("Wallet111");
    expect(connected.signer.publicKey.toBase58()).toBe("Wallet111");
    await expect(connected.signer.signTransaction("tx")).resolves.toBe("signed:tx");
    await expect(connected.signer.signAllTransactions(["a", "b"])).resolves.toEqual([
      "signed:a",
      "signed:b",
    ]);
  });

  it("prefers window.solana and falls back to window.solflare", () => {
    const phantom = browserProvider({ publicKey: "Phantom111" });
    const solflare = browserProvider({ publicKey: "Solflare111" });

    expect(injectedSolanaProviderFromWindow({ solana: phantom, solflare })).toBe(phantom);
    expect(injectedSolanaProviderFromWindow({ solflare })).toBe(solflare);
    expect(injectedSolanaProviderFromWindow({})).toBeNull();
  });

  it.each([
    ["missing provider", null, "Browser wallet provider is required."],
    ["missing public key", browserProvider({ publicKey: null }), "Browser wallet public key is unavailable."],
    ["missing signTransaction", browserProvider({ publicKey: "Wallet111", signTransaction: undefined }), "Browser wallet signTransaction is required."],
    ["missing signAllTransactions", browserProvider({ publicKey: "Wallet111", signAllTransactions: undefined }), "Browser wallet signAllTransactions is required."],
    ["connect rejection", browserProvider({ publicKey: "Wallet111", connectError: new Error("User rejected") }), "Browser wallet connection failed: User rejected"],
  ])("blocks %s", async (_label, provider, reason) => {
    await expect(connectInjectedSolanaWallet(provider)).resolves.toEqual({
      status: "blocked",
      reason,
    });
  });
});

type BrowserProviderOptions = {
  publicKey: string | { toBase58(): string } | null;
  connectError?: Error;
  signTransaction?: InjectedSolanaProvider["signTransaction"];
  signAllTransactions?: InjectedSolanaProvider["signAllTransactions"];
};

function browserProvider(options: BrowserProviderOptions): InjectedSolanaProvider {
  const signTransaction = Object.hasOwn(options, "signTransaction")
    ? options.signTransaction
    : async <T,>(tx: T) => `signed:${String(tx)}` as T;
  const signAllTransactions = Object.hasOwn(options, "signAllTransactions")
    ? options.signAllTransactions
    : async <T,>(txs: T[]) => txs.map((tx) => `signed:${String(tx)}` as T);

  return {
    publicKey: options.publicKey,
    connect: async () => {
      if (options.connectError) {
        throw options.connectError;
      }
      return { publicKey: options.publicKey };
    },
    ...(signTransaction ? { signTransaction } : {}),
    ...(signAllTransactions ? { signAllTransactions } : {}),
  };
}


