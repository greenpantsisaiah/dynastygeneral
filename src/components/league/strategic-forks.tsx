/**
 * Strategic forks panel. The side-by-side view of "which pick pushes
 * which path" at the user's current draft moment.
 *
 * Design ethos: don't pick the user's strategy for them. Surface the
 * options, let the general decide. We render forks in position order
 * (QB / RB / WR / TE) regardless of whether the user has a starter
 * hole at any of them. Starter-need forks get visual emphasis (red
 * tint, "FILL STARTER" header) so the user sees the trade-off clearly,
 * but they aren't promoted to first slot. Filling a need vs. taking
 * earned value is itself a strategic fork.
 *
 * Plus a peer "Earned Value" fork at the end pulls the top 3 dynasty-
 * ranked players regardless of position. Picks the position-agnostic
 * best-on-board so the user can compare "fill RB hole (Saquon, 29)"
 * vs. "max value (Cam Ward, 23)" side by side.
 *
 * Each fork shows primary + 2 backups. Same player appearing in two
 * different paths is fine and expected: a redundant top recommendation
 * is meaningful (the pick is correct regardless of which path you commit).
 *
 * No LLM. Just a presentation of data we already compute server-side.
 *
 * Stage B: integrate KTC / ADP / FantasyPros as additional ranking
 * sources, render side-by-side ("KTC says X, ADP says Y, our heuristic
 * says Z"). Today we use Sleeper search_rank × age + position factor
 * for dynasty value, which is the best free signal but not authoritative.
 */

import type {
  ArchetypeCandidate,
  Position,
  RankedArchetype,
} from "@/lib/strategy/archetypes/schema";
import type { AvailablePlayer } from "@/lib/players/available";
import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { AskCoachButton } from "./ask-coach-button";

const PICKS_PER_FORK = 3; // primary + 2 backups
const POSITION_ORDER: Position[] = ["QB", "RB", "WR", "TE"];
const POSITION_LABEL: Record<Position, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DST: "DST",
};

type StarterNeedFork = {
  kind: "starter_need";
  position: Position;
  have: number;
  need: number;
  candidates: AvailablePlayer[];
};

type PathFork = {
  kind: "path";
  position: Position;
  ranked: RankedArchetype;
  candidates: ArchetypeCandidate[];
};

type DepthFork = {
  kind: "depth";
  position: Position;
  candidates: AvailablePlayer[];
};

type EarnedValueFork = {
  kind: "earned_value";
  candidates: AvailablePlayer[];
};

type Fork = StarterNeedFork | PathFork | DepthFork | EarnedValueFork;

function starterNeeds(format: LeagueSnapshot["format"]): Record<Position, number> {
  const isSuperflex = format === "superflex" || format === "2qb";
  return { QB: isSuperflex ? 2 : 1, RB: 2, WR: 3, TE: 1, K: 0, DST: 0 };
}

function inferPrimaryPosition(r: RankedArchetype): Position | null {
  const id = r.archetype.id;
  const cat = r.archetype.category;
  if (id.startsWith("qb-") || cat === "Positional Leverage") return "QB";
  if (id.startsWith("wr-") || cat === "WR Strategy") return "WR";
  if (id.startsWith("rb-") || cat === "RB Strategy") return "RB";
  if (id.startsWith("te-") || cat === "TE Strategy") return "TE";
  return null;
}

