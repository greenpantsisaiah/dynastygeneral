"use client";

/**
 * After-Action Report (AAR). Post-draft synthesis: relative grade,
 * top picks, whiff picks, pattern read, league position, 90-day
 * playbook. Voice: decisive coach. Lead with the action; pivot to
 * forward play; never insult.
 *
 * Data sources:
 *   Server: picks + ADP + KTC values + roster context + outlook
 *   Client: localStorage continuity history (engine standing call
 *           at each user pick) for divergence detection
 *
 * Founder direction 2026-04-30:
 *   Voice = decisive coach (positivity baked in; no childish snark)
 *   Grade = relative to league (extracted available value)
 *   Roast button = secondary, generates league-wide roast (Phase 2)
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { RosterLaneIdentity } from "@/components/league/roster-lane-identity";
import type {
  IdentityMove,
  LaneMembership,
} from "@/lib/strategy/lane-identity";

export type LeagueMoment = {
  pick_no: number;
  pick_label: string;
  player_name: string;
  position: string | null;
  team: string | null;
  manager_name: string | null;
  is_me: boolean;
  adp: number;
  adp_delta: number;
};

export type AarPick = {
  pick_no: number;
  pick_label: string;
  round: number;
  player_id: string;
  player_name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  is_rookie: boolean;
  adp: number | null;
  adp_delta: number | null;
};

export type AarServerData = {
  leagueId: string;
  leagueName: string;
  ownerName: string;
  totalTeams: number;
  picks: AarPick[];
  starter_avg_age: number | null;
  win_now_rank: number;
  future_rank: number;
  win_now_score: number;
  future_score: number;
  league_mean_win_now: number;
  league_mean_future: number;
  build_label: string;
  build_composition: { winNow: number; balanced: number; future: number };
  league_steals: LeagueMoment[];
  league_swings: LeagueMoment[];
  /**
   * Roster-shape lane identity (audit pass 4 rewrite). The verdict
   * block reads these instead of synthesizing a grade letter +
   * doctrine-drift framing. Lane memberships are descriptive, not
   * evaluative; identity moves give the post-draft monitor surface.
   */
  lane_memberships: LaneMembership[];
  lane_moves: IdentityMove[];
};

type HistoryEntry = {
  user_pick_no: number;
  player_id: string;
  player_name: string;
  first_seen_ms: number;
  last_seen_ms: number;
  refresh_count: number;
};

type StoredHistory = {
  league_id: string;
  entries: HistoryEntry[];
};

function readHistory(leagueId: string): StoredHistory {
  if (typeof window === "undefined") {
    return { league_id: leagueId, entries: [] };
  }
  try {
    const raw = window.localStorage.getItem(`dg_rec_history_${leagueId}`);
    if (!raw) return { league_id: leagueId, entries: [] };
    const parsed = JSON.parse(raw) as StoredHistory;
    if (parsed.league_id !== leagueId) {
      return { league_id: leagueId, entries: [] };
    }
    return parsed;
  } catch {
    return { league_id: leagueId, entries: [] };
  }
}

/**
 * Compose a one-line shape headline from lane memberships. Names the
 * dominant identity (e.g., "Sustained Contender" if that composite is
 * IN; "Future-Loaded Builder" if Future Stock + Trade Capital IN; etc.)
 * Replaces the prior grade-letter + tagline framing that scored the
 * roster against a declared window the user never explicitly declared
 * (audit pass 4 / founder direction 2026-05-11).
 */
function composeShapeHeadline(memberships: LaneMembership[]): string {
  const inIds = new Set<string>(
    memberships.filter((m) => m.state === "in").map((m) => m.lane_id),
  );
  const has = (id: string) => inIds.has(id);
  if (has("sustained_contender")) return "Sustained Contender";
  if (has("win_now_floor") && has("wr_anchor") && has("rb_bellcow")) {
    return "Loaded Contender";
  }
  if (has("zero_rb")) return "Zero-RB Build";
  if (has("future_stock") && has("trade_capital") && !has("win_now_floor")) {
    return "Patient Builder";
  }
  if (has("win_now_floor") && !has("future_stock")) {
    return "Win-Now Tilt";
  }
  if (has("future_stock") && !has("win_now_floor")) {
    return "Future Tilt";
  }
  if (has("balanced")) return "Balanced Build";
  if (inIds.size === 0) return "Roster Forming";
  return "Mixed Build";
}

