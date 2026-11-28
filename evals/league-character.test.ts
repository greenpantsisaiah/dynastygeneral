/**
 * /home "Your teams" lines (src/lib/decisions/character.ts): posture only
 * in dynasty and keeper, redraft framed as this season only, the rival is
 * the other team with the best chance to win the league, games back counts
 * ties as half, the favorite case reads as the favorite, and copy carries
 * no em dash. Plus the shared rosterValueRank helper.
 * Run: npm run test:league-character
 */
import { characterChip, characterLine, rivalLine, teamTile, type LeagueCharacter } from "../src/lib/decisions/character";
import { rosterValueRank } from "../src/lib/strategy/posture/detect";
import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`); }
}

const dyn: LeagueCharacter = {
  kind: "dynasty",
  posture: { category: "rebuilder", headline: "Patient build. War year projects 2028." },
  strongest: { position: "QB", rank: 5, total: 12 },
  weakest: { position: "RB", rank: 10, total: 12 },
  me: { wins: 7, losses: 4, ties: 0, title_pct: 0.01, playoff_pct: 0.7 },
  rival: { manager: "Willfredson", wins: 9, losses: 2, ties: 0, title_pct: 0.35 },
};
console.log("\n1. Character line");
check("dynasty: posture chip", characterChip(dyn) === "Rebuilder");
check("dynasty: posture headline then rooms", characterLine(dyn) === "Patient build. War year projects 2028. Best room: QB (5th of 12). Thinnest: RB (10th).", characterLine(dyn) ?? "");
const red: LeagueCharacter = { ...dyn, kind: "redraft", posture: null, me: { ...dyn.me!, playoff_pct: 0.9 } };
check("redraft: no war year, this season framing", characterLine(red)!.startsWith("Redraft: this season is the whole story, 90% to make the playoffs.") && !characterLine(red)!.includes("War year"));
check("redraft: chip is the playoff odds", /^Playoffs \S+%$/.test(characterChip(red) ?? ""), characterChip(red) ?? "");

console.log("\n2. Rival line");
check("behind: names rival, record, odds, games back", rivalLine(dyn) === "Top rival: Willfredson, 9-2, 35% to win the league. You are 2 games back at 7-4, <2% to win it.", rivalLine(dyn) ?? "");
const fav: LeagueCharacter = { ...dyn, me: { ...dyn.me!, title_pct: 0.4 } };
check("favorite: says so and names the next team", rivalLine(fav) === "You are the favorite to win the league at 40%. Next: Willfredson, 9-2, 35%.", rivalLine(fav) ?? "");
const tie: LeagueCharacter = { ...dyn, me: { ...dyn.me!, wins: 8, losses: 2, ties: 1 }, rival: { ...dyn.rival!, wins: 9, losses: 2 } };
check("a tie counts as half a game", rivalLine(tie)!.includes("0.5 games back at 8-2-1"), rivalLine(tie) ?? "");
check("no rival line without odds", rivalLine({ ...dyn, me: null }) === null);
for (const c of [dyn, red, fav, tie]) check("no em dash", !`${characterLine(c)} ${rivalLine(c)}`.includes("—"));

console.log("\n3. rosterValueRank");
const snap = { rosters: [
  { roster_id: 1, player_ids: ["a", "b"] },
  { roster_id: 2, player_ids: ["c"] },
  { roster_id: 3, player_ids: [] },
] } as unknown as LeagueSnapshot;
const v: Record<string, number> = { a: 10, b: 5, c: 30 };
check("ranks by summed value", rosterValueRank({ snap, rosterId: 1, valueOf: (id) => v[id] }) === 2);
check("top roster is 1", rosterValueRank({ snap, rosterId: 2, valueOf: (id) => v[id] }) === 1);
check("unknown roster is null", rosterValueRank({ snap, rosterId: 9, valueOf: (id) => v[id] }) === null);

const tile = teamTile("12m", "12 Man", dyn)!;
check("tile: posture chip and short note", tile.chip === "Rebuilder" && tile.note === "Patient build. War year projects 2028.");
check("tile: games back from records", tile.rival?.gamesBack === 2 && tile.rival?.favorite === false && tile.rival?.myRecord === "7-4");
check("tile: rooms carried as rank meters", tile.best?.rank === 5 && tile.thinnest?.rank === 10);
const bal = teamTile("b", "B", { ...dyn, posture: { category: "balanced", headline: "Mid-pack. Two playable lenses; pick a direction." } })!;
check("tile: balanced drops the filler headline", bal.chip === "Balanced" && bal.note === null);
check("tile: redraft chip is the league kind", teamTile("r", "R", red)!.chip === "Redraft");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
