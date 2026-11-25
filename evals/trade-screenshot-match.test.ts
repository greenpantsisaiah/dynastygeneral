/**
 * Trade screenshot matcher regression. Fixtures transcribe the two real
 * Sleeper layouts the founder sent from Dynasty Disasters (2026-11-25):
 *   1. League chat trade card (heading per manager = what they RECEIVE)
 *   2. Trade offer screen (user's own header cut off, manager null)
 * plus the look-alike case: two active "B. Robinson" RBs.
 *
 *   npx tsx --tsconfig tsconfig.json evals/trade-screenshot-match.test.ts
 */

import {
  matchScreenshotTrade,
  ScreenshotReadError,
  type ExtractedAsset,
  type ExtractedTrade,
  type MatchPlayer,
  type MatchRoster,
} from "../src/lib/trade/screenshot-match";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

const POOL: MatchPlayer[] = [
  { player_id: "9758", first_name: "C.J.", last_name: "Stroud", full_name: "C.J. Stroud", position: "QB", team: "HOU", search_rank: 40 },
  { player_id: "8000", first_name: "Chris", last_name: "Stroud", full_name: "Chris Stroud", position: "TE", team: null, search_rank: 9999 },
  { player_id: "7564", first_name: "Khalil", last_name: "Shakir", full_name: "Khalil Shakir", position: "WR", team: "BUF", search_rank: 120 },
  { player_id: "9488", first_name: "Jayden", last_name: "Reed", full_name: "Jayden Reed", position: "WR", team: "GB", search_rank: 110 },
  { player_id: "5001", first_name: "Joe", last_name: "Reed", full_name: "Joe Reed", position: "WR", team: null, search_rank: 9999 },
  { player_id: "9509", first_name: "Bijan", last_name: "Robinson", full_name: "Bijan Robinson", position: "RB", team: "ATL", search_rank: 3 },
  { player_id: "9221", first_name: "Brian", last_name: "Robinson", full_name: "Brian Robinson Jr.", position: "RB", team: "ATL", search_rank: 200 },
  { player_id: "4000", first_name: "Wan'Dale", last_name: "Robinson", full_name: "Wan'Dale Robinson", position: "WR", team: "NYG", search_rank: 150 },
];

// izzydabomb = roster 1 (owns Stroud). jwatts0723 = roster 2 (owns Shakir, Reed).
const ROSTERS: MatchRoster[] = [
  { roster_id: 1, manager_names: ["izzydabomb"], player_ids: ["9758", "9509"] },
  { roster_id: 2, manager_names: ["jwatts0723"], player_ids: ["7564", "9488"] },
  { roster_id: 3, manager_names: ["watticusgg"], player_ids: ["9221"] },
];

const player = (name: string, position: string, team: string): ExtractedAsset => ({
  kind: "player", name, position, team, season: null, round: null, original_owner: null,
  raw_text: `${name} ${position} - ${team}`,
});
const pick = (season: number, round: number, owner: string | null): ExtractedAsset => ({
  kind: "pick", name: null, position: null, team: null, season, round, original_owner: owner,
  raw_text: `${season} ${round} Rd${owner ? ` (${owner})` : ""}`,
});

const PICKS = [pick(2028, 2, "jwatts0723"), pick(2028, 3, "jwatts0723"), pick(2027, 4, "watticusgg"), pick(2028, 4, "jwatts0723")];

console.log("\n── chat trade card (Stroud for Shakir + picks) ──");
{
  const extracted: ExtractedTrade = {
    format: "chat_card",
    league_name: "Dynasty Disasters",
    parties: [
      { manager: "jwatts0723", receives: [player("C. Stroud", "QB", "HOU")] },
      { manager: "izzydabomb", receives: [player("K. Shakir", "WR", "BUF"), ...PICKS] },
    ],
  };
  const m = matchScreenshotTrade({ extracted, pool: POOL, rosters: ROSTERS, myRosterId: 1 });
  check("user sends Stroud", m.you_send.length === 1 && m.you_send[0].label === "C.J. Stroud", JSON.stringify(m.you_send));
  check("Stroud match is exact", m.you_send[0].confidence === "exact");
  check("user receives Shakir + 4 picks", m.you_receive.length === 5 && m.you_receive[0].label === "Khalil Shakir");
  check("pick label keeps original owner", m.you_receive[1].label === "2028 2nd (via jwatts0723)", m.you_receive[1].label);
  check("other manager is jwatts0723", m.other_manager === "jwatts0723");
  check("sides high confidence", m.side_confidence === "high", m.side_reason);
  check("no warnings", m.warnings.length === 0, m.warnings.join(" | "));
}

