import { describe, expect, it } from "vitest";

import {
  readStoredLastConfig,
  writeStoredLastConfig,
} from "../../src/lib/agent/last-config-memory";

describe("last config memory", () => {
  it("returns null when no last config was saved", () => {
    expect(readStoredLastConfig(createStorage())).toBeNull();
  });

  it("returns null for malformed stored data", () => {
    expect(readStoredLastConfig(createStorage("{bad json"))).toBeNull();
  });

  it("persists a compact last config snapshot", () => {
    const storage = createStorage();

    writeStoredLastConfig(storage, {
      kind: "launch_volume_sequence",
      label: "Launch + Volume: Blue Frog / BFROG",
      templateId: "momentum_v1",
      updatedAt: "2026-04-30T20:00:00.000Z",
    });

    expect(readStoredLastConfig(storage)).toEqual({
      kind: "launch_volume_sequence",
      label: "Launch + Volume: Blue Frog / BFROG",
      templateId: "momentum_v1",
      updatedAt: "2026-04-30T20:00:00.000Z",
    });
  });
});

function createStorage(savedValue: string | null = null) {
  const storage = {
    savedValue,
    getItem: () => storage.savedValue,
    setItem: (_key: string, value: string) => {
      storage.savedValue = value;
    },
  };

  return storage;
}
