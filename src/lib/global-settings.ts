import type { GlobalSettings } from "@/lib/smithii/types";

export const GLOBAL_SETTINGS_STORAGE_KEY = "smithii-agent:global-settings";

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  speed: "fast",
  jitoTip: "default",
  mevProtection: true,
  slippagePct: 10,
};

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

export function clampSlippageInput(value: string | number) {
  if (value === "") {
    return DEFAULT_GLOBAL_SETTINGS.slippagePct;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GLOBAL_SETTINGS.slippagePct;
  }

  return Math.min(100, Math.max(1, Math.round(parsed)));
}

export function normalizeGlobalSettings(value: unknown): GlobalSettings {
  if (!isRecord(value)) {
    return DEFAULT_GLOBAL_SETTINGS;
  }

  return {
    speed: value.speed === "turbo" ? "turbo" : DEFAULT_GLOBAL_SETTINGS.speed,
    jitoTip:
      value.jitoTip === "default" ||
      (typeof value.jitoTip === "number" && Number.isFinite(value.jitoTip))
        ? value.jitoTip
        : DEFAULT_GLOBAL_SETTINGS.jitoTip,
    mevProtection:
      typeof value.mevProtection === "boolean"
        ? value.mevProtection
        : DEFAULT_GLOBAL_SETTINGS.mevProtection,
    slippagePct: clampSlippageInput(
      typeof value.slippagePct === "string" ||
        typeof value.slippagePct === "number"
        ? value.slippagePct
        : DEFAULT_GLOBAL_SETTINGS.slippagePct,
    ),
  };
}

export function readStoredGlobalSettings(storage: SettingsStorage) {
  const saved = storage.getItem(GLOBAL_SETTINGS_STORAGE_KEY);
  if (!saved) {
    return DEFAULT_GLOBAL_SETTINGS;
  }

  try {
    return normalizeGlobalSettings(JSON.parse(saved));
  } catch {
    return DEFAULT_GLOBAL_SETTINGS;
  }
}

export function writeStoredGlobalSettings(
  storage: SettingsStorage,
  settings: GlobalSettings,
) {
  storage.setItem(
    GLOBAL_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeGlobalSettings(settings)),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
