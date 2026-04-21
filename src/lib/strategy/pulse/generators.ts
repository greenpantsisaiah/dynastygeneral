/**
 * Pulse generators. Each function takes the league snapshot and
 * returns 0+ Pulse insights. Generators are deterministic. the LLM
 * stays out of this layer.
 *
 * Add new generators here as we learn what early-draft / mid-draft
 * users want to see. Each should be cheap and stateless.
 */

import type { LeagueSnapshot } from "../league-state/snapshot";
import type { Position } from "../archetypes/schema";
import type { Pulse } from "./types";
import { slotForPickNo } from "@/lib/sleeper/snake";

const SCORING_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

const POSITION_LABEL: Record<Position, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DST: "DST",
};

// =====================================================================
// Format note. always shown. Sets context for everything else.
// =====================================================================

export function formatNote(snap: LeagueSnapshot): Pulse[] {
  const notes: string[] = [];
  if (snap.format === "superflex") {
    notes.push("Superflex makes QB the most premium dynasty position");
  } else if (snap.format === "2qb") {
    notes.push("2QB starts further inflate QB demand");
  }
  if (snap.scoring.includes("TE-premium")) {
    notes.push("TE-premium amplifies elite TE scarcity");
  }
  if (snap.scoring.includes("PPR")) {
    notes.push("Full PPR rewards target volume. pass-game WRs and pass-catching backs hold value");
  }

  if (notes.length === 0) return [];

  return [
    {
      id: "format-note",
      severity: "info",
      category: "format-note",
      headline: `${snap.format.toUpperCase()} · ${snap.scoring.join(" · ")}`,
      body: notes.join(". ") + ".",
      stats: [
        { label: "Format", value: snap.format.toUpperCase() },
        { label: "Teams", value: String(snap.total_teams) },
        { label: "Scoring", value: snap.scoring.join(" + ") },
      ],
    },
  ];
}

// =====================================================================
// QB pace. most actionable in superflex / 2QB. How fast is QB going?
// =====================================================================

export function qbPace(snap: LeagueSnapshot): Pulse[] {
  if (snap.draft.next_pick_no == null) return [];
  if (snap.draft.picks_made.length === 0) return [];

  const picksMade = snap.draft.picks_made.length;
  const qbCount = snap.draft.picks_made.filter((p) => p.position === "QB").length;
  const totalTeams = snap.total_teams;

  // Expected pace baselines:
  //   superflex: ~1.5 QBs per round average (early rounds heavier)
  //   1qb: ~0.5 QBs per round average
  const round = Math.ceil(picksMade / totalTeams);
  const expectedRate =
    snap.format === "superflex" ? 1.5 : snap.format === "2qb" ? 1.8 : 0.5;
  const expectedQbs = Math.round(expectedRate * round);

  // Only fire if we have enough sample to compare meaningfully
  if (picksMade < Math.max(4, totalTeams / 3)) return [];

  const delta = qbCount - expectedQbs;
  const teamsWithoutQb = snap.agg.teams_without_position_after_round(
    "QB",
    round,
  );

  if (snap.format === "superflex" || snap.format === "2qb") {
    if (delta <= -2) {
      return [
        {
          id: "qb-pace-light",
          severity: "notable",
          category: "position-pace",
          headline: `QB pace is light. cartel window opening`,
          body: `${qbCount} QBs in ${picksMade} picks (expected ~${expectedQbs} for ${snap.format}). ${teamsWithoutQb}/${totalTeams} teams are still QB-less. If this pace holds through Round 2, the 2-3 teams that load QBs early will hold premium leverage all season.`,
          stats: [
            { label: "QBs taken", value: String(qbCount) },
            { label: "Expected", value: `~${expectedQbs}` },
            { label: "Teams w/o QB", value: `${teamsWithoutQb}/${totalTeams}` },
          ],
        },
      ];
    }
    if (delta >= 2) {
      return [
        {
          id: "qb-pace-heavy",
          severity: "notable",
          category: "position-pace",
          headline: `QB run in progress. premium tier evaporating`,
          body: `${qbCount} QBs already gone in ${picksMade} picks (expected ~${expectedQbs}). The startable-QB pool is thinning fast. your window to get a top-tier anchor is closing.`,
          stats: [
            { label: "QBs taken", value: String(qbCount) },
            { label: "Expected", value: `~${expectedQbs}` },
            { label: "Teams w/o QB", value: `${teamsWithoutQb}/${totalTeams}` },
          ],
        },
      ];
    }
  }

  return [];
}

// =====================================================================
// Position run. last N picks heavily clustered at one position.
// =====================================================================

