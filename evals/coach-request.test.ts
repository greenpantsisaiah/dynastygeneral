/**
 * Coach request-parsing regression. Locks the rule that the user's
 * `message` is the ONLY hard requirement of a Coach turn; history +
 * active_plays + companion_beat are auxiliary context salvaged
 * per-entry so one corrupt localStorage row never 400s the whole turn.
 *
 *   npx tsx --tsconfig tsconfig.json evals/coach-request.test.ts
 *
 * Bug class pinned (founder report 2026-05-24): Coach failed INSTANTLY
 * on mobile only because a single malformed committed play in the
 * phone's localStorage failed strict whole-body validation, while the
 * desktop's localStorage was clean. The whole feature bricked on one
 * bad auxiliary row.
 */

import {
  parseCoachRequest,
  COACH_ACTIVE_PLAYS_MAX,
  COACH_HISTORY_MAX,
} from "../src/lib/coach/request";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

const validPlay = {
  archetype: "QB_STACK",
  play_name: "QB Stack",
  primary_player_name: "Lamar Jackson",
  primary_player_position: "QB",
  followthrough_description: "Pair with a BAL pass-catcher",
  followthrough_target_names: ["Mark Andrews", "Zay Flowers"],
};

function run() {
  console.log("\n── coach request parsing (parseCoachRequest) ──");

  // Core: message is required.
  check("empty message fails", parseCoachRequest({ message: "" }).ok === false);
  check(
    "missing message fails",
    parseCoachRequest({ history: [] }).ok === false,
  );
  check(
    "over-long message fails",
    parseCoachRequest({ message: "x".repeat(4001) }).ok === false,
  );
  check(
    "non-object body fails on missing message",
    parseCoachRequest(null).ok === false,
  );

  const minimal = parseCoachRequest({ message: "who should I take" });
  check("minimal valid message parses", minimal.ok === true);
  if (minimal.ok) {
    check(
      "minimal body yields empty auxiliary arrays",
      minimal.data.history.length === 0 &&
        minimal.data.activePlays.length === 0 &&
        minimal.data.companionBeat === null,
    );
  }

  // THE bug: a malformed active play must NOT fail the turn; it is
  // dropped, the valid plays survive, and ok stays true.
  const mixedPlays = parseCoachRequest({
    message: "any rookies to take a flier on?",
    active_plays: [
      validPlay,
      { archetype: "ANCHOR_HANDCUFF", play_name: "Anchor + Handcuff" }, // missing fields
      { ...validPlay, primary_player_name: undefined }, // undefined required field
      { ...validPlay, followthrough_target_names: [1, 2] }, // bad array element types
    ],
  });
  check(
    "malformed active plays do not fail the turn",
    mixedPlays.ok === true,
  );
  if (mixedPlays.ok) {
    check(
      "only the valid active play survives",
      mixedPlays.data.activePlays.length === 1 &&
        mixedPlays.data.activePlays[0].primary_player_name === "Lamar Jackson",
      `${mixedPlays.data.activePlays.length} kept`,
    );
  }

  // Count cap: more than the max collapses to the max.
  const manyPlays = parseCoachRequest({
    message: "review my plays",
    active_plays: Array.from({ length: COACH_ACTIVE_PLAYS_MAX + 5 }, () => ({
      ...validPlay,
    })),
  });
  check(
    "active plays capped at the max",
    manyPlays.ok === true &&
      manyPlays.data.activePlays.length === COACH_ACTIVE_PLAYS_MAX,
    `cap ${COACH_ACTIVE_PLAYS_MAX}`,
  );

  // History: malformed rows dropped, valid kept; never fails the turn.
  const mixedHistory = parseCoachRequest({
    message: "continue",
    history: [
      { role: "user", content: "hi" },
      { role: "assistant", content: "" }, // empty content invalid
      { role: "bot", content: "nope" }, // bad role
      { role: "assistant", content: "real reply" },
    ],
  });
  check(
    "malformed history rows do not fail the turn",
    mixedHistory.ok === true,
  );
  if (mixedHistory.ok) {
    check(
      "only valid history rows survive",
      mixedHistory.data.history.length === 2,
      `${mixedHistory.data.history.length} kept`,
    );
  }

  // History cap keeps the most recent.
  const longHistory = parseCoachRequest({
    message: "continue",
    history: Array.from({ length: COACH_HISTORY_MAX + 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
    })),
  });
  check(
    "history capped at the max (most recent kept)",
    longHistory.ok === true &&
      longHistory.data.history.length === COACH_HISTORY_MAX &&
      longHistory.data.history.at(-1)?.content ===
        `m${COACH_HISTORY_MAX + 10 - 1}`,
    `cap ${COACH_HISTORY_MAX}`,
  );

  // Companion beat: invalid degrades to null; valid is preserved.
  const badBeat = parseCoachRequest({
    message: "talk it through",
    companion_beat: { kind: "debate" }, // missing required source fields
  });
  check(
    "invalid companion beat degrades to null without failing",
    badBeat.ok === true && badBeat.data.companionBeat === null,
  );
  const goodBeat = parseCoachRequest({
    message: "talk it through",
    companion_beat: {
      kind: "debate",
      headline: "You took Y over the call",
      source_signal: "computeWhatIfReadout",
      source_detail: "EV delta -3",
    },
  });
  check(
    "valid companion beat is preserved",
    goodBeat.ok === true && goodBeat.data.companionBeat?.kind === "debate",
  );

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
