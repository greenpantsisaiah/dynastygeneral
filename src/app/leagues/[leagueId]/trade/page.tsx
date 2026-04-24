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
  searchParams: Promise<{ mode?: string; username?: string; season?: string }>;
};

export default async function TradePage({ params, searchParams }: PageProps) {
  const { leagueId } = await params;
  const { mode, username = "", season = "" } = await searchParams;
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
              ? "Name a target player or manager. You'll get the attack angle, three tiered packages, a copy-ready opener, and the walk-away floor."
              : "Paste what you send and what you receive. You'll get accept / counter / decline / wait, the opponent read, leverage, stronger ask, and a copy-ready message."}
          </p>

          <TradeForm
            leagueId={leagueId}
            sleeperUsername={username}
            mode={outbound ? "outbound" : "incoming"}
          />
        </div>
      </main>
    </>
  );
}
