import type { Database } from "better-sqlite3";
import type { AppSettings } from "./types";
import type { ProviderRow } from "./serialize";

export const DEFAULT_SETTINGS: AppSettings = {
  imageProviderId: null,
  imageModel: "",
  sttProviderId: null,
  sttModel: "whisper-1",
  ttsProviderId: null,
  ttsModel: "tts-1",
  ttsVoice: "alloy",
  embeddingProviderId: null,
  embeddingModel: "",
};

export function getSettings(db: Database): AppSettings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const stored: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value);
    } catch {
      // 忽略坏数据
    }
  }
  return { ...DEFAULT_SETTINGS, ...stored } as AppSettings;
}

export function saveSettings(db: Database, patch: Partial<AppSettings>): AppSettings {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    stmt.run(k, JSON.stringify(v));
  }
  return getSettings(db);
}

// 解析某能力的 Provider：优先 settings 指定，否则取第一个声明支持该端点的
export function resolveProvider(
  db: Database,
  settings: AppSettings,
  kind: "image" | "audio" | "embedding"
): ProviderRow | null {
  const byId = (id: number | null): ProviderRow | null => {
    if (!id) return null;
    const row = db.prepare("SELECT * FROM providers WHERE id = ?").get(id);
    return (row as ProviderRow) ?? null;
  };
  const settingsKey = `${kind === "image" ? "image" : kind === "embedding" ? "embedding" : "tts"}ProviderId`;
  const preferred = byId((settings as unknown as Record<string, unknown>)[settingsKey] as number | null);
  if (preferred) return preferred;
  const rows = db.prepare("SELECT * FROM providers ORDER BY id").all() as ProviderRow[];
  for (const r of rows) {
    try {
      const endpoints = JSON.parse(r.endpoints) as string[];
      const needed = kind === "audio" ? ["audio"] : [kind];
      if (needed.every((e) => endpoints.includes(e))) return r;
    } catch {
      // 忽略
    }
  }
  return null;
}
