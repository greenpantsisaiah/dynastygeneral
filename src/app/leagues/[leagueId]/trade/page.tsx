import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Trade Analysis",
  robots: { index: false, follow: false },
};
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import { TradeForm } from "./trade-form";

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ mode?: string; username?: string; season?: string; send?: string; receive?: string; manager?: string }>;
};

export default async function TradePage({ params, searchParams }: PageProps) {
  const { leagueId } = await params;
  const { mode, username = "", season = "", send = "", receive = "", manager = "" } = await searchParams;
  // Prefill from a /home trade card: the opening offer the analysts priced.
  const clip = (v: string) => v.slice(0, 300);
  const prefill = { send: clip(send), receive: clip(receive), manager: clip(manager) };
  const outbound = mode === "outbound";

  const back = `/leagues/${leagueId}${
    username || season
      ? `?${new URLSearchParams({
          ...(username ? { username } : {}),
          ...(season ? { season } : {}),
        }).toString()}`
      : ""
  }`;

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-grid">
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
          <div className="flex items-center justify-between">
            <Ticker
              label={outbound ? "Outbound trade · live" : "Incoming trade · live"}
            />
            <Link
              href={back}
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2 hover:text-foreground"
            >
              ← Back to hub
            </Link>
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {outbound ? "Attack a target." : "Should you take this deal?"}
          </h1>
          <p className="mt-4 max-w-2xl text-muted">
            {outbound
              ? "Name a target: a specific player, a manager whose roster you want to raid, or a specific draft pick. You'll get the attack angle, three tiered packages (conservative / fair / aggressive), a copy-ready opener, and the walk-away floor."
              : "Paste what you send and what you receive. You'll get accept / counter / decline / wait, the opponent read, leverage, stronger ask, and a copy-ready message you can paste into your league chat."}
          </p>

          {!outbound && prefill.send && prefill.receive && (
            <p className="mt-4 max-w-2xl rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm text-foreground">
              Filled in with your opening offer{prefill.manager ? ` to ${prefill.manager}` : ""}. Check it now, or when
              they answer, change it to their counter and check that.
            </p>
          )}

          <TradeForm
            leagueId={leagueId}
            sleeperUsername={username}
            mode={outbound ? "outbound" : "incoming"}
            prefill={prefill}
          />
        </div>
      </main>
    </>
  );
}
