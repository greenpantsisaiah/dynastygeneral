import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { ComparisonTable } from "@/components/methodology/comparison-table";
import { SpearmanChart } from "@/components/methodology/spearman-chart";
import { AgeCurveChart } from "@/components/methodology/age-curve-chart";
import { InflectionSample } from "@/components/methodology/inflection-sample";
import { LaneCohortDistribution } from "@/components/league/lane-cohort-distribution";
import {
  COHORT_GENERATED_AT,
  COHORT_LEAGUE_COUNT,
  COHORT_STATS_BY_LANE,
  COHORT_TOTAL,
} from "@/lib/strategy/lane-identity/cohort-stats";
import type { LaneMembership } from "@/lib/strategy/lane-identity";

export const metadata: Metadata = {
  title: "Methodology · Dynasty General",
  description:
    "The receipts behind the model. Backtest comparison against KTC and FantasyPros, the 82-roster cohort that calibrates our lane identity thresholds, position-specific age curves with refit history, and the engineering rigor behind every fix.",
  alternates: { canonical: "/methodology" },
};

// Sample membership for the cohort-snippet chart. The /methodology
// page is not user-scoped (it's a public marketing surface) so we
// fabricate a "near-median" placement to demonstrate where a sample
// roster lands inside the cohort, NOT a real user's score.
const SAMPLE_MEMBERSHIPS: LaneMembership[] = [
  {
    lane_id: "win_now_floor",
    label: "Win-Now Floor",
    blurb: "",
    axis: "horizon",
    state: "close",
    aggregate_score: 265,
    in_threshold: COHORT_STATS_BY_LANE.win_now_floor.in_threshold,
    close_threshold: COHORT_STATS_BY_LANE.win_now_floor.close_threshold,
    contributors: [],
    gap: null,
    is_derived: false,
  },
  {
    lane_id: "future_stock",
    label: "Future Stock",
    blurb: "",
    axis: "horizon",
    state: "in",
    aggregate_score: 340,
    in_threshold: COHORT_STATS_BY_LANE.future_stock.in_threshold,
    close_threshold: COHORT_STATS_BY_LANE.future_stock.close_threshold,
    contributors: [],
    gap: null,
    is_derived: false,
  },
];

