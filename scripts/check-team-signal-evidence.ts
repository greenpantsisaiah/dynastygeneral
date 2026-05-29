/**
 * Live evidence-stack check for Phase B #1 (sig-scheme32).
 *
 * NOT a historical backtest. Confirms the LIVE rubric now reads the
 * freshly-written team_signals scheme columns: for representative
 * players it calls `evaluateForPlayer` (via the canonical
 * `getPlayerSignalsMap` + `getTeamSignalsMap` readers) and prints the
 * evidence_stack, highlighting the contributions sourced from the new
 * signals (scheme_tag, pass_rate_neutral, personnel_12_rate, oc tenure /
 * first-year, first-time HC).
 *
 * Read-only. Run: npx tsx --tsconfig tsconfig.json scripts/check-team-signal-evidence.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import {
  getPlayerSignalsMap,
  getTeamSignalsMap,
} from "@/lib/players/player-signals";
import { evaluateForPlayer } from "@/lib/engine/evaluation/wiring";
import { __dumpAllPlayers, humanize } from "@/lib/players/cache";
import type { HumanPlayer } from "@/lib/players/cache";

const TEAM_SIGNAL_SOURCES = new Set([
  "scheme_pass_heavy",
  "pass_rate_neutral",
  "personnel_12_rate",
  "oc_continuity",
  "oc_first_year",
  "oc_first_year_te_penalty",
  "first_time_hc_tier1_qb",
  "late_round_qb_hit",
]);

type Target = {
  label: string;
  position: "WR" | "QB" | "TE";
  // Predicate over the team_signals row to pick the team we want.
  pickTeam: (t: Record<string, unknown>) => boolean;
  // Force a market prior so tier-gated reads (e.g. first-time-HC tier-1
  // QB) actually fire. Null lets the rubric fall back.
  ktcValue: number | null;
};

const TARGETS: Target[] = [
  {
    label: "WR on a pass-heavy scheme (high pass_rate_neutral)",
    position: "WR",
    pickTeam: (t) =>
      ["mcvay", "shanahan", "spread", "air_raid"].includes(
        String(t.scheme_tag),
      ) && Number(t.pass_rate_neutral) >= 0.55,
    ktcValue: 7000,
  },
  {
    label: "QB on a stable-OC team (oc_tenure_yrs >= 3)",
    position: "QB",
    pickTeam: (t) => Number(t.oc_tenure_yrs) >= 3,
    ktcValue: 7000,
  },
  {
    label: "QB on a rookie-HC team (hc_first_time_flag = true), tier 1",
    position: "QB",
    pickTeam: (t) => t.hc_first_time_flag === true,
    ktcValue: 9000, // force tier 1 so first_time_hc_tier1_qb can fire
  },
  {
    label: "TE on a high-12-personnel team (e.g. CLE)",
    position: "TE",
    pickTeam: (t) => Number(t.personnel_12_rate) >= 0.30,
    ktcValue: 5000,
  },
];

async function main() {
  const [playerMap, teamMap, dump] = await Promise.all([
    getPlayerSignalsMap(),
    getTeamSignalsMap(),
    __dumpAllPlayers(),
  ]);

  const humans = new Map<string, HumanPlayer>();
  for (const p of dump) humans.set(p.player_id, humanize(p));

  console.log(
    `[evidence-check] players=${playerMap.size} teams=${teamMap.size} sleeper=${dump.size ?? humans.size}`,
  );
  console.log(
    "[evidence-check] LIVE rubric read of newly-written team_signals. NOT a historical backtest.\n",
  );

  for (const target of TARGETS) {
    // Find a team matching the predicate.
    let chosenTeam: string | null = null;
    for (const [team, row] of teamMap) {
      if (target.pickTeam(row as unknown as Record<string, unknown>)) {
        chosenTeam = team;
        break;
      }
    }
    if (!chosenTeam) {
      console.log(`## ${target.label}\n  NO TEAM matched predicate.\n`);
      continue;
    }

    // Find a player at the position on that team, preferring the
    // highest-profile (lowest search_rank via the Sleeper dump).
    const candidates: { id: string; human: HumanPlayer }[] = [];
    for (const [id, sig] of playerMap) {
      if (sig.position !== target.position) continue;
      if (sig.team !== chosenTeam) continue;
      const human = humans.get(id);
      if (!human) continue;
      candidates.push({ id, human });
    }
    if (candidates.length === 0) {
      console.log(
        `## ${target.label}\n  team=${chosenTeam} but NO ${target.position} found in player_signals.\n`,
      );
      continue;
    }
    // Prefer a player with a real age (proxy for active starter).
    candidates.sort((a, b) => (b.human.age ?? 0) - (a.human.age ?? 0));
    const chosen = candidates[0];
    const sig = playerMap.get(chosen.id)!;
    const team = teamMap.get(chosenTeam)!;

    const out = evaluateForPlayer({
      player_signals: sig,
      team_signals: team,
      ktc_value: target.ktcValue,
      adp: null,
      search_rank: null,
      position: target.position,
      age: chosen.human.age,
      years_exp: chosen.human.yearsExp ?? undefined,
    });

    const t = team as unknown as Record<string, unknown>;
    console.log(`## ${target.label}`);
    console.log(
      `  player=${chosen.human.name} (${target.position}, ${chosenTeam}, age ${chosen.human.age ?? "?"})`,
    );
    console.log(
      `  team_signals: scheme=${t.scheme_tag} pass_rate=${t.pass_rate_neutral} p12=${t.personnel_12_rate} oc_tenure=${t.oc_tenure_yrs} oc_first_year=${t.oc_first_year_with_team_flag} hc_first=${t.hc_first_time_flag}`,
    );
    if (!out) {
      console.log("  evaluate() returned null.\n");
      continue;
    }
    console.log(
      `  point_estimate=${out.point_estimate.toFixed(2)} band=[${out.variance_band.lo.toFixed(1)}, ${out.variance_band.hi.toFixed(1)}] confidence=${out.confidence.toFixed(2)}`,
    );
    console.log("  evidence_stack:");
    for (const e of out.evidence_stack) {
      const tag = TEAM_SIGNAL_SOURCES.has(e.signal) ? "  <-- NEW team signal" : "";
      console.log(
        `    [${e.layer}] ${e.signal}: contribution=${e.contribution.toFixed(2)} weight=${e.weight.toFixed(2)} (${e.source})${tag}`,
      );
    }
    const teamHits = out.evidence_stack.filter((e) =>
      TEAM_SIGNAL_SOURCES.has(e.signal),
    );
    console.log(
      `  >> ${teamHits.length} team-signal evidence row(s); ${teamHits.filter((e) => Math.abs(e.contribution) > 0).length} with non-zero contribution.\n`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
