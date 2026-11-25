/**
 * Counterparty-scan regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/counterparty-scan.test.ts
 *
 * Locks the 2026-11-25 founder report (Dynasty Disasters): trade advice on
 * a C.J. Stroud offer from jwatts0723 never surfaced that jwatts' Drake Maye
 * (FantasyCalc 6145, above Stroud's 5114) had just fractured his ankle. The
 * fixture is that roster's top end as it stood that week.
 */

import {
  counterpartyRecord,
  injuredNow,
  isUnavailableNow,
  normalizeInjuryStatus,
  standingsRanks,
  type CounterpartyPlayer,
} from "../src/lib/coach/counterparty-scan";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function player(
  name: string,
  pos: string,
  value: number | null,
  injury_status: string | null,
): CounterpartyPlayer {
  return {
    name,
    pos,
    team: null,
    age: null,
    value,
    position_rank: null,
    overall_rank: null,
    injury_status,
  };
}

console.log("\n── injury status normalization ──");
check("null stays null", normalizeInjuryStatus(null) === null);
check("blank is healthy", normalizeInjuryStatus("  ") === null);
check("IR is unavailable", isUnavailableNow("IR"));
check("Out is unavailable", isUnavailableNow("Out"));
check("PUP is unavailable", isUnavailableNow("PUP"));
check("Sus is unavailable", isUnavailableNow("Sus"));
check("Questionable is NOT unavailable", !isUnavailableNow("Questionable"));
check("healthy is NOT unavailable", !isUnavailableNow(null));

console.log("\n── Dynasty Disasters: jwatts0723 roster, week 12 ──");
{
  const roster: CounterpartyPlayer[] = [
    player("Brock Bowers", "TE", 7387, null),
    player("CeeDee Lamb", "WR", 6972, null),
    player("Drake Maye", "QB", 6145, "IR"),
    player("Kenneth Walker III", "RB", 6134, null),
    player("Tyler Shough", "QB", 3219, "Questionable"),
    player("Quinshon Judkins", "RB", 2652, null),
    player("Deep stash", "WR", null, "Out"),
  ];
  const hurt = injuredNow(roster);
  check("surfaces Drake Maye as an injured asset", hurt.some((p) => p.name === "Drake Maye"));
  check("Maye leads the list (highest value)", hurt[0]?.name === "Drake Maye");
  check("unvalued injured player sorts last", hurt[hurt.length - 1]?.name === "Deep stash");
  check("questionable Shough is not listed", !hurt.some((p) => p.name === "Tyler Shough"));
  check("healthy players are not listed", hurt.length === 2, `got ${hurt.length}`);
}

console.log("\n── standings ──");
{
  const rows = [
    { roster_id: 1, wins: 6, losses: 5, ties: 0 },
    { roster_id: 7, wins: 0, losses: 11, ties: 0 },
    { roster_id: 11, wins: 9, losses: 2, ties: 0 },
    { roster_id: 8, wins: 6, losses: 5, ties: 0 },
  ];
  const ranks = standingsRanks(rows);
  check("best record ranks 1", ranks.get(11) === 1);
  check("equal records share a rank", ranks.get(1) === 2 && ranks.get(8) === 2);
  check("0-11 ranks last", ranks.get(7) === 4);
  const rec = counterpartyRecord(rows[0], ranks, 12);
  check(
    "record carries W-L-T + rank of N",
    rec.wins === 6 && rec.losses === 5 && rec.standing_rank === 2 && rec.of === 12,
  );
  const preseason = standingsRanks([
    { roster_id: 1, wins: 0, losses: 0, ties: 0 },
    { roster_id: 2, wins: 0, losses: 0, ties: 0 },
  ]);
  check("no games played gives no rank", preseason.size === 0);
  check(
    "record before games has null rank",
    counterpartyRecord({ roster_id: 1, wins: 0, losses: 0, ties: 0 }, preseason, 12)
      .standing_rank === null,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
