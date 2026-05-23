import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";

export const metadata = {
  title: "Scoreboard methodology",
  description:
    "Reproducible methodology for the Dynasty General Scoreboard. Snapshot dates, loss functions, sample sizes, source attribution, and reproduction instructions for the public backtest accuracy comparison.",
  alternates: { canonical: "/scoreboard/methodology" },
};

export default function ScoreboardMethodologyPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 pt-16 pb-10 sm:pt-24">
            <Ticker label="Scoreboard methodology · updated 2026-05-06" />
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              How we compute the scoreboard
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted">
              Each row of the{" "}
              <Link href="/scoreboard" className="underline">
                public scoreboard
              </Link>{" "}
              is a metric we computed from the predicted-vs-actual
              relationship for one (source, format, prediction year, loss
              function) tuple. Scores are reproducible from the source's
              published rankings against historical actuals.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-10">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              What we compare
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Each dynasty ranking source predicts how players will perform
              over a multi-year dynasty horizon. We measure how well each
              source's preseason ranking correlates with the actual
              cumulative fantasy points scored over the post-prediction
              window.
            </p>

            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
              <li>
                <strong className="text-foreground">Dynasty General v0:</strong>{" "}
                Our engine output. v0 uses position rubrics (RB / WR / QB /
                TE) plus age curves, with KTC value as a Bayesian prior. v0
                has NO signal codes loaded yet (Track A in progress);
                position rubrics fall back to KTC-prior + age curves only.
              </li>
              <li>
                <strong className="text-foreground">FantasyPros ECR:</strong>{" "}
                Their published expert blend, accessed under a paid trial
                in May 2026 from{" "}
                <code className="text-xs">
                  fantasypros.com/nfl/rankings/dynasty-overall.php?year=YYYY
                </code>
                .
              </li>
              <li>
                <strong className="text-foreground">FantasyPros ADP:</strong>{" "}
                Their published dynasty 1QB ADP page, same access path.
              </li>
              <li>
                <strong className="text-foreground">KeepTradeCut:</strong>{" "}
                Dynasty value rankings recovered from public Wayback Machine
                snapshots of `keeptradecut.com`.
              </li>
            </ul>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-10">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Loss function
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              We follow VALIDATION_PLAN section 8.2. The dynasty loss is a
              0.6/0.4 weighted composite of KTC 6-month value drift and
              cumulative-3-year PPR points error.
            </p>
            <pre className="mt-4 overflow-x-auto rounded bg-surface px-4 py-3 text-xs">
              {`L_dynasty = 0.6 * KTC_6mo_value_MAE
          + 0.4 * cumulative_3yr_PPR_RMSE`}
            </pre>
            <p className="mt-3 text-base leading-relaxed text-muted">
              In v0 we publish the cumulative-PPR-rank component (Spearman
              rank correlation) and a separate KTC-value-drift summary.
              v1 will composite them into the full weighted loss.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              The cumulative window adapts to outcome data availability:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              <li>2022 prediction → 3-year cumulative (2022 + 2023 + 2024)</li>
              <li>2023 prediction → 2-year cumulative (2023 + 2024)</li>
              <li>
                2024 prediction → 1-year (2024 only); will become 3-year
                when 2025 + 2026 outcomes are ingested
              </li>
            </ul>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-10">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Metrics published
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
              <li>
                <strong>Spearman rank correlation</strong> between predicted
                dynasty rank and actual cumulative-PPR rank
              </li>
              <li>
                <strong>Mean absolute rank error</strong> across joined
                (predicted, actual) pairs
              </li>
              <li>
                <strong>Top-50 hit rate</strong> and <strong>Top-100 hit rate</strong>:
                overlap between predicted top-N and actual top-N
              </li>
              <li>
                <strong>KTC 6-month value drift</strong> (where data permits):
                how much value did each predicted top-N player gain or lose
                6 months after prediction
              </li>
              <li>
                <strong>Sample size (n_pairs)</strong> for every row, so
                confidence intervals can be inferred (small n means wide CI)
              </li>
            </ul>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-10">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              What we do NOT publish
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
              <li>Source player-by-player rankings</li>
              <li>Source-internal ordering reproductions</li>
              <li>Cropped excerpts of FantasyPros tier displays</li>
            </ul>
            <p className="mt-3 text-base leading-relaxed text-muted">
              We compute. We publish the computed numbers. We cite the
              source.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-10">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Snapshot dates
            </h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-border-soft">
              <table className="min-w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted">
                      Source
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted">
                      Snapshot date convention
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted">
                      Access
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-2 text-foreground">FP ECR / ADP</td>
                    <td className="px-4 py-2 text-muted">
                      Aug 15 of prediction year
                    </td>
                    <td className="px-4 py-2 text-muted">Paid 3-day trial 2026-05-05</td>
                  </tr>
                  <tr className="border-t border-border-soft">
                    <td className="px-4 py-2 text-foreground">KeepTradeCut</td>
                    <td className="px-4 py-2 text-muted">
                      Closest to Aug 15 from public Wayback archive
                    </td>
                    <td className="px-4 py-2 text-muted">
                      Wayback Machine `playersArray` extraction
                    </td>
                  </tr>
                  <tr className="border-t border-border-soft">
                    <td className="px-4 py-2 text-foreground">Sleeper outcomes</td>
                    <td className="px-4 py-2 text-muted">
                      Season totals, regular season + playoffs
                    </td>
                    <td className="px-4 py-2 text-muted">
                      Public Sleeper API `/stats/nfl/{`{`}season{`}`}`
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-2">
              The 2024 FP ECR snapshot is dated Jan 9 2025 in their UI but
              the content is preseason 2024 (rookie variance signature
              confirms: Jayden Daniels worst=109, std_dev=24.8 indicates
              experts had not yet seen his rookie season). We trust the
              variance over the label.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-10">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Reproducibility
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              To reproduce a row in this scoreboard:
            </p>
            <ol className="mt-3 space-y-2 text-sm leading-relaxed text-muted list-decimal list-inside">
              <li>Subscribe to the source (FP requires a paid trial)</li>
              <li>
                Capture the preseason-snapshot rankings for the target year
                and format
              </li>
              <li>
                Score against `historical_outcomes` from the public Sleeper
                season-stats endpoint
              </li>
              <li>
                Compute Spearman rank correlation between predicted rank and
                actual cumulative-PPR rank
              </li>
              <li>Restrict to top-N predicted with n-pairs visibility</li>
            </ol>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Scripts (in the public repository under{" "}
              <code className="text-xs">web/scripts/</code>):
            </p>
            <ul className="mt-2 space-y-1 text-sm font-mono text-muted-2">
              <li>ingest-fp-csvs.ts</li>
              <li>ingest-ktc-historical.ts</li>
              <li>ingest-historical-outcomes.ts</li>
              <li>run-engine-historical.ts</li>
              <li>backtest-score-dynasty.ts</li>
              <li>build-scoreboard.ts</li>
            </ul>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-10">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Industry prior art
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Comparative-accuracy publication is standard in the fantasy
              industry. FantasyCalc maintains a public performance-analysis
              page that explicitly compares their values against FantasyPros
              ECR by name. Draft Sharks publishes commentary on FantasyPros
              accuracy. Academic sports-analytics literature regularly cites
              and benchmarks against industry sources.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              We are not the first to publish a comparative scoreboard. We
              aim to be the first to publish a calibrated dynasty-loss-
              function-based comparative scoreboard with full reproducibility
              documentation.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-10">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Caveats
            </h2>
            <ol className="mt-3 space-y-2 text-sm leading-relaxed text-muted list-decimal list-inside">
              <li>
                Sample sizes are small. Top-100 joined pairs per source per
                year run 60-90. Confidence intervals on Spearman values are
                roughly ±0.05 to ±0.10.
              </li>
              <li>
                Engine v0 has zero signal codes loaded. Track A
                (`scripts/extract-historical-signals.ts`) is in progress.
                v1 with signals will be re-run.
              </li>
              <li>
                Loss function is partial in v0. We publish the
                cumulative-PPR-rank component. The full §8.2 loss composites
                that with KTC value drift; v1 will composite.
              </li>
              <li>
                Dynasty horizons differ by source. Source rankings target
                1-3 year horizons, not single-season. Single-season-only
                Spearman scores are noisy by design.
              </li>
            </ol>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-3xl px-6 py-10">
            <div className="rounded-lg border border-border-soft bg-surface px-6 py-5 text-xs leading-relaxed text-muted-2">
              <p>
                Updated 2026-05-06. Past backtest performance does not
                predict future seasons. Dynasty General is not affiliated
                with, endorsed by, or sponsored by FantasyPros, Marzen Media
                LLC, KeepTradeCut, FantasyCalc, or Sleeper. Comparative
                claims reflect public product observation and our own
                backtest methodology as of 2026-05-06. FantasyPros is a
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
