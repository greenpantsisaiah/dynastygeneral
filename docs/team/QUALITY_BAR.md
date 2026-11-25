# Quality bar for user-facing outputs

Read this before building, reviewing, or approving anything a user will see: a page, a hub card, an email, a share card, Coach copy, a landing page, a push notification.

Why it exists: the first weekly brief email (week 11, 2026-11-25) went to all 13 accounts and was, in Isaiah's words, "objectively kind of crappy." It passed every gate the team had. CI was green, the reviewer merged it, the copy had no em dashes. Nobody, agent or human, had looked at the real email rendered with real league data before it reached users. The postmortem is `docs/team/postmortems/2026-11-25-weekly-brief.md`. This file is the fix: a definition of done that a test suite alone cannot satisfy.

## Definition of done (all five, or it is not done)

1. **Rendered with real data.** The output is rendered from real league data, not only hand-made fixtures. Render against the committed real-league snapshot (see "The real-league snapshot" below), so cloud agents never have to wait on Isaiah's Mac. If the snapshot does not exist yet, is older than 8 days, or lacks a league type you need, that is a **blocker to report**, not a reason to ship unseen; ask for a snapshot refresh rather than rendering live on his Mac for each change.
2. **Rendered across league types.** At minimum: dynasty, redraft, best ball, trade deadline passed, an account with no leagues, and an account with many leagues (7 or more). An output that is wrong for one league type is wrong.
3. **Screenshots in the PR.** The PR body links or attaches a screenshot of each rendered case (desktop and phone width for pages and emails). No screenshots, no review.
4. **Critiqued against the rubric below,** by someone other than the author: the `design-qa` agent, scored, with the score in the PR body.
5. **Owner preview before first exposure.** The first time a new surface or a new version of an email reaches users, Isaiah has seen that exact rendered output first and said yes to it. Approving a mockup is approving a direction, not a send. For email this is enforced in code by the send guard (`src/lib/email/send-guard.ts`): users get only the template version Isaiah approved.

If any of the five is missing, the reviewer blocks with `reviewer-blocked` and names the missing item.

## Small-change lane

Not every change needs the full matrix. A change qualifies for the small lane when it only edits copy, spacing, or colors inside an existing surface, and adds no new data, logic, section, or recipient. In the small lane:

- One screenshot of the changed area, rendered from the real-league snapshot, replaces the six-case matrix.
- design-qa scores only rubric lines 2, 3, 4 and 9 (personalization, contradictions, filler, Voice A), with no zero allowed.
- Owner preview is not required unless the change touches a broadcast email's subject or headline.

The author claims the small lane in the PR body; the reviewer or design-qa can move it to the full lane if it does more than the rule allows.

## The real-league snapshot

Cloud sessions cannot reach Sleeper (proxy 403), so real data comes from a committed snapshot instead of live calls.

- **What:** a JSON capture of Isaiah's real leagues (league settings, rosters, users, matchups, Sleeper state) covering every league type in item 2, written by a capture script run on his Mac. This snapshot is the source of truth for his Sleeper ids and league list; do not read them from project memory.
- **Where:** `evals/fixtures/real-leagues/` (status: **planned**; the capture script and first snapshot are a prerequisite follow-up, not yet built). Until it lands, the fallback is one Remote Control render on Isaiah's Mac per user-facing PR.
- **Refresh:** weekly, before the Monday brief, plus on demand when a surface needs a league type the snapshot lacks. The capture date is in the file; renders against a snapshot older than 8 days do not count.
- **Privacy:** league and manager names are fine (they already show in the product); never commit emails, auth tokens, or postal addresses.

A second prerequisite: an **admin-only render route** (status: **planned**) that returns the exact email HTML for a given user without sending, so the reviewer and design-qa can see the real email from the live data path.

## The rubric (design-qa scores each line 0, 1 or 2)

A user-facing output ships only with a total of 16 or more out of 20 **and** no zero on lines 1 to 4.

| # | Check | 0 means |
|---|---|---|
| 1 | **Fits the user's situation.** Advice matches the league format and calendar: no trade or waiver advice where trading or waivers are off (best ball, deadline passed), the right week, the right season stage. | Tells a best-ball manager to sell. |
| 2 | **Correct personalization.** Names, leagues, teams and numbers belong to this user. Never shows an email address, raw id, or placeholder as a name. Every league is present or its absence is explained. | "Keep going or sell, isaiah@...?"; 3 of 8 leagues with no word on the rest. |
| 3 | **No contradictions.** No sentence argues against its own label or another sentence ("Lean push ... This is not the window"). | A voice contradicts itself. |
| 4 | **Every line earns its place.** No zero-value lines ("costs 0.0 pts"), no sentence repeated under every item, no jargon a sharp non-analyst cannot parse in one read. | The same upsell line under every player. |
| 5 | **Leads with the answer.** The first screen tells the user what to do or what changed, in one line. | The user has to read three blocks to learn the verdict. |
| 6 | **Visual hierarchy.** Scannable in 10 seconds: a summary on top, numbers shown as numbers (bars, chips, tables) where that is clearer than prose, consistent spacing. | A text wall. |
| 7 | **Matches the approved design.** If Isaiah approved a mockup, the shipped output is recognizably that mockup. List every deviation in the PR. | Mockup had a scale and tiles; ship is a bullet list. |
| 8 | **Honest numbers.** Every number has units, plausible magnitude, and a source (Principle 0, claims register). Implausible values are investigated before shipping, not after. | A number that looks off (a 32-year-old RB "loses about 1 value point by August") ships without anyone checking it. |
| 9 | **Voice A.** `BRAND_VOICE.md`: decisive, no hedging, no em dashes, no exclamation points in chrome. | Hype or hedging. |
| 10 | **Emotional ROI.** Would Isaiah forward it to a league-mate? It should feel like a senior advisor who knows his leagues, not a report generator. | Reads like a log file. |

The judge writes one line of evidence per score, quoting the rendered output. A score with no quote counts as 0.

## Who does what

- **Author (engineer or specialist):** meets items 1 to 3 of the definition of done before opening the PR, and asks `design-qa` for item 4.
- **design-qa:** renders or reads the rendered cases, scores the rubric, posts the scorecard on the PR. Blocks below the bar.
- **Reviewer:** does not merge a user-facing PR without the screenshots and a passing scorecard. A code review is not a product review.
- **Chief of staff / coordinator:** when relaying an approval, says exactly what Isaiah saw ("approved the mockup with sample numbers" is not "approved the email"). A send window or cron deadline is never a reason to skip the bar; the next scheduled run is the fallback.
- **Isaiah:** approves the rendered preview, not the concept.

## Tests that back the bar

Every user-facing renderer gets a fixture test per league type (the list in item 2) that asserts the rubric lines a machine can check: no "@" in names, no trade copy when trading is off, no zero-value lines, no duplicate sentences, every league present or explained, week label matches its source. Status: **planned**. The email version is being built by the email redesign work; until it exists, nothing in CI checks these lines and design-qa covers them by hand. Once built, CI should keep the rendered HTML as an artifact so a reviewer can open it (also **planned**). Lines a machine cannot check (hierarchy, emotional ROI, design match) are the `design-qa` judge's job.