export function StrategicForks({
  ranked,
  available,
  snapshot,
  myPickLabel,
}: {
  ranked: RankedArchetype[];
  // Available player pool used to fill depth forks at positions that
  // no ranked archetype covers.
  available: AvailablePlayer[];
  // Roster context. Used to detect starter-need positions that should
  // be promoted above path forks.
  snapshot: LeagueSnapshot | null;
  // e.g. "14.9". null when not in active draft. Drives the header copy.
  myPickLabel: string | null;
}) {
  const me = snapshot?.rosters.find((r) => r.is_me) ?? null;
  const reqs = snapshot ? starterNeeds(snapshot.format) : null;
  const positionState = (pos: Position): { have: number; need: number } => {
    const have = me?.position_counts[pos] ?? 0;
    const need = reqs?.[pos] ?? 0;
    return { have, need };
  };
  const isStarterNeed = (pos: Position): boolean => {
    const { have, need } = positionState(pos);
    return need > 0 && have < need;
  };

  // Group ranked archetypes by position. Multiple paths can share a
  // position (QB Cartel + QB Volume Replacement); we surface up to 2
  // path forks per position so the user sees the strategic split
  // without one position dominating the row.
  const pathsByPosition: Record<Position, RankedArchetype[]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    K: [],
    DST: [],
  };
  for (const r of ranked) {
    const pos = inferPrimaryPosition(r);
    if (
      !pos ||
      !r.top_candidates ||
      r.top_candidates.length === 0 ||
      pathsByPosition[pos].length >= 2
    )
      continue;
    pathsByPosition[pos].push(r);
  }

  // Build forks in position order. Starter-need forks get visual
  // emphasis (red treatment) but stay in their position slot rather
  // than getting promoted to first. Filling a need vs. taking earned
  // value is itself a strategic choice; we surface both, the general
  // picks.
  const positionForks: Fork[] = [];
  for (const pos of POSITION_ORDER) {
    const { have, need } = positionState(pos);
    const paths = pathsByPosition[pos];
    const positionCandidates = available
      .filter((p) => (p.position ?? "").toUpperCase() === pos)
      .slice(0, PICKS_PER_FORK);

    if (isStarterNeed(pos) && positionCandidates.length > 0) {
      // Render starter-need fork instead of path/depth for this slot.
      // The starter-need treatment subsumes both since they'd surface
      // similar players at the position; the starter-need framing is
      // just sharper about WHY (you have a hole).
      positionForks.push({
        kind: "starter_need",
        position: pos,
        have,
        need,
        candidates: positionCandidates,
      });
      continue;
    }

    if (paths.length > 0) {
      for (const r of paths) {
        positionForks.push({
          kind: "path",
          position: pos,
          ranked: r,
          candidates: r.top_candidates!.slice(0, PICKS_PER_FORK),
        });
      }
    } else if (positionCandidates.length > 0) {
      positionForks.push({
        kind: "depth",
        position: pos,
        candidates: positionCandidates,
      });
    }
  }

  // Earned Value fork: top dynasty-rank players regardless of position.
  // Lets the user compare "fill RB hole (Saquon, 29)" vs "max value
  // (Cam Ward, 23)" head-to-head without our heuristic deciding for them.
  const earnedValuePicks = available.slice(0, PICKS_PER_FORK);
  const forks: Fork[] = [...positionForks];
  if (earnedValuePicks.length > 0) {
    forks.push({ kind: "earned_value", candidates: earnedValuePicks });
  }
  if (forks.length === 0) return null;

  // Layout: 4 across on lg (so the rows stay balanced even with 5-7
  // forks; extra forks wrap to a second row), 2 across on md, 1 on mobile.
  const cols =
    forks.length >= 4
      ? "md:grid-cols-2 lg:grid-cols-4"
      : forks.length === 3
        ? "md:grid-cols-3"
        : "md:grid-cols-2";

  return (
    <section className="mt-8">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        Strategic forks
        {myPickLabel ? ` at ${myPickLabel}` : ""}
      </div>
      <p className="mt-1 text-sm text-muted">
        Each pick pushes a different path. Pick the one that matches the
        direction you want.
      </p>
      <div className={`mt-4 grid gap-3 ${cols}`}>
        {forks.map((f) => (
          <ForkCard
            key={
              f.kind === "path"
                ? `path-${f.ranked.archetype.id}`
                : f.kind === "earned_value"
                  ? "earned-value"
                  : `${f.kind}-${f.position}`
            }
            fork={f}
          />
        ))}
      </div>
    </section>
  );
}

function horizonLabel(h: number): { text: string; tone: string } {
  if (h >= 60) return { text: "Win-now", tone: "text-success" };
  if (h <= -60) return { text: "Future", tone: "text-accent" };
  if (h >= 20) return { text: "Lean win-now", tone: "text-success" };
  if (h <= -20) return { text: "Lean future", tone: "text-accent" };
  return { text: "Balanced", tone: "text-foreground" };
}

function pathTradeoff(ranked: RankedArchetype): string {
  const h = ranked.archetype.horizon;
  const driftPct = Math.round(ranked.drift_score * 100);
  if (h >= 60)
    return `Doubles down on win-now. Currently drifting ${driftPct}% toward this path.`;
  if (h <= -60)
    return `Adds to the rebuild stack. Currently drifting ${driftPct}% toward this path.`;
  if (h >= 20)
    return `Modest win-now push. Currently drifting ${driftPct}% toward this path.`;
  if (h <= -20)
    return `Modest future tilt. Currently drifting ${driftPct}% toward this path.`;
  return `Balanced add. Currently drifting ${driftPct}% toward this path.`;
}

