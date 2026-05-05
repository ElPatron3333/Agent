import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { PumpFunClient } from "@smithii/sdk/pump";

import {
  createPumpBrowserClient,
  createBrowserExecutionPlan,
  pumpBrowserHandoffConfigFromEnv,
  validatePumpBrowserHandoffConfig,
} from "../../src/lib/smithii/browser-handoff";

describe("Smithii browser handoff contract", () => {
  it("creates a deterministic non-secret execution plan for browser launch handoff", () => {
    const plan = createBrowserExecutionPlan({
      flow: "bundle_launch",
      wallet: "DevWallet111",
      params: {
        token: "Blue Frog",
        buyerWallets: ["Buyer111", "Buyer222"],
        totalBuysSol: 0.2,
      },
      expectedFeesLamports: "100000000",
      now: new Date("2026-05-06T08:00:00.000Z"),
      nonce: "nonce-1",
    });

    expect(plan).toEqual({
      planId: "live_bundle_launch_c58c2467a03a",
      flow: "bundle_launch",
      wallet: "DevWallet111",
      paramsHash:
        "5965296f3df17b050d86ca3919fe327bf5d1a41eb5c5f21b0ca78385dd0e35d8",
      expectedFeesLamports: "100000000",
      expiresAt: "2026-05-06T08:05:00.000Z",
      nonce: "nonce-1",
      idempotencyKey:
        "c58c2467a03a417f92d72ae243a8edee11c2bb948fd1cdc5b9122bed601303a6",
    });
    expect(JSON.stringify(plan)).not.toContain("Blue Frog");
    expect(JSON.stringify(plan)).not.toContain("buyerWallets");
  });

  it.each([
    "privateKey",
    "mnemonic",
    "pk",
    "privKeys",
    "privateKeys",
    "secretKey",
    "seedPhrase",
  ])(
    "rejects private-key-shaped params field %s",
    (fieldName) => {
      expect(() =>
        createBrowserExecutionPlan({
          flow: "bundle_swap",
          wallet: "Trader111",
          params: { nested: { [fieldName]: "SECRET_SHOULD_NOT_HASH" } },
          expectedFeesLamports: "100000000",
          now: new Date("2026-05-06T08:00:00.000Z"),
          nonce: "nonce-2",
        }),
      ).toThrow("Browser execution plan params cannot contain private-key-shaped fields.");
    },
  );

  it("allows null browser execution plan params as an explicit JSON value", () => {
    const plan = createBrowserExecutionPlan({
      flow: "bundle_swap",
      wallet: "Trader111",
      params: null,
      expectedFeesLamports: "100000000",
      now: new Date("2026-05-06T08:00:00.000Z"),
      nonce: "nonce-null",
    });

    expect(plan.paramsHash).toBe(
      "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    );
  });

  it.each([
    ["undefined", undefined],
    ["function", () => "not-json"],
    ["symbol", Symbol("not-json")],
    ["bigint", BigInt(1)],
    ["NaN", Number.NaN],
    ["nested undefined", { token: "Mint111", amount: undefined }],
    ["date", new Date("2026-05-06T08:00:00.000Z")],
  ])("rejects non-JSON browser execution plan params: %s", (_label, params) => {
    expect(() =>
      createBrowserExecutionPlan({
        flow: "bundle_swap",
        wallet: "Trader111",
        params,
        expectedFeesLamports: "100000000",
        now: new Date("2026-05-06T08:00:00.000Z"),
        nonce: "nonce-json",
      }),
    ).toThrow("Browser execution plan params must be JSON-serializable.");
  });

  it("validates required public browser SDK configuration", () => {
    expect(
      validatePumpBrowserHandoffConfig({
        rpcUrl: "https://rpc.example",
        proxyUrl: "https://tools.smithii.io",
        jitoUuid: "jito-uuid",
      }),
    ).toEqual({
      rpcUrl: "https://rpc.example",
      proxyUrl: "https://tools.smithii.io",
      jitoUuid: "jito-uuid",
    });

    expect(() =>
      validatePumpBrowserHandoffConfig({
        rpcUrl: "",
        proxyUrl: "https://tools.smithii.io",
        jitoUuid: "jito-uuid",
      }),
    ).toThrow("Smithii browser handoff RPC URL is required.");
  });

  it("reads public Pump handoff config from Next public env fields", () => {
    expect(
      pumpBrowserHandoffConfigFromEnv({
        NEXT_PUBLIC_SOLANA_RPC_URL: "https://rpc.example",
        NEXT_PUBLIC_SMITHII_PROXY_URL: "https://tools.smithii.io",
        NEXT_PUBLIC_SMITHII_JITO_UUID: "jito-uuid",
      }),
    ).toEqual({
      rpcUrl: "https://rpc.example",
      proxyUrl: "https://tools.smithii.io",
      jitoUuid: "jito-uuid",
    });
  });

  it("creates a PumpFunClient from browser-only public config and wallet signer", () => {
    const client = createPumpBrowserClient(
      {
        rpcUrl: "https://rpc.example",
        proxyUrl: "https://tools.smithii.io",
        jitoUuid: "jito-uuid",
      },
      {
        publicKey: new PublicKey("11111111111111111111111111111111"),
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      },
    );

    expect(client).toBeInstanceOf(PumpFunClient);
  });
});
