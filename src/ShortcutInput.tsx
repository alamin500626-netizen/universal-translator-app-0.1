import { KeyboardEvent } from "react";

// Turns a key press into an accelerator string such as "Ctrl+Shift+T".
// Uses e.code so Shift+1 is "1", not "!". At least one modifier is required.
function toAccelerator(e: KeyboardEvent<HTMLInputElement>): string | null {
  let key = "";
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1[0-2])$/.test(e.code)) key = e.code;
  else if (e.code === "Space") key = "Space";
  else return null;

  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  if (mods.length === 0) return null;
  return [...mods, key].join("+");
}

export default function ShortcutInput(p: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      {p.label}
      <input
        readOnly
        value={p.value}
        title="Click, then press the new key combination"
        onKeyDown={(e) => {
          if (e.key === "Tab") return;
          e.preventDefault();
          const acc = toAccelerator(e);
          if (acc) p.onChange(acc);
        }}
      />
    </label>
  );
}
