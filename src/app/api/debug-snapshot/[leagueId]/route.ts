import { NextResponse } from "next/server";
import {
  getLeague,
  getRosters,
  getLeagueUsers,
  getUserByUsername,
} from "@/lib/sleeper";
import { resolveDraftState } from "@/lib/sleeper/draft-state";
import { buildLeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { rankArchetypes } from "@/lib/strategy/ranking/rank";
import { generatePulse } from "@/lib/strategy/pulse";
import { selectPlaysFromHere } from "@/lib/strategy/plays-from-here/select";
import { computeWindows } from "@/lib/strategy/windows/compute";
import { buildPickApproach } from "@/lib/strategy/pick-approach/predict";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const url = new URL(req.url);
  const username = url.searchParams.get("username")?.trim().replace(/^@/, "") ?? "";
  const [league, rosters, users] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId),
  ]);
  if (!league) return NextResponse.json({ error: "no league" }, { status: 404 });
  const sleeperUser = username ? await getUserByUsername(username) : null;
  const draftState = await resolveDraftState(leagueId, sleeperUser?.user_id ?? null);
  const snapshot = await buildLeagueSnapshot({
    league,
    rosters,
    users,
    draftState,
    mySleeperUserId: sleeperUser?.user_id ?? null,
  });
  const ranked = rankArchetypes(snapshot);
  const pulse = generatePulse(snapshot);
  const plays = selectPlaysFromHere(snapshot);
  const windows = computeWindows(snapshot);
  const pickApproach = buildPickApproach(snapshot, ranked);
  const me = snapshot.rosters.find((r) => r.is_me);
  return NextResponse.json({
    format: snapshot.format,
    scoring: snapshot.scoring,
    draft_status: snapshot.draft.status,
    draft_type: snapshot.draft.type,
    draft_rounds: snapshot.draft.rounds,
    total_teams: snapshot.total_teams,
    next_pick_no: snapshot.draft.next_pick_no,
    picks_made: snapshot.draft.picks_made.length,
    qb_drafted_through_r2: snapshot.draft.picks_made.filter(
      (p) => p.round <= 2 && p.position === "QB",
    ).length,
    teams_without_qb_after_r2: snapshot.agg.teams_without_position_after_round("QB", 2),
    me: me
      ? {
          roster_id: me.roster_id,
          owner_name: me.owner_name,
          position_counts: me.position_counts,
          avg_age: me.avg_age,
          wins: me.wins,
          losses: me.losses,
        }
      : null,
    ranked: ranked.map((r) => ({
      id: r.archetype.id,
      name: r.archetype.name,
      fit: r.drift_score,
      opening_boost: r.opening_boost,
      total: r.total_score,
      gamble_pct: r.live_gamble.pct,
      active_modifiers: r.live_gamble.active_modifiers,
      active_openings: r.active_openings,
    })),
    pulse,
    plays_from_here: plays.map((p) => ({ id: p.id, title: p.title })),
    windows: { win_now: windows.win_now.score, future: windows.future_value.score, current_ratio: windows.current_ratio },
    pick_approach: pickApproach,
  });
}