function depthTradeoff(position: Position): string {
  return `No top-ranked path is anchored at ${POSITION_LABEL[position]} right now. This is a depth/value pick rather than a directional commitment.`;
}

function starterNeedTradeoff(have: number, need: number, position: Position): string {
  if (have === 0) {
    return `You have 0 starter ${POSITION_LABEL[position]}s (need ${need}). Filling this hole almost always beats doubling down on a path you're already executing.`;
  }
  return `You have ${have}/${need} starter ${POSITION_LABEL[position]}s. Below need; fill the hole before doubling down elsewhere.`;
}

function earnedValueTradeoff(): string {
  return "Top dynasty-value players on the board, regardless of position. Heuristic: Sleeper rank scaled by age + position factor. KTC/ADP integration is a future feature.";
}

// Format ADP for chip display. Sleeper ADPs use one decimal place
// (e.g., 154.6); render as integer for compact card display.
function fmtAdp(adp: number | null | undefined): string {
  if (adp == null || !Number.isFinite(adp)) return "n/a";
  return Math.round(adp).toString();
}

// Divergence between Sleeper ADP rank and our dynasty heuristic rank.
// Both scales are "lower = better." A meaningful gap (>= 50 positions)
// is editorial. Either we like a player the market doesn't, or vice
// versa. Returns a one-line note or null when no divergence.
function divergenceNote(c: {
  adp?: number | null;
  search_rank?: number | null;
}): string | null {
  const adp = c.adp ?? null;
  const sleeperRank = c.search_rank ?? null;
  if (adp == null || sleeperRank == null) return null;
  const gap = adp - sleeperRank;
  // 30+ pick gap is editorially interesting. Less than that is noise
  // (Sleeper's algo and the market usually agree on top players).
  if (Math.abs(gap) < 30) return null;
  if (gap > 0) {
    return `Sleeper ranks #${sleeperRank} but market drafts at ${Math.round(adp)}. possible value pick.`;
  }
  return `Sleeper ranks #${sleeperRank} but market drafts at ${Math.round(adp)}. consensus reaches earlier than rank.`;
}

