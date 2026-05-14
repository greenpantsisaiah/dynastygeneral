/**
 * Backtest comparison chart. One row per prediction horizon (1yr, 2yr,
 * 3yr cumulative) with a side-by-side dot plot of Spearman correlation
 * for each ranking source. Anchors the methodology page's headline
 * claim: we beat KTC on every horizon and win convincingly on 1-year.
 *
 * Source: data/scoreboard/scoreboard_v1.csv. Values baked here from
 * the public scoreboard data. When the CSV refreshes, regenerate
 * these numbers AND the canonical scoreboard page in lockstep.
 */

type ModelKey = "dg" | "ktc" | "fp_ecr" | "fp_adp";

const ROW_LABELS: Record<ModelKey, { label: string; tone: string }> = {
  dg: { label: "Dynasty General v1", tone: "bg-accent" },
  fp_ecr: { label: "FantasyPros ECR", tone: "bg-muted-2" },
  fp_adp: { label: "FantasyPros ADP", tone: "bg-muted-2" },
  ktc: { label: "KeepTradeCut", tone: "bg-muted-2" },
};

const HORIZON_DATA: Array<{
  horizon: string;
  year: string;
  values: Partial<Record<ModelKey, number>>;
  winner: ModelKey;
}> = [
  {
    horizon: "1-year cumulative",
    year: "predicted 2024",
    values: { dg: 0.346, ktc: 0.236, fp_ecr: 0.2, fp_adp: 0.093 },
    winner: "dg",
  },
  {
    horizon: "2-year cumulative",
    year: "predicted 2023",
    values: { dg: 0.474, ktc: 0.449, fp_ecr: 0.433, fp_adp: 0.535 },
    winner: "fp_adp",
  },
  {
    horizon: "3-year cumulative",
    year: "predicted 2022",
    values: { dg: 0.393, ktc: 0.354, fp_ecr: 0.463, fp_adp: 0.463 },
    winner: "fp_ecr",
  },
];

const MAX_X = 0.6;

export function SpearmanChart() {
  return (
    <div className="rounded-lg border border-border-soft bg-surface px-5 py-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Backtest, by horizon
      </div>
      <p className="mt-1 text-sm text-muted">
        Spearman rank correlation between each source's preseason
        ranking and actual cumulative fantasy points scored over the
        post-prediction window. Higher is better. Top-100 dynasty pool.
      </p>

      <div className="mt-5 space-y-5">
        {HORIZON_DATA.map((row) => (
          <div key={row.horizon}>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {row.horizon}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                  {row.year}
                </div>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                {row.winner === "dg"
                  ? "DG wins"
                  : `DG · ${(row.values.dg ?? 0).toFixed(3)} vs winner ${(row.values[row.winner] ?? 0).toFixed(3)}`}
              </div>
            </div>
            <div className="mt-2 space-y-1">
              {(["dg", "fp_ecr", "fp_adp", "ktc"] as ModelKey[]).map((m) => {
                const v = row.values[m];
                if (v == null) return null;
                const pct = (v / MAX_X) * 100;
                const isDg = m === "dg";
                return (
                  <div key={m} className="flex items-center gap-2 text-xs">
                    <div
                      className={`min-w-[140px] font-mono uppercase tracking-[0.14em] ${
                        isDg ? "text-accent" : "text-muted-2"
                      }`}
                    >
                      {ROW_LABELS[m].label}
                    </div>
                    <div className="flex-1 overflow-hidden rounded-sm bg-surface-2">
                      <div
                        className={`h-3 ${
                          isDg ? "bg-accent" : "bg-muted-2/40"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div
                      className={`min-w-[60px] text-right font-mono ${
                        isDg ? "text-foreground" : "text-muted-2"
                      }`}
                    >
                      {v.toFixed(3)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        The honest read: Engine v1 wins convincingly on 1-year. We beat
        KeepTradeCut on every horizon we tested. We trail FantasyPros
        ECR and ADP on 2-year and 3-year. Both numbers are published;
        we do not cherry-pick. Full methodology + per-row reproduction
        at the scoreboard.
      </p>
    </div>
  );
}
