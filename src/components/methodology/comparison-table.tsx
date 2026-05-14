/**
 * "Us vs them" methodology comparison. Designed for visual scan rather
 * than careful reading. Each dimension is a row; each source is a
 * column. Cells lead with a big icon (yes / partial / no) and carry a
 * short tag. The Dynasty General column is tinted so the eye lands
 * there first. Founder feedback 2026-05-14: the previous text-heavy
 * version "is too text-heavy."
 */

type Source =
  | "dynasty_general"
  | "keeptradecut"
  | "fantasycalc"
  | "fantasypros";

type Tone = "yes" | "partial" | "no";

const COLUMNS: Array<{ key: Source; label: string; subtitle?: string }> = [
  {
    key: "dynasty_general",
    label: "Dynasty General",
    subtitle: "this product",
  },
  { key: "keeptradecut", label: "KTC" },
  { key: "fantasycalc", label: "FantasyCalc" },
  { key: "fantasypros", label: "FantasyPros" },
];

type Row = {
  dimension: string;
  detail: string;
  values: Record<Source, { tag: string; tone: Tone }>;
};

const ROWS: Row[] = [
  {
    dimension: "Public backtest",
    detail: "Spearman vs actual production, multiple horizons",
    values: {
      dynasty_general: { tag: "Published", tone: "yes" },
      keeptradecut: { tag: "Not published", tone: "no" },
      fantasycalc: { tag: "Not published", tone: "no" },
      fantasypros: { tag: "Internal only", tone: "no" },
    },
  },
  {
    dimension: "Cohort calibration",
    detail: "Real-roster percentile thresholds",
    values: {
      dynasty_general: { tag: "n=82, 5 leagues", tone: "yes" },
      keeptradecut: { tag: "Single value", tone: "no" },
      fantasycalc: { tag: "Single value", tone: "no" },
      fantasypros: { tag: "Tier breaks", tone: "partial" },
    },
  },
  {
    dimension: "Per-position age curves",
    detail: "Empirically refit peak bands",
    values: {
      dynasty_general: { tag: "4 positions, refit 05/12", tone: "yes" },
      keeptradecut: { tag: "Generic decay", tone: "partial" },
      fantasycalc: { tag: "Implicit", tone: "no" },
      fantasypros: { tag: "Tiered", tone: "partial" },
    },
  },
  {
    dimension: "Lane identity model",
    detail: "Multi-attribute roster classification",
    values: {
      dynasty_general: { tag: "11 lanes, 3 axes", tone: "yes" },
      keeptradecut: { tag: "None", tone: "no" },
      fantasycalc: { tag: "None", tone: "no" },
      fantasypros: { tag: "None", tone: "no" },
    },
  },
  {
    dimension: "Inflection scorecards",
    detail: "Bimodal forecasts with signal scorecard + comparators",
    values: {
      dynasty_general: { tag: "Bimodal + signals", tone: "yes" },
      keeptradecut: { tag: "None", tone: "no" },
      fantasycalc: { tag: "None", tone: "no" },
      fantasypros: { tag: "None", tone: "no" },
    },
  },
  {
    dimension: "Tunable model",
    detail: "User-controlled engine weights",
    values: {
      dynasty_general: { tag: "8 dials", tone: "yes" },
      keeptradecut: { tag: "None", tone: "no" },
      fantasycalc: { tag: "Format toggles", tone: "partial" },
      fantasypros: { tag: "Expert blend", tone: "no" },
    },
  },
  {
    dimension: "Opponent dossiers",
    detail: "Per-league trade fingerprints + pick patterns",
    values: {
      dynasty_general: { tag: "Per opponent", tone: "yes" },
      keeptradecut: { tag: "None", tone: "no" },
      fantasycalc: { tag: "None", tone: "no" },
      fantasypros: { tag: "None", tone: "no" },
    },
  },
  {
    dimension: "Reproducibility",
    detail: "Source CSV + scripts published",
    values: {
      dynasty_general: { tag: "CSV + methodology", tone: "yes" },
      keeptradecut: { tag: "Closed", tone: "no" },
      fantasycalc: { tag: "Public API", tone: "partial" },
      fantasypros: { tag: "Paid only", tone: "no" },
    },
  },
];

function ToneGlyph({ tone }: { tone: Tone }) {
  const common = "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px]";
  if (tone === "yes") {
    return (
      <span
        className={`${common} bg-accent text-black`}
        aria-label="yes"
      >
        ✓
      </span>
    );
  }
  if (tone === "partial") {
    return (
      <span
        className={`${common} border border-warning bg-warning/20 text-warning`}
        aria-label="partial"
      >
        ◐
      </span>
    );
  }
  return (
    <span
      className={`${common} border border-border-soft bg-surface-2 text-muted-2`}
      aria-label="no"
    >
      ✕
    </span>
  );
}

export function ComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border-soft bg-surface">
      <table className="w-full min-w-[760px] text-xs">
        <thead>
          <tr>
            <th className="bg-surface-2 px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              {/* dimension */}
            </th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-3 text-left ${
                  c.key === "dynasty_general"
                    ? "bg-accent/10"
                    : "bg-surface-2"
                }`}
              >
                <div
                  className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                    c.key === "dynasty_general"
                      ? "text-accent"
                      : "text-muted-2"
                  }`}
                >
                  {c.label}
                </div>
                {c.subtitle && (
                  <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
                    {c.subtitle}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr
              key={row.dimension}
              className="border-t border-border-soft align-middle"
            >
              <td className="px-4 py-3">
                <div className="font-semibold text-foreground">
                  {row.dimension}
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-2">
                  {row.detail}
                </div>
              </td>
              {COLUMNS.map((c) => {
                const cell = row.values[c.key];
                const isDg = c.key === "dynasty_general";
                return (
                  <td
                    key={c.key}
                    className={`px-3 py-3 ${isDg ? "bg-accent/5" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <ToneGlyph tone={cell.tone} />
                      <span
                        className={`leading-snug ${
                          isDg
                            ? "text-foreground"
                            : cell.tone === "yes"
                              ? "text-foreground"
                              : cell.tone === "partial"
                                ? "text-warning"
                                : "text-muted-2"
                        }`}
                      >
                        {cell.tag}
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
