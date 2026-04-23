"use client";

/**
 * Multi-asset token input with player + pick autocomplete. Used in the
 * trade form to replace the freeform textarea for "you send", "you
 * receive", "willing to move."
 *
 * Behavior:
 * - Type to search; dropdown shows matching players + future picks.
 * - ↓/↑ to navigate, Enter or Tab to select. Click also selects.
 * - Selected items render as removable chips.
 * - Free-form fallback: pressing Enter on no-match commits the raw
 *   text as a chip (so notes like "future considerations" still work).
 * - Backspace on empty input removes the last chip.
 * - A hidden input mirrors the comma-separated value so server-side
 *   form parsing (FormData) is unchanged. Backend contract stays.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type Hit = {
  id: string;
  label: string;
  sublabel: string;
  kind: "player" | "pick";
};

type Props = {
  name: string;
  required?: boolean;
  initialValue?: string;
  placeholder?: string;
  className?: string;
  // Optional cap on number of selected tokens. Trade payloads are small.
  maxTokens?: number;
};

const SEPARATOR = /[\n,]/;

function parseInitial(raw: string): string[] {
  return raw
    .split(SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function AssetTokenInput({
  name,
  required,
  initialValue = "",
  placeholder = "Add player or pick (e.g. Bijan Robinson, 2027 1st)",
  className = "",
  maxTokens = 20,
}: Props) {
  const [tokens, setTokens] = useState<string[]>(parseInitial(initialValue));
  const [draft, setDraft] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);

  // Debounced search: schedule a fetch 120ms after the last keystroke
  // so we don't spam the API on every character. Sequence number
  // discards out-of-order responses.
  useEffect(() => {
    const q = draft.trim();
    if (q.length === 0) {
      setHits([]);
      setOpen(false);
      return;
    }
    setOpen(true);
    const seq = ++requestSeq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/players/search?q=${encodeURIComponent(q)}`,
        );
        if (!r.ok) return;
        const data: { results: Hit[] } = await r.json();
        if (seq !== requestSeq.current) return;
        setHits(data.results);
        setActiveIndex(0);
      } catch {
        // Ignore. Free-form fallback still works on Enter.
      }
    }, 120);
    return () => clearTimeout(t);
  }, [draft]);

  const commitToken = useCallback(
    (value: string) => {
      const v = value.trim();
      if (!v) return;
      if (tokens.length >= maxTokens) return;
      // De-dup case-insensitively to avoid "Bijan" + "bijan" both showing.
      if (tokens.some((t) => t.toLowerCase() === v.toLowerCase())) {
        setDraft("");
        setOpen(false);
        return;
      }
      setTokens((prev) => [...prev, v]);
      setDraft("");
      setOpen(false);
      inputRef.current?.focus();
    },
    [tokens, maxTokens],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Always prevent form submit on Enter inside this control: Enter
      // means "commit token", not "submit." Form submission happens via
      // the explicit button.
      e.preventDefault();
      const pick = open && hits[activeIndex] ? hits[activeIndex].label : draft;
      if (pick.trim()) commitToken(pick);
      return;
    }
    if (e.key === "Tab" && open && hits[activeIndex]) {
      e.preventDefault();
      commitToken(hits[activeIndex].label);
      return;
    }
    if (e.key === "ArrowDown" && open && hits.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % hits.length);
      return;
    }
    if (e.key === "ArrowUp" && open && hits.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + hits.length) % hits.length);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Backspace" && draft.length === 0 && tokens.length > 0) {
      // Pop last chip. Lets the user fix typos quickly.
      e.preventDefault();
      setTokens((prev) => prev.slice(0, -1));
      return;
    }
    // Comma also commits, matching the legacy "comma-separated" UX.
    if (e.key === ",") {
      e.preventDefault();
      if (draft.trim()) commitToken(draft);
    }
  };

  const removeToken = (idx: number) => {
    setTokens((prev) => prev.filter((_, i) => i !== idx));
    inputRef.current?.focus();
  };

  const hiddenValue = tokens.join(", ");

  return (
    <div
      className={`rounded-md border border-border-strong bg-surface px-3 py-2 ${className}`}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex flex-wrap gap-1.5">
        {tokens.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs text-foreground"
          >
            {t}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeToken(i);
              }}
              aria-label={`Remove ${t}`}
              className="text-muted-2 hover:text-danger"
            >
              ×
            </button>
          </span>
        ))}
        <div className="relative flex-1 min-w-[12rem]">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (draft.trim().length > 0) setOpen(true);
            }}
            onBlur={() => {
              // Defer close so click on dropdown item still registers.
              setTimeout(() => setOpen(false), 120);
            }}
            placeholder={tokens.length === 0 ? placeholder : ""}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-2"
          />
          {open && hits.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border-strong bg-background shadow-lg">
              {hits.map((h, i) => (
                <li
                  key={h.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitToken(h.label);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm ${
                    i === activeIndex
                      ? "bg-accent/15 text-foreground"
                      : "text-foreground hover:bg-surface-2"
                  }`}
                >
                  <span className="font-medium">{h.label}</span>
                  <span className="font-mono text-[10px] text-muted-2">
                    {h.sublabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {/* Hidden input keeps the form's existing FormData contract. */}
      <input
        type="hidden"
        name={name}
        value={hiddenValue}
        required={required && tokens.length === 0}
      />
    </div>
  );
}
