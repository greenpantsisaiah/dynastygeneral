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
  starter_talent_score: number | null;
  win_now_rank: number;
  future_rank: number;
  win_now_score: number;
  future_score: number;
  league_mean_win_now: number;
  league_mean_future: number;
  declared_horizon: number;
  build_label: string;
  build_composition: { winNow: number; balanced: number; future: number };
  is_superflex: boolean;
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

type GradeBreakdown = {
  letter: string;
  score: number;
  tagline: string;
  components: {
    talent: number;
    win_now_pct: number;
    future_pct: number;
    coherence: number;
    drift: number;
    pickValue: number;
    totalAdpDelta: number;
    completeness: number;
    missingPositions: number;
  };
};

function computeGrade(data: AarServerData): GradeBreakdown {
  // Talent percentile combines win-now AND future ranks. A team
  // that's elite across both windows (top of league in both)
  // outperforms a team that's elite in one and weak in the other.
  // Win-now weighted slightly more (60/40) since the immediate
  // season is what the user feels most.
  const winNowPct =
    data.totalTeams > 1
      ? 1 - (data.win_now_rank - 1) / (data.totalTeams - 1)
      : 0.5;
  const futurePct =
    data.totalTeams > 1
      ? 1 - (data.future_rank - 1) / (data.totalTeams - 1)
      : 0.5;
  const talent = 0.6 * winNowPct + 0.4 * futurePct;

  // Doctrine coherence. Reduced weight per founder feedback
  // 2026-04-30: a 3rd-of-12 win-now / 2nd-of-12 future team should
  // not get dropped a full grade tier just because their late-round
  // bench skewed the trajectory chip toward "Future Build" while
  // the dial said "Win-Now." The trajectory algorithm counts every
  // pick equally, which over-rotates in 25-round drafts where
  // late picks are heavily rookie/young by design.
  const buildHorizon =
    data.build_label === "Future Build"
      ? 60
      : data.build_label === "Future Lean"
        ? 30
        : data.build_label === "Win-Now Build"
          ? -60
          : data.build_label === "Win-Now Lean"
            ? -30
            : 0;
  const drift = Math.abs(data.declared_horizon - buildHorizon);
  const coherence = Math.max(0, 1 - drift / 150);

  const totalDelta = data.picks.reduce(
    (s, p) => s + (p.adp_delta ?? 0),
    0,
  );
  const pickValue = 1 / (1 + Math.exp(-totalDelta / 50));

  const hasQB = data.picks.some((p) => p.position === "QB");
  const hasRB = data.picks.some((p) => p.position === "RB");
  const hasWR = data.picks.some((p) => p.position === "WR");
  const hasTE = data.picks.some((p) => p.position === "TE");
  const missingCount =
    (hasQB ? 0 : 1) + (hasRB ? 0 : 1) + (hasWR ? 0 : 1) + (hasTE ? 0 : 1);
  const completeness = Math.max(0, 1 - missingCount * 0.25);

  // Weight rebalance 2026-04-30: result (talent) is the dominant
  // signal. Pick value comes second. Coherence and completeness
  // are situational modifiers. Total = 1.0.
  const composite =
    0.55 * talent +
    0.25 * pickValue +
    0.1 * coherence +
    0.1 * completeness;
  const letter =
    composite >= 0.9
      ? "A"
      : composite >= 0.85
        ? "A-"
        : composite >= 0.8
          ? "B+"
          : composite >= 0.75
            ? "B"
            : composite >= 0.7
              ? "B-"
              : composite >= 0.65
                ? "C+"
                : composite >= 0.6
                  ? "C"
                  : composite >= 0.55
                    ? "C-"
                    : "D";
  const tagline = (() => {
    const tier = data.win_now_rank;
    const half = Math.ceil(data.totalTeams / 2);
    if (data.build_label.includes("Win-Now") && tier <= 4)
      return "Loaded Contender";
    if (data.build_label.includes("Win-Now") && tier > half)
      return "Win-Now Effort, Roster Behind";
    if (data.build_label.includes("Future") && tier > half)
      return "Patient Rebuilder";
    if (data.build_label.includes("Future") && tier <= 4)
      return "Future-Tilted Contender";
    if (data.build_label.includes("Future") && tier <= half)
      return "Patient Contender";
    if (tier <= 4) return "Balanced Contender";
    if (tier > half) return "Mid-Pack, Real Path Forward";
    return "Balanced Build";
  })();
  return {
    letter,
    score: composite,
    tagline,
    components: {
      talent,
      win_now_pct: winNowPct,
      future_pct: futurePct,
      coherence,
      drift,
      pickValue,
      totalAdpDelta: totalDelta,
      completeness,
      missingPositions: missingCount,
    },
  };
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

function heroVerdictCopy(
  data: AarServerData,
  grade: { letter: string; score: number; tagline: string },
): string {
  const half = Math.ceil(data.totalTeams / 2);
  const isContenderTier = data.win_now_rank <= 4;
  const isMidPack = data.win_now_rank > 4 && data.win_now_rank <= half;
  const isBackHalf = data.win_now_rank > half;
  const isFutureLoaded = data.future_rank <= 4;
  const isWinNowDoctrine = data.declared_horizon < -20;
  const isFutureDoctrine = data.declared_horizon > 20;

  const positionLine = isContenderTier
    ? "You're in the contender tier."
    : isMidPack
      ? "You're in the middle of the league with a real path forward."
      : isBackHalf
        ? "You're in the back half on win-now, but the future is the play."
        : "You drafted into a contender window.";

  const futureLine = isFutureLoaded
    ? " Future is stocked; you can buy now or hold for 2027."
    : data.future_rank > half
      ? " Future is thin; trades to refresh youth matter mid-season."
      : "";

  const buildHorizon =
    data.build_label === "Future Build"
      ? 60
      : data.build_label === "Future Lean"
        ? 30
        : data.build_label === "Win-Now Build"
          ? -60
          : data.build_label === "Win-Now Lean"
            ? -30
            : 0;
  const drift = Math.abs(data.declared_horizon - buildHorizon);
  const doctrineLine =
    drift >= 60
      ? ` Doctrine drift: you said ${
          isWinNowDoctrine ? "Win-Now" : isFutureDoctrine ? "Future" : "Balanced"
        }, you drafted ${data.build_label}. Tighten one or the other.`
      : data.declared_horizon === 0 && data.build_label !== "Balanced Build"
        ? ""
        : " Doctrine and behavior are aligned; play it forward.";

  const valueLine =
    grade.letter[0] === "A"
      ? "extracted the available value"
      : grade.letter[0] === "B"
        ? "got most of the available value"
        : "left value on the table";

  return `${positionLine}${futureLine}${doctrineLine} You ${valueLine} given the league you drew. The next 4 months are about converting variance into floor.`;
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

  const grade = computeGrade(data);
  const topPicks = mounted ? topPicksOf(data.picks, history) : [];
  const whiffs = mounted ? whiffPicksOf(data.picks) : [];

  const buildHorizon =
    data.build_label === "Future Build"
      ? 60
      : data.build_label === "Future Lean"
        ? 30
        : data.build_label === "Win-Now Build"
          ? -60
          : data.build_label === "Win-Now Lean"
            ? -30
            : 0;
  const horizonDrift = Math.abs(data.declared_horizon - buildHorizon);
  const driftIsSignificant = horizonDrift >= 60;

  return (
    <div className="mt-6 space-y-12">
      <section className="rounded-xl border-2 border-accent/60 bg-surface px-6 py-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          The verdict
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div className="text-7xl font-bold tracking-tight text-accent">
            {grade.letter}
          </div>
          <div className="flex flex-col">
            <div className="text-xl font-semibold text-foreground">
              {grade.tagline}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
              Relative to your league. Win-now rank{" "}
              <span className="text-foreground">{ordinal(data.win_now_rank)}</span>{" "}
              of {data.totalTeams}, future rank{" "}
              <span className="text-foreground">{ordinal(data.future_rank)}</span>
              .
            </div>
          </div>
        </div>
        <p className="mt-5 max-w-prose text-sm text-foreground leading-relaxed">
          {heroVerdictCopy(data, grade)}
        </p>
      </section>

      {diagnose && (
        <section className="rounded-md border border-warning/40 bg-warning/5 px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-warning">
            Diagnose · grade math
          </div>
          <div className="mt-3 grid gap-1 font-mono text-[11px] text-foreground sm:grid-cols-2">
            <div>
              composite score:{" "}
              <span className="text-accent">
                {grade.score.toFixed(3)}
              </span>{" "}
              → {grade.letter}
            </div>
            <div>
              talent: {grade.components.talent.toFixed(3)} (win-now{" "}
              {grade.components.win_now_pct.toFixed(2)} | future{" "}
              {grade.components.future_pct.toFixed(2)})
            </div>
            <div>
              pickValue: {grade.components.pickValue.toFixed(3)} (total
              ADP delta {grade.components.totalAdpDelta.toFixed(0)})
            </div>
            <div>
              coherence: {grade.components.coherence.toFixed(3)} (drift{" "}
              {grade.components.drift.toFixed(0)} pts)
            </div>
            <div>
              completeness: {grade.components.completeness.toFixed(3)}{" "}
              (missing {grade.components.missingPositions} pos)
            </div>
            <div>
              declared horizon: {data.declared_horizon} · build:{" "}
              {data.build_label}
            </div>
          </div>
          <div className="mt-3 font-mono text-[10px] text-muted-2">
            weighted contributions · talent 0.55 ·{" "}
            {(0.55 * grade.components.talent).toFixed(3)} | pickValue 0.25 ·{" "}
            {(0.25 * grade.components.pickValue).toFixed(3)} |
            coherence 0.10 ·{" "}
            {(0.1 * grade.components.coherence).toFixed(3)} |
            completeness 0.10 ·{" "}
            {(0.1 * grade.components.completeness).toFixed(3)}
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
        {driftIsSignificant && (
          <div className="mt-4 rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-foreground">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-warning">
              Doctrine drift ·{" "}
            </span>
            You set Horizon{" "}
            <span className="font-semibold">
              {data.declared_horizon > 0 ? "+" : ""}
              {data.declared_horizon}
            </span>{" "}
            (
            {data.declared_horizon > 0
              ? "Future"
              : data.declared_horizon < 0
                ? "Win-Now"
                : "Balanced"}
            ) on the Soundboard. Your build closed at{" "}
            <span className="font-semibold">{data.build_label}</span>. That's{" "}
            {horizonDrift} points of drift. Either the dial was a vibe rather
            than an instruction, or the late-round picks over-corrected. Worth
            tightening before training camp so your trade behavior matches
            your doctrine.
          </div>
        )}
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
