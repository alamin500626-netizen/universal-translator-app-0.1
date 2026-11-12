import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { api, defaultKeys, KeyName, Settings } from "./api";
import { LANGS } from "./languages";
import ShortcutInput from "./ShortcutInput";

type Props = { s: Settings; update: (p: Partial<Settings>) => void; onClose: () => void; onHistoryCleared: () => void };

const KEY_LABELS: Record<KeyName, string> = {
  open: "Open translator (loads clipboard)",
  bengali: "Translate clipboard to Bengali",
  english: "Translate clipboard to English",
  lang: "Open target language picker",
  copy: "Copy translated result",
};

export default function SettingsPanel({ s, update, onClose, onHistoryCleared }: Props) {
  const [autostart, setAutostart] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => { isEnabled().then(setAutostart).catch(() => {}); }, []);

  type ToggleKey = "autoTranslate" | "autoCopy" | "rememberLast" | "saveHistory" | "alwaysOnTop" | "shortcutsEnabled";
  const toggle = (k: ToggleKey, label: string) => (
    <label className="toggle" key={k}>
      <input type="checkbox" checked={s[k]} onChange={(e) => update({ [k]: e.target.checked } as Partial<Settings>)} />
      {label}
    </label>
  );

  return (
    <div className="settings">
      <div className="shead"><strong>Settings</strong><button onClick={onClose}>Done</button></div>

      <h4>Translation</h4>
      <p className="muted">Free, no API key. Text is sent to Google Translate (backup: MyMemory) only when you translate.</p>
      {toggle("autoTranslate", "Translate copied or pasted text automatically")}
      {toggle("autoCopy", "Copy the translation to the clipboard")}
      {toggle("rememberLast", "Remember last selected languages")}
      <label>Default source language
        <select value={s.defaultSource} onChange={(e) => update({ defaultSource: e.target.value })}>
          <option value="auto">Auto detect</option>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </label>
      <label>Default target language
        <select value={s.defaultTarget} onChange={(e) => update({ defaultTarget: e.target.value })}>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </label>

      <h4>Window</h4>
      {toggle("alwaysOnTop", "Keep window on top")}
      <label className="toggle">
        <input type="checkbox" checked={autostart} onChange={async (e) => {
          try {
            if (e.target.checked) await enable(); else await disable();
            setAutostart(e.target.checked);
          } catch (err) { setNote(`Could not change startup setting: ${String(err)}`); }
        }} />
        Start with Windows
      </label>
      <label>Theme
        <select value={s.theme} onChange={(e) => update({ theme: e.target.value as Settings["theme"] })}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>

      <h4>History</h4>
      {toggle("saveHistory", "Save translation history on this PC")}
      <button onClick={async () => {
        if (confirm("Delete all saved translations?")) { await api.historyClear(); onHistoryCleared(); setNote("History cleared."); }
      }}>Clear history</button>

      <h4>Global shortcuts</h4>
      {toggle("shortcutsEnabled", "Enable global shortcuts")}
      {(Object.keys(KEY_LABELS) as KeyName[]).map((k) => (
        <ShortcutInput key={k} label={KEY_LABELS[k]} value={s.keys[k]} onChange={(v) => update({ keys: { ...s.keys, [k]: v } })} />
      ))}
      <button onClick={() => update({ keys: defaultKeys })}>Reset shortcuts to default</button>
      <p className="muted">Click a box and press the new keys (Ctrl, Alt or Shift plus a letter, number or F-key).</p>

      {note && <p className="muted">{note}</p>}
    </div>
  );
}
