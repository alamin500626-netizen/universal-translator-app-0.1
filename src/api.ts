import { invoke } from "@tauri-apps/api/core";

export type Mode = "mini" | "compact" | "expanded";
export type KeyName = "open" | "bengali" | "english" | "lang" | "copy";
export const KEY_NAMES: KeyName[] = ["open", "bengali", "english", "lang", "copy"];

export type Settings = {
  defaultSource: string; defaultTarget: string;
  autoTranslate: boolean; autoCopy: boolean; rememberLast: boolean;
  lastSource: string; lastTarget: string;
  saveHistory: boolean; alwaysOnTop: boolean; shortcutsEnabled: boolean;
  theme: "dark" | "light"; mode: Mode;
  favorites: string[]; recents: string[];
  keys: Record<KeyName, string>;
};

export const defaultKeys: Record<KeyName, string> = {
  open: "Ctrl+Shift+T",
  bengali: "Ctrl+Shift+B",
  english: "Ctrl+Shift+E",
  lang: "Ctrl+Shift+L",
  copy: "Ctrl+Shift+C",
};

export const defaultSettings: Settings = {
  defaultSource: "auto", defaultTarget: "bn",
  autoTranslate: true, autoCopy: false, rememberLast: true,
  lastSource: "auto", lastTarget: "bn",
  saveHistory: true, alwaysOnTop: true, shortcutsEnabled: true,
  theme: "dark", mode: "compact",
  favorites: [], recents: [],
  keys: defaultKeys,
};

const STORAGE_KEY = "ut.settings.v4";

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { ...defaultSettings, ...raw, keys: { ...defaultKeys, ...(raw.keys ?? {}) } };
  } catch {
    return defaultSettings;
  }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export type TranslateResult = { text: string; detected?: string | null; engine: string };
export type Entry = {
  id: number; original: string; translated: string; source: string; target: string;
  createdAt: string; favorite: boolean;
};

// All translation work happens in the Rust backend (src-tauri/src/providers.rs).
export const api = {
  translate: (text: string, source: string, target: string) =>
    invoke<TranslateResult>("translate", { req: { text, source, target } }),
  historyAdd: (entry: { original: string; translated: string; source: string; target: string }) =>
    invoke<void>("history_add", { entry }),
  historyList: (query: string, favoritesOnly: boolean) =>
    invoke<Entry[]>("history_list", { query, favoritesOnly }),
  historyFavorite: (id: number, favorite: boolean) => invoke<void>("history_favorite", { id, favorite }),
  historyDelete: (id: number) => invoke<void>("history_delete", { id }),
  historyClear: () => invoke<void>("history_clear"),
};
