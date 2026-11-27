# Incidents: prevent, detect, resolve

Every agent owns production quality. This is the contract.

Origin (2026-11-26): Isaiah tapped a trade link in the weekly email and landed on his Europa league page under a red "ENGINE INTEGRITY ISSUE · POSITION UNKNOWN" banner. Travis Hunter is listed by Sleeper as `position: "DB"` with `fantasy_positions: ["DB", "WR"]`, and the engine read only `position`. The banner had been logging a server alarm, but nothing read the logs, no test ran the pipeline on a real roster, and no agent had proposed a watch. A user found it first. That is the failure this file exists to stop.

## 1. Prevent (before merge)

- **Real data in CI.** `evals/real-league-integrity.test.ts` runs the live hub pipeline (snapshot, priced pool, integrity suite) over every league in the committed real-league snapshot and fails on any severe integrity issue. A change that breaks a real user's league fails CI, not a user's phone.
- **Fix at the source, through a canonical.** A data-shape bug is fixed once at ingest (example: every per-player position read goes through `playerPosition`, which falls back to `fantasy_positions` for two-way players), never patched per surface.
- **No raw engine output on a default view.** Users see plain Voice A lines that say what on the page is affected (`userFacingIntegrityNote`). Engine vocabulary, evidence, and debugging hints render only under `?diagnose=1`. Honesty stays (a partial answer is never served silently); jargon goes.
- **Every new surface ships its own guard.** A new page, email, cron, or API route lands with: a test on real fixture data, its failure path logged with a `[tag]` (so it becomes an incident automatically), and, for a page, a path in the incident watch's probe list when it is reachable from an email link.

## 2. Detect (in production, automatic)

All faults land in one deduped incident log (`src/lib/ops/incidents.ts`, Upstash):

| Source | How it is captured |
|---|---|
| `server_error` | `onRequestError` in `src/instrumentation.ts` (every uncaught server error, by route) |
| `logged_error` | Every tagged `console.error("[stage]", err)`, mirrored by the console capture installed in `register()` |
| `integrity` | Each severe engine-integrity issue on the hub, one incident per kind |
| `cron` | `withCronIncidents` around every cron: a throw or 5xx records an incident; a clean run stamps a heartbeat |
| `client_error` | The app error boundaries post to `/api/ops/client-error` when a page crashes in the browser |
| `probe` | The hourly watch opens key pages and every real-league page signed out, the way email links do |

Deduping: one fingerprint per source + key + normalized message (ids and numbers stripped), with a running count.

**The hourly incident watch** (`.github/workflows/incident-watch.yml`, `scripts/ops/incident-watch.mjs`) reads `/api/ops/incidents`, runs the probes, checks cron heartbeats (a cron that stops running is an incident too), and keeps exactly one GitHub issue per fingerprint, labelled `incident` plus `severity:red` or `severity:amber`. It updates counts on an open issue and reopens a closed one when the fault recurs after the fix.

## 3. Resolve

- **Amber** (most incidents): the `DG on-call engineer` scheduled task runs three times a day. It takes each open `incident` issue without `fix-in-progress`, states "the bug is X because Y" with runtime evidence (INVARIANTS pre-fix checklist), writes a failing test that reproduces it (on the real-league snapshot when it is data-shaped), fixes the root cause, and opens a PR with `Fixes #<issue>`. The PR goes through the normal gate: tests, Vercel preview, the reviewer agent, design-qa for anything user-facing, never removing a feature. It labels the issue `fix-in-progress`. A fault it cannot fix in one PR gets a written diagnosis on the issue and goes to the Monday brief.
- **Red**: the issue is also labelled `interrupt` and assigned to Isaiah the moment it is filed, and the on-call engineer works it first. Red means money, trust, or every-user impact:
  - the weekly brief or Game Day cron failing or stopped,
  - wrong-team or missing-player integrity (`roster_identity_mismatch`, `pool_missing_player`, `pricing_unresolved`),
  - errors or a failing probe on the homepage, `/home`, sign-up, sign-in, or billing,
  - any fault with 50 or more occurrences in the watch window.
- An incident issue closes only with a merged fix or a written reason (for example: upstream Sleeper outage, recovered on its own). If it recurs, the watch reopens it.

## Setup status

- `HEALTH_TOKEN` must be set as a GitHub secret and a Vercel env var (already required by the post-deploy tripwire). Without it the watch runs probes only.
- Upstash env vars in production (already used by rate limits and the tripwire). Without them the log is a no-op and only probes run.
- Vercel's own runtime log API is not needed: the console capture records the same tagged lines at the source.

## What every agent does by default

This is not the engineer's job alone. Any agent that builds, reviews, or plans:

1. Asks "how would we know if this broke in production?" before shipping, and makes sure the answer is "an incident would open," not "a user would tell us."
2. When it sees a fault (in a screenshot, a log, a council run, a user message), checks for an `incident` issue and files one if missing, instead of only mentioning it in chat.
3. Treats a bug a user found before the watch did as a gap in detection, and closes that gap in the same PR as the fix (a new test, probe, or tag).
