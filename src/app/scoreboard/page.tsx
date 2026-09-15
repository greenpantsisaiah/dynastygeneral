import Link from "next/link";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import {
  dedupeNewest,
  headlineAverages,
  parseScoreboardCsv,
  type ScoreRow,
} from "@/lib/scoreboard/rows";

export const metadata = {
  title: "Scoreboard",
  description:
    "Dynasty General publishes our backtest accuracy against named industry baselines (FantasyPros ECR, FantasyPros ADP, KeepTradeCut). Spearman rank correlations on dynasty cumulative outcomes 2022-2024, engine v0 and v1 as of 2026-05-08. Methodology and reproduction notes included.",
  alternates: { canonical: "/scoreboard" },
};

/** The backtest this page reports. Not the live engine; see the note in the hero. */
const BACKTEST_RUN_DATE = "2026-05-08";
const LIVE_ENGINE_CHANGE_DATE = "2026-06-19";
const HEADLINE_YEARS = [2022, 2023, 2024];

function readScoreboard(): ScoreRow[] {
  const csvPath = resolve(process.cwd(), "data/scoreboard/scoreboard_v1.csv");
  let content: string;
  try {
    content = readFileSync(csvPath, "utf8");
  } catch {
    return [];
  }
  return parseScoreboardCsv(content);
}
function prettyModel(model_version: string): string {
  const map: Record<string, string> = {
    "fantasypros_ecr@1qb": "FantasyPros ECR (1QB)",
    "fantasypros_ecr@sf": "FantasyPros ECR (Superflex)",
    "fantasypros_adp@1qb": "FantasyPros ADP",
    "fantasypros_top20draft2024@1qb": "FantasyPros Top-20 Most Accurate",
    "fantasypros_top20draft2024@sf": "FantasyPros Top-20 Most Accurate (SF)",
    "ktc@1qb": "KeepTradeCut (1QB)",
    "ktc@sf": "KeepTradeCut (Superflex)",
    "dynasty_general_v0_nosignals@1qb": "Dynasty General v0 (1QB, no signals)",
    "dynasty_general_v0_nosignals@sf": "Dynasty General v0 (SF, no signals)",
    "dynasty_general_v0_signals@1qb": "Dynasty General v1 (1QB, RB signals loaded)",
    "dynasty_general_v0_signals@sf": "Dynasty General v1 (SF, RB signals loaded)",
  };
  return map[model_version] ?? model_version;
}

