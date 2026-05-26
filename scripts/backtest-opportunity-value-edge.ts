/**
 * Backtest: does prior-season OPPORTUNITY (snap share / targets) predict
 * forward dynasty VALUE, beyond what prior production and the market's own
 * rank already capture?
 *
 * This is the Stage 2b methodology gate of the "data right" on-ramp
 * (ARCHITECTURE_UNIFICATION_PLAN.md addendum). Stage 3 (wiring evaluate()
 * as a projection prior) is gated on this. The grounding verdict
 * (dynasty-canon-keeper, 2026-05-25): a flat "proven beats unproven" or any
 * rookie/proven multiplier on the VALUE scale is indefensible; the
 * defensible lever is age-adjusted OPPORTUNITY wired as a per-player
 * PROJECTION prior. So the question is NOT "does opportunity correlate with
 * forward production" (it does, ~0.95, mostly autocorrelation). It is: does
 * opportunity predict forward VALUE that the market has not ALREADY priced?
 * That marginal, market-residual signal is the only thing worth wiring.
 *
 * Differences from backtest-proven-production-edge.ts (the PPR first-cut):
 *   - Outcome is forward dynasty VALUE (KTC rank movement), not forward PPR.
 *   - The predictor is OPPORTUNITY (snap share, targets/g) from the free
 *     Sleeper /stats feed, joined by player_id (== Sleeper id, verified).
 *   - Residualized on prior production AND current market rank, so we read
 *     the MARGINAL opportunity signal, not autocorrelation or market echo.
 *   - Washouts kept (fell out of the forward snapshot => worst rank).
 *
 * Honest data ceiling (the plan anticipated this): KTC SF snapshots run
 * 2022-08 .. 2024-12 and historical_outcomes covers 2022-2024. So exactly
 * ONE vintage has BOTH a clean prior (production + opportunity) AND a
 * forward value snapshot: 2023-10-01 -> 2024-08-13 (~10mo). A second,
 * longer-horizon vintage (2022-08 -> 2024-08, 24mo) has opportunity from
 * the 2021 /stats feed but no prior-production control (no 2021 outcomes in
 * the DB). Both are underpowered; this is directional evidence that informs
 * whether to PROCEED to the methodology audit, not a license to ship a
 * value-scale change. More KTC snapshots are the unlock.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-opportunity-value-edge.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import {
  getSeasonStats,
  buildOpportunityProfile,
  type PlayerSeasonStats,
} from "../src/lib/players/season-stats";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const FORMAT = "sf";
const BAND_LO = 100;
const BAND_HI = 280;
const PROVEN_PPR_MIN = 50;

type MV = {
  player_id: string;
  overall_rank: number | null;
  position: string | null;
  raw_attributes: { age?: number } | null;
};

async function pageAll(
  table: string,
  cols: string,
  filters: (q: ReturnType<typeof sb.from>["select"] extends infer _ ? any : never) => any,
): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await filters(sb.from(table).select(cols)).range(
      from,
      from + PAGE - 1,
    );
    if (error) {
      console.log(`ERR ${table}: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

function pearson(xs: number[], ys: number[]): { r: number; n: number } {
  const n = xs.length;
  if (n < 3) return { r: NaN, n };
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  return { r: denom === 0 ? NaN : sxy / denom, n };
}

// OLS via normal equations (X'X)b = X'y, Gaussian elimination. X includes
// the intercept column. Returns coefficients; used to residualize y on a
// set of controls so a follow-on correlation reads the MARGINAL signal.
function olsResiduals(y: number[], controls: number[][]): number[] {
  const n = y.length;
  const k = controls.length; // number of control predictors
  // Design matrix rows: [1, c1, c2, ...]
  const X: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = [1];
    for (let j = 0; j < k; j++) row.push(controls[j][i]);
    X.push(row);
  }
  const p = k + 1;
  // Normal equations
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  // Solve XtX b = Xty (Gaussian elimination with partial pivoting)
  const A = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < p; col++) {
    let piv = col;
    for (let r = col + 1; r < p; r++)
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = A[r][col] / d;
      for (let c = col; c <= p; c++) A[r][c] -= f * A[col][c];
    }
  }
  const b = new Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    const d = A[i][i];
    b[i] = Math.abs(d) < 1e-12 ? 0 : A[i][p] / d;
  }
  // residual_i = y_i - Xb_i
  return y.map((yi, i) => {
    let pred = 0;
    for (let a = 0; a < p; a++) pred += b[a] * X[i][a];
    return yi - pred;
  });
}

async function loadOutcomes(): Promise<Map<string, number>> {
  const oc = await pageAll(
    "historical_outcomes",
    "player_id,season,ppr_points,week",
    (q) => q.is("week", null),
  );
  const m = new Map<string, number>();
  for (const r of oc) m.set(`${r.player_id}:${r.season}`, Number(r.ppr_points) || 0);
  return m;
}

async function snapshot(date: string): Promise<MV[]> {
  return (await pageAll(
    "historical_market_values",
    "player_id,overall_rank,position,raw_attributes",
    (q) =>
      q.eq("source", "ktc").eq("format", FORMAT).eq("snapshot_date", date),
  )) as MV[];
}

type Row = {
  id: string;
  pos: string;
  rank: number; // snapshot rank (market opinion)
  fwdDelta: number; // snapshotRank - forwardRank (+ = climbed = gained value)
  fellOut: boolean;
  snap: number | null;
  tpg: number | null;
  priorPpr: number | null; // null when no outcomes for the prior season
  age: number | null;
};

async function buildVintage(args: {
  snapDate: string;
  fwdDate: string;
  priorSeason: string;
  ppr: Map<string, number>;
  hasPriorProd: boolean;
}): Promise<Row[]> {
  const { snapDate, fwdDate, priorSeason, ppr, hasPriorProd } = args;
  const snap = await snapshot(snapDate);
  const fwd = await snapshot(fwdDate);
  const fwdRank = new Map<string, number>();
  for (const r of fwd) if (r.overall_rank != null) fwdRank.set(r.player_id, r.overall_rank);
  const WORST = Math.max(...[...fwdRank.values()], 450) + 25;
  const stats: Map<string, PlayerSeasonStats> = await getSeasonStats(priorSeason);
  const rows: Row[] = [];
  for (const m of snap) {
    if (m.overall_rank == null || m.overall_rank < BAND_LO || m.overall_rank > BAND_HI)
      continue;
    const pos = (m.position ?? "").toUpperCase();
    const opp = buildOpportunityProfile(stats.get(m.player_id));
    const fr = fwdRank.get(m.player_id);
    rows.push({
      id: m.player_id,
      pos,
      rank: m.overall_rank,
      fwdDelta: m.overall_rank - (fr ?? WORST),
      fellOut: fr == null,
      snap: opp.snap_share,
      tpg: opp.targets_per_game,
      priorPpr: hasPriorProd ? (ppr.get(`${m.player_id}:${priorSeason}`) ?? 0) : null,
      age: typeof m.raw_attributes?.age === "number" ? m.raw_attributes.age : null,
    });
  }
  return rows;
}

function reportCorr(label: string, rows: Row[], key: "snap" | "tpg") {
  const usable = rows.filter((r) => r[key] != null);
  const xs = usable.map((r) => r[key] as number);
  const ys = usable.map((r) => r.fwdDelta);
  const { r, n } = pearson(xs, ys);
  console.log(`  ${label.padEnd(26)} n=${String(n).padStart(3)}  corr(${key}, fwdValueDelta) = ${isNaN(r) ? "n/a" : r.toFixed(3)}`);
}

function reportResidualCorr(rows: Row[]) {
  // Marginal opportunity signal: residualize forward value on prior
  // production AND current market rank, then correlate snap share with the
  // residual. A positive residual corr = opportunity predicts forward value
  // the market did NOT already price. Near-zero = the market already has it.
  const usable = rows.filter((r) => r.snap != null && r.priorPpr != null);
  if (usable.length < 8) {
    console.log(`  (residualized) n=${usable.length} too small for a residual read`);
    return;
  }
  const y = usable.map((r) => r.fwdDelta);
  const ctrlProd = usable.map((r) => r.priorPpr as number);
  const ctrlRank = usable.map((r) => r.rank);
  const snap = usable.map((r) => r.snap as number);
  const residProd = olsResiduals(y, [ctrlProd]);
  const residBoth = olsResiduals(y, [ctrlProd, ctrlRank]);
  const cP = pearson(snap, residProd);
  const cB = pearson(snap, residBoth);
  console.log(`  (residual on prior PPR)            n=${cP.n}  corr(snap, resid) = ${cP.r.toFixed(3)}`);
  console.log(`  (residual on prior PPR + mkt rank) n=${cB.n}  corr(snap, resid) = ${cB.r.toFixed(3)}`);
}

function reportStratified(rows: Row[]) {
  // Control for production by proven/unproven, then split each by snap-share
  // median; compare median forward value delta. Non-parametric, robust to
  // small n. high-opp beating low-opp WITHIN a production bucket is the
  // marginal opportunity signal in plain medians.
  const usable = rows.filter((r) => r.snap != null && r.priorPpr != null);
  if (usable.length < 8) {
    console.log("  (stratified) too few rows");
    return;
  }
  const snaps = usable.map((r) => r.snap as number);
  const snapMed = median(snaps);
  for (const [blab, bucket] of [
    ["proven (priorPPR>=50)", usable.filter((r) => (r.priorPpr as number) >= PROVEN_PPR_MIN)],
    ["unproven", usable.filter((r) => (r.priorPpr as number) < PROVEN_PPR_MIN)],
  ] as const) {
    const hi = bucket.filter((r) => (r.snap as number) >= snapMed);
    const lo = bucket.filter((r) => (r.snap as number) < snapMed);
    const hm = median(hi.map((r) => r.fwdDelta));
    const lm = median(lo.map((r) => r.fwdDelta));
    const edge = hi.length && lo.length ? (hm - lm).toFixed(0) : "n/a";
    console.log(
      `  ${blab.padEnd(22)} hi-opp n=${String(hi.length).padStart(2)} medΔ=${(isNaN(hm) ? 0 : hm).toFixed(0).padStart(5)} | lo-opp n=${String(lo.length).padStart(2)} medΔ=${(isNaN(lm) ? 0 : lm).toFixed(0).padStart(5)} | hi-lo edge=${edge}`,
    );
  }
}

function reportAgeCut(rows: Row[]) {
  // The young-riser thesis (the founder's Mitchell case): a YOUNG player
  // (age <= 24) with a real earned role should out-gain the market. If
  // opportunity has any value-scale signal, it should be strongest here,
  // age-adjusted, per the grounding. Tests it directly.
  const young = rows.filter((r) => r.age != null && r.age <= 24 && r.snap != null);
  const older = rows.filter((r) => r.age != null && r.age > 24 && r.snap != null);
  const cy = pearson(young.map((r) => r.snap as number), young.map((r) => r.fwdDelta));
  console.log(`  young (<=24)  n=${cy.n}  corr(snap, fwdValueDelta) = ${isNaN(cy.r) ? "n/a" : cy.r.toFixed(3)}`);
  if (young.length >= 6) {
    const med = median(young.map((r) => r.snap as number));
    const hi = young.filter((r) => (r.snap as number) >= med);
    const lo = young.filter((r) => (r.snap as number) < med);
    console.log(
      `    young hi-opp n=${hi.length} medΔ=${median(hi.map((r) => r.fwdDelta)).toFixed(0)} | young lo-opp n=${lo.length} medΔ=${median(lo.map((r) => r.fwdDelta)).toFixed(0)}`,
    );
  }
  console.log(`  older (>24)   n=${older.length} (for contrast)`);
}

async function main() {
  const ppr = await loadOutcomes();

  console.log("=".repeat(78));
  console.log("STAGE 2b - does prior-season OPPORTUNITY predict forward dynasty VALUE");
  console.log(`KTC ${FORMAT.toUpperCase()} band ${BAND_LO}-${BAND_HI}. Value = rank movement (+ = climbed). Washouts kept.`);
  console.log("=".repeat(78));

  // Vintage A: clean prior (prod+opp) + 10mo forward value.
  const A = await buildVintage({
    snapDate: "2023-10-01",
    fwdDate: "2024-08-13",
    priorSeason: "2022",
    ppr,
    hasPriorProd: true,
  });
  console.log(`\n[VINTAGE A] snap 2023-10-01 -> fwd 2024-08-13 (~10mo). prior opp+prod = 2022.`);
  console.log(`  rows=${A.length}  with snap share=${A.filter((r) => r.snap != null).length}  fell out of fwd=${A.filter((r) => r.fellOut).length}`);
  console.log("  -- raw correlation (opportunity vs forward value) --");
  reportCorr("ALL", A, "snap");
  for (const pos of ["QB", "RB", "WR", "TE"]) reportCorr(pos, A.filter((r) => r.pos === pos), "snap");
  reportCorr("WR/TE targets/g", A.filter((r) => r.pos === "WR" || r.pos === "TE"), "tpg");
  console.log("  -- marginal signal (residualized) --");
  reportResidualCorr(A);
  console.log("  -- stratified medians (production-controlled) --");
  reportStratified(A);
  console.log("  -- age-conditioned (the young-riser thesis) --");
  reportAgeCut(A);

  // Vintage B: 24mo forward value, opportunity from 2021 /stats, no prod ctrl.
  const B = await buildVintage({
    snapDate: "2022-08-14",
    fwdDate: "2024-08-13",
    priorSeason: "2021",
    ppr,
    hasPriorProd: false,
  });
  console.log(`\n[VINTAGE B] snap 2022-08-14 -> fwd 2024-08-13 (~24mo). prior opp = 2021 /stats (no prod control).`);
  console.log(`  rows=${B.length}  with snap share=${B.filter((r) => r.snap != null).length}  fell out of fwd=${B.filter((r) => r.fellOut).length}`);
  if (B.filter((r) => r.snap != null).length < 10) {
    console.log("  2021 /stats coverage too thin to read (Sleeper may not serve that season). Skipping.");
  } else {
    console.log("  -- raw correlation (opportunity vs forward value) --");
    reportCorr("ALL", B, "snap");
    for (const pos of ["QB", "RB", "WR", "TE"]) reportCorr(pos, B.filter((r) => r.pos === pos), "snap");
  }

  console.log("\n" + "=".repeat(78));
  console.log("READING: positive residual corr = opportunity predicts forward VALUE");
  console.log("the market has NOT already priced (a signal worth wiring as a prior).");
  console.log("Near-zero = the market already prices it (no marginal edge).");
  console.log("CAVEAT: one clean vintage, deep-tier band, KTC rank as the value proxy");
  console.log("(non-stationary as players enter), small per-position n. DIRECTIONAL ONLY.");
  console.log("Gates the methodology audit before any Stage 3 value/projection wiring.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
