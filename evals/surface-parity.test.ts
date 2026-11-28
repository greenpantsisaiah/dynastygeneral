/**
 * Surface parity: the weekly email, /home and the league page must name the
 * same trade (partner, ask, verdict, week, deadline) for the same league at
 * the same moment. Coach loads its verdict through the same loader the page
 * uses (loadContendOrSellVerdict with no resultsWeek), so the page path below
 * also stands for Coach's contend_or_sell object.
 *
 *   npx tsx --tsconfig tsconfig.json evals/surface-parity.test.ts
 *
 * Why (2026-11-26): Isaiah's email said "offer Warren to ladovina11" while the
 * app said Revolver420. Every surface already shared one item builder; the
 * inputs drifted. The email computed the results week with lastCompletedWeek
 * (Tue/Wed after Monday night counts the finished week) while the page and
 * Coach used nflWeek - 1, so the season sim started a week apart and ranked
 * buyers differently. OPERATING_STANDARD principle 2 (one truth everywhere),
 * flaw F2. This test runs both real paths on the committed real-league
 * snapshot at several clocks, offline.
 */

import { loadRealLeagueSnapshot, listRealLeagueSnapshots } from "./fixtures/real-leagues/load";
import { installSnapshotFetch } from "../scripts/lib/snapshot-replay";

let passed = 0;
let failed = 0;
let compared = 0;
let offers = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` (${detail})` : ""}`);
}

type Comparable = Record<string, unknown> | null;

function comparable(item: Record<string, unknown> | null | undefined): Comparable {
  if (!item) return null;
  if (item.kind === "trade") {
    return {
      kind: item.kind,
      week: item.week,
      direction: item.direction,
      manager: item.manager,
      ask: item.ask ?? null,
      verdict: item.verdict,
      deadline: item.deadline,
    };
  }
  return { kind: item.kind, week: item.week, title: item.title };
}

async function main() {
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = () => {};
  console.error = () => {};

  const { getLeague, getRosters, getLeagueUsers } = await import("../src/lib/sleeper/client");
  const { resolveDraftState } = await import("../src/lib/sleeper/draft-state");
  const { buildLeagueContext } = await import("../src/lib/engine/league-context");
  const { loadContendOrSellVerdict } = await import("../src/lib/strategy/verdict/load");
  const { leagueDecision } = await import("../src/lib/decisions/league-decision");
  const { buildBriefLeagues } = await import("../src/lib/email/build-brief");
  const { buildTradeDeskModel } = await import("../src/lib/email/trade-desk/model");
  const { buildDecisionItems } = await import("../src/lib/decisions/items");

  for (const username of listRealLeagueSnapshots()) {
    const snap = loadRealLeagueSnapshot(username, { allowStale: true });
    const nfl = snap.nfl_state as { week: number; season: string; season_type: string; season_start_date?: string };
    // Monday (results week = nflWeek - 1) and Tuesday (lastCompletedWeek may
    // count the week that just finished): the drift window.
    const captured = new Date(snap.captured_at);
    const at = (dow: number, weeksBack: number) => {
      const d = new Date(captured);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - dow + 7) % 7) - 7 * weeksBack);
      d.setUTCHours(18, 0, 0, 0);
      return d;
    };
    // The live week, plus a replay one week back: Sleeper reports that week
    // as current while its games are already final, which is exactly when
    // lastCompletedWeek and nflWeek - 1 disagree.
    const scenarios = [
      { nflWeek: nfl.week, now: at(1, 0) },
      { nflWeek: nfl.week, now: at(2, 0) },
      { nflWeek: nfl.week - 1, now: at(1, 1) },
      { nflWeek: nfl.week - 1, now: at(2, 1) },
    ];
    const restore = installSnapshotFetch(snap);
    try {
      for (const { nflWeek, now } of scenarios) {
        const day = `${now.toISOString().slice(0, 10)} wk${nflWeek}`;
        // Email + /home path.
        const brief = await buildBriefLeagues({
          username,
          season: nfl.season,
          nflWeek,
          seasonType: nfl.season_type,
          logTag: "parity",
          now,
        });
        const model = buildTradeDeskModel({
          ownerName: "Parity",
          tier: "pro",
          resultsWeek: brief.resultsWeek,
          leagues: brief.leagues,
          seasonStartDate: nfl.season_start_date ?? null,
          now,
        });
        const { items } = buildDecisionItems({ model, season: nfl.season });
        // The opening offer a trade card hands the user agrees with the card:
        // same buyer, same first return the verdict names, sold player named.
        for (const t of items) {
          if (t.kind !== "trade" || !t.offer) continue;
          offers++;
          const o = t.offer;
          check(
            `${username} @ ${day}: offer to ${t.manager} matches the card`,
            o.message.includes(t.manager) && o.message.includes(o.send[0]) && t.verdict.includes(o.receive[0]) && !o.message.includes("\u2014") && !/\btheir\b/.test(o.message),
            JSON.stringify({ o, verdict: t.verdict }),
          );
        }

        for (const entry of snap.leagues) {
          const leagueId = entry.league.league_id;
          const name = `${username} / ${entry.league.name.trim()} @ ${day}`;
          try {
            const emailItem = items.find(
              (i) => i.league_id === leagueId && (i.kind === "trade" || i.kind === "league_call"),
            ) as Record<string, unknown> | undefined;

            // League page path (and Coach's verdict loader).
            const [league, rosters, users] = await Promise.all([
              getLeague(leagueId),
              getRosters(leagueId),
              getLeagueUsers(leagueId),
            ]);
            const draftState = await resolveDraftState(leagueId, snap.user.user_id);
            const ctx = await buildLeagueContext({ league, rosters, users, draftState, mySleeperUserId: snap.user.user_id });
            const res = await loadContendOrSellVerdict({
              league,
              snapshot: ctx.snapshot,
              nflWeek,
              seasonType: nfl.season_type,
              playerValuesById: ctx.pricedPool.playerValuesById,
              now,
            });
            const pageItem = res.ok
              ? leagueDecision({
                  league,
                  verdict: res.verdict,
                  season: nfl.season,
                  resultsWeek: res.resultsWeek,
                  tier: "pro",
                  seasonStartDate: nfl.season_start_date ?? null,
                  now,
                })
              : null;

            const a = comparable(emailItem);
            const b = comparable(pageItem as unknown as Record<string, unknown> | null);
            // The email caps the number of trade cards (MAX_CARDS); a league
            // the email skipped may still carry a call on its page. Parity is
            // required wherever both surfaces show one.
            if (a == null || b == null) continue;
            compared++;
            const same = JSON.stringify(a) === JSON.stringify(b);
            check(`${name}: email and page name the same call`, same, same ? undefined : `email ${JSON.stringify(a)} vs page ${JSON.stringify(b)}`);
          } catch (err) {
            check(`${name}: both paths run`, false, err instanceof Error ? `${err.message}\n${err.stack}` : String(err));
          }
        }
      }
    } finally {
      restore();
    }
  }

  console.warn = origWarn;
  console.error = origError;
  // A parity test that compares nothing proves nothing.
  check(`compared at least 8 email/page call pairs (got ${compared})`, compared >= 8);
  check(`real leagues produced at least one opening offer (got ${offers})`, offers >= 1);
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