export default function MethodologyPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 pt-14 pb-10 sm:pt-20">
            <Ticker label="Methodology · with receipts" />
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              How this measures up.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              Every claim ships with the source data, the method, and a
              way to reproduce. We win on some horizons. We lose on
              others. Both numbers are published. The methodology is
              what stays.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-2">
              <Link href="/scoreboard" className="hover:text-foreground">
                Full backtest scoreboard →
              </Link>
              <Link
                href="/scoreboard/methodology"
                className="hover:text-foreground"
              >
                Scoreboard methodology →
              </Link>
              <Link href="/library" className="hover:text-foreground">
                Library →
              </Link>
            </div>
          </div>
        </section>

        {/* Comparison table. What we publish that the field does not. */}
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-10">
            <div className="mb-4 max-w-2xl">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                What we publish that the field does not
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Side by side.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Eight methodology dimensions a sophisticated reader
                would ask about. KTC and FantasyCalc publish one number
                per player. FantasyPros publishes tiers. Our model
                publishes the math, the cohort, the curves, and the
                receipts. The cells below are specific rather than yes
                or no.
              </p>
            </div>
            <ComparisonTable />
          </div>
        </section>

        {/* Backtest visualization */}
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-10">
            <div className="mb-4 max-w-2xl">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                Receipt 1 · backtest
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                We beat KeepTradeCut on every horizon.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                We win convincingly on 1-year prediction. We trail
                FantasyPros ECR on 3-year. We publish both numbers and
                the loss function and the snapshot dates. Nothing
                cherry-picked.
              </p>
            </div>
            <SpearmanChart />
          </div>
        </section>

        {/* Cohort calibration */}
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-10">
            <div className="mb-4 max-w-2xl">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                Receipt 2 · cohort
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Calibrated against {COHORT_TOTAL} real rosters.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                The 11 lane-identity thresholds (Win-Now Floor,
                Balanced, Future Stock, RB Bellcow, WR Anchor, WR
                Stable, QB Stable, TE-Premium Lock, Trade Capital,
                Sustained Contender, Zero-RB) are tuned against the
                percentile distribution of this cohort, not picked by
                feel. Baked {COHORT_GENERATED_AT} from{" "}
                {COHORT_LEAGUE_COUNT} dynasty and keeper leagues.
              </p>
            </div>
            <LaneCohortDistribution memberships={SAMPLE_MEMBERSHIPS} />
          </div>
        </section>

        {/* Inflection scorecards · unique to us */}
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-10">
            <div className="mb-4 max-w-2xl">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                Receipt 3 · inflection scorecards (only we publish this)
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Bimodal forecasts, not single points.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                When a player is in a high-variance moment (aging
                cliff, rookie debut, post-major-injury return), the
                conditional distribution of outcomes is bimodal. The
                mean lands in the valley between the two modes, where
                no actual player ends up. KTC and FantasyCalc collapse
                this into one number anyway. We refuse to. Each
                inflection window publishes both stories with
                calibrated probabilities, a signal scorecard with
                confidence labels, and named historical comparators.
              </p>
            </div>
            <InflectionSample />
          </div>
        </section>

        {/* Age curves */}
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-10">
            <div className="mb-4 max-w-2xl">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                Receipt 4 · age curves
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Peak bands refit when the data says so.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Four position-specific curves derived from NFL starter
                production 2022 to 2025. Refits are dated and
                traceable. Most products use "RB cliff at 30" as a
                rule of thumb. We use a band that we update when the
                cohort moves.
              </p>
            </div>
            <AgeCurveChart />
          </div>
        </section>

        {/* Coach context */}
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-10">
            <div className="mb-4 max-w-2xl">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                Receipt 5 · LLM context
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Coach reads the full named roster.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Every Coach request ships the user's named players
                (name, position, age, team, KTC value), format rules
                (starter slots, K and DST presence, superflex,
                TE-premium), and a pricing block with KTC-anchored
                pick values. No "you need a TE" when Kincaid is on
                roster. Three-layer fix for every hallucination class:
                explicit context field, hard system-prompt rule
                referencing it, pre-LLM guard.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-warning/40 bg-warning/5 px-5 py-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-warning">
                  What other tools send their LLM
                </div>
                <pre className="mt-3 overflow-x-auto text-[11px] leading-relaxed text-muted">
{`Available pool: 247 players
Your roster: 23 players
Question: should I trade for Bijan?

(model has to guess at format,
guess at what's on the roster,
guess at the trade math)`}
                </pre>
              </div>
              <div className="rounded-lg border border-success/40 bg-success/5 px-5 py-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-success">
                  What Coach receives per request
                </div>
                <pre className="mt-3 overflow-x-auto text-[11px] leading-relaxed text-foreground">
{`format_rules:
  is_superflex: true
  qb_starters_max: 2
  te_premium: true
  has_k: false
  has_dst: false

your_roster:
  Patrick Mahomes (QB, age 30, KC, KTC 85)
  Jahmyr Gibbs (RB, age 24, DET, KTC 100)
  Travis Kincaid (TE, age 22, BUF, KTC 78)
  [... 20 more]

pricing:
  pick_values: { "2026.1.05": 92, ... }
  player_values_present: true

question: should I trade for Bijan Robinson?`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* Engineering rigor */}
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-10">
            <div className="mb-4 max-w-2xl">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                Receipt 6 · engineering
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                71 evals + 12 anti-pattern lint rules.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Every fix ships with a test. Pre-deploy audits cover
                security, cost, legal, trade realism, and LLM context
                hallucinations. The lint rules are what catch a class
                of bug before it ships rather than after a user finds
                it.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <AuditCard
                title="Eval suite (71 tests)"
                items={[
                  "Lane identity calibration regressions",
                  "Format-aware starter math (1QB / SF / 2QB / flex)",
                  "Survival pct + availability bucket consistency",
                  "Anti-pattern lint (hardcoded thresholds, raw hard.QB)",
                  "Em-dash check (never ships)",
                  "Rerank cascade ordering",
                  "Snake-pick math + traded-pick resolution",
                ]}
              />
              <AuditCard
                title="Pre-deploy audits"
                items={[
                  "Security: OWASP + SSRF + Anthropic-key leakage",
                  "Cost: per-endpoint LLM budget worst-case",
                  "Legal: privacy, ToS, GDPR/CCPA",
                  "Trade realism: KTC pricing within ±15%",
                  "Context doctor: LLM hallucination triage",
                  "Microcopy: brand voice consistency",
                ]}
              />
            </div>
          </div>
        </section>

        {/* Honest disclosure */}
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-10">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              What we do not claim
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Limits, named.
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-foreground">
              <li>
                <span className="font-semibold">Three years of NFL data, not thirty.</span>{" "}
                The age-curve calibration cohort spans 2022 to 2025.
                Older seasons exist; we are not yet using them.
              </li>
              <li>
                <span className="font-semibold">82 rosters, not 8,200.</span>{" "}
                The cohort is dynasty and keeper leagues we have
                explicit access to. Larger cohort means tighter
                percentile estimates; we are adding leagues over time.
              </li>
              <li>
                <span className="font-semibold">OL transitions and OC tenure not fully ingested.</span>{" "}
                The team_signals table that powers Coaching Continuity
                is mid-calibration. The dial reads as neutral until
                the table is complete.
              </li>
              <li>
                <span className="font-semibold">FantasyPros wins us on 3-year.</span>{" "}
                Their expert blend has access to in-season ADP
                revisions; our preseason model does not. Closing the
                gap is the next calibration target.
              </li>
              <li>
                <span className="font-semibold">No future prediction.</span>{" "}
                The model reads what your opponents have done, what
                the cohort looks like today, and how a player fits an
                identity vector. It does not predict trades that have
                not happened or game-script that is not real yet.
              </li>
            </ul>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-3xl px-6 py-10 text-sm text-muted">
            <p>
              Source CSV for the backtest:{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">
                data/scoreboard/scoreboard_v1.csv
              </code>
              . Cohort statistics:{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">
                src/lib/strategy/lane-identity/cohort-stats.ts
              </code>
              . Age-curve definitions:{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">
                src/lib/strategy/lane-identity/lanes.ts
              </code>
              . Every number on this page reproducible from the
              repository.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function AuditCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-border-soft bg-surface px-5 py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        {title}
      </div>
      <ul className="mt-3 space-y-1.5 text-xs leading-snug text-muted">
        {items.map((line, i) => (
          <li key={i}>· {line}</li>
        ))}
      </ul>
    </div>
  );
}
