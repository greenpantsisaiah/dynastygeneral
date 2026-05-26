/**
 * Beat phrasing. The one place companion prose is written, so the Voice
 * A rules are enforceable in a single spot: no em dashes, no exclamation
 * points, numbers carry units, headlines lead with the number. The
 * scoped 'we' exception (BRAND_VOICE.md "Companion register") lives here
 * and ONLY here, inside grounded beats.
 *
 * `phraseBeat` is deterministic: it reads `kind` + `source.values` and
 * returns Voice A copy. The LLM never phrases a beat; it enters only on
 * the Coach debate handoff. See CANONICAL_SOURCES.md "Beat phrasing".
 */

import type { Beat, BeatDraft } from "./types";

/** Turn a draft into a finished beat by phrasing its headline + body. */
export function finalizeBeat(draft: BeatDraft): Beat {
  return { ...draft, ...phraseBeat(draft) };
}

export function phraseBeat(draft: BeatDraft): {
  headline: string;
  body?: string;
} {
  const v = draft.source.values ?? {};
  switch (draft.kind) {
    case "debate":
      return phraseDebate(v);
    case "vindication":
      return phraseVindication(v);
    case "bad_beat":
      return phraseBadBeat(v);
    case "critique":
      return phraseCritique(v);
    case "anticipation":
      return phraseAnticipation(v);
    case "callback":
      return phraseCallback(v);
    case "play_advanced":
      return phrasePlayAdvanced(v);
    case "milestone":
      return phraseMilestone(v);
  }
}

type Values = Record<string, number | string | null>;

function phraseDebate(v: Values): { headline: string; body?: string } {
  const chosen = str(v.chosen) ?? "your pick";
  const alt = str(v.alternative) ?? "the call";
  const delta = num(v.ev_delta);
  const evText = delta != null ? `: EV ${signed(delta)} vs the call` : "";
  return {
    headline: `${chosen} over ${alt}${evText}.`,
    body: "A real divergence. We can lay out the case both ways. Which window are you drafting for?",
  };
}

function phrasePlayAdvanced(v: Values): { headline: string; body?: string } {
  const pick = str(v.pick) ?? "that pick";
  const play = str(v.play_name) ?? "your play";
  const next = str(v.next_target);
  return {
    headline: `${pick} advances ${play}.`,
    body: next
      ? `We're a step closer. Next piece: ${next}.`
      : "We're a step closer. The play is coming together.",
  };
}

function phraseVindication(v: Values): { headline: string; body?: string } {
  const subject = str(v.subject) ?? "the call";
  const contrarian = v.contrarian === 1 || v.contrarian === "true";
  const detail = str(v.detail);
  const headline = contrarian
    ? `We called it. The ${subject} gamble cashed.`
    : `We called it. ${subject} held.`;
  return { headline, body: detail ?? undefined };
}

function phraseBadBeat(v: Values): { headline: string; body?: string } {
  // A sniped plan target reuses the already-grounded acknowledgment.
  const ack = str(v.acknowledgment);
  if (ack) {
    return { headline: "Bad beat.", body: ack };
  }
  const pct = num(v.expected_pct);
  const flippedBy = str(v.flipped_by);
  const parts: string[] = [];
  if (pct != null) parts.push(`We were ${pctText(pct)} to win at kickoff.`);
  if (flippedBy) parts.push(`${flippedBy} flipped it.`);
  parts.push("Nothing in the call was wrong. Variance took this one.");
  return { headline: "Bad beat.", body: parts.join(" ") };
}

function phraseCritique(v: Values): { headline: string; body?: string } {
  const subject = str(v.subject) ?? "that one";
  const alt = str(v.alternative);
  const gap = num(v.gap);
  const sideText = alt
    ? `${alt} was the higher-EV side`
    : "The higher-EV side was on the board";
  const gapText = gap != null ? ` by ${Math.abs(gap).toFixed(1)} EV` : "";
  return {
    headline: `${subject}: a gap we left.`,
    body: `${sideText}${gapText}. Worth remembering the next time the matchup fear talks louder than the math.`,
  };
}

