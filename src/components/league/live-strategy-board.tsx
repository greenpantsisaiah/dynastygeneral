"use client";

/**
 * Live Strategy Board. drift-based, never-empty board of archetype
 * candidates with trajectory indicators showing which paths are
 * widening or narrowing pick-by-pick.
 *
 * Replaces the old "lock in one strategy" mechanic with "working
 * toward". softer commitment that admits the path can shift as
 * others draft and the user makes more picks.
 *
 * Server passes RankedArchetype[] (drift_score, trajectory, openings,
 * live likelihoods). This component owns:
 *   - declared-archetype localStorage (now "working toward")
 *   - card expand/collapse interaction
 *   - drift + trajectory + opening rendering
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type {
  DriftDirection,
  RankedArchetype,
} from "@/lib/strategy/archetypes/schema";
import { getArchetype } from "@/lib/strategy/archetypes";
import type { DraftStatus } from "@/lib/sleeper/draft-state";
import {
  declaredArchetypeKey,
  readDeclaredArchetype,
  writeDeclaredArchetype,
} from "@/lib/strategy/declared-archetype";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// Horizon is a -100..+100 axis where -100 = pure rebuild, +100 = pure
// contender, 0 = perfectly balanced. The number alone isn't intuitive
// to most users (they see "30" or "-55" and ask "thirty of what?"), so
// we render a directional label + the signed value with a /100 anchor
// and a hover-tooltip that spells the scale out.
function horizonLabel(h: number): {
  label: string;
  tone: string;
  tooltip: string;
} {
  const tooltip =
    "Horizon scale: -100 (full rebuild) ↔ 0 (balanced) ↔ +100 (max contender)";
  const signed = h >= 0 ? `+${h}` : `${h}`;
  if (h >= 60)
    return { label: `Win-now · ${signed}/100`, tone: "text-success", tooltip };
  if (h <= -60)
    return { label: `Future · ${signed}/100`, tone: "text-accent", tooltip };
  if (h >= 20)
    return {
      label: `Lean win-now · ${signed}/100`,
      tone: "text-success",
      tooltip,
    };
  if (h <= -20)
    return {
      label: `Lean future · ${signed}/100`,
      tone: "text-accent",
      tooltip,
    };
  return { label: `Balanced · ${signed}/100`, tone: "text-foreground", tooltip };
}

function gambleTone(p: number): string {
  if (p >= 0.65) return "text-success";
  if (p >= 0.45) return "text-foreground";
  return "text-muted";
}

function driftTone(p: number): string {
  if (p >= 0.6) return "text-success";
  if (p >= 0.3) return "text-foreground";
  return "text-muted";
}

function trajectoryGlyph(d: DriftDirection): string {
  if (d === "up") return "▲";
  if (d === "down") return "▼";
  return "–";
}

function trajectoryTone(d: DriftDirection): string {
  if (d === "up") return "text-success";
  if (d === "down") return "text-danger";
  return "text-muted-2";
}

function emptyHeadline({
  isIdentified,
  draftStatus,
}: {
  isIdentified: boolean;
  draftStatus: DraftStatus | null;
}): string {
  if (!isIdentified) return "Connect your Sleeper account to see candidates";
  if (draftStatus === "drafting" || draftStatus === "paused")
    return "Tracking your draft. paths will surface as your roster takes shape";
  if (draftStatus === "pre_draft")
    return "Pre-draft. Paths will surface once picks start.";
  return "No paths to show for current state";
}

function emptyBody({
  isIdentified,
  draftStatus,
}: {
  isIdentified: boolean;
  draftStatus: DraftStatus | null;
}): string {
  if (!isIdentified)
    return "Hit Identify above with your Sleeper username. we need your roster to score paths.";
  if (draftStatus === "drafting" || draftStatus === "paused")
    return "Even partial picks should produce drift candidates. If you're seeing this on a live draft, the snapshot may be lagging. refresh in a moment.";
  if (draftStatus === "pre_draft")
    return "Once the draft starts, paths fill in pick-by-pick.";
  return "We can't infer paths from current state.";
}

function subscribeToStorage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function LiveStrategyBoard({
  leagueId,
  ranked,
  isIdentified,
  draftStatus,
}: {
  leagueId: string;
  ranked: RankedArchetype[];
  isIdentified: boolean;
  draftStatus: DraftStatus | null;
}) {
  const workingTowardId = useSyncExternalStore(
    subscribeToStorage,
    useCallback(() => readDeclaredArchetype(leagueId), [leagueId]),
    () => null,
  );

  // Expanded *rows* (pairs of cards in the md:grid-cols-2 layout), not
  // individual cards. Toggling one card opens its row partner too so
  // heights align and the user can compare the two paths side by side.
  const [expandedRows, setExpandedRows] = useState<Set<number>>(
    () => (ranked.length > 0 ? new Set([0]) : new Set()),
  );
  const toggleRow = useCallback((idx: number) => {
    const row = Math.floor(idx / 2);
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
  }, []);

  const workingTowardArchetype = useMemo(
    () => (workingTowardId ? getArchetype(workingTowardId) : null),
    [workingTowardId],
  );

  function setWorkingToward(id: string) {
    writeDeclaredArchetype(leagueId, id);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new StorageEvent("storage", { key: declaredArchetypeKey(leagueId) }),
      );
    }
  }

  function clearWorkingToward() {
    writeDeclaredArchetype(leagueId, null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new StorageEvent("storage", { key: declaredArchetypeKey(leagueId) }),
      );
    }
  }

  if (ranked.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-border-soft bg-surface px-5 py-6">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-2">
          Live strategy board
        </div>
        <div className="mt-1 text-base font-semibold text-foreground">
          {emptyHeadline({ isIdentified, draftStatus })}
        </div>
        <p className="mt-2 text-sm text-muted">
          {emptyBody({ isIdentified, draftStatus })}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Live strategy board
          </div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {workingTowardArchetype
              ? `Working toward: ${workingTowardArchetype.name}`
              : "Paths you\u2019re drifting toward"}
          </div>
          <p className="mt-1 text-sm text-muted">
            Drift % shifts pick-by-pick. ▲/▼ shows what your last picks (and
            opponents&rsquo;) just did to each path.
            {!workingTowardArchetype &&
              " Mark one as your primary direction. soft commitment, change anytime."}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
            Horizon score: -100 rebuild ↔ 0 balanced ↔ +100 max contender
          </p>
        </div>
        {workingTowardArchetype && (
          <button
            type="button"
            onClick={clearWorkingToward}
            className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2 hover:text-danger"
          >
            Clear direction
          </button>
        )}
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        {ranked.map((r, idx) => (
          <ArchetypeCard
            key={r.archetype.id}
            ranked={r}
            isWorkingToward={workingTowardId === r.archetype.id}
            isExpanded={expandedRows.has(Math.floor(idx / 2))}
            onToggle={() => toggleRow(idx)}
            onSetWorkingToward={() => setWorkingToward(r.archetype.id)}
            draftStatus={draftStatus}
          />
        ))}
      </div>
    </div>
  );
}

function ArchetypeCard({
  ranked,
  isWorkingToward,
  isExpanded,
  onToggle,
  onSetWorkingToward,
  draftStatus,
}: {
  ranked: RankedArchetype;
  isWorkingToward: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSetWorkingToward: () => void;
  draftStatus: DraftStatus | null;
}) {
  const {
    archetype: a,
    drift_score,
    opening_boost,
    trajectory,
    live_gamble,
    live_risks,
    active_openings,
  } = ranked;
  const horizon = horizonLabel(a.horizon);

  // Visual treatment:
  //   working-toward → bold green border (your primary direction)
  //   active opening → accent border (live opening signal)
  //   low drift + opening only → dashed border (opportunity, not your fit)
  //   normal → standard border
  const isOpportunityOnly = drift_score < 0.15 && opening_boost > 0;
  const borderTone = isWorkingToward
    ? "border-2 border-success/70 bg-success/5"
    : isOpportunityOnly
      ? "border-dashed border-accent/40 bg-surface"
      : active_openings.length > 0
        ? "border-accent/50 bg-accent/5"
        : "border-border-strong bg-surface";

  const visiblePlays = (a.plays ?? []).slice(0, 2);
  const visiblePivots = a.pivots.slice(0, 2);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border ${borderTone}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-col items-start gap-2 px-5 py-4 text-left"
      >
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-2">
            {a.category}
            {isOpportunityOnly && (
              <span className="ml-2 rounded-full border border-accent/40 px-1.5 py-0.5 text-accent">
                Opening
              </span>
            )}
            {isWorkingToward && (
              <span className="ml-2 rounded-full border border-success/60 bg-success/10 px-1.5 py-0.5 text-success">
                Primary
              </span>
            )}
            {ranked.phase === "executing" && (
              <span
                className="ml-2 rounded-full border border-success/60 bg-success/10 px-1.5 py-0.5 text-success"
                title="Drift maxed and required moves complete. acquisition phase done; pivot to selling/execution"
              >
                Executing
              </span>
            )}
          </span>
          <span
            className={`font-mono text-xs uppercase tracking-[0.16em] ${horizon.tone}`}
            title={horizon.tooltip}
          >
            {horizon.label}
          </span>
        </div>
        <h3 className="text-xl font-semibold text-foreground">{a.name}</h3>
        <p className="text-sm leading-snug text-muted">{a.tagline}</p>

        {ranked.top_candidates && ranked.top_candidates.length > 0 && (
          <div className="mt-2 w-full rounded-md border border-accent/40 bg-accent/5 px-3 py-2">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
              Pick to push this path
            </div>
            <div className="mt-0.5 text-sm">
              <span className="font-semibold text-foreground">
                {ranked.top_candidates[0].name}
              </span>
              <span className="text-muted-2">
                {" "}
                · {ranked.top_candidates[0].position}
                {ranked.top_candidates[0].team
                  ? `-${ranked.top_candidates[0].team}`
                  : ""}
                {ranked.top_candidates[0].age != null
                  ? `, age ${ranked.top_candidates[0].age}`
                  : ""}
              </span>
              {ranked.top_candidates[1] && (
                <span className="text-muted-2">
                  {" "}
                  · then {ranked.top_candidates[1].name}
                </span>
              )}
            </div>
          </div>
        )}

        {active_openings.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {active_openings.map((o) => (
              <span
                key={o.label}
                className="inline-flex w-fit items-center rounded-full border border-accent/60 bg-accent/10 px-2 py-0.5 font-mono text-xs uppercase tracking-[0.14em] text-accent"
              >
                ⚡ Opening: {o.label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex w-full flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-3">
          <div className="flex items-baseline gap-4">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
                Drifting toward
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span
                  className={`font-mono text-2xl font-semibold ${driftTone(drift_score)}`}
                >
                  {pct(drift_score)}
                </span>
                <span
                  className={`font-mono text-base font-semibold ${trajectoryTone(trajectory.direction)}`}
                  title={trajectory.reasons.join(" · ")}
                >
                  {trajectoryGlyph(trajectory.direction)}
                </span>
              </div>
            </div>
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
                Gamble pays
              </div>
              <div
                className={`mt-0.5 font-mono text-base font-semibold ${gambleTone(live_gamble.pct)}`}
                title={`${pct(live_gamble.pct)} = ${pct(live_gamble.base)} base${live_gamble.active_modifiers
                  .map(
                    (m) =>
                      ` ${m.delta > 0 ? "+" : "−"} ${pct(Math.abs(m.delta))}`,
                  )
                  .join("")}. Expand for details.`}
              >
                {pct(live_gamble.pct)}
              </div>
            </div>
          </div>
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
            {isExpanded ? "Hide" : "Details"} →
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border-soft px-5 py-4 space-y-5">
          {trajectory.reasons.length > 0 && (
            <Section
              label={`What just changed (${trajectoryGlyph(trajectory.direction)})`}
            >
              <ul className="space-y-1 text-xs text-muted">
                {trajectory.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Section>
          )}

          <Section label="The gamble">
            <p className="text-sm text-foreground">{a.the_gamble.statement}</p>
            <div className="mt-3 rounded-md border border-border-soft bg-surface-2 px-3 py-2">
              <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2">
                Gamble math
              </div>
              <div className="mt-1 font-mono text-sm text-foreground">
                {pct(live_gamble.pct)}
                {" = "}
                <span className="text-muted">
                  {pct(live_gamble.base)} base
                </span>
                {live_gamble.active_modifiers.map((m, i) => (
                  <span key={i}>
                    {" "}
                    <span
                      className={
                        m.delta > 0 ? "text-success" : "text-danger"
                      }
                    >
                      {m.delta > 0 ? "+ " : "− "}
                      {pct(Math.abs(m.delta))}
                    </span>
                  </span>
                ))}
                {live_gamble.active_modifiers.length === 0 && (
                  <span className="text-muted-2">
                    {" "}
                    (no live modifiers active)
                  </span>
                )}
              </div>
              {live_gamble.active_modifiers.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {live_gamble.active_modifiers.map((m, i) => (
                    <li key={i}>
                      <span
                        className={
                          m.delta > 0 ? "text-success" : "text-danger"
                        }
                      >
                        {m.delta > 0 ? "+" : ""}
                        {Math.round(m.delta * 100)}%
                      </span>{" "}
                      · {m.rationale}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 text-[11px] italic text-muted-2">
                Base rates are heuristics; modifiers are computed from
                live league state. Calibration improves with data.
              </div>
            </div>
          </Section>

          <Section label="The risks">
            <ul className="space-y-2">
              {live_risks.map((r, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span
                    className={`font-mono text-xs font-semibold ${
                      r.live.pct >= 0.5 ? "text-danger" : "text-muted"
                    }`}
                  >
                    {pct(r.live.pct)}
                  </span>
                  <span className="text-foreground">{r.statement}</span>
                </li>
              ))}
            </ul>
          </Section>

          {ranked.top_candidates && ranked.top_candidates.length > 0 && (
            <Section label="Top candidates available">
              <ul className="space-y-1.5 text-sm">
                {ranked.top_candidates.map((c) => (
                  <li
                    key={c.player_id}
                    className="flex items-baseline gap-2"
                  >
                    <span className="font-mono text-[11px] text-muted-2 w-10 shrink-0">
                      #{c.search_rank}
                    </span>
                    <span className="text-foreground">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-2">
                        {" "}
                        · {c.position}
                        {c.team ? `-${c.team}` : ""}
                      </span>
                    </span>
                    <span className="text-xs text-muted">· {c.reason}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {visiblePlays.length > 0 && (
            <Section label="Plays this week">
              <ul className="space-y-3">
                {visiblePlays.map((p) => {
                  const targetEntry = ranked.targeted_plays?.find(
                    (t) => t.play_id === p.id,
                  );
                  return (
                    <li
                      key={p.id}
                      className="rounded-md border border-border-soft bg-surface-2 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-[0.14em]">
                        <span className="text-accent">{p.intent}</span>
                        <span className="text-muted-2">·</span>
                        <span className="text-muted-2">{p.channel}</span>
                        <span className="text-muted-2">·</span>
                        <span className="text-muted-2">{p.tone}</span>
                      </div>
                      <p className="mt-1 text-sm italic text-foreground">
                        &ldquo;{p.template}&rdquo;
                      </p>
                      {targetEntry && targetEntry.targets.length > 0 && (
                        <div className="mt-2 rounded-md border border-accent/40 bg-accent/5 px-2 py-1.5">
                          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                            Target this play at
                          </div>
                          <ul className="mt-1 space-y-0.5 text-xs">
                            {targetEntry.targets.map((t) => (
                              <li key={t.owner_name}>
                                <span className="font-semibold text-foreground">
                                  {t.owner_name}
                                </span>
                                <span className="text-muted">
                                  {" "}
                                  · {t.reason}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {p.risks.length > 0 && (
                        <p className="mt-2 text-xs text-muted">
                          Risk: {p.risks[0]}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {visiblePivots.length > 0 && (
            <Section label="Pivots if things change">
              <ul className="space-y-2 text-sm">
                {visiblePivots.map((p, i) => {
                  const triggerStr = describeTrigger(p.trigger);
                  return (
                    <li key={i} className="text-foreground">
                      <span className="text-muted-2">If</span> {triggerStr}{" "}
                      <span className="text-muted-2">→</span>{" "}
                      {p.branches
                        .map(
                          (b) =>
                            getArchetype(b.archetype_id)?.name ?? b.archetype_id,
                        )
                        .join(" or ")}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {(() => {
            const moves =
              ranked.evaluated_moves ??
              a.required_moves.map((m) => ({ ...m, completed: false }));
            if (moves.length === 0) return null;
            const isDrafting =
              draftStatus === "drafting" || draftStatus === "paused";
            // Bucket by phase. While drafting, "this-draft" moves are
            // primary; "this-week"/"wk:N"/"next-trade-window" are
            // in-season directives that should be deferred so they
            // don't read as critical-during-pick guidance.
            const phaseOf = (
              by_when: string,
            ): "draft" | "in-season" | "off-season" | "other" => {
              if (by_when === "this-draft") return "draft";
              if (
                by_when === "this-week" ||
                by_when === "next-trade-window" ||
                by_when.startsWith("wk:")
              )
                return "in-season";
              if (by_when === "off-season") return "off-season";
              return "other";
            };
            const primary: typeof moves = [];
            const deferred: typeof moves = [];
            for (const m of moves) {
              const phase = phaseOf(m.by_when);
              const inSeasonDuringDraft = isDrafting && phase === "in-season";
              const offSeasonDuringDraft = isDrafting && phase === "off-season";
              if (inSeasonDuringDraft || offSeasonDuringDraft) {
                deferred.push(m);
              } else {
                primary.push(m);
              }
            }

            const renderRow = (
              m: (typeof moves)[number],
              i: number,
              dimmed: boolean,
            ) => {
              const done = "completed" in m && m.completed;
              const priorityTone = done
                ? "text-success"
                : dimmed
                  ? "text-muted-2"
                  : m.priority === "critical"
                    ? "text-danger"
                    : m.priority === "high"
                      ? "text-accent"
                      : "text-muted-2";
              return (
                <li
                  key={i}
                  className={
                    done || dimmed ? "text-muted-2" : "text-foreground"
                  }
                >
                  <span
                    className={`font-mono text-xs uppercase tracking-[0.14em] ${priorityTone}`}
                  >
                    [{done ? "done" : m.priority}] {m.by_when}
                  </span>{" "}
                  <span className={done ? "line-through" : ""}>
                    {m.description}
                  </span>
                </li>
              );
            };

            return (
              <Section label="Required moves">
                {primary.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {primary.map((m, i) => renderRow(m, i, false))}
                  </ul>
                )}
                {deferred.length > 0 && (
                  <div className="mt-3 border-t border-border-soft pt-2">
                    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
                      After the draft (in-season directives)
                    </div>
                    <ul className="mt-1 space-y-1 text-sm opacity-70">
                      {deferred.map((m, i) => renderRow(m, i, true))}
                    </ul>
                  </div>
                )}
              </Section>
            );
          })()}

          <div className="flex items-center justify-between border-t border-border-soft pt-4">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2">
              Drift {pct(drift_score)}
              {opening_boost > 0 && ` · Opening +${pct(opening_boost)}`}
            </span>
            {!isWorkingToward ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetWorkingToward();
                }}
                className="inline-flex h-9 items-center rounded-md border border-success/60 bg-surface px-3 text-xs font-semibold text-success transition hover:bg-success hover:text-black"
              >
                Work toward this
              </button>
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.16em] text-success">
                ✓ Primary direction
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-2">
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function describeTrigger(
  t: import("@/lib/strategy/archetypes/schema").PivotTrigger,
): string {
  switch (t.kind) {
    case "anchor_injury":
      return `your ${t.position} anchor goes down ${t.duration_weeks_min}+ weeks`;
    case "opposing_archetype_overlap":
      return `${t.min}+ teams converge on the same archetype`;
    case "league_market_shift":
      return `${t.signal} trends ${t.direction}`;
    case "own_strategy_drift":
      return `your build drifts off-thesis`;
    case "approaching_byes":
      return `${t.positions.join("/")} byes approach`;
    case "user_record_collapse":
      return `you fall to ${t.wins_max} wins through ${t.games_min} games`;
  }
}
