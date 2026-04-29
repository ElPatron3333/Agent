import { describe, expect, it } from "vitest";

import {
  buildLaunchWalletSelection,
  createDemoWalletRoster,
  exportPrivateKeyCsv,
  parsePrivateKeyCsv,
  toPublicWalletRows,
} from "../../src/lib/wallet-roster";
import { handleMockChat } from "../../src/lib/agent/mock-chat";

const now = Date.parse("2026-04-29T00:00:00.000Z");

describe("wallet roster boundary", () => {
  it("parses privateKey CSV into browser-only bundle wallets", () => {
    const imported = parsePrivateKeyCsv(
      [
        "privateKey",
        "4Nd1mportedPrivateKey111111111111111111111111111",
        "5Nd1mportedPrivateKey222222222222222222222222222",
      ].join("\n"),
    );

    expect(imported).toEqual([
      {
        id: "imported-1",
        pubkey: "Imported wallet 1",
        privateKey: "4Nd1mportedPrivateKey111111111111111111111111111",
        solBalance: 0,
        tokenBalance: 0,
        pctOfSupply: 0,
        role: "bundle",
      },
      {
        id: "imported-2",
        pubkey: "Imported wallet 2",
        privateKey: "5Nd1mportedPrivateKey222222222222222222222222222",
        solBalance: 0,
        tokenBalance: 0,
        pctOfSupply: 0,
        role: "bundle",
      },
    ]);
  });

  it("parses a privateKey column from a multi-column CSV", () => {
    const imported = parsePrivateKeyCsv(
      [
        "label,privateKey,notes",
        "first,4Nd1mportedPrivateKey111111111111111111111111111,alpha",
        "second,5Nd1mportedPrivateKey222222222222222222222222222,beta",
      ].join("\n"),
    );

    expect(imported.map((wallet) => wallet.privateKey)).toEqual([
      "4Nd1mportedPrivateKey111111111111111111111111111",
      "5Nd1mportedPrivateKey222222222222222222222222222",
    ]);
  });

  it("does not derive imported public labels from private-key contents", () => {
    const imported = parsePrivateKeyCsv(
      [
        "privateKey",
        "4Nd1mportedPrivateKey111111111111111111111111111",
      ].join("\n"),
    );

    expect(imported[0].pubkey).toBe("Imported wallet 1");
    expect(imported[0].pubkey).not.toContain(imported[0].privateKey.slice(-4));
  });

  it("rejects CSV without the privateKey header", () => {
    expect(() =>
      parsePrivateKeyCsv(
        ["wallet", "4Nd1mportedPrivateKey111111111111111111111111111"].join(
          "\n",
        ),
      ),
    ).toThrow("CSV must have a single privateKey header.");
  });

  it("rejects empty private key rows", () => {
    expect(() => parsePrivateKeyCsv(["privateKey", ""].join("\n"))).toThrow(
      "CSV must include at least one private key.",
    );
  });

  it("rejects private keys outside the base58 shape", () => {
    expect(() => parsePrivateKeyCsv(["privateKey", "not-valid-000"].join("\n"))).toThrow(
      "Private key on row 2 must be base58.",
    );
  });

  it("exports current browser roster as privateKey CSV", () => {
    const csv = exportPrivateKeyCsv(createDemoWalletRoster().slice(0, 2));

    expect(csv).toBe(
      [
        "privateKey",
        "4DemoPrivateKeyDev1111111111111111111111111111111",
        "4DemoPrivateKeyBnde111111111111111111111111111111",
      ].join("\n"),
    );
  });

  it("imports an exported demo roster CSV", () => {
    const csv = exportPrivateKeyCsv(createDemoWalletRoster());

    const imported = parsePrivateKeyCsv(csv);

    expect(imported).toHaveLength(createDemoWalletRoster().length);
    expect(imported.map((wallet) => wallet.privateKey)).toEqual(
      createDemoWalletRoster().map((wallet) => wallet.privateKey),
    );
  });

  it("keeps private keys out of public wallet rows", () => {
    const roster = createDemoWalletRoster();
    const publicRows = toPublicWalletRows(roster);

    expect(publicRows).toHaveLength(roster.length);
    expect(JSON.stringify(publicRows)).not.toContain("privateKey");
    expect(JSON.stringify(publicRows)).not.toContain("DemoPrivateKey");
  });

  it("builds a launch wallet selection from browser-only roster state", () => {
    const selection = buildLaunchWalletSelection({
      roster: createDemoWalletRoster(),
      walletCount: 3,
      solPerWallet: 0.5,
    });

    expect(selection).toEqual({
      devWalletPubkey: "DevWallet...91nP",
      bundleWallets: [
        { pubkey: "BndlWallet...4kd9", buyAmountSol: 0.5 },
        { pubkey: "BndlWallet...8qa2", buyAmountSol: 0.5 },
        { pubkey: "BndlWallet...2mwp", buyAmountSol: 0.5 },
      ],
    });
    expect(JSON.stringify(selection)).not.toContain("privateKey");
  });

  it("uses provided public wallet selection for bundle launch preview", () => {
    const selection = buildLaunchWalletSelection({
      roster: createDemoWalletRoster(),
      walletCount: 2,
      solPerWallet: 0.75,
    });

    const result = handleMockChat({
      message: "yes",
      now,
      launchWalletSelection: selection,
      draft: {
        tool: "bundle_launch",
        data: {
          tokenName: "Blue Frog",
          symbol: "BFROG",
          description: "A blue frog community token.",
          walletCount: 2,
          solPerWallet: 0.75,
          imageFileName: "blue-frog.png",
          socialsEnabled: false,
          cashbackCoin: false,
          useDifferentBlocks: true,
        },
      },
    });

    expect(result.activePreview).toMatchObject({
      kind: "bundle_launch",
      planId: "plan_bundle_launch_2_1_150",
      totalBuysSol: 1.5,
      devWalletPubkey: "DevWallet...91nP",
      bundleWallets: [
        { pubkey: "BndlWallet...4kd9", buyAmountSol: 0.75 },
        { pubkey: "BndlWallet...8qa2", buyAmountSol: 0.75 },
      ],
    });
  });
});
