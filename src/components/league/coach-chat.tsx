"use client";

/**
 * Coach chat. Two variants:
 *
 *   variant="page"  - full-page /coach experience. Big centered layout,
 *                     quick-prompt grid, roomy input.
 *   variant="panel" - hub sidebar. Sticky column, context chip at top,
 *                     compact single-column quick prompts, dense form.
 *
 * History + context + API endpoint are identical between variants.
 * Only layout changes.
 *
 * Panel variant listens for a window event "coach:seed" with detail
 * `{ prompt: string }` so hub panels (Strategic Forks, Characterizations)
 * can deep-link a question into the coach input with one click.
 * Example from a fork card: dispatch coach:seed with
 * "Compare Trey Benson vs Tony Pollard for my pick."
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

type Role = "user" | "assistant";
type ChatMessage = { role: Role; content: string; ts: number };

const MAX_HISTORY = 30;

const QUICK_PROMPTS = [
  "Compare my next-pick options. Which one should I take and why?",
  "Is my strategy still on track? What should I be doing differently?",
  "Who should I target for trades, and what should I offer?",
  "Talk through the top divergences in our strategic forks.",
];

function storageKey(leagueId: string): string {
  return `dc:coach-chat:${leagueId}`;
}

function readHistory(leagueId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(leagueId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ChatMessage[];
  } catch {
    return [];
  }
}

function writeHistory(leagueId: string, msgs: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(leagueId), JSON.stringify(msgs));
    window.dispatchEvent(
      new StorageEvent("storage", { key: storageKey(leagueId) }),
    );
  } catch {
    // ignore
  }
}

const SSR_EMPTY: ChatMessage[] = [];

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key && e.key.startsWith("dc:coach-chat:")) callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

type CacheEntry = { raw: string | null; parsed: ChatMessage[] };
const historyCache = new Map<string, CacheEntry>();

function getCachedHistory(leagueId: string): ChatMessage[] {
  if (typeof window === "undefined") return SSR_EMPTY;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(storageKey(leagueId));
  } catch {
    return SSR_EMPTY;
  }
  const cached = historyCache.get(leagueId);
  if (cached && cached.raw === raw) return cached.parsed;
  const parsed = readHistory(leagueId);
  historyCache.set(leagueId, { raw, parsed });
  return parsed;
}

export type CoachContext = {
  leagueName?: string;
  myPickLabel?: string | null;
  picksUntilMe?: number | null;
  lean?: string | null;
};

export type CoachVariant = "page" | "panel";

export function CoachChat({
  leagueId,
  username,
  displayName,
  variant = "page",
  context,
}: {
  leagueId: string;
  username: string;
  displayName: string;
  variant?: CoachVariant;
  context?: CoachContext;
}) {
  const history = useSyncExternalStore(
    subscribe,
    useCallback(() => getCachedHistory(leagueId), [leagueId]),
    () => SSR_EMPTY,
  );

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, pending]);

  // Seed-question bridge. Hub panels dispatch `coach:seed` events with a
  // pre-filled prompt so tapping a Strategic Fork card drops "Compare
  // these candidates" into the input without the user typing. Only
  // active in panel variant to avoid duplicated handlers when both
  // instances are mounted (the /coach page doesn't need this).
  useEffect(() => {
    if (variant !== "panel") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail;
      if (!detail?.prompt) return;
      setDraft(detail.prompt);
      // Scroll into the input and focus it
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      });
    };
    window.addEventListener("coach:seed", handler);
    return () => window.removeEventListener("coach:seed", handler);
  }, [variant]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || pending) return;
      setError(null);
      const newUserMsg: ChatMessage = {
        role: "user",
        content: message,
        ts: Date.now(),
      };
      const updated = [...history, newUserMsg].slice(-MAX_HISTORY);
      writeHistory(leagueId, updated);
      setDraft("");
      setPending(true);
      try {
        const url = new URL(
          `/api/coach/${leagueId}`,
          window.location.origin,
        );
        url.searchParams.set("username", username);
        const res = await fetch(url.toString(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            history: updated.slice(0, -1).map((m) => ({
              role: m.role,
              content: m.content,
            })),
            message,
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => res.statusText);
          throw new Error(`coach returned ${res.status}: ${txt.slice(0, 200)}`);
        }
        const data = (await res.json()) as { reply: string };
        const reply: ChatMessage = {
          role: "assistant",
          content: data.reply,
          ts: Date.now(),
        };
        writeHistory(leagueId, [...updated, reply].slice(-MAX_HISTORY));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPending(false);
      }
    },
    [history, leagueId, pending, username],
  );

  function clearChat() {
    if (
      window.confirm(
        "Clear the conversation history for this league? Cannot be undone.",
      )
    ) {
      writeHistory(leagueId, []);
    }
  }

  const isPanel = variant === "panel";

  return (
    <section
      className={
        isPanel
          ? "flex h-full flex-col rounded-lg border border-border-strong bg-surface"
          : "mt-6"
      }
    >
      {/* Panel-only sticky header with context chip */}
      {isPanel && (
        <header className="flex items-baseline justify-between gap-2 border-b border-border-soft px-4 py-3">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
              Coach
            </div>
            {context && (
              <div className="mt-0.5 text-[11px] text-muted-2">
                {[
                  context.leagueName,
                  context.myPickLabel
                    ? `pick ${context.myPickLabel}${
                        context.picksUntilMe != null
                          ? ` · ${context.picksUntilMe} ahead`
                          : ""
                      }`
                    : null,
                  context.lean,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 hover:text-danger"
              title="Clear this league's conversation"
            >
              Clear
            </button>
          )}
        </header>
      )}

      {/* Quick prompts or conversation */}
      {history.length === 0 ? (
        isPanel ? (
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
              Try a quick prompt
            </div>
            <p className="mt-1 text-xs text-muted">
              Or tap any fork/characterization card to seed a question.
            </p>
            <div className="mt-3 space-y-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  disabled={pending}
                  className="w-full rounded-md border border-border-soft bg-surface-2 px-3 py-2 text-left text-xs text-foreground transition hover:border-accent/60 hover:bg-accent/5 disabled:opacity-60"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border-strong bg-surface px-5 py-5">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
              Quick prompts
            </div>
            <p className="mt-1 text-sm text-muted">
              Skip the typing. Tap one to seed the conversation.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  disabled={pending}
                  className="rounded-md border border-border-soft bg-surface-2 px-3 py-2 text-left text-sm text-foreground transition hover:border-accent/60 hover:bg-accent/5 disabled:opacity-60"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )
      ) : (
        <div
          ref={scrollRef}
          className={
            isPanel
              ? "flex-1 overflow-y-auto px-3 py-3"
              : "max-h-[60vh] overflow-y-auto rounded-lg border border-border-strong bg-surface px-4 py-4"
          }
        >
          <ul className="space-y-3">
            {history.map((m, i) => (
              <li
                key={i}
                className={
                  m.role === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[90%] rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-foreground"
                      : "max-w-[95%] rounded-lg border border-border-soft bg-surface-2 px-3 py-2 text-sm leading-relaxed text-foreground"
                  }
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                    {m.role === "user" ? displayName : "Coach"}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap">{m.content}</div>
                </div>
              </li>
            ))}
            {pending && (
              <li className="flex justify-start">
                <div className="max-w-[95%] rounded-lg border border-border-soft bg-surface-2 px-3 py-2 text-sm text-muted">
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                    Coach
                  </div>
                  <div className="mt-1 italic">thinking...</div>
                </div>
              </li>
            )}
          </ul>
        </div>
      )}

      {error && (
        <div
          className={
            isPanel
              ? "mx-3 mb-2 rounded-md border border-danger/60 bg-danger/10 px-3 py-2 text-xs text-danger"
              : "mt-3 rounded-md border border-danger/60 bg-danger/10 px-3 py-2 text-xs text-danger"
          }
        >
          {error}
        </div>
      )}

      {/* Input form. Sticky at bottom of panel; below content on page. */}
      <form
        className={
          isPanel
            ? "border-t border-border-soft px-3 py-3"
            : "mt-4"
        }
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <div className={isPanel ? "flex flex-col gap-2" : "flex gap-2"}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send(draft);
              }
            }}
            placeholder={
              isPanel
                ? "Ask anything. ⌘ + Enter to send."
                : "Ask anything: 'Compare Trey Benson vs Jerry Jeudy vs Chris Bell'  ·  'Should I trade Hurts to SparkWoods?'  ·  ⌘ + Enter to send"
            }
            rows={isPanel ? 2 : 3}
            className={
              isPanel
                ? "w-full resize-y rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
                : "flex-1 resize-y rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
            }
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            className={
              isPanel
                ? "self-end rounded-md border border-accent/60 bg-accent px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-border-soft disabled:text-muted-2"
                : "self-end rounded-md border border-accent/60 bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-border-soft disabled:text-muted-2"
            }
          >
            {pending ? "..." : "Send"}
          </button>
        </div>
        {!isPanel && history.length > 0 && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={clearChat}
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2 hover:text-danger"
            >
              Clear conversation
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

/**
 * Helper used by hub panels to seed the coach input with a prompt.
 * Safe to call anywhere; no-ops if the coach panel isn't mounted.
 */
export function seedCoachPrompt(prompt: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("coach:seed", { detail: { prompt } }),
  );
}
