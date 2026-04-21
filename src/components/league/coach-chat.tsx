"use client";

/**
 * Coach chat. Conversational interface to the dynasty coach with full
 * league context per turn. History persists in localStorage per league
 * so refreshes don't blow the conversation away.
 *
 * Quick prompts at top seed common starting questions ("compare my
 * queue", "should I take the contender or rebuild lane next pick").
 * User can also free-form type.
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

// Module-level cache keyed by leagueId so useSyncExternalStore returns
// stable references when localStorage hasn't changed (avoids the
// "result of getSnapshot should be cached" infinite-loop guard).
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

export function CoachChat({
  leagueId,
  username,
  displayName,
}: {
  leagueId: string;
  username: string;
  displayName: string;
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

  useEffect(() => {
    // Auto-scroll to bottom on new message.
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, pending]);

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

  return (
    <section className="mt-6">
      {history.length === 0 && (
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
      )}

      {history.length > 0 && (
        <div
          ref={scrollRef}
          className="max-h-[60vh] overflow-y-auto rounded-lg border border-border-strong bg-surface px-4 py-4"
        >
          <ul className="space-y-4">
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
                      ? "max-w-[85%] rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-foreground"
                      : "max-w-[85%] rounded-lg border border-border-soft bg-surface-2 px-3 py-2 text-sm leading-relaxed text-foreground"
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
                <div className="max-w-[85%] rounded-lg border border-border-soft bg-surface-2 px-3 py-2 text-sm text-muted">
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
        <div className="mt-3 rounded-md border border-danger/60 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send(draft);
              }
            }}
            placeholder="Ask anything: 'Compare Trey Benson vs Jerry Jeudy vs Chris Bell'  ·  'Should I trade Hurts to SparkWoods?'  ·  ⌘ + Enter to send"
            rows={3}
            className="flex-1 resize-y rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            className="self-end rounded-md border border-accent/60 bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-border-soft disabled:text-muted-2"
          >
            {pending ? "..." : "Send"}
          </button>
        </div>
        {history.length > 0 && (
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