function pickEngineCallFor(
  pick: AarPick,
  history: StoredHistory,
): { name: string; player_id: string } | null {
  const matches = history.entries.filter(
    (e) => e.user_pick_no === pick.pick_no,
  );
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  if (last.player_id === pick.player_id) return null;
  return { name: last.player_name, player_id: last.player_id };
}

function topPicksOf(
  picks: AarPick[],
  history: StoredHistory,
): AarPick[] {
  const inWindow = picks.filter((p) => p.round <= 18 && p.adp_delta != null);
  const positive = inWindow.filter((p) => (p.adp_delta ?? 0) > 0);
  const scored = positive.map((p) => {
    const engineCall = pickEngineCallFor(p, history);
    const aligned = engineCall === null;
    const score = (p.adp_delta ?? 0) + (aligned ? 5 : 0);
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((x) => x.p);
}

function whiffPicksOf(picks: AarPick[]): AarPick[] {
  const inWindow = picks.filter(
    (p) => p.round <= 15 && p.adp_delta != null,
  );
  const negatives = inWindow.filter((p) => (p.adp_delta ?? 0) < 0);
  negatives.sort((a, b) => (a.adp_delta ?? 0) - (b.adp_delta ?? 0));
  return negatives.slice(0, 3);
}

function commentaryForTopPick(p: AarPick, isAligned: boolean): string {
  const delta = Math.round(p.adp_delta ?? 0);
  const whoLine =
    isAligned ? "Engine called it; you locked it. " : "";
  if (delta >= 20) {
    return `${whoLine}${p.player_name} fell ${delta} picks past consensus. Best value of your draft. The market reached past him; you didn't blink.`;
  }
  if (delta >= 10) {
    return `${whoLine}${p.player_name} fell ${delta} picks past ADP. Sharp call at ${p.pick_label}. He would not have survived to your next turn.`;
  }
  return `${whoLine}${p.player_name} at ${p.pick_label} is ${delta} picks past ADP. Solid extraction.`;
}

function commentaryForWhiff(
  p: AarPick,
  engineCall: { name: string } | null,
): string {
  const delta = Math.abs(Math.round(p.adp_delta ?? 0));
  const reach =
    delta >= 20 ? `${delta} picks before consensus` : `${delta} picks early`;
  if (engineCall) {
    return `${p.player_name} at ${p.pick_label} was ${reach}. Engine called ${engineCall.name}. The trade-window play: ${p.player_name} is now your variance asset. If his role does not clarify by camp, package him for proven depth at a thinner position.`;
  }
  return `${p.player_name} at ${p.pick_label} was ${reach}. Worth it if his role is locked; otherwise the cost shows up in floor. Watch the depth chart in May; flip if the news is not there.`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function AarReport({
  data,
  diagnose = false,
}: {
  data: AarServerData;
  diagnose?: boolean;
}) {
  const [history, setHistory] = useState<StoredHistory>({
    league_id: data.leagueId,
    entries: [],
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setHistory(readHistory(data.leagueId));
  }, [data.leagueId]);

  const topPicks = mounted ? topPicksOf(data.picks, history) : [];
  const whiffs = mounted ? whiffPicksOf(data.picks) : [];

  const inCount = data.lane_memberships.filter((m) => m.state === "in").length;
  const closeCount = data.lane_memberships.filter(
    (m) => m.state === "close",
  ).length;
  const shapeHeadline = composeShapeHeadline(data.lane_memberships);

  return (
    <div className="mt-6 space-y-12">
      <section className="rounded-xl border-2 border-accent/60 bg-surface px-6 py-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Roster shape
        </div>
        <div className="mt-2 flex flex-col gap-3">
          <div className="text-2xl font-semibold tracking-tight text-foreground">
            {shapeHeadline}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
            {inCount} lanes in · {closeCount} close ·{" "}
            <span className="text-foreground">{ordinal(data.win_now_rank)}</span>{" "}
            of {data.totalTeams} on win-now ·{" "}
            <span className="text-foreground">{ordinal(data.future_rank)}</span>{" "}
            on future
          </div>
        </div>
        <div className="mt-6">
          <RosterLaneIdentity
            memberships={data.lane_memberships}
            moves={data.lane_moves}
          />
        </div>
      </section>

      {diagnose && (
        <section className="rounded-md border border-warning/40 bg-warning/5 px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-warning">
            Diagnose · league math
          </div>
          <div className="mt-3 grid gap-1 font-mono text-[11px] text-foreground sm:grid-cols-2">
            <div>
              win-now rank: {data.win_now_rank} of {data.totalTeams} (score{" "}
              {data.win_now_score.toFixed(1)} vs league mean{" "}
              {data.league_mean_win_now.toFixed(1)})
            </div>
            <div>
              future rank: {data.future_rank} of {data.totalTeams} (score{" "}
              {data.future_score.toFixed(1)} vs league mean{" "}
              {data.league_mean_future.toFixed(1)})
            </div>
            <div>build trajectory: {data.build_label}</div>
            <div>
              composition · win-now {data.build_composition.winNow} ·
              balanced {data.build_composition.balanced} · future{" "}
              {data.build_composition.future}
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-success">
          What you crushed
        </div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Best picks of your draft
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          The three picks where you extracted the most value out of where the
          market had {data.ownerName} on the board.
        </p>
        <div className="mt-5 space-y-3">
          {topPicks.length === 0 && (
            <p className="rounded-md border border-border-soft bg-surface px-4 py-3 text-sm text-muted-2">
              No clear value picks identified yet. Once ADP variance settles
              for this draft, top picks will surface here.
            </p>
          )}
          {topPicks.map((p) => {
            const engineCall = pickEngineCallFor(p, history);
            const aligned = engineCall === null;
            return (
              <div
                key={p.pick_no}
                className="rounded-md border border-success/40 bg-success/5 px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">
                    {p.pick_label} · {p.player_name}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-success">
                    +{Math.round(p.adp_delta ?? 0)} past ADP
                  </div>
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                  {p.position}
                  {p.team ? `-${p.team}` : ""}
                  {p.age != null ? ` · age ${p.age}` : ""}
                  {p.adp != null ? ` · ADP ${Math.round(p.adp)}` : ""}
                </div>
                <p className="mt-2 text-sm text-foreground leading-snug">
                  {commentaryForTopPick(p, aligned)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-warning">
          What to watch
        </div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Picks to make pay off in trade season
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          The three picks where you took someone before consensus. Sometimes
          that's conviction; sometimes it's a stretch. Either way, here's the
          play to make it work going forward.
        </p>
        <div className="mt-5 space-y-3">
          {whiffs.length === 0 && (
            <p className="rounded-md border border-border-soft bg-surface px-4 py-3 text-sm text-muted-2">
              No clear reaches in your first 15 rounds. You drafted within
              consensus on the picks that mattered.
            </p>
          )}
          {whiffs.map((p) => {
            const engineCall = pickEngineCallFor(p, history);
            return (
              <div
                key={p.pick_no}
                className="rounded-md border border-warning/40 bg-warning/5 px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">
                    {p.pick_label} · {p.player_name}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
                    {Math.round(p.adp_delta ?? 0)} vs ADP
                  </div>
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                  {p.position}
                  {p.team ? `-${p.team}` : ""}
                  {p.age != null ? ` · age ${p.age}` : ""}
                  {p.adp != null ? ` · ADP ${Math.round(p.adp)}` : ""}
                </div>
                <p className="mt-2 text-sm text-foreground leading-snug">
                  {commentaryForWhiff(p, engineCall)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {(data.league_steals.length > 0 || data.league_swings.length > 0) && (
        <section>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            League moments
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Notable picks across the draft
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Steals and swings from every manager. Your name in green is
            your moment; everyone else's is content for the group chat.
          </p>

          {data.league_steals.length > 0 && (
            <div className="mt-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-success">
                Steals of the draft
              </div>
              <div className="mt-2 space-y-2">
                {data.league_steals.map((m) => (
                  <MomentRow key={`steal-${m.pick_no}`} moment={m} kind="steal" />
                ))}
              </div>
            </div>
          )}

          {data.league_swings.length > 0 && (
            <div className="mt-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-warning">
                Biggest swings
              </div>
              <p className="mt-1 text-xs text-muted-2">
                Picks taken well before consensus. Could be conviction;
                could be a stretch. The next 4 months tell.
              </p>
              <div className="mt-2 space-y-2">
                {data.league_swings.map((m) => (
                  <MomentRow key={`swing-${m.pick_no}`} moment={m} kind="swing" />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          Pattern read
        </div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          The shape of your team
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border-soft bg-surface px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              Build
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">
              {data.build_label}
            </div>
            <div className="mt-1 text-xs text-muted">
              {data.build_composition.future} future ·{" "}
              {data.build_composition.balanced} balanced ·{" "}
              {data.build_composition.winNow} win-now picks
            </div>
          </div>
          <div className="rounded-md border border-border-soft bg-surface px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              Starter age
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">
              {data.starter_avg_age != null
                ? data.starter_avg_age.toFixed(1)
                : "n/a"}
            </div>
            <div className="mt-1 text-xs text-muted">
              {data.starter_avg_age == null
                ? "no age data yet"
                : data.starter_avg_age >= 28
                  ? "Veteran-loaded. 2026 ceiling real, 2027 cliff real."
                  : data.starter_avg_age >= 25
                    ? "Prime-age core. Multi-year window."
                    : "Young core. Window opens 2027+."}
            </div>
          </div>
          <div className="rounded-md border border-border-soft bg-surface px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              Win-now score
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">
              {data.win_now_score}{" "}
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                · {ordinal(data.win_now_rank)} of {data.totalTeams}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted">
              League mean {data.league_mean_win_now.toFixed(1)}.
            </div>
          </div>
          <div className="rounded-md border border-border-soft bg-surface px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              Future score
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">
              {data.future_score}{" "}
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                · {ordinal(data.future_rank)} of {data.totalTeams}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted">
              League mean {data.league_mean_future.toFixed(1)}.
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          90-day playbook
        </div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          What to do next
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          The dynasty offseason has predictable value-flow patterns. Use them.
          Each block links back to product features as they come online.
        </p>
        <div className="mt-5 space-y-3">
          <PlaybookBlock
            window="Now to end of May"
            title="Sell rookies at landing-spot peak"
            body="Day-2 rookies typically peak in KTC value the first week after the NFL draft, then drift down through summer. If you stashed rookies whose role is unclear, this is your sell window unless you genuinely want them long-term. The Stalk button on each candidate (already shipped) tracks them across refreshes."
          />
          <PlaybookBlock
            window="June"
            title="Dead zone. Hold."
            body="Trade volume drops. Patience pays. Don't manufacture activity. Use this window to study the league's structure: who's selling future, who's buying now."
          />
          <PlaybookBlock
            window="July to early August (camp)"
            title="Buy injured veterans, sell aging stars"
            body="Beat reporters leak snap counts and target shares from OTAs and early camp. Buy low on injured veterans whose redraft ADP hasn't recovered (their floor is intact). Sell aging stars whose dynasty value is propped up by name recognition; their production is real but their value window is closing."
          />
          <PlaybookBlock
            window="Mid-August to preseason"
            title="Trade rookie clarity for proven depth"
            body="Position battles resolve. Rookie roles clarify. The rookies whose stock spikes are your tradable currency: package 1-2 for proven mid-tier starters at a thinner position. Lock the lineup floor before week 1."
          />
          <PlaybookBlock
            window="Early September (week 1)"
            title="Hold position; let games re-anchor value"
            body="Pre-week-1 trades skew emotional. Receivers of frantic offers tend to overpay. Be the patient counterparty. Mid-season check-in arrives in October."
          />
        </div>
      </section>

      <section className="rounded-md border border-border-strong bg-surface-2 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
              Share with the league
            </div>
            <p className="mt-1 text-sm text-foreground">
              Roast my draft (and theirs).{" "}
              <span className="text-muted-2">
                Coming soon: a league-wide AAR you can post in your group
                chat. Every team gets the same coach treatment; you decide
                who to send it to.
              </span>
            </p>
          </div>
          <button
            type="button"
            disabled
            className="rounded-md border border-border-soft bg-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2"
            title="League-wide roast launches in Phase 2"
          >
            Roast everyone (soon)
          </button>
        </div>
      </section>

      <section>
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-2">
          Full draft journey
        </div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
          Every pick you made
        </h2>
        <ol className="mt-4 space-y-1.5">
          {data.picks.map((p) => {
            const engineCall = mounted ? pickEngineCallFor(p, history) : null;
            const delta = p.adp_delta;
            const tone =
              delta == null
                ? "muted"
                : delta >= 5
                  ? "success"
                  : delta <= -5
                    ? "warning"
                    : "neutral";
            return (
              <li
                key={p.pick_no}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-sm border border-border-soft bg-surface px-3 py-1.5 text-sm"
              >
                <span className="min-w-[3.5rem] font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
                  {p.pick_label}
                </span>
                <span className="font-semibold text-foreground">
                  {p.player_name}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                  {p.position}
                  {p.team ? `-${p.team}` : ""}
                  {p.age != null ? ` · age ${p.age}` : ""}
                </span>
                {delta != null && (
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                      tone === "success"
                        ? "text-success"
                        : tone === "warning"
                          ? "text-warning"
                          : "text-muted-2"
                    }`}
                  >
                    {delta > 0 ? "+" : ""}
                    {Math.round(delta)} vs ADP
                  </span>
                )}
                {engineCall && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
                    engine: {engineCall.name}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-md border border-border-soft bg-surface px-5 py-4 text-sm text-muted">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
          Coming this offseason
        </div>
        <p className="mt-2">
          Camp news alerts on your roster, mid-season check-in (October),
          year-end retrospective (February). Each builds on the same AAR
          shell, refreshed with real production data as the season unfolds.{" "}
          <Link href="/pricing" className="text-accent hover:underline">
            See Pro tier features →
          </Link>
        </p>
      </section>
    </div>
  );
}

function MomentRow({
  moment,
  kind,
}: {
  moment: LeagueMoment;
  kind: "steal" | "swing";
}) {
  const delta = Math.round(moment.adp_delta);
  const absDelta = Math.abs(delta);
  const ownerLabel = moment.manager_name ?? "?";
  const tone =
    kind === "steal"
      ? moment.is_me
        ? "border-success/60 bg-success/15"
        : "border-success/30 bg-success/5"
      : moment.is_me
        ? "border-warning/60 bg-warning/15"
        : "border-warning/30 bg-warning/5";
  const accent =
    kind === "steal"
      ? "text-success"
      : "text-warning";
  return (
    <div className={`rounded-md border ${tone} px-3 py-2`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            {moment.pick_label}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {moment.player_name}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            {moment.position}
            {moment.team ? `-${moment.team}` : ""}
          </span>
        </div>
        <div className={`font-mono text-[10px] uppercase tracking-[0.14em] ${accent}`}>
          {kind === "steal"
            ? `+${absDelta} past ADP`
            : `${absDelta} before ADP`}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
        <span className={moment.is_me ? "text-accent font-semibold" : "text-muted-2"}>
          {moment.is_me ? `▸ ${ownerLabel} (you)` : ownerLabel}
        </span>
        <span className="text-muted-2">
          · ADP {Math.round(moment.adp)}
        </span>
      </div>
    </div>
  );
}

function PlaybookBlock({
  window,
  title,
  body,
}: {
  window: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-md border border-border-soft bg-surface px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
        {window}
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-1 text-sm text-muted leading-snug">{body}</p>
    </div>
  );
}
