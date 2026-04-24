import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Strategy Audit",
  robots: { index: false, follow: false },
};
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import { StrategyRunner } from "./strategy-runner";

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ username?: string; season?: string }>;
};

export default async function StrategyPage({
  params,
  searchParams,
}: PageProps) {
  const { leagueId } = await params;
  const { username = "", season = "" } = await searchParams;
  const cleaned = username.trim().replace(/^@/, "");

  const back = `/leagues/${leagueId}${
    cleaned || season
      ? `?${new URLSearchParams({
          ...(cleaned ? { username: cleaned } : {}),
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
            <Ticker label="Strategy · structural synthesis" />
            <Link
              href={back}
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2 hover:text-foreground"
            >
              ← Back to hub
            </Link>
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            What are you actually building?
          </h1>
          <p className="mt-4 max-w-2xl text-muted">
            Run a full structural read: what strategy the system infers from
            your roster, which paths remain open, and which have closed so you
            don&apos;t drift into them.
          </p>

          <StrategyRunner leagueId={leagueId} sleeperUsername={cleaned} />
        </div>
      </main>
    </>
  );
}
