"use client";

/**
 * Strategy Lab card. Shows the user which strategic paths are still
 * open at the current draft moment, with named anchors and counter-
 * position notes when the room is heavy in one direction.
 *
 * Two modes via the `prominent` flag:
 *   - prominent: large hero card, sits above WindowsBar. Used early
 *     in the draft (user has < ~3 picks) when the Decision card
 *     doesn't have enough roster context to be the dominant frame.
 *   - context: compact strip, sits below the Decision card. Used
 *     mid-to-late draft as a "what am I cutting off?" awareness
 *     surface.
 *
 * The "you're at pick 5 and everyone went win-now; thread the future
 * needle" insight from the founder lives in the counter-position note
 * on each path, plus the league-pulse headline at the top.
 *
 * Live transition badges (client-side): on each visit we capture a
 * snapshot of (archetype_id → state, viability) into localStorage. On
 * the next visit we diff the current state against the snapshot and
 * surface "JUST CLOSED · QB Cartel" badges so the user feels paths
 * slamming shut between page loads. Snapshots older than 6h are
 * suppressed (a refresh after a day shouldn't fire drama badges).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  StrategyLabPath,
  StrategyLabState,
} from "@/lib/strategy/strategy-lab/types";
import type { BranchPreview } from "@/lib/strategy/strategy-lab/branch-preview";
import {
  computeTransition,
  readPreviousSnapshot,
  writeSnapshot,
  type Transition,
} from "@/lib/strategy/strategy-lab/transitions";
import type { ActivePathCommitment } from "@/lib/strategy/path-commitment/types";

const STATE_TONE: Record<
  StrategyLabPath["state"],
  { border: string; chip: string; bar: string; label: string }
> = {
  open: {
    border: "border-success/60",
    chip: "text-success",
    bar: "bg-success/70",
    label: "OPEN",
  },
  narrowing: {
    border: "border-accent/60",
    chip: "text-accent",
    bar: "bg-accent/70",
    label: "NARROWING",
  },
  closing: {
    border: "border-warning/60",
    chip: "text-warning",
    bar: "bg-warning/60",
    label: "CLOSING",
  },
  closed: {
    border: "border-border-soft",
    chip: "text-muted-2",
    bar: "bg-muted-2/40",
    label: "CLOSED",
  },
};

const TRANSITION_TONE: Record<
  Transition["kind"],
  { bg: string; text: string; label: string }
> = {
  just_closed: {
    bg: "bg-danger/15 border-danger/60",
    text: "text-danger",
    label: "JUST CLOSED",
  },
  tightened: {
    bg: "bg-warning/15 border-warning/60",
    text: "text-warning",
    label: "TIGHTENED",
  },
  just_opened: {
    bg: "bg-success/15 border-success/60",
    text: "text-success",
    label: "JUST OPENED",
  },
  loosened: {
    bg: "bg-success/10 border-success/40",
    text: "text-success",
    label: "LOOSENED",
  },
};

export function StrategyLab({
  lab,
  leagueId,
  season,
  commitment,
  signedIn,
}: {
  lab: StrategyLabState;
  leagueId: string;
  season: string;
  commitment: ActivePathCommitment | null;
  signedIn: boolean;
}) {
  // Per-path transition badges, keyed by archetype_id. Populated
  // post-mount from the localStorage snapshot of the previous visit.
  // Empty on first ever visit; saving the snapshot now means the
  // NEXT visit will see badges if anything moved.
  const [transitions, setTransitions] = useState<
    Record<string, Transition>
  >({});
  const [committing, setCommitting] = useState<string | null>(null);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const prev = readPreviousSnapshot(leagueId);
    if (prev) {
      const next: Record<string, Transition> = {};
      for (const p of lab.paths) {
        const t = computeTransition(p, prev.paths[p.archetype_id], prev.ts);
        if (t) next[p.archetype_id] = t;
      }
      setTransitions(next);
    }
    writeSnapshot(leagueId, lab.paths);
  }, [leagueId, lab.paths]);

  async function commitPath(path: StrategyLabPath) {
    if (committing) return;
    setCommitting(path.archetype_id);
    try {
      const res = await fetch(
        `/api/leagues/${leagueId}/path-commitment`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            season,
            archetype_id: path.archetype_id,
            archetype_name: path.archetype_name,
            committed_at_pick_no: null,
            viability: path.viability,
            state: path.state,
          }),
        },
      );
      if (res.status === 401) {
        // Anonymous user. The conversion moment.
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?next=${next}`;
        return;
      }
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setCommitting(null);
    }
  }

  async function abandonPath() {
    if (!commitment) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Switch from ${commitment.commitment.archetype_name}? The chronicle is preserved; you can lean a different path.`,
      )
    ) {
      return;
    }
    const res = await fetch(
      `/api/leagues/${leagueId}/path-commitment`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commitment_id: commitment.commitment.id }),
      },
    );
    if (res.ok) router.refresh();
  }

  // In context mode we hide closed paths UNLESS they just closed
  // (the user should see the drama before it's tucked away). In
  // prominent mode we show closed too, with strikethrough.
  const visiblePaths = lab.prominent
    ? lab.paths
    : lab.paths
        .filter(
          (p) =>
            p.state !== "closed" ||
            transitions[p.archetype_id]?.kind === "just_closed",
        )
        .slice(0, 5);

  // Empty state: no qualifying paths to show. This happens when the
  // engine has no archetype data yet (pre-snapshot leagues) OR every
  // path has closed and none "just closed" (context mode mid-draft
  // after the user has crossed every fork). Both cases benefit from
  // a clear explanation instead of a missing component the user
  // can't account for.
  if (visiblePaths.length === 0) {
    const allClosed =
      lab.paths.length > 0 && lab.paths.every((p) => p.state === "closed");
    return (
      <section className="mt-8 rounded-lg border border-border-strong bg-surface px-5 py-5">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
              Strategy Lab
            </div>
            <h2 className="mt-1 text-xl font-semibold text-foreground">
              {allClosed ? "Every fork already crossed" : "No paths to score yet"}
            </h2>
          </div>
        </header>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {allClosed
            ? "The strategic forks for this draft are behind you. The Decision card is now the right tool; come back here next year when fresh archetypes are open."
            : "We don't have enough roster or draft signal yet to score archetype paths. Add a pick or two, or come back once your league has a draft underway."}
        </p>
      </section>
    );
  }

  return (
    <section
      className={`mt-8 rounded-lg border-2 ${
        lab.prominent ? "border-accent/60" : "border-border-strong"
      } bg-surface px-5 py-5`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Strategy Lab · {visiblePaths.length} paths
          </div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            {lab.prominent ? "What's still open for you" : "Path watch"}
          </h2>
          {lab.prominence_reason && (
            <p className="mt-1 text-xs text-muted">{lab.prominence_reason}</p>
          )}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          Open ≥65 · Narrowing 45-64 · Closing 25-44
        </div>
      </header>

      {commitment && (
        <CommitmentHeader
          commitment={commitment}
          chronicleOpen={chronicleOpen}
          onToggleChronicle={() => setChronicleOpen((s) => !s)}
          onAbandon={abandonPath}
        />
      )}

      {/* Optionality reminder in prominent mode. Without this, the
          "Lean this way" CTAs feel like commitment when really they
          are soft signals. The user explicitly flagged this: at
          pick 1.x with one pick made, the right mental model is
          OPTIONALITY, not commitment. Lean creates a tracked
          commitment server-side but is reversible any time. */}
      {lab.prominent && !commitment && (
        <p className="mt-4 rounded-md border border-border-soft bg-surface-2/60 px-4 py-3 text-xs leading-relaxed text-muted">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
            Lean, don't lock ·
          </span>{" "}
          You don't have to commit yet. Lean is a soft signal we'll
          track across picks; you can switch any time as the board
          unfolds. For the projected chain of your next picks, see
          the Decision card's Next Picks Plan above.
        </p>
      )}

      {lab.league_pulse.headline && (
        <div className="mt-4 rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm leading-relaxed text-foreground">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
            League pulse ·
          </span>{" "}
          {lab.league_pulse.headline}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {visiblePaths.map((p) => (
          <PathRow
            key={p.archetype_id}
            path={p}
            prominent={lab.prominent}
            transition={transitions[p.archetype_id] ?? null}
            isCommitted={
              commitment?.commitment.archetype_id === p.archetype_id
            }
            canCommit={
              !commitment &&
              (p.state === "open" || p.state === "narrowing")
            }
            committing={committing === p.archetype_id}
            signedIn={signedIn}
            onCommit={() => commitPath(p)}
          />
        ))}
      </div>
    </section>
  );
}

