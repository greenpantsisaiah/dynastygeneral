/**
 * Survival window regression. Locks in the 2026-05-19 founder report
 * that survival showed "likely here 100%" on candidates that obviously
 * would not survive (DeVonta Smith with 2-3 picks of pre-turn cushion;
 * back-to-back wraparound owners always 100% to next slot).
 *
 *   npx tsx --tsconfig tsconfig.json evals/survival-window.test.ts
 *
 * Root cause: the gap walked from user's FIRST upcoming pick to user's
 * SECOND upcoming pick. That answered "if you were on the clock right
 * now, would alternates survive your pass" instead of "will this
 * player be on the board when your turn comes." For pre-turn watchers
 * with 37 picks of cushion the right window was 37 opponents; the old
 * code walked 0 opponents (everyone showed 100%). For at-turn back-to-
 * back owners (wraparound, traded slots) the gap was trivially zero;
 * everyone showed 100% indistinguishably.
 *
 * Fix: computeSurvivalWindow now anchors on the live on-the-clock pick
 * (snap.draft.next_pick_no). Pre-turn = walk live → user first; at-turn
 * = walk user first → first CONTESTED next slot (skipping back-to-back).
 */

import { computeSurvivalWindow } from "../src/lib/strategy/decision-synthesis/synthesize";
import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";
import type { PickScheduleEntry } from "../src/lib/strategy/league-state/snapshot";

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

function snapWithLive(livePickNo: number | null): LeagueSnapshot {
  return {
    draft: { next_pick_no: livePickNo },
  } as unknown as LeagueSnapshot;
}

function scheduleEntry(pickNo: number): PickScheduleEntry {
  return {
    pick_no: pickNo,
    round: Math.ceil(pickNo / 12),
    pick_label: `${Math.ceil(pickNo / 12)}.X`,
    gap_to_prev: 0,
    gap_to_next: 0,
    density_kind: "normal",
  } as unknown as PickScheduleEntry;
}

function run() {
  console.log("\n── 1. Pre-turn (live well before user pick) ──");
  {
    // Founder's lincolnenglish scenario: live pick on the clock is
    // 76, user's first pick is 113 (37 picks away). The window
    // should walk 37 opponents.
    const snap = snapWithLive(76);
    const schedule = [scheduleEntry(113), scheduleEntry(125)];
    const w = computeSurvivalWindow(snap, schedule);
    check(
      "kind is pre_turn",
      w.kind === "pre_turn",
      `kind=${w.kind}`,
    );
    check(
      "from_pick_no = live - 1 (so walk includes live pick)",
      w.from_pick_no === 75,
      `from=${w.from_pick_no}`,
    );
    check(
      "to_pick_no = user's first upcoming pick",
      w.to_pick_no === 113,
      `to=${w.to_pick_no}`,
    );
    check(
      "target_pick_no = user's first upcoming pick (the 'will it survive to me' question)",
      w.target_pick_no === 113,
      `target=${w.target_pick_no}`,
    );
    // Window size: pickNo iterates from_pick_no+1 to to_pick_no-1.
    // For pre-turn: 76 to 112 = 37 opponent picks. Matches founder's
    // "37 picks away" claim.
    const windowSize = w.to_pick_no - w.from_pick_no - 1;
    check(
      "37 opponents in window",
      windowSize === 37,
      `size=${windowSize}`,
    );
  }

  console.log("\n── 2. At-turn with spaced picks (no back-to-back) ──");
  {
    // User on the clock at pick 56, next pick at 65 (9-pick gap, no
    // wraparound). Window walks 56 → 65, 8 opponents in the gap.
    const snap = snapWithLive(56);
    const schedule = [scheduleEntry(56), scheduleEntry(65)];
    const w = computeSurvivalWindow(snap, schedule);
    check(
      "kind is at_turn",
      w.kind === "at_turn",
      `kind=${w.kind}`,
    );
    check(
      "from_pick_no = user's first upcoming pick",
      w.from_pick_no === 56,
      `from=${w.from_pick_no}`,
    );
    check(
      "to_pick_no = user's second upcoming pick",
      w.to_pick_no === 65,
      `to=${w.to_pick_no}`,
    );
    check(
      "target_pick_no = user's second upcoming pick",
      w.target_pick_no === 65,
      `target=${w.target_pick_no}`,
    );
    const windowSize = w.to_pick_no - w.from_pick_no - 1;
    check(
      "8 opponents in window",
      windowSize === 8,
      `size=${windowSize}`,
    );
  }

  console.log("\n── 3. At-turn with back-to-back wraparound (skip trivial gap) ──");
  {
    // User owns picks 77 and 78 back-to-back (snake wraparound or
    // traded slots). On the clock at 77. Without the fix, the window
    // walked 77 → 78 = 0 opponents = 100% for all candidates. The
    // fix skips to the FIRST CONTESTED slot at pick 90.
    const snap = snapWithLive(77);
    const schedule = [
      scheduleEntry(77),
      scheduleEntry(78), // back-to-back, trivial gap
      scheduleEntry(90), // next contested slot
    ];
    const w = computeSurvivalWindow(snap, schedule);
    check(
      "kind is at_turn",
      w.kind === "at_turn",
      `kind=${w.kind}`,
    );
    check(
      "to_pick_no skips past back-to-back to first contested slot",
      w.to_pick_no === 90,
      `to=${w.to_pick_no} (was trivially 78 in old code)`,
    );
    check(
      "target_pick_no points at the first contested slot",
      w.target_pick_no === 90,
      `target=${w.target_pick_no}`,
    );
    const windowSize = w.to_pick_no - w.from_pick_no - 1;
    check(
      "12 opponents in window (real contention, not trivial 0)",
      windowSize === 12,
      `size=${windowSize}`,
    );
  }

  console.log("\n── 4. Pre-turn with back-to-back user picks behind it ──");
  {
    // Live pick 76 (pre-turn), user owns 77 and 78 back-to-back.
    // The "next user opportunity" is 77. Window walks live → 77.
    const snap = snapWithLive(76);
    const schedule = [
      scheduleEntry(77),
      scheduleEntry(78),
      scheduleEntry(90),
    ];
    const w = computeSurvivalWindow(snap, schedule);
    check(
      "kind is pre_turn",
      w.kind === "pre_turn",
      `kind=${w.kind}`,
    );
    check(
      "target_pick_no is the first user pick, NOT the contested-after-run slot",
      w.target_pick_no === 77,
      `target=${w.target_pick_no}`,
    );
    // Pre-turn cares about "will it be there when I draft," so the
    // back-to-back at 78 is irrelevant; the user wants survival to 77.
    const windowSize = w.to_pick_no - w.from_pick_no - 1;
    check(
      "1 opponent in window (just the live picker before user's slot)",
      windowSize === 1,
      `size=${windowSize}`,
    );
  }

  console.log("\n── 5. Null next_pick_no falls back to at-turn semantics ──");
  {
    // When the draft isn't active (next_pick_no = null), the engine
    // treats the user as at-turn against schedule[0]. Defensive
    // default; no crash.
    const snap = snapWithLive(null);
    const schedule = [scheduleEntry(50), scheduleEntry(58)];
    const w = computeSurvivalWindow(snap, schedule);
    check(
      "null next_pick_no defaults to at_turn",
      w.kind === "at_turn",
      `kind=${w.kind}`,
    );
    check(
      "from_pick_no defaults to schedule[0]",
      w.from_pick_no === 50,
      `from=${w.from_pick_no}`,
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