export default function ScoreboardPage() {
  const rows = readScoreboard();
  // Filter to dynasty cumulative loss function rows for the headline table
  const dynastyRows = dedupeNewest(
    rows
      .filter((r) => r.loss_function.startsWith("dynasty_v0_"))
      .filter((r) => r.format === "1qb")
      .filter((r) => !r.model_version.includes("top20draft")),
  ).sort((a, b) => {
    // Sort by year first, then put DG v1 first, then DG v0, then others within each year
    const yearCmp = Number(a.prediction_year) - Number(b.prediction_year);
    if (yearCmp !== 0) return yearCmp;
    const aV1 = a.model_version.includes("v0_signals");
    const bV1 = b.model_version.includes("v0_signals");
    if (aV1 !== bV1) return aV1 ? -1 : 1;
    const aV0 = a.model_version.includes("v0_nosignals");
    const bV0 = b.model_version.includes("v0_nosignals");
    if (aV0 !== bV0) return aV0 ? -1 : 1;
    return 0;
  });

  // Headline averages are DERIVED from the same deduped rows the table
  // renders, so the two cannot disagree (G03, 2026-09-15).
  const headline = headlineAverages(rows, {
    format: "1qb",
    years: HEADLINE_YEARS,
  }).filter((h) => !h.model_version.includes("top20draft"));

  // Group by year
  const byYear = new Map<string, ScoreRow[]>();
  for (const r of dynastyRows) {
    if (!byYear.has(r.prediction_year)) byYear.set(r.prediction_year, []);
    byYear.get(r.prediction_year)!.push(r);
  }

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
            <Ticker label={`Scoreboard · engine v0 + v1 backtest · run ${BACKTEST_RUN_DATE} · not the live engine`} />
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              We publish our accuracy. The industry hides theirs.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">
              Dynasty General is built on calibrated prediction. We backtest
              our engine against named industry baselines (FantasyPros ECR,
              FantasyPros ADP, KeepTradeCut) on dynasty cumulative outcomes
              from 2022 to 2024. The numbers below are reproducible from the
              source rankings and historical actuals.
            </p>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-2">
              Two engine versions are reported, both as they stood on{" "}
              {BACKTEST_RUN_DATE}. v0 uses position rubric scaffolding plus
              corpus-grounded age curves with no signal codes loaded. v1
              adds 182 RB player-years of signals (role tier,
              role-at-new-team, traded flag, compounding-news count) coded
              by an LLM extractor with a pre-draft knowledge cutoff, RB
              only. v1 averages +0.022 absolute Spearman over v0 across the
              three years, with the gain concentrated on 3-year cumulative.
            </p>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-2">
              What this page is not: the accuracy of the product you use
              today. The live board changed on {LIVE_ENGINE_CHANGE_DATE};
              every value now runs through the position rubrics blended
              with the FantasyCalc market prior at a market-dominant
              weight, and the signals tested after this run (route
              participation, scheme and coaching history, offensive-line
              proxies) did not beat the market in backtest. The live
              engine has not been re-scored here. Each cell below is the
              newest run of that cell; superseded runs are dropped when
              the board is rebuilt.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Dynasty cumulative-PPR Spearman rank correlation
            </h2>
            <p className="mt-3 text-sm text-muted">
              Higher is better. Each row is a (source, prediction year)
              snapshot. Cumulative window adapts to outcome data
              availability: 3-year for 2022, 2-year for 2023, 1-year for 2024
              (will become full 3-year when 2025 and 2026 outcomes are
              ingested).
            </p>

            {Array.from(byYear.entries()).map(([year, group]) => (
              <div key={year} className="mt-8">
                <h3 className="text-lg font-medium text-foreground">
                  {year} prediction year
                </h3>
                <div className="mt-3 overflow-x-auto rounded-lg border border-border-soft">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-muted">
                          Source
                        </th>
                        <th className="px-4 py-2 text-right font-medium text-muted">
                          Spearman
                        </th>
                        <th className="px-4 py-2 text-right font-medium text-muted">
                          MAR
                        </th>
                        <th className="px-4 py-2 text-right font-medium text-muted">
                          n
                        </th>
                        <th className="px-4 py-2 text-right font-medium text-muted">
                          Window
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((r) => {
                        const isUs = r.model_version.includes("dynasty_general");
                        return (
                          <tr
                            key={r.model_version}
                            className={
                              isUs
                                ? "bg-accent/5 font-medium"
                                : "border-t border-border-soft"
                            }
                          >
                            <td className="px-4 py-2 text-foreground">
                              {prettyModel(r.model_version)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-foreground">
                              {r.spearman}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-muted">
                              {r.mar}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-muted">
                              {r.n_pairs}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-muted">
                              {r.years_in_window}yr
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <div className="mt-10 rounded-lg border border-border-soft bg-surface px-6 py-5">
              <h3 className="text-base font-semibold text-foreground">
                Headline (averaged across 2022-2024, top-100 predicted, 1QB)
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                {headline.map((h) => (
                  <li key={h.model_version}>
                    <strong className="text-foreground">
                      {prettyModel(h.model_version)}:
                    </strong>{" "}
                    Spearman {h.spearman_avg.toFixed(3)}{" "}
                    <span className="text-muted-2">
                      ({h.by_year.map((y) => `${y.year} ${y.spearman.toFixed(3)}`).join(" · ")})
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-2">
                Honest read: DG wins on AVERAGE; per-year picture is mixed.
                In 2024 (1-year cumulative) DG dominates by a wide margin
                because consensus rankings collapsed on injury-driven busts
                (CMC, Aiyuk, Cooper Kupp, Tyreek Hill). On the longer
                horizons (2022 3-year, 2023 2-year) FantasyPros wins by
                ~0.02-0.06. Average win is real; per-year ranking deserves
                scrutiny. Sample sizes 60-90 joined pairs per cell;
                confidence intervals roughly ±0.05 to ±0.10.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-12">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Methodology
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              We score each source's preseason ranking against the actual
              cumulative PPR points scored over the post-prediction window.
              The loss function follows VALIDATION_PLAN section 8.2:
              <code className="mx-1 rounded bg-surface px-1 py-0.5 text-xs">
                L_dynasty = 0.6 × KTC_6mo_value_MAE + 0.4 × cumulative_3yr_PPR_RMSE
              </code>
              . v0 publishes the cumulative-PPR-rank correlation component;
              v1 will composite KTC value drift into the full weighted loss.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Source snapshots: FantasyPros rankings accessed under a paid
              trial in May 2026 from{" "}
              <code className="text-xs">
                dynasty-overall.php?year=YYYY&amp;week=0
              </code>
              . KeepTradeCut snapshots from the public Wayback Machine
              archive. Sleeper season totals from the public stats endpoint.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              We publish derived metrics (Spearman correlations, MAR, hit
              rates). We do not republish source rankings or player-by-player
              orderings. To reproduce a row: subscribe to the source, capture
              the preseason snapshot, score against actuals, compute the
              metric. Scripts are in the public repository under{" "}
              <code className="text-xs">web/scripts/</code>.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Industry prior art: FantasyCalc maintains a public performance-
              analysis page comparing their values to FantasyPros ECR by
              name. Comparative-accuracy publication is standard.
            </p>
            <p className="mt-4">
              <Link
                href="/scoreboard/methodology"
                className="text-sm underline text-foreground"
              >
                Full methodology and reproducibility notes
              </Link>
            </p>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-3xl px-6 py-12">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Caveats
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>
                v1 signal coverage is RB-only (182 RB player-years,
                LLM-coded with a pre-draft knowledge cutoff, 2022-2024).
                QB / WR / TE predictions in this run use rubric + age
                curve only. The signals tested after this run (route
                participation, scheme and coaching history, offensive-line
                proxies) did not beat the market; see negative-results in
                the repository.
              </li>
              <li>
                Per-position breakdown shows DG loses to FP within-position
                on QB and RB across years; WR is roughly tied. The DG
                top-100 average win comes from cross-position bust avoidance
                (correctly downgrading aging starters that consensus
                overranked) more than from within-position ordering.
              </li>
              <li>
                The horizon-gating thesis (that workload-dependent signals
                like the bellcow boost should be horizon-gated) was
                considered after the partial-coverage v1 result and
                refuted by the full-coverage data. v1 wins biggest on
                3-year cumulative. The boost is not horizon-gated.
              </li>
              <li>
                Sample sizes are small; confidence intervals are ±0.05 to
                ±0.10 on individual Spearman values. The average is more
                reliable than the year-by-year ordering.
              </li>
              <li>
                The 2024 prediction is currently scored on a 1-year window
                only. When 2025 and 2026 outcomes are ingested, this row
                will be re-scored on the full 3-year cumulative.
              </li>
              <li>
                Engine universe is restricted to KTC top-200; we cannot find
                a "diamond in the rough" outside that universe.
              </li>
              <li>
                Past backtest performance does not predict future seasons.
              </li>
            </ul>

            <div className="mt-12 rounded-lg border border-border-soft bg-surface px-6 py-5 text-xs leading-relaxed text-muted-2">
              <p>
                Backtest run {BACKTEST_RUN_DATE}; page copy updated
                2026-09-15. Dynasty General is not affiliated with,
                endorsed by, or sponsored by FantasyPros, Marzen Media LLC,
                KeepTradeCut, FantasyCalc, or Sleeper. Comparative claims
                reflect public product observation and our own backtest
                methodology as of {BACKTEST_RUN_DATE}; see{" "}
                <Link href="/scoreboard/methodology" className="underline">
                  /scoreboard/methodology
                </Link>{" "}
                for sources and reproducibility notes. FantasyPros is a
                trademark of Marzen Media LLC, used here for comparative
                reference under nominative fair use.
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
