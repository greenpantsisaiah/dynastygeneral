/**
 * Value-flip snapshot diff (Phase 4 gate, MODEL_LIVE_PLAN Phase D / value-pipe plan).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/value-flip-diff.ts
 *
 * Shows exactly what the user-visible scoring value changes when
 * VALUE_MODE flips from "market" (the shadow default, FantasyCalc
 * passthrough) to "rubric" (evaluate().point_estimate). This is the
 * founder-eyeball artifact the plan gates the flip on: no public ship
 * until the per-player diffs read defensibly (no Adonai-Mitchell
 * surprise, no replacement body floating into a startable tier).
 *
 * It does NOT mutate VALUE_MODE. It runs the EXACT production seam code
 * (resolvePlayerValues -> resolveEnrichedPlayers -> evaluateForPlayer ->
 * scoringValueFor) once and reads BOTH modes off the same evaluate()
 * output: market = scoringValueFor(v, out, "market") (== v.value),
 * rubric = scoringValueFor(v, out, "rubric") (== out.point_estimate ??
 * v.value). So the diff is the live flip, computed without touching the
 * const.
 *
 * Cohort: the top-N FantasyCalc dynasty players per format (the players
 * that actually drive standing calls), joined to player_signals via the
 * enriched resolver. With production signals sparse (Phase B finding),
 * evaluate() blends back to the market prior, so most deltas are small
 * by construction. The artifact's job is to surface the players where
 * the rubric DOES move and let the founder judge each.
 *
 * Fixtures: the format axis (1QB-PPR, Superflex-PPR, TE-Premium-PPR).
 * The standing-call-per-fixture half of the plan's battery needs a live
 * league snapshot; this script covers the value-scale half (every
 * surface reads playerValuesById, so the value diff is the root cause of
 * any standing-call change). Run scripts/value-flip-standing-call.ts (if
 * present) or the live hub in both modes for the decision-level check.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { resolvePlayerValues, type PlayerValue } from "@/lib/players/values";
import { resolveEnrichedPlayers } from "@/lib/players/enriched-player";
import {
  evaluateForPlayer,
  isRubricPriorDriven,
} from "@/lib/engine/evaluation/wiring";
import { scoringValueFor } from "@/lib/players/value-mode";
import type { EvaluationOutput } from "@/lib/engine/evaluation/types";

type Fixture = {
  label: string;
  isSuperflex: boolean;
  isPpr: boolean;
  isHalfPpr: boolean;
  isTePremium: boolean;
};

const FIXTURES: Fixture[] = [
  {
    label: "1QB · PPR · standard TE",
    isSuperflex: false,
    isPpr: true,
    isHalfPpr: false,
    isTePremium: false,
  },
  {
    label: "Superflex · PPR · standard TE",
    isSuperflex: true,
    isPpr: true,
    isHalfPpr: false,
    isTePremium: false,
  },
  {
    label: "1QB · PPR · TE-Premium",
    isSuperflex: false,
    isPpr: true,
    isHalfPpr: false,
    isTePremium: true,
  },
];

// How many top-by-market players to evaluate per fixture. The startable
// tier and standing-call candidates live in the top couple hundred; 250
// covers them with margin without paying for the long tail.
const COHORT_SIZE = 250;
// How many of the largest absolute movers to print per fixture.
const SHOW_TOP_MOVERS = 40;
// A market-value floor below which a player is "replacement-ish". The
// safety check flags any such player the rubric lifts INTO the top tier.
const REPLACEMENT_VALUE_MAX = 20;
const STARTABLE_TIER_VALUE_MIN = 40;

type Row = {
  id: string;
  name: string;
  position: string | null;
  age: number | null;
  market: number;
  rubric: number;
  delta: number;
  priorDriven: boolean | null;
  confidence: number | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

async function runFixture(fx: Fixture): Promise<void> {
  console.log("\n" + "=".repeat(72));
  console.log(`FIXTURE: ${fx.label}`);
  console.log("=".repeat(72));

  // 1) Pull the whole FantasyCalc dataset for this format, then take the
  //    top COHORT_SIZE by normalized value. resolvePlayerValues needs an
  //    id list, so we first fetch a broad set; the simplest broad set is
  //    the player_signals population the rubric reads. But the cohort we
  //    care about is "top market players", so we fetch values for the
  //    signals population and sort by value.
  //
  //    The enriched resolver fetches FantasyCalc itself when given a
  //    valueFormat and no valueMap, scoped to the ids we pass. So we need
  //    the id universe first. Read it from player_signals (the rubric's
  //    own population); that is exactly the set evaluate() can score.
  const { getAdminClient } = await import("@/lib/supabase/admin");
  const sb = getAdminClient();
  const { data: sigRows, error } = await sb
    .from("player_signals")
    .select("player_id");
  if (error) {
    console.error(`  player_signals read failed: ${error.message}`);
    return;
  }
  const universe = (sigRows ?? [])
    .map((r: { player_id: string }) => r.player_id)
    .filter(Boolean);
  if (universe.length === 0) {
    console.error("  player_signals is empty; cannot build a cohort.");
    return;
  }

  // 2) Resolve market values for the universe, then take the top cohort.
  const valueMap: Map<string, PlayerValue> = await resolvePlayerValues({
    ids: universe,
    isSuperflex: fx.isSuperflex,
    isPpr: fx.isPpr,
    isHalfPpr: fx.isHalfPpr,
    isTePremium: fx.isTePremium,
  });
  const cohort = [...valueMap.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, COHORT_SIZE);
  const cohortIds = cohort.map((v) => v.player_id);

  // 3) Resolve rubric inputs for the cohort (hand down the valueMap so no
  //    second FantasyCalc fetch), exactly as the seam does.
  const enriched = await resolveEnrichedPlayers({
    playerIds: cohortIds,
    valueMap,
  });

  // 4) For each cohort player, run evaluate() and read BOTH modes off it.
  const rows: Row[] = [];
  for (const v of cohort) {
    const e = enriched.get(v.player_id);
    let out: EvaluationOutput | null = null;
    if (e) {
      out = evaluateForPlayer({
        player_signals: e.signals,
        team_signals: e.team_signals,
        ktc_value: e.ktc_value,
        adp: e.adp,
        search_rank: e.search_rank,
        position: e.position,
        age: e.age,
        years_exp: e.years_exp,
      });
    }
    const market = scoringValueFor(v, out, "market");
    const rubric = scoringValueFor(v, out, "rubric");
    rows.push({
      id: v.player_id,
      name: v.name,
      position: v.position,
      age: e?.age ?? null,
      market: round1(market),
      rubric: round1(rubric),
      delta: round1(rubric - market),
      priorDriven: out ? isRubricPriorDriven(out) : null,
      confidence: out ? round1(out.confidence) : null,
    });
  }

  // 5) Aggregate stats.
  const moved = rows.filter((r) => Math.abs(r.delta) >= 0.05);
  const evaluated = rows.filter((r) => r.confidence != null);
  const priorDrivenCount = rows.filter((r) => r.priorDriven === true).length;
  const absDeltas = rows.map((r) => Math.abs(r.delta));
  const maxAbs = absDeltas.length ? Math.max(...absDeltas) : 0;
  const meanAbs = absDeltas.length
    ? round1(absDeltas.reduce((a, b) => a + b, 0) / absDeltas.length)
    : 0;
  const upMoves = rows.filter((r) => r.delta > 0).length;
  const downMoves = rows.filter((r) => r.delta < 0).length;

  console.log(
    `\n  cohort ${rows.length} · evaluated ${evaluated.length} · ` +
      `no rubric output ${rows.length - evaluated.length}`,
  );
  console.log(
    `  prior-driven ${priorDrivenCount}/${evaluated.length} ` +
      `(rubric leaning on the market, not live evidence)`,
  );
  console.log(
    `  moved (|delta| >= 0.05): ${moved.length} · up ${upMoves} · down ${downMoves}`,
  );
  console.log(`  mean |delta| ${meanAbs} · max |delta| ${maxAbs} (0-100 scale)`);

  // 6) Safety check: any replacement-ish market player the rubric lifts
  //    into the startable tier (the "replacement body floats up" risk the
  //    plan calls out).
  const tierJumps = rows.filter(
    (r) =>
      r.market <= REPLACEMENT_VALUE_MAX &&
      r.rubric >= STARTABLE_TIER_VALUE_MIN,
  );
  if (tierJumps.length > 0) {
    console.log(
      `\n  ⚠ TIER-JUMP RISK: ${tierJumps.length} player(s) below market ` +
        `${REPLACEMENT_VALUE_MAX} lifted to >= ${STARTABLE_TIER_VALUE_MIN} by the rubric:`,
    );
    for (const r of tierJumps) {
      console.log(
        `      ${r.name} (${r.position}) market ${r.market} -> rubric ${r.rubric} (+${r.delta})`,
      );
    }
  } else {
    console.log(
      `\n  tier-jump check: clean (no sub-${REPLACEMENT_VALUE_MAX} market ` +
        `player lifted to >= ${STARTABLE_TIER_VALUE_MIN})`,
    );
  }

  // 7) Top movers table.
  const movers = [...rows]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, SHOW_TOP_MOVERS)
    .filter((r) => Math.abs(r.delta) >= 0.05);
  if (movers.length === 0) {
    console.log("\n  no movers at >= 0.05 (pure shadow, every value identical)");
    return;
  }
  console.log(`\n  top ${movers.length} movers by |delta|:`);
  console.log(
    "    " +
      "player".padEnd(24) +
      "pos".padEnd(5) +
      "age".padEnd(5) +
      "market".padStart(8) +
      "rubric".padStart(8) +
      "delta".padStart(8) +
      "  prior?",
  );
  for (const r of movers) {
    console.log(
      "    " +
        r.name.slice(0, 23).padEnd(24) +
        String(r.position ?? "?").padEnd(5) +
        String(r.age ?? "?").padEnd(5) +
        String(r.market).padStart(8) +
        String(r.rubric).padStart(8) +
        String(r.delta >= 0 ? `+${r.delta}` : r.delta).padStart(8) +
        "  " +
        (r.priorDriven === true ? "prior" : r.priorDriven === false ? "live" : "-"),
    );
  }
}

async function main(): Promise<void> {
  console.log("Value-flip snapshot diff: market (shadow) vs rubric (flip target)");
  console.log("Running the live seam in BOTH modes off one evaluate() pass.");
  for (const fx of FIXTURES) {
    await runFixture(fx);
  }
  console.log("\n" + "=".repeat(72));
  console.log("Done. Founder review: do the movers read defensibly?");
  console.log("=".repeat(72));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAIL", e instanceof Error ? `${e.message}\n${e.stack}` : e);
    process.exit(1);
  });
