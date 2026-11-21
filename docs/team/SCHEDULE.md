# When the team runs, and why it is built this way

## The schedule

All times America/Chicago. Routines are stored in UTC cron, so after daylight saving starts (2027-03-14) each one runs an hour later in local time until it is adjusted. Manage them at claude.ai/code/routines.

| Routine | When (Central) | Model | Output |
|---|---|---|---|
| DG reviewer gate | Daily 7:00 am and 4:00 pm | Opus | Reviews and merges agent PRs; production watch and revert |
| DG stats steward | Monday 6:00 am | Opus | Resolved predictions, lab note, report |
| DG Coach quality | Monday 8:00 am | Opus | Test-set growth, weekly score, report |
| DG trade advisor | Monday 9:00 am | Opus | Seller-flag scoring, one improvement spec, report |
| DG product steward | Monday 10:00 am | Opus | Feedback triage, experiments, report |
| DG growth paid | Monday 11:00 am | Sonnet | Test pipeline, stop rules, report |
| DG growth partnerships | Monday 12:00 pm | Sonnet | Creator list, pitch drafts for approval, report |
| DG claims steward | Monday 1:00 pm | Opus | Claims register, vetoes, legal checklist, report |
| DG chief of staff brief | Monday 6:00 pm | Opus | The Monday brief as a GitHub issue assigned to Isaiah |

The engineer and the ten existing specialists (bug investigator, context doctor, canon keeper, and so on) have no schedule of their own. Role agents spawn them inside their runs.

The order on Monday is deliberate: the stats steward scores first, Coach quality and the trade advisor read those scores, the claims steward runs after the stats steward so it can promote or demote claims on fresh evidence, and the chief of staff runs last so every report is in. The 4:00 pm reviewer pass merges the day's docs-only PRs before the brief goes out.

## How Isaiah gets the brief

The chief of staff opens a GitHub issue titled `Monday brief, <date>`, labelled `weekly-brief` and assigned to `greenpantsisaiah`. GitHub sends it by email and to the GitHub mobile app. He answers by commenting on that issue; every routine reads his comments at the start of its next run. A copy is committed to `docs/team/briefs/`.

## Why these harness choices (for the case study)

A harness is what wraps a model so it can act: the tools it can call, the files it can see, the permissions it runs under, and when it wakes up. This team uses three layers.

1. **Agent definitions as files in the repo** (`.claude/agents/*.md`). Each role is a markdown file with a description (so another agent knows when to call it) and instructions. Because they live in git, every session on any machine, and every cloud run, reads the same team. Before this, the ten specialists existed only on Isaiah's Mac, so cloud runs could not use them.
2. **Cloud routines for the schedule** (claude.ai/code/routines), not scheduled tasks in the desktop app and not cron on the Mac. A routine starts a fresh cloud session with a clean checkout of `main`. It runs whether or not the Mac is awake, it cannot touch Isaiah's local files or secrets, and each run leaves a log at the routine's page. The desktop app's scheduled tasks only run while the app is open, which does not fit a team that works Monday mornings while Isaiah is at his job.
3. **GitHub as the shared memory and the message bus.** Sessions do not share context with each other. They coordinate through issues (reports, decisions, interrupts), PRs (work), labels (state), and a few files (`docs/team/`). This is slower than agents talking directly, but every handoff is visible, durable, and reviewable by Isaiah.

**One session per role, on purpose.** Running each role as its own routine, rather than one big session that plays every role, gives three things: a failure in one role does not stop the others; each run's log shows exactly what that role did; and the reviewer is a different session from every author, so no agent grades its own work. That separation is the eval.

**The merge gate is code plus an agent.** The `ci` GitHub Actions workflow runs every `npm test` suite on every PR (there was no CI before this). Vercel builds a preview of every PR. The reviewer agent merges only when both pass and its principle checklist passes. Recommended next step for Isaiah: turn on branch protection for `main` requiring the `ci / test` check, so even a confused agent cannot merge red.

**Model choice.** Judgment-heavy roles (chief of staff, reviewer, stewards, Coach quality, trade advisor) run on Opus. The two growth roles, which mostly research and draft, run on Sonnet to keep cost down. Revisit after the first month of measured run costs.

## Known limits on day one

- Agents cannot open ad accounts, enter payment details, or send email as Isaiah. Those steps are his (charter, "Open items").
- The reviewer's production watch needs the cloud environment to reach dynastygeneral.app. If the environment's network policy blocks it, the reviewer reports that and relies on Vercel's deployment checks until the policy is widened.
- Vercel preview URLs may sit behind deployment protection; the reviewer then relies on the build check plus a diff read.
- Repo-wide `tsc --noEmit` and `eslint` report pre-existing errors, so CI gates on `npm test` (the project's ship gate). Clearing that debt is an engineer backlog item.
