export const LAST_CONFIG_STORAGE_KEY = "smithii-agent:last-config";

export type LastConfigSnapshot = {
  kind: "bundle_launch" | "bundle_swap" | "volume_bot" | "launch_volume_sequence";
  label: string;
  templateId?: string;
  updatedAt: string;
};

type LastConfigStorage = Pick<Storage, "getItem" | "setItem">;

export function readStoredLastConfig(storage: LastConfigStorage) {
  const saved = storage.getItem(LAST_CONFIG_STORAGE_KEY);
  if (!saved) {
    return null;
  }

  try {
    const parsed = JSON.parse(saved);
    return isLastConfigSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredLastConfig(
  storage: LastConfigStorage,
  snapshot: LastConfigSnapshot,
) {
  storage.setItem(LAST_CONFIG_STORAGE_KEY, JSON.stringify(snapshot));
}

function isLastConfigSnapshot(value: unknown): value is LastConfigSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isConfigKind(value.kind) &&
    typeof value.label === "string" &&
    value.label.trim().length > 0 &&
    (value.templateId === undefined || typeof value.templateId === "string") &&
    typeof value.updatedAt === "string" &&
    value.updatedAt.trim().length > 0
  );
}

function isConfigKind(value: unknown): value is LastConfigSnapshot["kind"] {
  return (
    value === "bundle_launch" ||
    value === "bundle_swap" ||
    value === "volume_bot" ||
    value === "launch_volume_sequence"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
