import Link from "next/link";
import { Ticker } from "@/components/ui/ticker";
import { isBetaOpenMode } from "@/lib/billing/beta-mode";

export function Hero() {
  const beta = isBetaOpenMode();
  return (
    <section className="relative overflow-hidden border-b border-border-soft">
      <div className="absolute inset-0 bg-grid opacity-60" />
      <div className="absolute inset-0 bg-glow" />
      <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <Ticker
          label={
            beta
              ? "Beta · everything's open · Sleeper today, MFL next · Dynasty only"
              : "Live · Sleeper today, MyFantasyLeague next · Dynasty only"
          }
        />
        <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          Win the decision in front of you.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
          Most dynasty tools tell you who is good.
          <br className="hidden sm:block" />
          This tells you what to do. Right now, in your league, with your team.
        </p>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-2">
          Draft smarter. Trade harder. Stay disciplined. A dynasty copilot that
          remembers your strategy, detects leverage, and helps you act with
          conviction before the moment passes. Sleeper users today;
          MyFantasyLeague support shipping next.
        </p>

        {beta && (
          <p className="mt-4 max-w-2xl rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm leading-relaxed text-foreground">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Beta is open ·
            </span>{" "}
            Coach, briefings, multi-pick rollout, and contender outlook are
            free for every signed-in tester. Hosting and Anthropic API tokens
            cost real money. Support the project on{" "}
            <Link href="/pricing" className="text-accent hover:underline">
              Pro
            </Link>{" "}
            if Dynasty Copilot makes your decisions sharper.
          </p>
        )}

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/connect"
            className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Try with your Sleeper account
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface px-6 text-sm font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
          >
            {beta ? "Support during beta →" : "See pricing →"}
          </Link>
        </div>

        <HeroDecisionCard />
      </div>
    </section>
  );
}

function HeroDecisionCard() {
  return (
    <div className="relative mt-14 max-w-2xl">
      <div className="rounded-lg border border-border-strong bg-surface/80 p-5 shadow-[0_0_0_1px_rgba(245,158,11,0.05),0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
          <span>Decision · Pick 1.07</span>
          <span className="text-accent">On the clock</span>
        </div>
        <div className="mt-3 text-lg font-semibold text-foreground">
          Recommended: trade back, target Addison + late 1st
        </div>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          <li>· Fits your young WR-heavy rebuild</li>
          <li>· Avoids short-term RB value trap</li>
          <li>· Two teams behind you need WR; leverage is real</li>
        </ul>
        <div className="mt-4 flex items-center gap-2 border-t border-border-soft pt-3 font-mono text-[11px] text-success">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
          On strategy · drift risk low
        </div>
      </div>
    </div>
  );
}
