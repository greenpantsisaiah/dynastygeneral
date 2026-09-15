import Link from "next/link";
import { Ticker } from "@/components/ui/ticker";
import { HeroCohortChart } from "@/components/landing/home-charts";

/**
 * Chart-led hero, rebuilt 2026-05-12 after the "rethink from the ground
 * up, visual over words" direction.
 *
 * Old hero: 6-pt copy headline + Sleeper username form + giant
 * screenshot of the Decision card with 4 numbered callouts. The
 * screenshot showed UI, not insight; the visit-first user couldn't
 * tell at a glance what made the product different from KTC or DLF.
 *
 * New hero: a 538-style cohort distribution as the first visual. The
 * reader sees a histogram of Win-Now Floor scores across 82 rosters,
 * spots the "your roster" marker, and intuits the value proposition
 * (lane membership, percentile placement, statistical cohort) before
 * any copy is read. The Sleeper username form sits next to the chart
 * as the single CTA.
 *
 * Form is still a plain HTML GET to /connect; no client JS required.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border-soft">
      <div className="absolute inset-0 bg-grid opacity-50" />
      <div className="absolute inset-0 bg-glow" />
      <div className="relative mx-auto max-w-6xl px-6 pt-14 pb-20 sm:pt-20 sm:pb-24">
        <Ticker label="Dynasty intelligence · Sleeper today · MFL next" />

        <div className="mt-8 grid items-start gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
              Read the room before you make the trade.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Lane identity scored across 82 dynasty rosters in 5
              calibration leagues. Per-opponent trade fingerprints.
              Coach context with named players, not IDs.
            </p>

            <form
              action="/connect"
              method="GET"
              className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-center"
            >
              <input type="hidden" name="platform" value="sleeper" />
              <label className="flex-1">
                <span className="sr-only">Sleeper username</span>
                <input
                  name="username"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Sleeper username"
                  className="h-12 w-full rounded-md border border-border-strong bg-surface px-4 text-base text-foreground outline-none transition focus:border-accent"
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
              >
                See your roster →
              </button>
            </form>
            <p className="mt-3 max-w-xl font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              Sleeper read-only via public API. No password, no install.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-2">
              <Link href="/scout" className="hover:text-foreground">
                Scout any manager →
              </Link>
              <Link href="/library" className="hover:text-foreground">
                Methodology library →
              </Link>
              <Link href="/built-by" className="hover:text-foreground">
                Built by →
              </Link>
            </div>
          </div>

          <div className="lg:pl-2">
            <div className="rounded-lg border border-border-soft bg-surface px-5 py-5">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                    Win-Now Floor lane
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Cohort distribution with the engine's CLOSE and IN
                    thresholds. The marker shows where one example
                    roster sits.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <HeroCohortChart />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
