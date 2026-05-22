"use client";

/**
 * Decision Board. The main pick-consideration area (founder direction
 * 2026-05-21: "a main area where I'm considering my picks for various
 * reasons/angles ... all angles in one section"). The Call is a
 * one-line verdict on top; below it the same candidates are weighed
 * from four angles, in the founder's order:
 *
 *   1. By Lane   win-now / balanced / future columns
 *   2. By Tier / EV   tier drops (left) + best value (right)
 *   3. By Play   which plays this pick's options serve
 *   4. By Path   the Draft Path Projector sequences
 *
 * Strategic Lanes (the old 3-lane grid) and the standalone Tier Map +
 * Draft Path Projector are folded in here. Reads canonical Decision +
 * TierMap + DraftPathProjection data only; no new math.
 */

import { useEffect, useMemo, useState } from "react";
import type {
  Decision,
  DecisionQuadrantCandidate,
} from "@/lib/strategy/decision-synthesis/types";
import type { DraftPathProjection } from "@/lib/strategy/draft-paths/types";
import type { TierMap as TierMapData } from "@/lib/engine/evaluation/tier-map";
import type { PlayCommitment } from "@/lib/strategy/plays/types";
import { CandidateBlock, computeEv } from "./candidate-bits";
import { TierMap } from "../tier-map";
import { DraftPathProjector } from "../draft-path-projector";
import { getActivePlayCommitments, archetypeLabel } from "@/lib/plays-storage";

export type DecisionBoardProps = {
  decision: Decision;
  tierMap: TierMapData | null;
  pathProjection: DraftPathProjection | null;
  leagueId: string;
};

const LANES: { id: "win-now" | "balanced" | "future"; label: string }[] = [
  { id: "win-now", label: "Win-Now" },
  { id: "balanced", label: "Balanced" },
  { id: "future", label: "Future" },
];

function AngleHeader({ n, label, hint }: { n: number; label: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
        {n} · {label}
      </span>
      {hint && (
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
          {hint}
        </span>
      )}
    </div>
  );
}

