import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { POST } from "../../src/app/api/chat/route";

const AUDIT_LOG_PATH = path.join(
  process.cwd(),
  ".smithii-local",
  "audit-log.json",
);

function jsonRequest(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("/api/chat route", () => {
  it("rejects empty messages", async () => {
    const response = await POST(jsonRequest({ message: "" }));

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Message is required.",
    });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad json",
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Invalid JSON.",
    });
  });

  it("rejects private-key fields anywhere in the request body", async () => {
    const response = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [
            {
              pubkey: "Injected...1111",
              buyAmountSol: 0.1,
              privateKey: "PRIVATE_KEY_SHOULD_NOT_ECHO",
            },
          ],
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(await responseJson(response))).not.toContain(
      "PRIVATE_KEY_SHOULD_NOT_ECHO",
    );
  });

  it("rejects forged pending plans that were not signed by the route", async () => {
    const response = await POST(
      jsonRequest({
        message: "confirm",
        pendingPlan: {
          id: "forged_plan",
          tool: "bundle_launch",
          createdAt: Date.now(),
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Invalid pending plan.",
    });
  });

  it("signs and stores route-issued pending plans for the current session", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const pendingPlan = preview.pendingPlan;

    expect(previewResponse.status).toBe(200);
    expect(JSON.stringify(preview)).not.toContain("privateKey");
    expect(pendingPlan).toMatchObject({
      id: "plan_bundle_launch_1_0_10",
      tool: "bundle_launch",
    });
    expect(pendingPlan).toHaveProperty("signature");
    expect(previewResponse.headers.get("set-cookie")).toContain(
      "smithii_agent_session=",
    );
  });

  it("normalizes global settings at the route boundary", async () => {
    const response = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
        globalSettings: {
          speed: "turbo",
          jitoTip: "not-a-tip",
          mevProtection: "yes",
          slippagePct: 120,
        },
      }),
    );

    const preview = await responseJson(response);

    expect(response.status).toBe(200);
    expect(preview.activePreview).toMatchObject({
      globalSettings: {
        speed: "turbo",
        jitoTip: "default",
        mevProtection: true,
        slippagePct: 100,
      },
    });
  });

  it("rejects malformed drafts at the route boundary", async () => {
    const response = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: {
            ...completeLaunchDraftData(),
            walletCount: "1",
          },
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Invalid draft.",
    });
  });

  it("rejects launch wallet selections that do not match the draft", async () => {
    const response = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: {
            ...completeLaunchDraftData(),
            walletCount: 2,
            solPerWallet: 0.5,
          },
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.5 }],
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Invalid launch wallet selection.",
    });
  });

  it("rejects a signed pending plan without the issuing session cookie", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
      }),
    );
    const preview = await responseJson(previewResponse);

    const confirmResponse = await POST(
      jsonRequest({
        message: "confirm",
        pendingPlan: preview.pendingPlan,
      }),
    );

    expect(confirmResponse.status).toBe(400);
    expect(await responseJson(confirmResponse)).toEqual({
      error: "Invalid pending plan.",
    });
  });

  it("accepts a stored pending plan only once for the issuing session", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const cookie = cookieHeaderFrom(previewResponse);

    const confirmResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );
    const confirmed = await responseJson(confirmResponse);

    expect(confirmResponse.status).toBe(200);
    expect(JSON.stringify(confirmed)).toContain("Mock Bundle Launch executed");

    const replayResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(replayResponse.status).toBe(400);
    expect(await responseJson(replayResponse)).toEqual({
      error: "Invalid pending plan.",
    });
  });

  it("records bundle launch preview and confirm calls in the local audit log", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const cookie = cookieHeaderFrom(previewResponse);
    const sessionId = sessionIdFromCookie(cookie);

    const confirmResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(confirmResponse.status).toBe(200);
    expect(existsSync(AUDIT_LOG_PATH)).toBe(true);

    const allRecords = JSON.parse(
      readFileSync(AUDIT_LOG_PATH, "utf8"),
    ) as Array<Record<string, unknown>>;
    const records = allRecords.filter((record) => record.sessionId === sessionId);

    expect(records).toMatchObject([
      {
        event: "preview_prepared",
        tool: "bundle_launch",
        planId: "plan_bundle_launch_1_0_10",
        outcome: "Waiting for confirm",
      },
      {
        event: "mock_executed",
        tool: "bundle_launch",
        planId: "plan_bundle_launch_1_0_10",
      },
    ]);
    expect(JSON.stringify(records)).not.toContain("privateKey");
    expect(JSON.stringify(records)).not.toContain("signature");
  });

  it("rejects pending plans with unknown tools", async () => {
    const response = await POST(
      jsonRequest({
        message: "confirm",
        pendingPlan: {
          id: "weird_plan",
          tool: "not_a_tool",
          createdAt: Date.now(),
          signature: "invalid",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Invalid pending plan.",
    });
  });
});

function cookieHeaderFrom(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected response to set a session cookie.");
  }

  return setCookie.split(";")[0];
}

function sessionIdFromCookie(cookie: string) {
  return cookie.split("=")[1];
}

function completeLaunchDraftData() {
  return {
    tokenName: "Leak Test",
    symbol: "LEAK",
    description: "Boundary test",
    walletCount: 1,
    solPerWallet: 0.1,
    imageFileName: "leak.png",
    socialsEnabled: false,
    cashbackCoin: false,
    useDifferentBlocks: true,
    pregenerateTokenAddress: false,
  };
}