function ForkCard({ fork }: { fork: Fork }) {
  if (fork.candidates.length === 0) return null;
  const primary = fork.candidates[0];
  const backups = fork.candidates.slice(1);
  const primaryDivergence = divergenceNote(primary);

  const isPathFork = fork.kind === "path";
  const isStarterNeedFork = fork.kind === "starter_need";
  const isEarnedValueFork = fork.kind === "earned_value";
  const horizon = isPathFork
    ? horizonLabel(fork.ranked.archetype.horizon)
    : null;
  const isExecuting = isPathFork && fork.ranked.phase === "executing";

  // Visual tone:
  //   starter_need → red (you have a hole, but it's still your call)
  //   earned_value → success-green border (positive emphasis on value)
  //   path / depth → standard
  const cardBorder = isStarterNeedFork
    ? "border-2 border-danger/60 bg-danger/5"
    : isEarnedValueFork
      ? "border-2 border-success/50 bg-success/5"
      : "border border-border-strong bg-surface";

  const headerChip = isStarterNeedFork ? (
    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-danger">
      Fill starter
    </span>
  ) : isEarnedValueFork ? (
    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-success">
      Earned value
    </span>
  ) : (
    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">
      {isPathFork ? "Push" : "Depth"}
    </span>
  );

  const headerRight = isStarterNeedFork ? (
    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-danger">
      {fork.have}/{fork.need} {POSITION_LABEL[fork.position]}
    </span>
  ) : isEarnedValueFork ? (
    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-success">
      Any pos
    </span>
  ) : horizon ? (
    <span
      className={`font-mono text-[11px] uppercase tracking-[0.14em] ${horizon.tone}`}
      title="Horizon: -100 rebuild ↔ +100 contender"
    >
      {horizon.text}
    </span>
  ) : (
    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
      {POSITION_LABEL[fork.position]}
    </span>
  );

  const cardTitle = isPathFork
    ? fork.ranked.archetype.name
    : isStarterNeedFork
      ? `Fill ${POSITION_LABEL[fork.position]} starter hole`
      : isEarnedValueFork
        ? "Max dynasty value"
        : `Best at ${POSITION_LABEL[fork.position]}`;

  const innerBoxClass = isStarterNeedFork
    ? "mt-3 rounded-md border border-danger/40 bg-danger/5 px-3 py-2"
    : isEarnedValueFork
      ? "mt-3 rounded-md border border-success/40 bg-success/5 px-3 py-2"
      : "mt-3 rounded-md border border-accent/40 bg-accent/5 px-3 py-2";

  const innerLabelTone = isStarterNeedFork
    ? "text-danger"
    : isEarnedValueFork
      ? "text-success"
      : "text-accent";
  const innerLabelText = isStarterNeedFork
    ? "Take to fill"
    : isEarnedValueFork
      ? "Top value"
      : "Primary";

  const innerDividerClass = isStarterNeedFork
    ? "border-danger/20"
    : isEarnedValueFork
      ? "border-success/20"
      : "border-accent/20";

  return (
    <div className={`flex flex-col rounded-lg ${cardBorder} px-4 py-3`}>
      <div className="flex items-baseline justify-between gap-2">
        {headerChip}
        {headerRight}
      </div>
      <div className="mt-0.5 text-base font-semibold text-foreground">
        {cardTitle}
        {isExecuting && (
          <span className="ml-2 rounded-full border border-success/60 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-success">
            Executing
          </span>
        )}
      </div>

      <div className={innerBoxClass}>
        <div
          className={`font-mono text-[11px] uppercase tracking-[0.16em] ${innerLabelTone}`}
        >
          {innerLabelText}
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">
            {primary.name}
          </span>
          {primary.adp != null && (
            <span
              className="font-mono text-[10px] text-muted-2"
              title={`Sleeper ADP for this league format. lower = drafted earlier`}
            >
              ADP {fmtAdp(primary.adp)}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-2">
          {primary.position}
          {primary.team ? `-${primary.team}` : ""}
          {primary.age != null ? `, age ${primary.age}` : ""}
        </div>
        {primaryDivergence && (
          <div className="mt-1 text-[11px] italic text-accent">
            ⚠ {primaryDivergence}
          </div>
        )}

        {backups.length > 0 && (
          <div className={`mt-3 border-t pt-2 ${innerDividerClass}`}>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">
              Backups if gone
            </div>
            <ul className="mt-1 space-y-0.5">
              {backups.map((b, i) => {
                const id = "player_id" in b ? b.player_id : b.id;
                return (
                  <li
                    key={id}
                    className="flex items-baseline justify-between gap-2 text-xs"
                  >
                    <span>
                      <span className="font-mono text-[10px] text-muted-2">
                        {i + 2}.
                      </span>{" "}
                      <span className="font-medium text-foreground">
                        {b.name}
                      </span>
                      <span className="text-muted-2">
                        {" "}
                        · {b.position}
                        {b.team ? `-${b.team}` : ""}
                        {b.age != null ? `, age ${b.age}` : ""}
                      </span>
                    </span>
                    {b.adp != null && (
                      <span className="font-mono text-[10px] text-muted-2">
                        ADP {fmtAdp(b.adp)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted">
        {isPathFork
          ? pathTradeoff(fork.ranked)
          : isStarterNeedFork
            ? starterNeedTradeoff(fork.have, fork.need, fork.position)
            : isEarnedValueFork
              ? earnedValueTradeoff()
              : depthTradeoff(fork.position)}
      </p>

      <AskCoachButton prompt={buildForkCoachPrompt(fork)} />
    </div>
  );
}

// Compose a sharp question for the coach based on the fork kind. The
// coach already has league context; this just tells it which angle.
function buildForkCoachPrompt(fork: Fork): string {
  const primary = fork.candidates[0]?.name ?? "the top pick";
  const backups = fork.candidates
    .slice(1)
    .map((c) => c.name)
    .join(", ");
  if (fork.kind === "path") {
    return `Should I push ${fork.ranked.archetype.name} by taking ${primary}? Tradeoffs vs my other options${
      backups ? ` (alternatives: ${backups})` : ""
    }?`;
  }
  if (fork.kind === "starter_need") {
    return `I'm ${fork.have}/${fork.need} at ${POSITION_LABEL[fork.position]}. Should I take ${primary} to fill it? Which dynasty option is sharpest${
      backups ? ` (others: ${backups})` : ""
    }?`;
  }
  if (fork.kind === "earned_value") {
    return `Max dynasty value on the board is ${primary}${
      backups ? ` (then ${backups})` : ""
    }. Should I take the highest-value player regardless of position here?`;
  }
  return `Best depth at ${POSITION_LABEL[fork.position]} is ${primary}${
    backups ? ` or ${backups}` : ""
  }. Worth taking, or push a different direction?`;
}
