# Postmortem: the first weekly brief email (2026-11-25)

Blameless. The point is what the system let through, not who typed it.

## What happened

The first live weekly brief (week 11) went to all 13 accounts at 2:52 PM Central on Wednesday 2026-11-25, 0 failures. Isaiah's verdict two minutes later: text-heavy, not visual, useless for his best-ball league, missing most of his leagues. He had never seen this version before it reached users.

Defects in the email as sent:

1. Sell advice in "Smells like jabroni spirit," a best-ball league where trades, adds and drops are impossible.
2. 3 of his 8 leagues shown, chosen arbitrarily (`all.slice(0, 3)`), with no word on the other 5.
3. Greeting "Keep going or sell, isaiah@greenpantsstudio.com?": `profiles.display_name` holds the email for email signups.
4. "Week 11" while Sleeper showed week 12, with no label for results versus the week ahead.
5. A text wall: no summary, no visual hierarchy; the approved mockups had odds bars and voices on a scale.
6. Repeated template lines: "3 managers ranked as buyers. Pro names them and why." under every player.
7. Zero-value lines: "Selling costs 0.0 pts of title odds," "costs 0% of title odds, worth 0 at 100 per title."
8. A self-contradicting voice: "Strategist, Lean push. ... This is not the window." (`voices.ts` line 101: young roster plus non-contender gives `lean_push` with the non-contender sentence).
9. Sent from a deploy without the beta framing or the reply-to, so replies had nowhere to go.

## Timeline (Central time)

- **Nov 23, 8:28 PM.** Isaiah, on the mockups (made-up numbers): "The email is gold ... You can build the features."
- **8:39 to 8:48 PM.** One session builds the verdict engine, hub card, Coach mirror and email in one PR (#115): 23 files, about 2,040 lines, in about 20 minutes. Tested with synthetic leagues "because this build environment can't reach Sleeper."
- **Nov 24, 11:42 AM.** Isaiah: "send it. excited to see what this looks like." This approved a send he had not seen.
- **11:45 AM.** First review blocks #115 on 4 code and compliance items. It ran as a subagent of the authoring session and noted "Preview: not loaded (deployment protection); relied on the build check and the diff." It flagged the odd greeting ("sell, there?") as non-blocking.
- **11:49 to 11:50 AM.** Re-review in a separate session; merged about 75 seconds after the request, under a "goes out today if it merges before 3 PM" deadline.
- **Nov 25, 2:27 to 2:52 PM.** Isaiah configures Vercel step by step through relayed instructions; three runs fail on missing settings (Resend domain, CRON_SECRET, REPLY_TO). Three more PRs merge in the same half hour (#123, #124, #125). #123 merged while its author was still pushing the reply-to and beta commits, which then needed #124. The successful run at 2:52 broadcast to all 13 accounts; no step sent Isaiah a copy first.
- **2:54 PM.** Isaiah's critique. **3:01 PM.** Send guard (#126) merges: future versions preview to Isaiah only until he approves that exact version.

## Root causes

1. **Nobody looked at the real output.** No agent rendered the email with real league data. The cloud sandbox cannot reach Sleeper and the Vercel preview is behind deployment protection, and every agent treated that as a reason to rely on the diff instead of a blocker. Even `?dry=1` returned counts, not the rendered email. Isaiah's Mac could have rendered it through Remote Control.
2. **The gates checked code, not product.** CI tests assert compliance and structure (unsubscribe link, escaping, free versus Pro gating) against one synthetic 12-team league. The reviewer's 10-item gate covers checks green, claims, Voice A, invariants, flags, tiers, and a preview check written for "UI changes" with an explicit escape hatch when the preview is unreachable. Nothing asked "is this good, and right for this user's leagues?" The coach has a blind quality eval that gates changes; user-facing artifacts had nothing comparable.
3. **No owner of design quality.** The roster has stewards for claims, stats, Coach quality and trades. No role owned how the product looks and reads.
4. **Approving a concept was treated as approving the artifact.** Isaiah approved mockups with designed visuals and sample numbers; the shipped renderer was a quick inline-styled list that looked nothing like them. No step compared ship to mockup, and the red-tier "bulk message" approval was taken from "send it" on an unseen email.
5. **Speed beat the bar.** A 2,000-line, four-surface PR in 20 minutes; a cron window ("before 3 PM today") drove merges in about a minute; relays focused on unblocking the send. Each step was locally reasonable; together they removed every pause where someone might have looked.
6. **Known context was not used.** Best ball and trade deadlines are already parsed in the canonical `buildFormatRulesFromSnapshot` (Coach uses them); the verdict and the email never consulted it. INVARIANTS already bans emitting plays that ignore `format_rules`; the same rule was not applied to verdicts.

## What went right

- The send guard, logging, and reply-to fixes shipped within an hour of the critique.
- The first review caught a bug that would have sent nothing (wrong `profiles` columns).
- Isaiah gave fast, specific feedback, and the redesign thread already proposes a pre-send content lint and per-league-type fixtures.

## Changes (this PR and follow-ups)

Shipped in this PR (rules and prompts only, no product code):

- `docs/team/QUALITY_BAR.md`: definition of done for user-facing outputs and a 10-line rubric.
- New `design-qa` agent that scores the rubric as a separate judge.
- Reviewer gate: user-facing PRs need real-data screenshots and a passing design-qa scorecard; no diff-only escape; review the head commit you were asked about.
- Engineer: a sandbox that cannot reach real data is a blocker to report; split large user-facing PRs.
- Chief of staff and charter: deadlines never skip the bar; relay exactly what Isaiah saw; approval means approving a rendered preview.
- PR template with the user-facing checklist.

Follow-ups owned elsewhere:

- Email content lint, per-league-type fixtures, and the redesign: "Redesign the weekly email brief" thread.
- Gate the contend-or-sell verdict on `format_rules` (best ball, deadline) and fix the contradicting strategist sentence and zero-value lines in `voices.ts`: engineer, requested by the trade advisor.
- Prerequisite: a real-league snapshot captured weekly from Isaiah's Mac into `evals/fixtures/real-leagues/`, so cloud agents render real data without live Sleeper calls.
- Prerequisite: an admin-only render route that returns the exact email HTML for a given user without sending, so reviewers can see output from the live data path.
- Run design-qa over the live hub card and Coach verdict copy, which shipped through the same gate.