console.log("\n── offer screen, own header cut off (Stroud for Reed + picks) ──");
{
  const extracted: ExtractedTrade = {
    format: "offer_screen",
    league_name: null,
    parties: [
      { manager: null, receives: [player("J. Reed", "WR", "GB"), ...PICKS] },
      { manager: "jwatts0723", receives: [player("C. Stroud", "QB", "HOU")] },
    ],
  };
  const m = matchScreenshotTrade({ extracted, pool: POOL, rosters: ROSTERS, myRosterId: 1 });
  check("user sends Stroud", m.you_send[0]?.label === "C.J. Stroud");
  check("user receives Jayden Reed (rostered, not retired Joe Reed)", m.you_receive[0]?.label === "Jayden Reed", m.you_receive[0]?.label);
  check("sides resolved without the user's header", m.side_confidence === "high", m.side_reason);
}

console.log("\n── sides flip when the user is listed second without names ──");
{
  const extracted: ExtractedTrade = {
    format: "offer_screen",
    league_name: null,
    parties: [
      { manager: null, receives: [player("C. Stroud", "QB", "HOU")] },
      { manager: null, receives: [player("J. Reed", "WR", "GB")] },
    ],
  };
  const m = matchScreenshotTrade({ extracted, pool: POOL, rosters: ROSTERS, myRosterId: 1 });
  check("roster ownership puts Stroud on the send side", m.you_send[0]?.label === "C.J. Stroud");
}

console.log("\n── look-alike names (two B. Robinson RBs on ATL) ──");
{
  const extracted: ExtractedTrade = {
    format: "chat_card",
    league_name: null,
    parties: [
      { manager: "jwatts0723", receives: [player("B. Robinson", "RB", "ATL")] },
      { manager: "izzydabomb", receives: [player("K. Shakir", "WR", "BUF")] },
    ],
  };
  const m = matchScreenshotTrade({ extracted, pool: POOL, rosters: ROSTERS, myRosterId: 1 });
  const a = m.you_send[0];
  check("B. Robinson flagged ambiguous", a?.confidence === "ambiguous", a?.confidence);
  check("best guess is the user's rostered Bijan", a?.label === "Bijan Robinson", a?.label);
  check("Brian Robinson offered as the alternative", a?.alternatives.length === 1 && a.alternatives[0].label === "Brian Robinson Jr.");
  check("Wan'Dale (WR, NYG) not offered", !a?.alternatives.some((c) => c.label.startsWith("Wan")));
  check("warning asks the user to pick", m.warnings.some((w) => w.includes("Pick the right one")));

  const full = matchScreenshotTrade({
    extracted: { ...extracted, parties: [{ manager: "jwatts0723", receives: [player("Bijan Robinson", "RB", "ATL")] }, extracted.parties[1]] },
    pool: POOL, rosters: ROSTERS, myRosterId: 1,
  });
  check("a full first name is not ambiguous", full.you_send[0]?.confidence === "exact", full.you_send[0]?.confidence);
}

console.log("\n── guards ──");
{
  let threw = false;
  try {
    matchScreenshotTrade({
      extracted: { format: "chat_card", league_name: null, parties: [{ manager: "a", receives: [player("C. Stroud", "QB", "HOU")] }] },
      pool: POOL, rosters: ROSTERS, myRosterId: 1,
    });
  } catch (e) {
    threw = e instanceof ScreenshotReadError;
  }
  check("one-sided read is rejected", threw);

  const m = matchScreenshotTrade({
    extracted: {
      format: "chat_card", league_name: null,
      parties: [
        { manager: "jwatts0723", receives: [player("X. Nobody", "WR", "KC")] },
        { manager: "izzydabomb", receives: [player("K. Shakir", "WR", "BUF")] },
      ],
    },
    pool: POOL, rosters: ROSTERS, myRosterId: 1,
  });
  check("unknown player is kept and flagged", m.you_send[0]?.confidence === "unmatched" && m.warnings.length > 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
