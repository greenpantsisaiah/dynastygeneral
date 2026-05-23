"use client";

/**
 * The companion check-in surface (REDESIGN_INTENTIONS.md "Companion
 * panel", Principle 13). The PUSH half of the loop: what is waiting for
 * the user when they come back bored "hoping for some thoughts." Sits at
 * the top of the hub, in the LastVisitDigest position.
 *
 * It renders grounded beats only. Each beat is a real reaction to a real
 * signal (the classifier guarantees a `source`); this surface just shows
 * them, leading with the most resonant (rankBeats). Provenance is one tap
 * away (Principle 0). The "talk it through" affordance hands debate /
 * critique beats to Coach (the PULL half).
 *
 * Voice A is already baked into each beat's headline / body by phraseBeat;
 * this component adds no copy of its own beyond the eyebrow labels.
 */

import type { Beat, BeatKind, BeatTone } from "@/lib/strategy/companion/types";
import type { Urgency } from "@/lib/strategy/plays/types";
import { rankBeats } from "@/lib/strategy/companion/priority";
import { urgencyLabel } from "@/lib/strategy/plays/urgency";
import { seedCoachWithBeat } from "./coach-chat";

/**
 * Self-contained urgency chip. Inlined (not imported from the plays UI)
 * so the companion does not break when the plays/Call surfaces churn. The
 * label still comes from the canonical `urgencyLabel`.
 */
function UrgencyChip({ urgency }: { urgency?: Urgency }) {
  if (!urgency) return null;
  const tone =
    urgency === "act_now"
      ? "border-danger/50 text-danger"
      : urgency === "this_round"
        ? "border-warning/50 text-warning"
        : "border-border-soft text-muted-2";
  return (
    <span
      className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${tone}`}
    >
      {urgencyLabel(urgency)}
    </span>
  );
}

const KIND_LABEL: Record<BeatKind, string> = {
  vindication: "Called it",
  bad_beat: "Bad beat",
  critique: "The read",
  debate: "Let's talk",
  anticipation: "Watching",
  callback: "Still tracking",
  milestone: "Checkpoint",
};

const TONE_CARD: Record<BeatTone, string> = {
  win: "border-accent/50 bg-accent/5",
  commiserate: "border-warning/50 bg-warning/5",
  challenge: "border-foreground/25 bg-foreground/[0.04]",
  neutral: "border-border-soft bg-transparent",
};

const TONE_EYEBROW: Record<BeatTone, string> = {
  win: "text-accent",
  commiserate: "text-warning",
  challenge: "text-foreground",
  neutral: "text-muted-2",
};

/**
 * Hand a beat to Coach (the PULL half). Reuses the existing coach:seed
 * mechanism, attaching the beat's grounded provenance so Coach engages
 * the exact decision. An explicit override wins when the hub provides one.
 */
function talkThrough(beat: Beat, override?: (b: Beat) => void): void {
  if (override) {
    override(beat);
    return;
  }
  const v = beat.source.values ?? {};
  const chosen = typeof v.chosen === "string" ? v.chosen : undefined;
  const alternative =
    typeof v.alternative === "string" ? v.alternative : undefined;
  const evDelta = typeof v.ev_delta === "number" ? v.ev_delta : undefined;
  const thesis = typeof v.thesis === "string" ? v.thesis : undefined;
  const prompt =
    chosen && alternative
      ? `Talk me through ${chosen} over ${alternative}. Lay out the case both ways and give me your honest read for my window.`
      : `Talk me through this: ${beat.headline}`;
  seedCoachWithBeat(prompt, {
    kind: beat.kind,
    headline: beat.headline,
    body: beat.body,
    source_signal: beat.source.signal,
    source_detail: beat.source.detail,
    chosen,
    alternative,
    ev_delta: evDelta,
    thesis,
    bet_id: beat.bet_id,
  });
}

export type CompanionCheckInProps = {
  beats: Beat[];
  /**
   * Hands a beat to Coach to talk through. Wired by the hub to seed the
   * Coach thread with the beat (and its bet_id / thesis). When absent,
   * the affordance does not render.
   */
  onTalkItThrough?: (beat: Beat) => void;
  /** How many secondary beats to list below the lead. */
  maxSecondary?: number;
};

export function CompanionCheckIn({
  beats,
  onTalkItThrough,
  maxSecondary = 3,
}: CompanionCheckInProps) {
  if (beats.length === 0) return null;
  const ranked = rankBeats(beats);
  const [lead, ...rest] = ranked;
  const secondary = rest.slice(0, maxSecondary);

  return (
    <div className="mt-4 space-y-2">
      <LeadBeat beat={lead} onTalkItThrough={onTalkItThrough} />
      {secondary.length > 0 && (
        <ul className="space-y-1 px-1">
          {secondary.map((b, i) => (
            <SecondaryBeat key={`${b.kind}-${i}`} beat={b} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LeadBeat({
  beat,
  onTalkItThrough,
}: {
  beat: Beat;
  onTalkItThrough?: (beat: Beat) => void;
}) {
  return (
    <div className={`rounded-md border px-4 py-3 ${TONE_CARD[beat.tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <div
          className={`font-mono text-[10px] uppercase tracking-[0.18em] ${TONE_EYEBROW[beat.tone]}`}
        >
          {KIND_LABEL[beat.kind]}
        </div>
        {beat.urgency ? <UrgencyChip urgency={beat.urgency} /> : null}
      </div>
      <p className="mt-1 text-sm font-medium leading-snug text-foreground">
        {beat.headline}
      </p>
      {beat.body && (
        <p className="mt-1 text-[13px] leading-snug text-muted">{beat.body}</p>
      )}
      <div className="mt-2 flex items-center gap-3">
        {beat.prompts_handoff && (
          <button
            type="button"
            onClick={() => talkThrough(beat, onTalkItThrough)}
            className="rounded-sm border border-border-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted hover:text-foreground"
          >
            Talk it through
          </button>
        )}
        <Provenance beat={beat} />
      </div>
    </div>
  );
}

function SecondaryBeat({ beat }: { beat: Beat }) {
  return (
    <li className="flex items-baseline gap-2 text-[12px] leading-snug">
      <span
        className={`font-mono text-[9px] uppercase tracking-[0.14em] ${TONE_EYEBROW[beat.tone]}`}
      >
        {KIND_LABEL[beat.kind]}
      </span>
      <span className="text-muted">{beat.headline}</span>
    </li>
  );
}

/** Provenance on tap (Principle 0): the canonical signal + its numbers. */
function Provenance({ beat }: { beat: Beat }) {
  const values = beat.source.values ?? {};
  const valueLine = Object.entries(values)
    .filter(([k]) => k !== "magnitude")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  return (
    <details className="group">
      <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 hover:text-muted">
        why
      </summary>
      <div className="mt-1 space-y-0.5 font-mono text-[10px] leading-snug text-muted-2">
        <div>source: {beat.source.signal}</div>
        <div>{beat.source.detail}</div>
        {valueLine && <div>{valueLine}</div>}
      </div>
    </details>
  );
}
