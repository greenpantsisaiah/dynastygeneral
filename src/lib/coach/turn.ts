/**
 * Coach turn assembly (prompt-cache layout).
 *
 * Cost problem (FABLE_AUDIT_2026_09_15 risk 3): the per-turn
 * `<current_state>` snapshot is 25k to 40k input tokens. It used to ride
 * inside the LAST user message, after the chat history, so it sat past
 * every cache breakpoint and was billed at the full input rate on every
 * turn, even when nothing in the league had changed between turns.
 *
 * Layout now (order is the cache prefix):
 *   system[0]  SYSTEM_PROMPT + COACH_CONTRACT (+ draft-window note)
 *              cache_control: identical for every user, so it is shared.
 *   system[1]  <current_state> JSON for THIS turn
 *              cache_control: identical across a user's consecutive turns
 *              while the league state has not moved, so follow-ups within
 *              the cache TTL read it at about a tenth of the input rate.
 *   messages   prior turns (plain text), then the new user message.
 *
 * Recency guard. The snapshot used to sit last so it out-ranked stale
 * claims in prior assistant turns (the "7.12 vs 9.12" pick-label bug).
 * The state block still carries the authoritative marker, and the final
 * user message now opens with a short [STATE] pointer that restates the
 * two fields that bug class is about (next pick label + standing call)
 * and names the system block as this turn's truth. The pointer is a few
 * dozen tokens, so it costs nothing to keep it uncached at the end.
 */

import type Anthropic from "@anthropic-ai/sdk";

export type CoachHistoryEntry = { role: "user" | "assistant"; content: string };

export type CoachTurnInput = {
  /** Static instructions (SYSTEM_PROMPT + COACH_CONTRACT + any draft note). */
  system: string;
  /** The per-turn context payload. Serialized here, deterministically. */
  contextPayload: unknown;
  /** Already-trimmed prior turns. */
  history: CoachHistoryEntry[];
  /** Per-turn [GUARD] lines (trade / taxi / unread surface). May be "". */
  guards: string;
  /** The user's new message. */
  message: string;
  /** Live next pick label, if any (restated in the pointer). */
  nextPickLabel?: string | null;
  /** Live standing-call player name, if any (restated in the pointer). */
  standingCallName?: string | null;
};

export type CoachTurnParts = {
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
};

export function renderCurrentState(contextPayload: unknown): string {
  return `<current_state>\n${JSON.stringify(contextPayload, null, 2)}\n</current_state>`;
}

export function renderStatePointer(
  nextPickLabel?: string | null,
  standingCallName?: string | null,
): string {
  const facts: string[] = [];
  if (nextPickLabel) facts.push(`next pick ${nextPickLabel}`);
  if (standingCallName) facts.push(`standing call ${standingCallName}`);
  const live = facts.length > 0 ? ` Live this turn: ${facts.join("; ")}.` : "";
  return `[STATE] The <current_state> block in the system context was rebuilt for THIS turn and is the authoritative truth. It overrides anything said in earlier replies.${live}`;
}

export function buildCoachTurn(input: CoachTurnInput): CoachTurnParts {
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: input.system, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: renderCurrentState(input.contextPayload),
      cache_control: { type: "ephemeral" },
    },
  ];
  const pointer = renderStatePointer(input.nextPickLabel, input.standingCallName);
  const messages: Anthropic.MessageParam[] = [
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `${pointer}${input.guards}\n\n${input.message}` },
  ];
  return { system, messages };
}
