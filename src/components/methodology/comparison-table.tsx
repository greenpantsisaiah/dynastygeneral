/**
 * "Us vs them" methodology comparison table. The most impressive thing
 * to put in front of a sports-data-savvy friend: a side-by-side that
 * names what Dynasty General publishes that the rest of the dynasty
 * market does not.
 *
 * Each row is a methodology dimension the founder should be able to
 * defend in conversation. Each cell is intentionally specific (cite
 * the number or the absence) rather than yes/no.
 */

type Source =
  | "dynasty_general"
  | "keeptradecut"
  | "fantasycalc"
  | "fantasypros";

const COLUMNS: Array<{ key: Source; label: string }> = [
  { key: "dynasty_general", label: "Dynasty General" },
  { key: "keeptradecut", label: "KeepTradeCut" },
  { key: "fantasycalc", label: "FantasyCalc" },
  { key: "fantasypros", label: "FantasyPros" },
];

type Row = {
  dimension: string;
  detail: string;
  values: Record<Source, { text: string; tone: "yes" | "partial" | "no" }>;
};

const ROWS: Row[] = [
  {
    dimension: "Public backtest",
    detail: "Spearman vs actual cumulative production, multiple horizons",
    values: {
      dynasty_general: {
        text: "Yes, /scoreboard",
        tone: "yes",
      },
      keeptradecut: { text: "Not published", tone: "no" },
      fantasycalc: { text: "Not published", tone: "no" },
      fantasypros: { text: "Internal only", tone: "no" },
    },
  },
  {
    dimension: "Cohort calibration",
    detail: "Thresholds tuned against real-roster distributions",
    values: {
      dynasty_general: {
        text: "n=82, 5 leagues",
        tone: "yes",
      },
      keeptradecut: { text: "One number per player", tone: "no" },
      fantasycalc: { text: "One number per player", tone: "no" },
      fantasypros: { text: "Tier breaks, no cohort math", tone: "partial" },
    },
  },
  {
    dimension: "Per-position age curves",
    detail: "Peak bands empirically refit per position",
    values: {
      dynasty_general: {
        text: "4 positions, refit 2026-05-12",
        tone: "yes",
      },
      keeptradecut: { text: "Generic age decay", tone: "partial" },
      fantasycalc: { text: "Implicit in value", tone: "no" },
      fantasypros: { text: "Tiered, not curved", tone: "partial" },
    },
  },
  {
    dimension: "Lane identity model",
    detail: "Multi-attribute roster classification across 11 lanes",
    values: {
      dynasty_general: {
        text: "11 lanes, 3 axes",
        tone: "yes",
      },
      keeptradecut: { text: "No identity layer", tone: "no" },
      fantasycalc: { text: "No identity layer", tone: "no" },
      fantasypros: { text: "No identity layer", tone: "no" },
    },
  },
  {
    dimension: "Tunable model",
    detail: "User can perturb the engine weights and see the output change",
    values: {
      dynasty_general: {
        text: "8 dials, 3 public, 5 signed-in",
        tone: "yes",
      },
      keeptradecut: { text: "One static ranking", tone: "no" },
      fantasycalc: { text: "Format toggles only", tone: "partial" },
      fantasypros: { text: "Expert blend, no controls", tone: "no" },
    },
  },
  {
    dimension: "Opponent dossiers",
    detail: "Per-league trade-fingerprint + recent-pick patterns",
    values: {
      dynasty_general: {
        text: "Yes, per opponent",
        tone: "yes",
      },
      keeptradecut: { text: "None", tone: "no" },
      fantasycalc: { text: "None", tone: "no" },
      fantasypros: { text: "None", tone: "no" },
    },
  },
  {
    dimension: "Coach context",
    detail: "LLM analysis with full named roster + format rules",
    values: {
      dynasty_general: {
        text: "Named players, KTC pricing, format rules",
        tone: "yes",
      },
      keeptradecut: { text: "No LLM surface", tone: "no" },
      fantasycalc: { text: "No LLM surface", tone: "no" },
      fantasypros: { text: "Generic content, no named context", tone: "partial" },
    },
  },
  {
    dimension: "Reproducibility",
    detail: "Source CSV + scripts published so anyone can re-run",
    values: {
      dynasty_general: {
        text: "Scoreboard CSV + methodology page",
        tone: "yes",
      },
      keeptradecut: { text: "No", tone: "no" },
      fantasycalc: { text: "Public API", tone: "partial" },
      fantasypros: { text: "Paid-only access", tone: "no" },
    },
  },
];

const TONE_CLASS: Record<Row["values"][Source]["tone"], string> = {
  yes: "text-accent",
  partial: "text-warning",
  no: "text-muted-2",
};

export function ComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border-soft bg-surface">
      <table className="w-full min-w-[840px] text-xs">
        <thead className="bg-surface-2">
          <tr>
            <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              Methodology dimension
            </th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] ${
                  c.key === "dynasty_general" ? "text-accent" : "text-muted-2"
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr
              key={row.dimension}
              className="border-t border-border-soft align-top"
            >
              <td className="px-4 py-3">
                <div className="font-semibold text-foreground">
                  {row.dimension}
                </div>
                <div className="mt-1 leading-snug text-muted-2">
                  {row.detail}
                </div>
              </td>
              {COLUMNS.map((c) => {
                const cell = row.values[c.key];
                return (
                  <td
                    key={c.key}
                    className={`px-3 py-3 leading-snug ${TONE_CLASS[cell.tone]}`}
                  >
                    {cell.text}
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
