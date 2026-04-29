import { describe, expect, it } from "vitest";

import {
  DEFAULT_GLOBAL_SETTINGS,
  clampSlippageInput,
  readStoredGlobalSettings,
  writeStoredGlobalSettings,
} from "../../src/lib/global-settings";

describe("global settings persistence", () => {
  it("returns defaults when session storage has no saved settings", () => {
    const storage = createStorage();

    expect(readStoredGlobalSettings(storage)).toEqual(DEFAULT_GLOBAL_SETTINGS);
  });

  it("returns defaults when saved settings are malformed", () => {
    const storage = createStorage("{bad json");

    expect(readStoredGlobalSettings(storage)).toEqual(DEFAULT_GLOBAL_SETTINGS);
  });

  it("reads valid saved settings from session storage", () => {
    const storage = createStorage(
      JSON.stringify({
        speed: "turbo",
        jitoTip: 0.004,
        mevProtection: false,
        slippagePct: 5,
      }),
    );

    expect(readStoredGlobalSettings(storage)).toEqual({
      speed: "turbo",
      jitoTip: 0.004,
      mevProtection: false,
      slippagePct: 5,
    });
  });

  it("normalizes invalid saved fields without discarding valid ones", () => {
    const storage = createStorage(
      JSON.stringify({
        speed: "turbo",
        jitoTip: "high",
        mevProtection: "yes",
        slippagePct: 120,
      }),
    );

    expect(readStoredGlobalSettings(storage)).toEqual({
      speed: "turbo",
      jitoTip: "default",
      mevProtection: true,
      slippagePct: 100,
    });
  });

  it("clamps slippage input to the supported range", () => {
    expect(clampSlippageInput("0")).toBe(1);
    expect(clampSlippageInput("101")).toBe(100);
    expect(clampSlippageInput("4.6")).toBe(5);
    expect(clampSlippageInput("")).toBe(DEFAULT_GLOBAL_SETTINGS.slippagePct);
  });

  it("writes settings as JSON to session storage", () => {
    const storage = createStorage();

    writeStoredGlobalSettings(storage, {
      speed: "turbo",
      jitoTip: 0.001,
      mevProtection: false,
      slippagePct: 25,
    });

    expect(storage.savedValue).toBe(
      JSON.stringify({
        speed: "turbo",
        jitoTip: 0.001,
        mevProtection: false,
        slippagePct: 25,
      }),
    );
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
