/**
 * Last-visit diff regression. Locks the principle-11 "what changed
 * since last visit" digest math.
 *
 *   npx tsx --tsconfig tsconfig.json evals/last-visit-diff.test.ts
 */

import {
  composeDigestLine,
  computeLastVisitDelta,
  formatTimeSince,
} from "../src/lib/last-visit/diff";

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

const NOW_MS = Date.parse("2026-05-08T17:00:00Z");
const ELEVEN_MIN_AGO_ISO = "2026-05-08T16:49:00Z";

function run() {
  console.log("\n── 1. First visit: no prior state, no digest ──");
  {
    const delta = computeLastVisitDelta({
      prior: null,
      now: {
        timestamp_ms: NOW_MS,
        total_picks_made: 5,
        standing_call_id: "p1",
        ev_bank_total: 2.0,
        my_roster_size: 1,
      },
    });
    check("is_first_visit = true", delta.is_first_visit);
    check("has_changes = false", !delta.has_changes);
    check("digest is null", composeDigestLine(delta) === null);
  }

  console.log("\n── 2. Picks made by others since last visit ──");
  {
    const delta = computeLastVisitDelta({
      prior: {
        v: 1,
        ts: ELEVEN_MIN_AGO_ISO,
        total_picks_made: 50,
        standing_call_id: "p1",
        ev_bank_total: 2.0,
        my_roster_size: 5,
      },
      now: {
        timestamp_ms: NOW_MS,
        total_picks_made: 53,
        standing_call_id: "p1",
        ev_bank_total: 2.0,
        my_roster_size: 5,
      },
    });
    check("picks_made_total = 3", delta.picks_made_total === 3, `actual: ${delta.picks_made_total}`);
    check("picks_made_by_user = 0", delta.picks_made_by_user === 0);
    check("standing_call_changed = false (same id)", !delta.standing_call_changed);
    check("ev_bank_delta = 0", delta.ev_bank_delta === 0);
    check("has_changes = true", delta.has_changes);
    const digest = composeDigestLine(delta);
    check(
      "digest mentions 3 picks made",
      digest != null && digest.includes("3 picks made"),
      `digest: ${digest}`,
    );
  }

  console.log("\n── 3. Standing call shifted ──");
  {
    const delta = computeLastVisitDelta({
      prior: {
        v: 1,
        ts: ELEVEN_MIN_AGO_ISO,
        total_picks_made: 50,
        standing_call_id: "judkins-id",
        ev_bank_total: 2.0,
        my_roster_size: 5,
      },
      now: {
        timestamp_ms: NOW_MS,
        total_picks_made: 53,
        standing_call_id: "warren-id",
        ev_bank_total: 2.0,
        my_roster_size: 5,
      },
    });
    check("standing_call_changed = true", delta.standing_call_changed);
    const digest = composeDigestLine(delta);
    check(
      "digest mentions standing call shifted",
      digest != null && digest.includes("standing call shifted"),
      `digest: ${digest}`,
    );
  }

  console.log("\n── 4. EV bank delta surfaces only when meaningful ──");
  {
    // 0.3 delta: below 0.5 threshold; should not surface.
    const small = computeLastVisitDelta({
      prior: {
        v: 1,
        ts: ELEVEN_MIN_AGO_ISO,
        total_picks_made: 50,
        standing_call_id: "p1",
        ev_bank_total: 2.0,
        my_roster_size: 5,
      },
      now: {
        timestamp_ms: NOW_MS,
        total_picks_made: 50,
        standing_call_id: "p1",
        ev_bank_total: 2.3,
        my_roster_size: 5,
      },
    });
    check("small EV delta = 0.3 stored", Math.abs(small.ev_bank_delta! - 0.3) < 0.01);
    check("small EV delta does not trigger has_changes", !small.has_changes);
    check("small EV delta produces no digest", composeDigestLine(small) === null);

    // 0.7 delta: above threshold.
    const big = computeLastVisitDelta({
      prior: {
        v: 1,
        ts: ELEVEN_MIN_AGO_ISO,
        total_picks_made: 50,
        standing_call_id: "p1",
        ev_bank_total: 2.0,
        my_roster_size: 5,
      },
      now: {
        timestamp_ms: NOW_MS,
        total_picks_made: 50,
        standing_call_id: "p1",
        ev_bank_total: 2.7,
        my_roster_size: 5,
      },
    });
    check("big EV delta = 0.7 stored", Math.abs(big.ev_bank_delta! - 0.7) < 0.01);
    check("big EV delta triggers has_changes", big.has_changes);
    const digest = composeDigestLine(big);
    check(
      "digest mentions EV bank movement",
      digest != null && digest.includes("EV bank +0.7"),
      `digest: ${digest}`,
    );
  }

  console.log("\n── 5. User picked since last visit ──");
  {
    const delta = computeLastVisitDelta({
      prior: {
        v: 1,
        ts: ELEVEN_MIN_AGO_ISO,
        total_picks_made: 80,
        standing_call_id: "p1",
        ev_bank_total: 4.0,
        my_roster_size: 7,
      },
      now: {
        timestamp_ms: NOW_MS,
        total_picks_made: 81,
        standing_call_id: null,
        ev_bank_total: 4.5,
        my_roster_size: 8,
      },
    });
    check("picks_made_by_user = 1", delta.picks_made_by_user === 1);
    check("picks_made_total = 1", delta.picks_made_total === 1);
  }

  console.log("\n── 6. formatTimeSince covers the buckets ──");
  {
    check("0 ms = 'moments ago'", formatTimeSince(0) === "moments ago");
    check("1 minute", formatTimeSince(60_000).includes("1 minute ago"));
    check("11 minutes", formatTimeSince(11 * 60_000) === "11 minutes ago");
    check("2 hours", formatTimeSince(2 * 3600_000) === "2 hours ago");
    check("1 day = yesterday", formatTimeSince(24 * 3600_000) === "yesterday");
    check("3 days", formatTimeSince(3 * 24 * 3600_000) === "3 days ago");
    check("2 weeks", formatTimeSince(14 * 24 * 3600_000) === "2 weeks ago");
    check("null = 'since you were last here'", formatTimeSince(null) === "since you were last here");
  }

  console.log("\n── 7. Digest composes multiple parts cleanly ──");
  {
    const delta = computeLastVisitDelta({
      prior: {
        v: 1,
        ts: ELEVEN_MIN_AGO_ISO,
        total_picks_made: 50,
        standing_call_id: "judkins-id",
        ev_bank_total: 2.0,
        my_roster_size: 5,
      },
      now: {
        timestamp_ms: NOW_MS,
        total_picks_made: 53,
        standing_call_id: "warren-id",
        ev_bank_total: 2.7,
        my_roster_size: 5,
      },
    });
    const digest = composeDigestLine(delta);
    check(
      "digest combines picks + standing call + EV",
      digest != null &&
        digest.includes("3 picks made") &&
        digest.includes("standing call shifted") &&
        digest.includes("EV bank +0.7"),
      `digest: ${digest}`,
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
