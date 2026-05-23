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
import { startupPickValue } from "@/lib/players/future-picks";
import { rerankByConsensus } from "@/lib/players/rerank";
import type { PathCompetition } from "@/lib/strategy/same-path-threats/build";
import { getHardStarterReqs } from "@/lib/engine/roster-fit";
import { AskCoachButton } from "./ask-coach-button";

const PICKS_PER_FORK = 4; // up to 4 candidates surfaced; variable per fork

// EV-band thresholds (KTC-equivalent, 0-100 scale). A candidate's
// player_value vs the slot's KTC anchor at this pick determines tier:
//   bargain: candidate is meaningfully above slot value (buy low)
//   fair:    within the ZOPA band (no flag)
//   reach:   meaningfully below slot value (only justified by need)
//
// Threshold is +/-8 points which approximates +/-15% in mid-rounds
// where slot anchors live in the 20-50 range (mirrors the trade-
// realism fairness band used in the SYSTEM_PROMPT). Per user feedback
// 2026-04-24: forks should respect EV unless need forces the reach;
// bargains should be surfaced as future leverage.
const EV_BARGAIN_DELTA = 8;
const EV_REACH_DELTA = 8;
// Magnitude of a "deep reach": candidate so far below slot value
// that even a starter-fill argument barely justifies them. Used to
// trim bottom candidates from path/depth forks (which never have a
// need-driven reason to reach).
const EV_DEEP_REACH_DELTA = 14;

type EvTier = "bargain" | "fair" | "reach";

function classifyEv(
  candidateValue: number | null | undefined,
  slotAnchor: number | null,
): { tier: EvTier; delta: number | null } {
  if (
    candidateValue == null ||
    slotAnchor == null ||
    !Number.isFinite(slotAnchor)
  ) {
    return { tier: "fair", delta: null };
  }
  const delta = candidateValue - slotAnchor;
  if (delta >= EV_BARGAIN_DELTA) return { tier: "bargain", delta };
  if (delta <= -EV_REACH_DELTA) return { tier: "reach", delta };
  return { tier: "fair", delta };
}
const POSITION_ORDER: Position[] = ["QB", "RB", "WR", "TE"];
const POSITION_LABEL: Record<Position, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DST: "DST",
};

// Per-candidate EV annotation. Attached server-side via the
// playerValuesById lookup; surfaced inline as a tier badge.
type CandidateEv = {
  player_id: string;
  ev_tier: EvTier;
  // Player KTC value minus slot anchor; positive = bargain, negative
  // = reach. Null when player_value or slot anchor is unavailable.
  ev_delta: number | null;
};

type StarterNeedFork = {
  kind: "starter_need";
  position: Position;
  have: number;
  need: number;
  candidates: AvailablePlayer[];
  candidate_ev: CandidateEv[];
  // Magnitude of necessary reach when no in-band candidates exist.
  // Drives the "best you can do here despite the hole" framing.
  forced_reach_magnitude: number | null;
};

type PathFork = {
  kind: "path";
  position: Position;
  ranked: RankedArchetype;
  candidates: ArchetypeCandidate[];
  candidate_ev: CandidateEv[];
  // Number of opponents whose roster shape competes for this same
  // path. From PathCompetition keyed by archetype_id. Null when no
  // competition data was provided.
  competitor_count: number | null;
};

type DepthFork = {
  kind: "depth";
  position: Position;
  candidates: AvailablePlayer[];
  candidate_ev: CandidateEv[];
};

type EarnedValueFork = {
  kind: "earned_value";
  candidates: AvailablePlayer[];
  candidate_ev: CandidateEv[];
};

type BargainHuntFork = {
  kind: "bargain_hunt";
  candidates: AvailablePlayer[];
  candidate_ev: CandidateEv[];
};

type Fork =
  | StarterNeedFork
  | PathFork
  | DepthFork
  | EarnedValueFork
  | BargainHuntFork;

