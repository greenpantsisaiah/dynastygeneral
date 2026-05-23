import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";

export const metadata = {
  title: "Pricing",
  description:
    "Dynasty General is in open alpha. Every signed-in tester gets every feature. Pricing lands when calibration ships.",
  alternates: { canonical: "/pricing" },
};

// Pricing page deliberately simplified 2026-05-12. Pro gating is not
// enforced (isBetaOpenMode hardcoded true; see DEPLOYMENT.md). A
// pricing page that promises tiers we are not actually charging for
// or enforcing creates a trust gap with the alpha cohort. The honest
// state is "alpha is free." The page stays at this URL because paywall
// fallback paths (lib/auth/paywall.ts, billing/paywall-modal.tsx)
// route 4xx responses here as the upgrade target. When monetization
// flips on, this page gets rebuilt with real tiers + Stripe checkout.

export default function PricingPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section>
          <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
            <Ticker label="Alpha · every feature open" />
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Pricing lands when calibration ships.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              Every signed-in tester gets every feature today. Coach,
              briefings, the Decision card, Contender Outlook, opponent
              dossiers, AAR, all of it. The engine has costs and the
              eventual pricing will reflect them, but not yet. We will
              not price anything we have not finished calibrating.
            </p>

            <div className="mt-10 rounded-lg border border-border-soft bg-surface px-6 py-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                What you get today
              </div>
              <ul className="mt-3 space-y-2 text-sm text-foreground">
                <li>
                  Lane identity over an 82-roster calibration cohort.
                </li>
                <li>
                  Per-opponent dossiers with trade fingerprints and
                  manual-note capture.
                </li>
                <li>
                  Coach with full named-roster context and KTC-anchored
                  trade math.
                </li>
                <li>After-Action Report at draft complete.</li>
                <li>
                  Briefing feed, contender outlook, league dossier
                  visualization.
                </li>
              </ul>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <Link
                href="/connect"
                className="inline-flex h-11 items-center rounded-md bg-accent px-5 font-semibold text-black transition hover:brightness-110"
              >
                Open the app →
              </Link>
              <Link
                href="/library"
                className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2 hover:text-accent"
              >
                Methodology library →
              </Link>
            </div>

            <p className="mt-12 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              Calibration receipt · engine v1 averages Spearman 0.421
              across 2022 to 2024 dynasty cumulative outcomes (KTC
              0.346, FantasyPros 0.365).
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