function phraseAnticipation(v: Values): { headline: string; body?: string } {
  const subject = str(v.subject) ?? "your target";
  const pct = num(v.survival_pct);
  const slot = str(v.to_pick_label) ?? "your next pick";
  const urgent = v.act_now === 1 || v.act_now === "true";
  const head =
    pct != null
      ? `${subject}: ${pctText(pct)} to survive to ${slot}.`
      : `${subject}: watching the board to ${slot}.`;
  return {
    headline: head,
    body: urgent
      ? "We move now or we lose him. The fallback is a step down."
      : "We are watching this one together. No rush yet.",
  };
}

function phraseCallback(v: Values): { headline: string; body?: string } {
  const subject = str(v.subject) ?? "the bet";
  const checkpoint = str(v.checkpoint_label) ?? "this week";
  const positive = v.positive === 1 || v.positive === "true";
  const cur = str(v.current_value);
  const head = positive
    ? `${subject}, ${checkpoint}: the bet is cashing.`
    : `${subject}, ${checkpoint}: still cooking.`;
  return { headline: head, body: cur ?? undefined };
}

function phraseMilestone(v: Values): { headline: string; body?: string } {
  // In-season twin: a record-based standing checkpoint (the EV bank is
  // draft-only). Distinguished by the context tag the classifier sets.
  if (v.context === "season_standing") return phraseSeasonStanding(v);
  // Offseason safety net: a roster-talent standing checkpoint.
  if (v.context === "roster_talent") return phraseRosterTalent(v);

  const evTotal = num(v.ev_total);
  const rank = num(v.rank);
  const of = num(v.of);
  const progress = num(v.progress_pct);
  const head =
    evTotal != null && rank != null && of != null
      ? `Value vs ADP ${signed(evTotal)}, ${ordinal(rank)} of ${of}.`
      : evTotal != null
        ? `Value vs ADP ${signed(evTotal)}.`
        : "Checkpoint.";
  const body =
    progress != null ? `Draft ${Math.round(progress)}% in. Solid session.` : undefined;
  return { headline: head, body };
}

function phraseSeasonStanding(v: Values): { headline: string; body?: string } {
  const rank = num(v.rank);
  const of = num(v.of);
  const wins = num(v.wins);
  const losses = num(v.losses);
  const ties = num(v.ties);
  if (rank == null || of == null) return { headline: "Checkpoint." };
  const record =
    wins != null && losses != null
      ? `${wins}-${losses}${ties ? `-${ties}` : ""}`
      : null;
  const inHunt = rank <= Math.ceil(of / 3);
  const headline = `${ordinal(rank)} of ${of} by record${record ? `, ${record}` : ""}.`;
  const body = inHunt
    ? "We are in the hunt. Same read carries the trade table: sell from strength, buy the holes."
    : "Long season ahead. The EV edge is in the trade table now, not the standings.";
  return { headline, body };
}

function phraseRosterTalent(v: Values): { headline: string; body?: string } {
  const rank = num(v.rank);
  const of = num(v.of);
  if (rank == null || of == null) return { headline: "Checkpoint." };
  const inHunt = rank <= Math.ceil(of / 3);
  const headline = `${ordinal(rank)} of ${of} by roster value.`;
  const body = inHunt
    ? "Talent says contender. The off-season job is turning depth into the one or two upgrades that win the title."
    : "The talent gap is real and bridgeable. Sell what you cannot start, buy the holes before the market reprices.";
  return { headline, body };
}

// --- formatting helpers (units always, no em dashes, no exclamations) ---

function num(x: number | string | null | undefined): number | null {
  return typeof x === "number" ? x : null;
}

function str(x: number | string | null | undefined): string | null {
  return typeof x === "string" && x.length > 0 ? x : null;
}

function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r >= 0 ? `+${r.toFixed(1)}` : r.toFixed(1);
}

/**
 * A probability rendered as a percent. Accepts either a 0-1 fraction or
 * a 0-100 percentage and normalizes to a whole-number percent.
 */
function pctText(p: number): string {
  const pct = p <= 1 ? p * 100 : p;
  return `${Math.round(pct)}%`;
}

function ordinal(n: number): string {
  const r = Math.round(n);
  const mod100 = r % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${r}th`;
  switch (r % 10) {
    case 1:
      return `${r}st`;
    case 2:
      return `${r}nd`;
    case 3:
      return `${r}rd`;
    default:
      return `${r}th`;
  }
}
