# Quality bar for user-facing outputs

Read this before building, reviewing, or approving anything a user will see: a page, a hub card, an email, a share card, Coach copy, a landing page, a push notification.

Why it exists: the first weekly brief email (week 11, 2026-11-25) went to all 13 accounts and was, in Isaiah's words, "objectively kind of crappy." It passed every gate the team had. CI was green, the reviewer merged it, the copy had no em dashes. Nobody, agent or human, had looked at the real email rendered with real league data before it reached users. The postmortem is `docs/team/postmortems/2026-11-25-weekly-brief.md`. This file is the fix: a definition of done that a test suite alone cannot satisfy.

## Definition of done (all five, or it is not done)

1. **Rendered with real data.** The output is rendered from real league data, not only hand-made fixtures. Isaiah's own leagues are the default sample (see the project memory for his Sleeper ids). If the session cannot reach Sleeper or the preview (cloud sessions get a proxy 403 on api.sleeper.app; Vercel previews sit behind deployment protection), that is a **blocker to report**, not a reason to ship unseen. Run the render on Isaiah's machine through Remote Control, or capture a real-data fixture there and commit it.
2. **Rendered across league types.** At minimum: dynasty, redraft, best ball, trade deadline passed, an account with no leagues, and an account with many leagues (7 or more). An output that is wrong for one league type is wrong.
3. **Screenshots in the PR.** The PR body links or attaches a screenshot of each rendered case (desktop and phone width for pages and emails). No screenshots, no review.
4. **Critiqued against the rubric below,** by someone other than the author: the `design-qa` agent, scored, with the score in the PR body.
5. **Owner preview before first exposure.** The first time a new surface or a new version of an email reaches users, Isaiah has seen that exact rendered output first and said yes to it. Approving a mockup is approving a direction, not a send. For email this is enforced in code by the send guard (`src/lib/email/send-guard.ts`): users get only the template version Isaiah approved.

If any of the five is missing, the reviewer blocks with `reviewer-blocked` and names the missing item.

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

Every user-facing renderer gets a fixture test per league type (the list in item 2) that asserts the rubric lines a machine can check: no "@" in names, no trade copy when trading is off, no zero-value lines, no duplicate sentences, every league present or explained, week label matches its source. CI keeps the rendered HTML as an artifact so a reviewer can open it. Lines a machine cannot check (hierarchy, emotional ROI, design match) are the `design-qa` judge's job.
