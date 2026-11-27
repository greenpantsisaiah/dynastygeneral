/**
 * Emailed trades stay as emailed (Isaiah, 2026-11-26/27: the email named
 * ladovina11, the app named Revolver420 four hours later). The weekly
 * brief saves each trade item it sends; the app shows that saved item, word
 * for word, until its trade-by time, in place of whatever the live rebuild
 * says for that league. After the deadline the live read takes over.
 *
 * Reads and writes are best-effort: a missing table or a failed query
 * leaves the live items untouched (never blocks the email or the page).
 */

import type { DecisionDigest, DecisionItem, TradeItem } from "./items";

/** The rows to save at send time: trade items that carry a deadline. */
export function emailedTradeRows(args: {
  userId: string;
  items: DecisionItem[];
  templateVersion: string;
  sendMode: "broadcast" | "preview";
  sentAt: Date;
}) {
  return args.items
    .filter((i): i is TradeItem => i.kind === "trade" && i.delivery.emailed && !!i.deadline)
    .map((i) => ({
      user_id: args.userId,
      item_id: i.id,
      kind: i.kind,
      league_id: i.league_id,
      deadline: i.deadline,
      item: { ...i, emailed_at: args.sentAt.toISOString() },
      template_version: args.templateVersion,
      send_mode: args.sendMode,
      sent_at: args.sentAt.toISOString(),
    }));
}

type Db = {
  from: (t: string) => {
    upsert: (rows: unknown[], opts: { onConflict: string }) => PromiseLike<{ error: { message: string } | null }>;
    select: (cols: string) => {
      eq: (c: string, v: string) => {
        gt: (c: string, v: string) => {
          order: (c: string, o: { ascending: boolean }) => PromiseLike<{ data: Array<{ item: unknown; sent_at: string }> | null; error: { message: string } | null }>;
        };
      };
    };
  };
};

export async function saveEmailedTrades(db: unknown, rows: ReturnType<typeof emailedTradeRows>): Promise<void> {
  if (rows.length === 0) return;
  try {
    const { error } = await (db as Db).from("emailed_decision_items").upsert(rows, { onConflict: "user_id,item_id" });
    if (error) console.error("[emailed-items:save]", error.message);
  } catch (err) {
    console.error("[emailed-items:save]", err instanceof Error ? `${err.message}\n${err.stack}` : err);
  }
}

/** The user's emailed trades whose deadline has not passed, newest send first. */
export async function loadEmailedTrades(db: unknown, userId: string, now: Date): Promise<TradeItem[]> {
  try {
    const { data, error } = await (db as Db)
      .from("emailed_decision_items")
      .select("item, sent_at")
      .eq("user_id", userId)
      .gt("deadline", now.toISOString())
      .order("sent_at", { ascending: false });
    if (error) {
      console.error("[emailed-items:load]", error.message);
      return [];
    }
    return (data ?? []).map((r) => r.item).filter((i): i is TradeItem => !!i && (i as TradeItem).kind === "trade");
  } catch (err) {
    console.error("[emailed-items:load]", err instanceof Error ? `${err.message}\n${err.stack}` : err);
    return [];
  }
}

/**
 * Pure overlay. For each league with a live (unexpired) emailed trade, the
 * newest emailed trade replaces the live trade and league call for that
 * league. The hero headline is rewritten only when the trade count moved.
 */
export function overlayEmailedTrades(args: {
  items: DecisionItem[];
  digest: DecisionDigest;
  emailed: TradeItem[];
  now: Date;
}): { items: DecisionItem[]; digest: DecisionDigest } {
  const byLeague = new Map<string, TradeItem>();
  for (const t of args.emailed) {
    if (!t.league_id || !t.deadline || new Date(t.deadline).getTime() <= args.now.getTime()) continue;
    if (!byLeague.has(t.league_id)) byLeague.set(t.league_id, t);
  }
  if (byLeague.size === 0) return { items: args.items, digest: args.digest };
  const liveTrades = args.items.filter((i) => i.kind === "trade").length;
  const kept = args.items.filter((i) => !(i.league_id && byLeague.has(i.league_id) && (i.kind === "trade" || i.kind === "league_call")));
  const items = [...kept, ...byLeague.values()];
  const trades = items.filter((i): i is TradeItem => i.kind === "trade");
  if (trades.length === liveTrades) return { items, digest: args.digest };
  const n = trades.length === 1 ? "1 trade" : `${trades.length} trades`;
  const first = [...trades].sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))[0];
  const by = first?.deadline_label?.startsWith("Trade before ") ? first.deadline_label.slice("Trade before ".length) : null;
  return {
    items,
    digest: {
      ...args.digest,
      headline: by ? `${n} worth trying before ${by}.` : `${n} worth trying.`,
      subline: "Trades from your email stay here as emailed until their trade-by time.",
    },
  };
}