export function DecisionBoard({
  decision,
  tierMap,
  pathProjection,
  leagueId,
}: DecisionBoardProps) {
  const pickNo = decision.pick_no;
  const standingCallId = decision.recommendation.player_id;

  const [activePlays, setActivePlays] = useState<PlayCommitment[]>([]);
  useEffect(() => {
    setActivePlays(getActivePlayCommitments(leagueId));
  }, [leagueId]);

  const advancesByPlayer = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of activePlays) {
      for (const t of c.followthrough_targets) {
        const existing = m.get(t.player_id);
        if (existing) existing.push(c.play_name);
        else m.set(t.player_id, [c.play_name]);
      }
    }
    return m;
  }, [activePlays]);

  const cands = decision.quadrant_candidates;
  const withEv = cands.map((c) => ({ c, ev: computeEv(c, pickNo) }));
  const ranked = withEv
    .filter((x) => x.ev != null)
    .sort((a, b) => (b.ev as number) - (a.ev as number));
  const bestEv = ranked[0] ?? null;
  const isBestEv = bestEv != null && bestEv.c.player_id === standingCallId;
  const callEv = computeEv(
    cands.find((c) => c.player_id === standingCallId) ?? decision.recommendation as unknown as DecisionQuadrantCandidate,
    pickNo,
  );
  const callEvColor =
    callEv == null ? "text-muted-2" : callEv >= 0 ? "text-success" : "text-danger";

  const byLane = new Map<string, DecisionQuadrantCandidate[]>();
  for (const c of cands) {
    const list = byLane.get(c.timeline_lane);
    if (list) list.push(c);
    else byLane.set(c.timeline_lane, [c]);
  }
  for (const list of byLane.values()) {
    list.sort((a, b) => (computeEv(b, pickNo) ?? -999) - (computeEv(a, pickNo) ?? -999));
  }

  // Best available: the actual best players left, sorted by raw
  // dynasty value (BPA order). Survival is called out per row so the
  // user can weigh "take the slightly lower-value player now because
  // the better one survives to my next pick" (founder direction
  // 2026-05-21). EV/discount still shows per row via CandidateBlock.
  const bestAvailable = [...cands]
    .filter((c) => typeof c.value === "number")
    .sort((a, b) => (b.value as number) - (a.value as number))
    .slice(0, 8);

  // By Play: committed plays a board candidate advances, plus the
  // plays this pick enables, each with the on-board candidates serving
  // them.
  const playRows: {
    key: string;
    label: string;
    archetype: string;
    kind: "committed" | "enables";
    servers: DecisionQuadrantCandidate[];
  }[] = [];
  for (const pc of activePlays) {
    const servers = cands.filter((c) =>
      pc.followthrough_targets.some((t) => t.player_id === c.player_id),
    );
    if (servers.length > 0) {
      playRows.push({
        key: `c:${pc.commitment_id}`,
        label: pc.play_name,
        archetype: archetypeLabel(pc.archetype),
        kind: "committed",
        servers,
      });
    }
  }
  for (const p of decision.plays_this_enables) {
    playRows.push({
      key: `e:${p.archetype}:${p.primary_player.player_id}`,
      label: p.name,
      archetype: archetypeLabel(p.archetype),
      kind: "enables",
      servers: cands.filter((c) =>
        p.followthrough.target_candidates.some((t) => t.player_id === c.player_id),
      ),
    });
  }

  return (
    <div className="px-5 py-5 space-y-6">
      {/* Verdict (one line) */}
      <div className="rounded-md border border-accent/60 bg-accent/5 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              The Call
            </span>
            <span className="text-[16px] font-semibold text-foreground">
              {decision.recommendation.name}
            </span>
            <span className="font-mono text-[10px] text-muted-2">
              {decision.recommendation.position}
              {decision.recommendation.team
                ? `-${decision.recommendation.team}`
                : ""}
            </span>
          </div>
          {callEv != null && (
            <span
              className={`shrink-0 font-mono text-[20px] font-semibold ${callEvColor} leading-none`}
            >
              {callEv >= 0 ? "+" : ""}
              {callEv.toFixed(1)}
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] leading-snug">
          {isBestEv ? (
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-success border border-success/60 rounded-full px-1.5 py-0.5">
              Best EV available
            </span>
          ) : bestEv && bestEv.ev != null ? (
            <span className="text-warning">
              Raw-EV leader: {bestEv.c.name} ({bestEv.ev >= 0 ? "+" : ""}
              {bestEv.ev.toFixed(1)}). The call weighs survival + fit; see
              By Tier / EV below.
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[12px] leading-snug text-muted">
          {decision.recommendation.primary_reason}
        </p>
      </div>

      {/* 1 · By Lane */}
      <div>
        <AngleHeader n={1} label="By lane" hint="win-now / balanced / future" />
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LANES.map((lane) => {
            const inLane = (byLane.get(lane.id) ?? []).slice(0, 3);
            return (
              <div
                key={lane.id}
                className="rounded-md border border-border-soft bg-surface/30 px-3 py-3"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
                  {lane.label}
                </div>
                {inLane.length === 0 ? (
                  <p className="mt-2 text-[11px] text-muted-2">
                    No {lane.label.toLowerCase()} candidate in the top pool.
                  </p>
                ) : (
                  <div className="mt-1 space-y-3">
                    {inLane.map((c) => (
                      <CandidateBlock
                        key={c.player_id}
                        candidate={c}
                        currentPickNo={pickNo}
                        isStandingCall={c.player_id === standingCallId}
                        advancesPlays={advancesByPlayer.get(c.player_id) ?? []}
                        compact
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2 · By Tier / EV */}
      <div>
        <AngleHeader n={2} label="By tier / EV" hint="tier drops · best available" />
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-border-soft bg-surface/30 px-1 py-1">
            {tierMap ? (
              <TierMap data={tierMap} />
            ) : (
              <p className="px-3 py-3 text-[11px] text-muted-2">
                Tier map unavailable for this pool.
              </p>
            )}
          </div>
          <div className="rounded-md border border-border-soft bg-surface/30 px-3 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
              Best available
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-2">
              Best players left by value. Survival is each one's chance
              to reach your next pick: dip to a lower-value player when
              the better one will still be there.
            </p>
            {bestAvailable.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-2">
                No valued candidates in the pool.
              </p>
            ) : (
              <div className="mt-1 space-y-3">
                {bestAvailable.map((c) => (
                  <CandidateBlock
                    key={c.player_id}
                    candidate={c}
                    currentPickNo={pickNo}
                    isStandingCall={c.player_id === standingCallId}
                    advancesPlays={advancesByPlayer.get(c.player_id) ?? []}
                    compact
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3 · By Play */}
      {playRows.length > 0 && (
        <div>
          <AngleHeader n={3} label="By play" hint="which options serve a plan" />
          <ul className="mt-2 space-y-2">
            {playRows.map((row) => (
              <li
                key={row.key}
                className="rounded-md border border-border-soft bg-surface/30 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
                    {row.archetype}
                  </span>
                  <span className="text-[13px] font-semibold text-foreground">
                    {row.label}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
                    {row.kind === "committed" ? "committed" : "this pick enables"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted">
                  {row.servers.length > 0
                    ? `On the board now: ${row.servers.map((c) => c.name).join(", ")}`
                    : "No board candidate serves this yet; it opens on a later pick."}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4 · By Path */}
      {pathProjection && pathProjection.paths.length > 0 && (
        <div>
          <AngleHeader n={4} label="By path" hint="multi-pick sequences" />
          <div className="mt-2">
            <DraftPathProjector projection={pathProjection} />
          </div>
        </div>
      )}
    </div>
  );
}