function starterNeeds(snap: LeagueSnapshot): Record<Position, number> {
  const reqs = getHardStarterReqs(snap);
  const total = reqs.QB + reqs.RB + reqs.WR + reqs.TE + reqs.K + reqs.DST;
  if (total === 0) {
    // Fallback only for unparseable roster_positions. Conventional defaults.
    const isSuperflex = snap.format === "superflex" || snap.format === "2qb";
    return { QB: isSuperflex ? 2 : 1, RB: 2, WR: 3, TE: 1, K: 0, DST: 0 };
  }
  return reqs;
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
  playerValuesById,
  currentPickNo,
  pathCompetition,
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
  // KTC-equivalent player values, keyed by Sleeper player_id. Used to
  // tag each candidate with bargain/fair/reach relative to slot anchor.
  // Empty record when FantasyCalc fetch failed; component degrades to
  // ungraded forks (no badges, no bargain-hunt).
  playerValuesById?: Record<string, number>;
  // Overall pick number the user is on/about to be on. Drives the
  // KTC slot anchor via startupPickValue. Null when no active draft.
  currentPickNo?: number | null;
  // Per-archetype opponent competition. When provided, path forks
  // render a "N opponents chasing" hint so the user knows whether
  // their lean is contested or unique. Per user feedback 2026-04-24:
  // path competition belongs as compressed signal here, not as a
  // separate panel high on the page.
  pathCompetition?: PathCompetition | null;
}) {
  const valuesById = playerValuesById ?? {};
  // Slot anchor: KTC-equivalent value of THIS pick slot on the same
  // 0-100 scale player_values use. Null when no draft is active. We
  // intentionally do NOT apply the SF multiplier here because the
  // FantasyCalc player values were fetched format-aware (numQbs=2 for
  // SF), so both sides of the comparison are already format-normalized.
  const slotAnchor =
    currentPickNo != null && currentPickNo > 0
      ? startupPickValue(currentPickNo)
      : null;
  const valueOf = (id: string): number | null => {
    const v = valuesById[id];
    return typeof v === "number" ? v : null;
  };
  const evFor = (id: string): CandidateEv => {
    const v = valueOf(id);
    const cls = classifyEv(v, slotAnchor);
    return {
      player_id: id,
      ev_tier: cls.tier,
      ev_delta: cls.delta,
    };
  };
  // Three-tier preference cascade lives in lib/players/rerank.ts so
  // the same cascade is used by available.ts (hub-page harmonization)
  // and Strategic Forks. Per audit 2026-04-25: previously the cascade
  // was duplicated, so the available pool ordering and Strategic
  // Forks' internal ordering could disagree on the same player. Now
  // there's one canonical source.
  function rerank<
    T extends {
      player_id?: string;
      id?: string;
      adp?: number | null;
    },
  >(items: T[]): T[] {
    return rerankByConsensus(items, valuesById);
  }
  // Per-archetype competitor count from PathCompetition. Keyed by
  // archetype_id; empty when path competition wasn't computed for this
  // hub render (e.g. no opponents with confidence). Path forks render
  // this as "N opponents chasing" beneath the path label so the user
  // sees competition signal compressed into the same panel.
  const competitorCountByArchetype = new Map<string, number>();
  if (pathCompetition && pathCompetition.paths.length > 0) {
    for (const p of pathCompetition.paths) {
      competitorCountByArchetype.set(p.archetype_id, p.threats.length);
    }
  }
  // VALUE PLAYS REFOCUS (2026-04-27 founder direction): position-
  // forks (starter_need, path, depth) deleted. Their content is
  // duplicated by the Decision card lane grid which is timeline-
  // grouped and richer. Kept on this surface: earned_value and
  // bargain_hunt. They answer "value vs slot anchor" which is
  // distinct from lanes' "value vs my roster fit." Founder said:
  // "I'm in love with the max dynasty value and buy low, flip
  // later boxes."

  // EV-band filtering rules retained for the two surviving forks:
  //   earned_value: only fair-or-bargain. "Earned" means at-or-above
  //                 slot value by definition.
  //   bargain_hunt: top players whose value > slot anchor by the
  //                 bargain threshold. Cross-position. Surfaces
  //                 future-leverage picks (buy low, flip later).
  // (Position fork loop deleted; see VALUE PLAYS REFOCUS comment
  // above. The `forks` array starts empty and gets the EV +
  // bargain entries appended below.)

  // Earned Value fork: top dynasty-value players regardless of
  // position, AT-OR-ABOVE slot anchor. "Earned" by definition excludes
  // reaches; if every option is a reach, the fork drops out (we don't
  // want to surface "best of bad reaches" as earned value). Wider
  // window + KTC re-rank so the cross-position top-of-board reflects
  // market dynasty value, not Sleeper's NFL-relevance heuristic.
  const evPool = rerank(available.slice(0, 30)).slice(
    0,
    PICKS_PER_FORK + 4,
  );
  const evdEv = evPool.map((p) => ({ p, ev: evFor(p.id) }));
  // Earned Value and Bargain Hunt must be DISJOINT by tier or they
  // surface identical lists. Bug 2026-04-28: earned_value previously
  // accepted "fair OR bargain" (everything not a reach), so in late
  // rounds where the slot anchor is low and most top-of-board picks
  // are bargains, both forks showed the same 4 players. Founder:
  // "that caused me to doubt it." Fix: earned_value is fair-tier
  // only (value matches what you're paying); bargain_hunt is bargain-
  // tier only (value exceeds what you're paying). Disjoint by
  // definition. In late rounds when there are no fair-tier picks,
  // earned_value drops out honestly rather than duplicating bargain.
  const earnedFiltered = evdEv.filter(
    (x) => x.ev.ev_tier === "fair" || x.ev.ev_delta == null,
  );
  const earnedTrimmed = earnedFiltered.slice(0, PICKS_PER_FORK);

  // Bargain Hunt fork: cross-position top-tier values that go below
  // their KTC at this slot. Future leverage; "buy low, flip later" is
  // the user's framing. Suppressed when there are fewer than 2 real
  // bargains (no signal to surface).
  const bargainPool = available.slice(0, 60).map((p) => ({
    p,
    ev: evFor(p.id),
  }));
  const bargains = bargainPool
    .filter((x) => x.ev.ev_tier === "bargain")
    .sort((a, b) => (b.ev.ev_delta ?? 0) - (a.ev.ev_delta ?? 0))
    .slice(0, PICKS_PER_FORK);

  const forks: Fork[] = [];
  if (earnedTrimmed.length > 0) {
    forks.push({
      kind: "earned_value",
      candidates: earnedTrimmed.map((x) => x.p),
      candidate_ev: earnedTrimmed.map((x) => x.ev),
    });
  }
  if (bargains.length >= 2) {
    forks.push({
      kind: "bargain_hunt",
      candidates: bargains.map((x) => x.p),
      candidate_ev: bargains.map((x) => x.ev),
    });
  }
  if (forks.length === 0) return null;

  // Layout: 4 across on lg (so the rows stay balanced even with 5-7
  // forks; extra forks wrap to a second row), 2 across on md, 1 on mobile.
  // Two forks max on this surface (earned_value, bargain_hunt). Two
  // columns on md+, single on mobile.
  const cols = "md:grid-cols-2";

  return (
    <section className="mt-8">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        Value plays
        {myPickLabel ? ` at ${myPickLabel}` : ""}
      </div>
      <p className="mt-1 text-sm text-muted">
        Cross-position value vs your slot anchor. Lanes (above) tell
        you what fits your roster; this tells you what the market is
        mispricing right now.
      </p>
      {slotAnchor != null && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          EV badges: BARGAIN = player KTC above this slot's value · REACH = below.
          Numbers are points on the 0-100 KTC scale (slot anchor here ≈ {Math.round(slotAnchor)}).
        </p>
      )}
      <div className={`mt-4 grid gap-3 ${cols}`}>
        {forks.map((f) => (
          <ForkCard
            key={
              f.kind === "path"
                ? `path-${f.ranked.archetype.id}`
                : f.kind === "earned_value"
                  ? "earned-value"
                  : f.kind === "bargain_hunt"
                    ? "bargain-hunt"
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

function pathTradeoff(
  ranked: RankedArchetype,
  competitorCount: number | null,
): string {
  const h = ranked.archetype.horizon;
  const driftPct = Math.round(ranked.drift_score * 100);
  // Competition tail: "Contested by N opponents." or "Uncontested."
  // Per user feedback 2026-04-24: viability vs competition is the
  // signal that compresses Path Competition / Strategy Lab into the
  // fork itself. Null = data unavailable (don't fabricate); 0 = clear
  // lane; >=1 = name how many.
  const compTail =
    competitorCount == null
      ? ""
      : competitorCount === 0
        ? " Lane is uncontested."
        : ` ${competitorCount} opponent${competitorCount === 1 ? "" : "s"} chasing the same shape.`;
  if (h >= 60)
    return `Doubles down on win-now. Currently drifting ${driftPct}% toward this path.${compTail}`;
  if (h <= -60)
    return `Adds to the rebuild stack. Currently drifting ${driftPct}% toward this path.${compTail}`;
  if (h >= 20)
    return `Modest win-now push. Currently drifting ${driftPct}% toward this path.${compTail}`;
  if (h <= -20)
    return `Modest future tilt. Currently drifting ${driftPct}% toward this path.${compTail}`;
  return `Balanced add. Currently drifting ${driftPct}% toward this path.${compTail}`;
}

function depthTradeoff(position: Position): string {
  return `No top-ranked path is anchored at ${POSITION_LABEL[position]} right now. This is a depth/value pick rather than a directional commitment.`;
}

function starterNeedTradeoff(
  have: number,
  need: number,
  position: Position,
  forcedReachMagnitude: number | null,
): string {
  const baseHole =
    have === 0
      ? `You have 0 starter ${POSITION_LABEL[position]}s (need ${need}).`
      : `You have ${have}/${need} starter ${POSITION_LABEL[position]}s. Below need.`;
  const reachClause =
    forcedReachMagnitude && forcedReachMagnitude > 0
      ? ` Best ${POSITION_LABEL[position]} on the board is ~${forcedReachMagnitude} below this slot's KTC anchor; the hole is bigger than the reach, but know you're paying it.`
      : ` Filling the hole almost always beats doubling down on a path you're already executing.`;
  return `${baseHole}${reachClause}`;
}

function earnedValueTradeoff(): string {
  return "Top dynasty-value players on the board (KTC at-or-above this slot's anchor), any position. Reaches filtered out: by definition, earned value can't be a discount on yourself.";
}

function bargainHuntTradeoff(): string {
  return "Players whose KTC value sits above this slot's expected anchor. Buy-low candidates: take them now and you're banking future trade value, not just filling a roster slot.";
}

// Format ADP for chip display. Sleeper ADPs use one decimal place
// (e.g., 154.6); render as integer for compact card display.
function fmtAdp(adp: number | null | undefined): string {
  if (adp == null || !Number.isFinite(adp)) return "n/a";
  return Math.round(adp).toString();
}

// Compact ROOKIE chip. Speculative-asset signal: pre-NFL-draft rookies
// often have no team / no age / no ADP, and dynasty value is volatile
// based on landing spot. The general should know.
function RookieChip() {
  return (
    <span
      className="ml-1.5 rounded-sm border border-accent/60 bg-accent/10 px-1 py-0 font-mono text-[9px] uppercase tracking-[0.14em] text-accent"
      title="Incoming rookie. Pre-NFL-draft value is speculative pending landing spot."
    >
      Rookie
    </span>
  );
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

// EV-tier badge. Single non-wrapping chip rendered inline next to
// player names. Number = points above (+) or below (-) this slot's
// KTC anchor on the 0-100 scale used by player values and pick
// values. Tooltip spells out the scale; the panel header carries a
// one-line legend so users don't have to hover to learn it.
//
// Fair tier renders nothing (clutter-free). Whitespace-nowrap +
// inline-flex keeps the chip atomic so it never breaks internally
// and never gets stranded on its own line below the name.
function EvBadge({ ev }: { ev: CandidateEv }) {
  if (ev.ev_tier === "fair" || ev.ev_delta == null) return null;
  const isBargain = ev.ev_tier === "bargain";
  const sign = ev.ev_delta >= 0 ? "+" : "";
  const tone = isBargain
    ? "border-success/60 bg-success/10 text-success"
    : "border-warning/60 bg-warning/10 text-warning";
  const label = isBargain ? "BARGAIN" : "REACH";
  const title = isBargain
    ? `Player's KTC value is ${Math.round(ev.ev_delta)} points above this slot's expected value (0-100 scale). Buying low.`
    : `Player's KTC value is ${Math.round(Math.abs(ev.ev_delta))} points below this slot's expected value (0-100 scale). Only justified by need.`;
  return (
    <span
      className={`ml-1.5 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border ${tone} px-1 py-0 font-mono text-[9px] uppercase tracking-[0.14em]`}
      title={title}
    >
      <span>{label}</span>
      <span className="opacity-80">
        {sign}
        {Math.round(ev.ev_delta)}
      </span>
    </span>
  );
}

function ForkCard({ fork }: { fork: Fork }) {
  if (fork.candidates.length === 0) return null;
  const primary = fork.candidates[0];
  const backups = fork.candidates.slice(1);
  const primaryDivergence = divergenceNote(primary);
  const evList = fork.candidate_ev;
  const primaryEv = evList[0];

  const isPathFork = fork.kind === "path";
  const isStarterNeedFork = fork.kind === "starter_need";
  const isEarnedValueFork = fork.kind === "earned_value";
  const isBargainHuntFork = fork.kind === "bargain_hunt";
  const horizon = isPathFork
    ? horizonLabel(fork.ranked.archetype.horizon)
    : null;
  const isExecuting = isPathFork && fork.ranked.phase === "executing";

  // Visual tone:
  //   starter_need: red (you have a hole, but it's still your call)
  //   earned_value: success-green border (positive emphasis on value)
  //   bargain_hunt: success-green border (positive emphasis on value)
  //   path / depth: standard
  const cardBorder = isStarterNeedFork
    ? "border-2 border-danger/60 bg-danger/5"
    : isEarnedValueFork || isBargainHuntFork
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
  ) : isBargainHuntFork ? (
    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-success">
      Bargain hunt
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
  ) : isBargainHuntFork ? (
    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-success">
      Future leverage
    </span>
  ) : horizon ? (
    <span
      className={`font-mono text-[11px] uppercase tracking-[0.14em] ${horizon.tone}`}
      title="Horizon: -100 rebuild to +100 contender"
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
        : isBargainHuntFork
          ? "Buy low, flip later"
          : `Best at ${POSITION_LABEL[fork.position]}`;

  const innerBoxClass = isStarterNeedFork
    ? "mt-3 rounded-md border border-danger/40 bg-danger/5 px-3 py-2"
    : isEarnedValueFork || isBargainHuntFork
      ? "mt-3 rounded-md border border-success/40 bg-success/5 px-3 py-2"
      : "mt-3 rounded-md border border-accent/40 bg-accent/5 px-3 py-2";

  const innerLabelTone = isStarterNeedFork
    ? "text-danger"
    : isEarnedValueFork || isBargainHuntFork
      ? "text-success"
      : "text-accent";
  const innerLabelText = isStarterNeedFork
    ? "Take to fill"
    : isEarnedValueFork
      ? "Top value"
      : isBargainHuntFork
        ? "Best bargain"
        : "Primary";

  const innerDividerClass = isStarterNeedFork
    ? "border-danger/20"
    : isEarnedValueFork || isBargainHuntFork
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
            {primary.is_rookie && <RookieChip />}
            {primaryEv && <EvBadge ev={primaryEv} />}
          </span>
          {primary.adp != null && (
            <span
              className="font-mono text-[10px] text-muted-2"
              title={`Dynasty ADP from Sleeper's projections data, format-aware. May differ 10-20 picks from Sleeper's live draft-room display.`}
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
                const ev = evList[i + 1];
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
                      {b.is_rookie && <RookieChip />}
                      {ev && <EvBadge ev={ev} />}
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
          ? pathTradeoff(fork.ranked, fork.competitor_count)
          : isStarterNeedFork
            ? starterNeedTradeoff(
                fork.have,
                fork.need,
                fork.position,
                fork.forced_reach_magnitude,
              )
            : isEarnedValueFork
              ? earnedValueTradeoff()
              : isBargainHuntFork
                ? bargainHuntTradeoff()
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
  if (fork.kind === "bargain_hunt") {
    return `Bargains on the board (going below their KTC value) are ${primary}${
      backups ? ` and ${backups}` : ""
    }. Worth grabbing as future leverage even if not a starter need?`;
  }
  return `Best depth at ${POSITION_LABEL[fork.position]} is ${primary}${
    backups ? ` or ${backups}` : ""
  }. Worth taking, or push a different direction?`;
}
