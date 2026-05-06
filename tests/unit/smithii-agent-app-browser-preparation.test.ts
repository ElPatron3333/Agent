import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = () => readFileSync("src/components/smithii-agent-app.tsx", "utf8");

describe("Smithii Agent App browser packet preparation wiring", () => {

  it("renders Bundle Launch packet preparation without importing the Pump executor", () => {
    const appSource = source();

    expect(appSource).toContain("prepareBundleLaunchBrowserExecution");
    expect(appSource).toContain("bundleLaunchBrowserExecutionSummary");
    expect(appSource).toContain("Keypair");
    expect(appSource).toContain("accept=\"image/*\"");
    expect(appSource).toContain("setBundleLaunchMetadataFile");
    expect(appSource).toContain("activePreview.tokenName");
    expect(appSource).toContain("activePreview.tokenSymbol");
    expect(appSource).toContain("activePreview.description");
    expect(appSource).toContain("activePreview.imageFileName");
    expect(appSource).toContain("activePreview.bundleWallets");
    expect(appSource).toContain("summary.mint");
    expect(appSource).toContain("summary.devAmount");
    expect(appSource).toContain("summary.buyerCount");
    expect(appSource).toContain("summary.isTokenPregenerated");
    expect(appSource).toContain("summary.isCashbackCoin");
    expect(appSource).not.toContain("pump-browser-executor");
  });

  it("renders browser live submit controls without importing the Pump executor", () => {
    const appSource = source();

    expect(appSource).toContain("connectInjectedSolanaWallet");
    expect(appSource).toContain("injectedSolanaProviderFromWindow");
    expect(appSource).toContain("executeBrowserLiveSubmit");
    expect(appSource).toContain("Explicit live submit approval");
    expect(appSource).toContain("Submit live launch via Smithii");
    expect(appSource).toContain("Submit live swap via Smithii");
    expect(appSource).toContain("submitResult.result");
    expect(appSource).not.toContain("pump-browser-executor");
  });

  it("renders Bundle Swap packet preparation without importing the Pump executor", () => {
    const appSource = source();

    expect(appSource).toContain("model.preparation?.actionLabel");
    expect(appSource).toContain("prepareBundleSwapBrowserExecution");
    expect(appSource).toContain("bundleSwapBrowserExecutionSummary");
    expect(appSource).toContain("summary.planId");
    expect(appSource).toContain("summary.idempotencyKey");
    expect(appSource).toContain("summary.amountCount");
    expect(appSource).not.toContain("pump-browser-executor");
  });
});