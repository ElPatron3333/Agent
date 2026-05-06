import { describe, expect, it } from "vitest";

import {
  getSmithiiCapability,
  listSmithiiCapabilities,
  listSmithiiNextCapabilityCandidates,
  SMITHII_CAPABILITY_REGISTRY,
} from "../../src/lib/smithii/capability-registry";

describe("Smithii capability registry", () => {
  it("is static non-executing metadata", () => {
    const capabilities = listSmithiiCapabilities();

    expect(capabilities.length).toBeGreaterThanOrEqual(18);
    for (const capability of capabilities) {
      expect(capability.registryEffect).toBe("metadata_only");
      expect(capability.executionEnabledByRegistry).toBe(false);
      expect(findFunctions(capability)).toEqual([]);
    }
  });

  it("marks current Pump flows as existing browser handoff work awaiting live acceptance", () => {
    expect(getSmithiiCapability("pump_bundle_launch")).toMatchObject({
      id: "pump_bundle_launch",
      status: "implemented-awaiting-live-acceptance",
      currentAgentSupport: "phase8-browser-handoff-awaiting-live-acceptance",
      sdk: {
        packageName: "@smithii/sdk",
        subpath: "@smithii/sdk/pump",
        client: "PumpFunClient",
        methods: ["createAndSnipeToken"],
      },
      zeroCustody: "confirmed-browser-held",
      executionEnabledByRegistry: false,
    });

    expect(getSmithiiCapability("pump_bundle_swap")).toMatchObject({
      id: "pump_bundle_swap",
      status: "implemented-awaiting-live-acceptance",
      currentAgentSupport: "phase8-browser-handoff-awaiting-live-acceptance",
      sdk: {
        packageName: "@smithii/sdk",
        subpath: "@smithii/sdk/pump",
        client: "PumpFunClient",
        methods: ["bundleSellBuy"],
      },
      zeroCustody: "confirmed-browser-held",
      executionEnabledByRegistry: false,
    });
  });

  it("keeps backend-keyed and unknown future tools blocked", () => {
    expect(getSmithiiCapability("classic_volume_bot")).toMatchObject({
      status: "blocked-custody",
      currentAgentSupport: "blocked",
      zeroCustody: "blocked-backend-keyed",
    });
    expect(getSmithiiCapability("classic_volume_bot").blockers).toContain(
      "Classic Volume Bot is backend-keyed and cannot satisfy the zero-custody requirement.",
    );

    expect(getSmithiiCapability("anti_mev_multi_wallet")).toMatchObject({
      status: "blocked-custody",
      currentAgentSupport: "blocked",
      zeroCustody: "blocked-backend-keyed",
    });

    expect(getSmithiiCapability("bags_launchpad")).toMatchObject({
      status: "needs-smithii-answer",
      currentAgentSupport: "planning-only",
      zeroCustody: "unknown",
    });
  });

  it("lists only near-reuse next candidates after Pump live acceptance", () => {
    expect(listSmithiiNextCapabilityCandidates().map((entry) => entry.id)).toEqual([
      "pumpswap_graduated_bundle_swap",
      "bonk_launch_bundle",
      "launchlab_launch_bundle",
    ]);
    expect(
      listSmithiiNextCapabilityCandidates().every(
        (entry) =>
          entry.status === "near-reuse-after-pump-live" &&
          entry.executionEnabledByRegistry === false,
      ),
    ).toBe(true);
  });

  it("does not store runtime values or live-test artifacts", () => {
    const serialized = JSON.stringify(SMITHII_CAPABILITY_REGISTRY);

    expect(serialized).not.toMatch(/NEXT_PUBLIC_SMITHII_JITO_UUID|JITO_UUID=/);
    expect(serialized).not.toMatch(/ghp_[A-Za-z0-9_]+/);
    expect(serialized).not.toMatch(/\.smithii-local|burner-wallets|launch-image/i);
  });
});

function findFunctions(value: unknown, path = "root"): string[] {
  if (typeof value === "function") {
    return [path];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findFunctions(entry, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, entry]) =>
    findFunctions(entry, `${path}.${key}`),
  );
}