function CommitmentHeader({
  commitment,
  chronicleOpen,
  onToggleChronicle,
  onAbandon,
}: {
  commitment: ActivePathCommitment;
  chronicleOpen: boolean;
  onToggleChronicle: () => void;
  onAbandon: () => void;
}) {
  const c = commitment.commitment;
  const currentVia = c.current_viability ?? c.viability_at_commit;
  const delta = currentVia - c.viability_at_commit;
  const sign = delta >= 0 ? "+" : "";
  return (
    <div className="mt-4 rounded-md border-2 border-success/50 bg-success/5 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-success">
            Your lean · since{" "}
            {c.committed_at_pick_no
              ? `pick ${c.committed_at_pick_no}`
              : new Date(c.committed_at).toLocaleDateString()}
          </div>
          <div className="mt-1 text-base font-semibold text-foreground">
            {c.archetype_name}
          </div>
          <div className="mt-1 font-mono text-xs text-muted">
            Viability {c.viability_at_commit} → {currentVia} ({sign}
            {delta}){c.current_state ? ` · ${c.current_state}` : ""}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-2">
            Soft lean. Switch any time as the board moves. Chronicle keeps
            the history regardless.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleChronicle}
            className="inline-flex h-8 items-center rounded-md border border-border-strong bg-background px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground transition hover:border-accent/60"
          >
            {chronicleOpen ? "Hide chronicle" : "Show chronicle"}
            <span className="ml-1.5 text-muted-2">
              {commitment.chronicle.length}
            </span>
          </button>
          <button
            type="button"
            onClick={onAbandon}
            className="inline-flex h-8 items-center rounded-md border border-border-strong bg-background px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted hover:border-accent hover:text-accent"
            title="Switch your lean. Chronicle is preserved; you can lean a different path."
          >
            Switch lean
          </button>
        </div>
      </div>

      {chronicleOpen && commitment.chronicle.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-success/20 pt-3 text-xs">
          {commitment.chronicle.map((e) => (
            <li
              key={e.id}
              className="flex items-baseline gap-2 text-foreground"
            >
              <span className="font-mono text-[10px] text-muted-2">
                {new Date(e.event_at).toLocaleDateString()}{" "}
                {new Date(e.event_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-success">
                {e.event_kind}
              </span>
              <span className="text-muted">{e.narrative}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PathRow({
  path,
  prominent,
  transition,
  isCommitted,
  canCommit,
  committing,
  signedIn,
  onCommit,
}: {
  path: StrategyLabPath;
  prominent: boolean;
  transition: Transition | null;
  isCommitted: boolean;
  canCommit: boolean;
  committing: boolean;
  signedIn: boolean;
  onCommit: () => void;
}) {
  const tone = STATE_TONE[path.state];
  const isClosed = path.state === "closed";
  const tBadge = transition ? TRANSITION_TONE[transition.kind] : null;
  const [branchOpen, setBranchOpen] = useState(false);
  const hasBranch =
    !isClosed &&
    path.branch_preview != null &&
    path.branch_preview.picks.length > 0;
  return (
    <div
      className={`rounded-md border ${
        isCommitted ? "border-success/60" : tone.border
      } ${
        isClosed ? "bg-surface-2/40 opacity-60" : "bg-surface-2"
      } ${isCommitted ? "ring-1 ring-success/40" : ""} px-4 py-3`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.14em] ${tone.chip}`}
          >
            {tone.label}
          </span>
          <span
            className={`text-base font-semibold ${
              isClosed ? "text-muted line-through decoration-muted-2/50" : "text-foreground"
            }`}
          >
            {path.archetype_name}
          </span>
          {tBadge && transition && (
            <span
              className={`inline-flex items-center gap-1 rounded-sm border ${tBadge.bg} px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${tBadge.text}`}
              title={`Was ${transition.prev_state} (${
                transition.viability_delta > 0 ? "+" : ""
              }${transition.viability_delta} viability since last visit)`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${tBadge.text} bg-current`}
              />
              {tBadge.label}
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-muted-2">
          {path.viability}/100
        </span>
      </div>

      <p className="mt-1 text-xs leading-snug text-muted">
        {path.archetype_tagline}
      </p>

      {/* Viability bar */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-surface">
        <div
          className={`h-full ${tone.bar}`}
          style={{ width: `${Math.max(0, Math.min(100, path.viability))}%` }}
        />
      </div>

      {/* Anchors row: only when prominent or path is open/narrowing */}
      {(prominent || path.state === "open" || path.state === "narrowing") &&
        path.anchors.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {path.anchors.map((a) => (
              <span
                key={a.player_id}
                className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] ${
                  a.available
                    ? "border-success/40 text-foreground"
                    : "border-border-soft text-muted-2 line-through decoration-muted-2/50"
                }`}
                title={
                  a.available
                    ? a.expected_gone_by
                      ? `Available · projected gone by pick ${a.expected_gone_by}`
                      : "Available"
                    : "Already drafted"
                }
              >
                <span
                  className={`inline-block h-1 w-1 rounded-full ${
                    a.available ? "bg-success" : "bg-muted-2"
                  }`}
                />
                {a.name} · {a.position ?? "?"}
              </span>
            ))}
          </div>
        )}

      {path.closes_if && !isClosed && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          {path.closes_if}
        </p>
      )}

      {path.counter_position_note && (
        <p className="mt-2 rounded-sm border border-accent/30 bg-accent/5 px-2.5 py-1.5 text-xs leading-snug text-foreground">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
            Counter-position ·
          </span>{" "}
          {path.counter_position_note.replace(/^Counter-position: /, "")}
        </p>
      )}

      {/* Branch preview: deterministic projection of "if you commit
          here, your next 3-4 picks look like this." Collapsed by
          default to keep the row scannable; expands inline on click. */}
      {hasBranch && path.branch_preview && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setBranchOpen((s) => !s)}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 transition hover:text-accent"
          >
            {branchOpen ? "▼" : "▶"} Branch preview · next {path.branch_preview.picks.length} picks
          </button>
          {branchOpen && (
            <BranchPreviewPanel preview={path.branch_preview} />
          )}
        </div>
      )}

      {/* Commitment CTA. Anonymous users get a sign-in link
          framed as the conversion moment ("Sign in to track").
          Authed users with no commitment get a Commit button on
          open/narrowing paths. Authed users on the committed path
          get a "Your path" badge instead of a button. */}
      {isCommitted && (
        <div className="mt-3 inline-flex items-center gap-1 rounded-sm border border-success/60 bg-success/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-success">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
          Your path
        </div>
      )}
      {!isCommitted && canCommit && (
        <div className="mt-3">
          {signedIn ? (
            <button
              type="button"
              onClick={onCommit}
              disabled={committing}
              className="inline-flex h-8 items-center rounded-md border border-success/60 bg-success/10 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-success transition hover:bg-success hover:text-black disabled:opacity-60"
              title={
                prominent
                  ? "Soft lean. Track this path's viability across picks. Switch any time."
                  : "Commit to this path. Track its viability and chronicle changes."
              }
            >
              {committing
                ? "Setting lean..."
                : prominent
                  ? "Lean this way →"
                  : "Commit to this path →"}
            </button>
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/")}`}
              className="inline-flex h-8 items-center rounded-md border border-accent/60 bg-accent/10 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-accent transition hover:bg-accent hover:text-black"
            >
              {prominent
                ? "Sign in to lean here →"
                : "Sign in to track this path →"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function BranchPreviewPanel({ preview }: { preview: BranchPreview }) {
  return (
    <div className="mt-2 rounded-md border border-border-soft bg-surface px-3 py-3">
      <p className="text-xs leading-snug text-foreground">{preview.thread}</p>
      <ol className="mt-3 space-y-2 text-xs">
        {preview.picks.map((p, i) => (
          <li
            key={`${p.pick_no}-${i}`}
            className="flex items-baseline gap-2"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 shrink-0">
              {p.pick_label}
            </span>
            {p.player ? (
              <span className="flex-1">
                <span className="text-foreground">
                  {p.player.name}
                  {p.player.is_rookie && (
                    <span className="ml-1 inline-flex items-center rounded-sm border border-accent/40 bg-accent/10 px-1 font-mono text-[9px] uppercase tracking-[0.12em] text-accent">
                      rookie
                    </span>
                  )}
                </span>{" "}
                <span className="font-mono text-[10px] text-muted-2">
                  {p.player.position ?? "?"}
                  {p.player.team ? ` · ${p.player.team}` : ""}
                  {p.player.age != null ? ` · age ${p.player.age}` : ""}
                </span>
                {p.source === "spillover" && (
                  <span
                    className="ml-1 inline-flex items-center rounded-sm border border-warning/40 bg-warning/10 px-1 font-mono text-[9px] uppercase tracking-[0.12em] text-warning"
                    title="Primary position saturated; took best available."
                  >
                    spillover
                  </span>
                )}
                {p.alternates.length > 0 && (
                  <span className="ml-2 font-mono text-[10px] text-muted-2">
                    or {p.alternates.map((a) => a.name).join(" / ")}
                  </span>
                )}
              </span>
            ) : (
              <span className="font-mono text-[10px] italic text-muted-2">
                pool exhausted at this slot
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        Deterministic projection. Real picks will drift; this is the chain shape.
      </p>
    </div>
  );
}