export function positionRun(snap: LeagueSnapshot): Pulse[] {
  const picks = snap.draft.picks_made;
  const WINDOW = Math.min(6, picks.length);
  if (WINDOW < 4) return [];
  const recent = picks.slice(-WINDOW);
  const counts: Partial<Record<Position, number>> = {};
  for (const p of recent) {
    if (!p.position) continue;
    counts[p.position] = (counts[p.position] ?? 0) + 1;
  }
  const out: Pulse[] = [];
  for (const pos of SCORING_POSITIONS) {
    const c = counts[pos] ?? 0;
    if (c >= Math.ceil(WINDOW * 0.6) && c >= 4) {
      out.push({
        id: `position-run-${pos.toLowerCase()}`,
        severity: "notable",
        category: "position-run",
        headline: `${POSITION_LABEL[pos]} run in progress`,
        body: `${c} of the last ${WINDOW} picks have been ${POSITION_LABEL[pos]}. Tier drop-off accelerating. the value advantage swings to teams that pivot away from ${POSITION_LABEL[pos]} now.`,
        stats: [
          { label: "Last picks", value: `${WINDOW}` },
          { label: `${POSITION_LABEL[pos]} taken`, value: String(c) },
        ],
      });
    }
  }
  return out;
}

// =====================================================================
// Your turn. countdown and who's between you and the clock.
// =====================================================================

export function yourTurn(snap: LeagueSnapshot): Pulse[] {
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return [];
  if (snap.draft.next_pick_no == null) return [];

  // Walk the snake forward from next_pick_no to find my next pick
  const totalTeams = snap.total_teams;
  const draftType = snap.draft.type ?? "snake";

  function rosterAtPick(pickNo: number): number | null {
    const { slot } = slotForPickNo(pickNo, totalTeams, {
      type: draftType,
      reversalRound: snap.draft.reversal_round,
    });
    const direct = snap.draft.slot_to_roster_id[slot];
    if (direct != null) return direct;
    const sample = snap.draft.picks_made.find(
      (p) =>
        slotForPickNo(p.pick_no, totalTeams, {
          type: draftType,
          reversalRound: snap.draft.reversal_round,
        }).slot === slot,
    );
    return sample?.roster_id ?? null;
  }

  let myNextPickNo: number | null = null;
  let picksUntilMe: number | null = null;
  for (
    let n = snap.draft.next_pick_no;
    n <= snap.draft.next_pick_no + totalTeams * 3;
    n++
  ) {
    const rid = rosterAtPick(n);
    if (rid === me.roster_id) {
      myNextPickNo = n;
      picksUntilMe = n - snap.draft.next_pick_no;
      break;
    }
  }

  if (myNextPickNo == null || picksUntilMe == null) return [];

  // Only surface if you're within 5 picks
  if (picksUntilMe > 5) return [];

  // Resolve the on-clock owner names between now and your turn
  const between: string[] = [];
  for (let n = snap.draft.next_pick_no; n < myNextPickNo; n++) {
    const rid = rosterAtPick(n);
    if (rid == null) continue;
    const r = snap.rosters.find((x) => x.roster_id === rid);
    if (r?.owner_name) between.push(r.owner_name);
  }

  const round = Math.ceil(myNextPickNo / totalTeams);
  const within = ((myNextPickNo - 1) % totalTeams) + 1;
  const label = `${round}.${within}`;

  if (picksUntilMe === 0) {
    return [
      {
        id: "your-turn-now",
        severity: "critical",
        category: "your-turn",
        headline: `You're on the clock. Pick ${label}`,
        body: `Make the call. Cross-reference your locked archetype, the firing openings, and the latest position run before you click.`,
        stats: [{ label: "Pick", value: label }],
      },
    ];
  }

  return [
    {
      id: "your-turn-soon",
      severity: picksUntilMe <= 2 ? "critical" : "notable",
      category: "your-turn",
      headline: `Your pick: ${label} (${picksUntilMe} away)`,
      body: between.length > 0
        ? `Between you and the clock: ${between.join(" → ")}.`
        : `${picksUntilMe} picks until your turn. Lock your archetype now if you haven't.`,
      stats: [
        { label: "Picks away", value: String(picksUntilMe) },
        { label: "Your pick", value: label },
      ],
    },
  ];
}

// =====================================================================
// Opening preview. which archetype openings would fire if Round 2
// completes with the current QB-less count.
// =====================================================================

export function openingPreview(snap: LeagueSnapshot): Pulse[] {
  if (snap.draft.next_pick_no == null) return [];
  const round = Math.ceil(snap.draft.next_pick_no / snap.total_teams);

  // Only meaningful during round 2 (between rounds, the opening either
  // already fired in the ranker or didn't).
  if (round !== 2) return [];

  const teamsWithoutQb = snap.agg.teams_without_position_after_round("QB", 2);
  if (teamsWithoutQb < 5) return [];

  return [
    {
      id: "opening-preview-qb-cartel",
      severity: "notable",
      category: "opening-preview",
      headline: "QB Cartel opening forming",
      body: `${teamsWithoutQb}/${snap.total_teams} teams currently QB-less through 2 rounds. If the count holds at 5+ when Round 2 wraps, the QB Cartel archetype unlocks with full opening boost. corner the market early before scarcity prices rise.`,
      stats: [
        {
          label: "QB-less teams",
          value: `${teamsWithoutQb}/${snap.total_teams}`,
        },
        { label: "Threshold", value: "≥5" },
      ],
    },
  ];
}
