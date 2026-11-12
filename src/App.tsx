import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { register, unregister, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { api, Entry, KEY_NAMES, KeyName, Mode, Settings, loadSettings, saveSettings } from "./api";
import { baseCode, LANGS } from "./languages";
import LangSelect from "./LangSelect";
import SettingsPanel from "./SettingsPanel";
import HistoryPanel from "./HistoryPanel";

const SIZES: Record<Mode, [number, number]> = {
  mini: [380, 310],
  compact: [480, 560],
  expanded: [920, 620],
};

export default function App() {
  const win = getCurrentWindow();
  const [s, setS] = useState<Settings>(loadSettings);
  const [src, setSrc] = useState(s.rememberLast ? s.lastSource : s.defaultSource);
  const [tgt, setTgt] = useState(s.rememberLast ? s.lastTarget : s.defaultTarget);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [detected, setDetected] = useState("");
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"none" | "settings" | "history">("none");
  const [pick, setPick] = useState(0);
  const [histKey, setHistKey] = useState(0);

  const glow = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);
  const hotkeyGen = useRef(0);

  const update = (p: Partial<Settings>) => setS((old) => ({ ...old, ...p }));

  useEffect(() => { saveSettings(s); }, [s]);
  useEffect(() => { document.documentElement.dataset.theme = s.theme; }, [s.theme]);
  useEffect(() => { win.setAlwaysOnTop(s.alwaysOnTop).catch(() => {}); }, [s.alwaysOnTop]);
  useEffect(() => {
    const [w, h] = SIZES[s.mode];
    win.setSize(new LogicalSize(w, h)).catch(() => {});
  }, [s.mode]);
  useEffect(() => {
    if (s.rememberLast) setS((o) => ({ ...o, lastSource: src, lastTarget: tgt }));
  }, [src, tgt]);

  // ---- translation -------------------------------------------------------
  const run = useCallback(async (text: string, source: string, target: string) => {
    if (!text.trim()) return;
    const id = ++reqId.current; // ignore answers that arrive after a newer request
    setBusy(true); setError(""); setStatus("Translating…");
    try {
      const r = await api.translate(text, source, target);
      if (id !== reqId.current) return;
      setOutput(r.text);
      setDetected(r.detected ?? "");
      setStatus(r.engine === "mymemory" ? "Done · MyMemory" : r.engine === "google" ? "Done · Google" : "Done");
      if (s.autoCopy) { try { await writeText(r.text); } catch { /* clipboard busy */ } }
      if (s.saveHistory && r.text.trim()) {
        try {
          await api.historyAdd({ original: text, translated: r.text, source: r.detected ?? source, target });
          setHistKey((k) => k + 1);
        } catch { /* history is optional */ }
      }
      setS((o) => ({ ...o, recents: [target, ...o.recents.filter((c) => c !== target)].slice(0, 6) }));
    } catch (e) {
      if (id !== reqId.current) return;
      setError(String(e));
      setStatus("Error");
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }, [s.autoCopy, s.saveHistory]);

  const clip = async () => { try { return (await readText()) ?? ""; } catch { return ""; } };
  const showWindow = async () => { await win.show(); await win.unminimize(); await win.setFocus(); };

  // ---- global shortcuts (handlers always see the latest state through this ref) ----
  const actions = useRef({} as Record<KeyName, () => void>);
  actions.current = {
    open: async () => {
      await showWindow();
      const t = await clip();
      if (t.trim()) { setInput(t); if (s.autoTranslate) run(t, src, tgt); }
    },
    bengali: async () => {
      await showWindow();
      const t = await clip();
      if (!t.trim()) return;
      setInput(t); setSrc("auto"); setTgt("bn"); run(t, "auto", "bn");
    },
    english: async () => {
      await showWindow();
      const t = await clip();
      if (!t.trim()) return;
      setInput(t); setSrc("auto"); setTgt("en"); run(t, "auto", "en");
    },
    lang: async () => { await showWindow(); setPick((n) => n + 1); },
    copy: async () => {
      if (!output) return;
      try { await writeText(output); setStatus("Copied"); } catch { setStatus("Could not copy"); }
    },
  };

  useEffect(() => {
    const gen = ++hotkeyGen.current; // a newer run cancels this one
    (async () => {
      try { await unregisterAll(); } catch { /* nothing registered */ }
      if (gen !== hotkeyGen.current || !s.shortcutsEnabled) { if (!s.shortcutsEnabled) setWarn(""); return; }
      const failed: string[] = [];
      for (const name of KEY_NAMES) {
        if (gen !== hotkeyGen.current) return;
        const acc = s.keys[name];
        const handler = (ev: { state: string }) => { if (ev.state === "Pressed") actions.current[name](); };
        try {
          await register(acc, handler);
        } catch {
          // Maybe our own earlier registration; free it and try once more.
          try { await unregister(acc); } catch { /* not ours */ }
          try { await register(acc, handler); } catch { failed.push(acc); }
        }
      }
      if (gen === hotkeyGen.current) {
        setWarn(failed.length ? `Already used by another program: ${failed.join(", ")}. Change it in Settings.` : "");
      }
    })();
    return () => { hotkeyGen.current++; };
  }, [s.shortcutsEnabled, s.keys]);

  // ---- small helpers -------------------------------------------------------
  const swap = () => {
    const newSrc = src === "auto" ? (detected || "en") : src;
    setSrc(tgt); setTgt(newSrc); setInput(output); setOutput(input);
  };
  const speak = () => {
    if (!output) return;
    const base = baseCode(tgt);
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0 && !voices.some((v) => v.lang.toLowerCase().startsWith(base))) {
      setStatus("No Windows voice installed for this language");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(output);
    u.lang = tgt;
    window.speechSynthesis.speak(u);
  };
  const toggleFav = (c: string) =>
    update({ favorites: s.favorites.includes(c) ? s.favorites.filter((x) => x !== c) : [...s.favorites, c] });
  const useEntry = (e: Entry) => { setInput(e.original); setOutput(e.translated); };

  const sel = { langs: LANGS, favorites: s.favorites, recents: s.recents, onToggleFav: toggleFav };
  const mini = s.mode === "mini";

  return (
    <div
      className="neon-shell"
      onMouseMove={(e) => {
        // Moves the glow without re-rendering the whole app.
        const r = e.currentTarget.getBoundingClientRect();
        if (glow.current) {
          glow.current.style.background =
            `radial-gradient(260px circle at ${e.clientX - r.left}px ${e.clientY - r.top}px, rgba(0,210,255,0.22), rgba(255,0,127,0.12) 40%, transparent 75%)`;
        }
      }}
    >
      <div className="cursor-glow" ref={glow} />
      <div className={`app ${s.mode}`}>
        <header data-tauri-drag-region>
          <span className="logo" data-tauri-drag-region>文A</span>
          {!mini && <span className="title" data-tauri-drag-region>Universal Translator</span>}
          <span className="spacer" data-tauri-drag-region />
          <button title={s.alwaysOnTop ? "Always on top: on" : "Always on top: off"} className={s.alwaysOnTop ? "pin on" : "pin"}
            onClick={() => update({ alwaysOnTop: !s.alwaysOnTop })}>📌</button>
          {!mini && <button title="Settings" onClick={() => setPanel(panel === "settings" ? "none" : "settings")}>⚙</button>}
          <button title="Minimize" onClick={() => win.minimize()}>–</button>
          <button title="Hide to tray (quit from the tray icon)" onClick={() => win.hide()}>✕</button>
        </header>

        <div className="langbar">
          <LangSelect {...sel} label="Source language" value={src} onChange={setSrc} allowAuto />
          <button className="swap" title="Swap languages" onClick={swap}>⇄</button>
          <LangSelect {...sel} label="Target language" value={tgt} onChange={setTgt} openSignal={pick} />
        </div>

        <main>
          <div className="body">
            <section className="box">
              <textarea
                placeholder="Type or paste text. Or copy anywhere and press Ctrl+Shift+T."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.ctrlKey && e.key === "Enter") run(input, src, tgt); }}
              />
              <div className="tools">
                <button onClick={async () => {
                  const t = await clip();
                  if (t) { setInput(t); if (s.autoTranslate) run(t, src, tgt); }
                }}>Paste</button>
                <button onClick={() => { setInput(""); setOutput(""); setError(""); setStatus("Ready"); }}>Clear</button>
                {!mini && <span className="count">{input.length} chars</span>}
              </div>
            </section>

            <button className="go" disabled={busy || !input.trim()} onClick={() => run(input, src, tgt)}>
              {busy ? "Translating…" : "Translate"} {!mini && <small>Ctrl+Enter</small>}
            </button>

            <section className="box out">
              {busy && <div className="bar" />}
              <textarea readOnly placeholder="Translation appears here" value={output} />
              {error && <div className="err">{error}</div>}
              <div className="tools">
                <button disabled={!output} onClick={async () => {
                  try { await writeText(output); setStatus("Copied"); } catch { setStatus("Could not copy"); }
                }}>Copy</button>
                {!mini && <button disabled={!output} onClick={speak}>Listen</button>}
                {!mini && <button disabled={!input.trim() || busy} onClick={() => run(input, src, tgt)}>Re-translate</button>}
                {!mini && <button disabled={!output} onClick={() => setOutput("")}>Clear</button>}
              </div>
            </section>
          </div>
          {s.mode === "expanded" && <aside><HistoryPanel onUse={useEntry} refreshKey={histKey} /></aside>}
        </main>

        {panel === "settings" && (
          <div className="overlay">
            <SettingsPanel s={s} update={update} onClose={() => setPanel("none")} onHistoryCleared={() => setHistKey((k) => k + 1)} />
          </div>
        )}
        {panel === "history" && s.mode !== "expanded" && (
          <div className="overlay">
            <div className="shead"><strong>History</strong><button onClick={() => setPanel("none")}>Done</button></div>
            <HistoryPanel onUse={(e) => { useEntry(e); setPanel("none"); }} refreshKey={histKey} />
          </div>
        )}

        <footer>
          <span className={status === "Error" ? "st bad" : "st"}>{status}</span>
          {warn && <span className="warn" title={warn}>⚠ {warn}</span>}
          <span className="spacer" />
          {!mini && s.mode !== "expanded" && (
            <button onClick={() => setPanel(panel === "history" ? "none" : "history")}>History</button>
          )}
          <button onClick={() => update({ mode: mini ? "compact" : "mini" })}>{mini ? "Compact" : "Mini"}</button>
          {!mini && (
            <button onClick={() => update({ mode: s.mode === "expanded" ? "compact" : "expanded" })}>
              {s.mode === "expanded" ? "Collapse" : "Expand"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
