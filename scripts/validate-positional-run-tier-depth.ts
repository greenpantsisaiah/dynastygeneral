/**
 * Empirically measure the DECIDING VARIABLE behind the "draft against a
 * positional run" question (RESEARCH_CORPUS.md, common-knowledge entry
 * "Draft against a positional run and you bank value on both sides").
 *
 *   npx tsx --tsconfig tsconfig.json scripts/validate-positional-run-tier-depth.ts
 *
 * The claim splits in two:
 *   Half A: the OFF-run positions come cheaper while the run is on.
 *           Near-mechanical (every pick spent on the run is a pick not
 *           bidding against you elsewhere). Not measured here; its
 *           magnitude needs completed-draft pick logs we do not store.
 *   Half B: the RUN position itself comes cheaper to you LATER. This is
 *           CONDITIONAL on the shape of that position's value curve below
 *           the run. Flat/deep tier => waiting is cheap => Half B holds.
 *           Steep cliff after the elite => the run emptied the startable
 *           tier => you bought cheap, not valuable.
 *
 * The deciding variable for Half B is therefore the per-position COST OF
 * WAITING THROUGH A RUN: how much value you give up by taking the next
 * available player at that position after k more of them leave the board.
 * That is a property of the real market value curve, measurable now.
 *
 * Non-circular: it reads the SAME real dynasty market data the pick-value
 * convexity validation used (KTC historical snapshots in
 * historical_market_values), NOT the engine's own scoring. Using the
 * engine to validate the engine would be circular.
 *
 * What this does NOT measure: the realized value-over-ADP a manager
 * actually banks by declining a run in a live draft (Half A magnitude and
 * Half B effect on real drafts). That needs a corpus of completed-draft
 * pick sequences (pick_no, position, who-took-it) which the schema does
 * not currently store. See RESEARCH_CORPUS.md open question 12 + the data
 * collection note at the bottom of this file.
 *
 * READ-ONLY. SELECT queries only; no writes.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

const TEAMS = 12; // structural anchor for the per-team depth lines
const POOL_RANKS = TEAMS * 20; // top 240 overall = the realistic startup pool
const SKILL = ["QB", "RB", "WR", "TE"] as const;
const RUN_SIZES = [4, 8] as const; // a small run and a big run
const SOURCE = "ktc"; // the populated dynasty market source

type Pos = (typeof SKILL)[number];
type Row = { position: string | null; value: number; overall_rank: number | null };

async function latestSnapshot(
  supa: ReturnType<typeof createClient>,
  format: "1qb" | "sf",
): Promise<{ date: string; rows: Row[] }> {
  const { data: dates } = await supa
    .from("historical_market_values")
    .select("snapshot_date")
    .eq("source", SOURCE)
    .eq("format", format)
    .order("snapshot_date", { ascending: false })
    .limit(1);
  const date = (dates?.[0]?.snapshot_date as string) ?? null;
  if (!date) return { date: "(none)", rows: [] };
  const { data } = await supa
    .from("historical_market_values")
    .select("position, value, overall_rank")
    .eq("source", SOURCE)
    .eq("format", format)
    .eq("snapshot_date", date)
    .not("overall_rank", "is", null)
    .lte("overall_rank", POOL_RANKS)
    .order("overall_rank", { ascending: true });
  return { date, rows: (data ?? []) as Row[] };
}

// Within-position value curve, sorted by value descending.
function curveFor(rows: Row[], pos: Pos): number[] {
  return rows
    .filter((r) => (r.position ?? "").toUpperCase() === pos)
    .map((r) => r.value)
    .sort((a, b) => b - a);
}

// Value retained (%) if you let a run of k at this position pass and take
// the next available one, starting from within-position rank d (1-based).
function retainedPct(curve: number[], d: number, k: number): number | null {
  const i = d - 1;
  if (i < 0 || i + k >= curve.length || curve[i] <= 0) return null;
  return (curve[i + k] / curve[i]) * 100;
}

// Mean retained (%) after a run of k across the draftable region, skipping
// the very top (the elite tier you would not be waiting on anyway).
function meanRetained(curve: number[], k: number, startRank = 6): number | null {
  const vals: number[] = [];
  for (let d = startRank; d + k <= curve.length; d++) {
    const r = retainedPct(curve, d, k);
    if (r != null) vals.push(r);
  }
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

function analyze(label: string, rows: Row[]) {
  if (rows.length === 0) {
    console.log(`\n${label}: no data.`);
    return;
  }
  console.log(`\n${label}`);
  console.log("  position depth(pool)  top-of-pos value   value @1/team  @2/team  @3/team");
  const curves: Record<string, number[]> = {};
  for (const pos of SKILL) {
    const c = curveFor(rows, pos);
    curves[pos] = c;
    const at = (n: number) => (c[n - 1] != null ? c[n - 1].toFixed(0) : "  -");
    console.log(
      `  ${pos.padEnd(8)} ${String(c.length).padStart(10)}  ${
        (c[0] ?? 0).toFixed(0).padStart(14)
      }  ${at(TEAMS).padStart(12)}  ${at(2 * TEAMS).padStart(7)}  ${at(3 * TEAMS).padStart(7)}`,
    );
  }

  // Cost of waiting through a run, at the per-team depth anchors.
  for (const k of RUN_SIZES) {
    console.log(`\n  Value RETAINED after a run of ${k} at the position (higher = run more ignorable):`);
    console.log("  position   from @1/team   from @2/team   from @3/team   mean across pool");
    for (const pos of SKILL) {
      const c = curves[pos];
      const fmt = (v: number | null) => (v == null ? "   -" : `${v.toFixed(0)}%`);
      console.log(
        `  ${pos.padEnd(8)} ${fmt(retainedPct(c, TEAMS, k)).padStart(13)}  ${
          fmt(retainedPct(c, 2 * TEAMS, k)).padStart(13)
        }  ${fmt(retainedPct(c, 3 * TEAMS, k)).padStart(13)}  ${
          fmt(meanRetained(c, k)).padStart(15)
        }`,
      );
    }
  }

  // Headline ranking: positions by ignorability (mean retained after a run
  // of 4). The most ignorable position is the one where waiting through a
  // run costs the least value, i.e. Half B is most likely to hold.
  const k = 4;
  const ranked = SKILL.map((pos) => ({ pos, retained: meanRetained(curves[pos], k) }))
    .filter((x) => x.retained != null)
    .sort((a, b) => (b.retained as number) - (a.retained as number));
  console.log(`\n  Run-ignorability ranking (mean value retained after a run of ${k}, most ignorable first):`);
  for (const { pos, retained } of ranked) {
    const verdict =
      (retained as number) >= 90
        ? "DEEP/FLAT: waiting is cheap, a run here is mostly noise (Half B holds)"
        : (retained as number) >= 80
          ? "MODERATE: waiting costs real value, weigh the tier cliff"
          : "CLIFFY: a run here empties the startable tier, the run is a real warning (Half B fails)";
    console.log(`    ${pos}: ${(retained as number).toFixed(0)}% retained -> ${verdict}`);
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    console.log("This script needs read access to historical_market_values.");
    process.exit(1);
  }
  const supa = createClient(url, key);
  console.log("=== Positional-run tier-depth validation (real KTC market data) ===");
  console.log(`Source: ${SOURCE}. League size: ${TEAMS} teams. Pool: top ${POOL_RANKS} overall.`);
  console.log("Measures the DECIDING VARIABLE for Half B: per-position cost of");
  console.log("waiting through a run. It does NOT measure the realized draft-day");
  console.log("edge (that needs completed-draft pick logs; see file header).");

  for (const format of ["sf", "1qb"] as const) {
    const { date, rows } = await latestSnapshot(supa, format);
    analyze(`Format ${format.toUpperCase()} (snapshot ${date}, ${rows.length} players in pool)`, rows);
  }

  console.log("\nInterpretation:");
  console.log("  Half A (off-run positions cheaper during the run) is near-mechanical");
  console.log("  and format-independent; not quantified here.");
  console.log("  Half B (run position cheaper later) holds when the run position is");
  console.log("  DEEP/FLAT (high retained %) and fails when it is CLIFFY (low retained %).");
  console.log("  The ranking above is the real-data answer to 'which runs can I ignore?'");
  console.log("");
  console.log("To close open question 12 (the realized draft-day edge), collect");
  console.log("completed-draft pick sequences (pick_no, position, roster) from Sleeper");
  console.log("finished drafts and measure value-over-ADP for managers who declined a");
  console.log("run vs those who chased it. The schema does not store this today.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
