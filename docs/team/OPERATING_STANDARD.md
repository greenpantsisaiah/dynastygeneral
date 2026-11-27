# Operating standard: how this team catches problems before users do

Written 2026-11-26 after Isaiah, in one week, found more product faults by using the product than the whole agent team found by building it. His words: "Have agents improve their seniority at their roles ... detect the kinds of issues that frustrate users or point to structural flaws, and also find ways to predict and detect issues in alignment with the product's purpose."

A junior response fixes the symptom in front of it. A senior response names the structural flaw that produced the symptom, adds a guard for the whole class, and checks where else the same flaw is already hiding. Every role on this team works the senior way. This file is the shared standard; `docs/team/INCIDENTS.md` is the detect-and-resolve machinery under principle 4.

## What the product is for (the yardstick for every check)

DynastyGeneral is a senior advisor for fantasy managers. A user trusts it when every number is valid, every surface tells the same story, and every item tells them exactly what to do next and why. So the failures that matter most are, in order: **wrong** (a number or fact that is not true), **contradictory** (two surfaces disagree), **stale** (true once, not now), **unactionable** (an opinion without a move), **broken** (a page or link fails), and **unreadable** (jargon, clutter). Predict and test for these, not for "does the code run."

## The issues Isaiah found, by structural flaw

| What he saw (Nov 21 to 26) | Structural flaw |
|---|---|
| First weekly brief went out from a stale build, with no reply-to, never previewed | F1 nobody walked the user's path |
| Sell advice in a best-ball league; 3 of 8 leagues shown; greeting used his email address | F1, plus F4 (raw `display_name` trusted) |
| Email link opened signed out and hit a red "roster not found" banner | F1 |
| Red "ENGINE INTEGRITY ISSUE · POSITION UNKNOWN" banner (Travis Hunter, DB/WR) | F4 unverified boundary, F5 engine-speak, F6 alarm nobody read |
| "Trade before Thu Nov 26, 11:30 AM" still shown after that time | F3 advice without a clock |
| Lineup advice on stale data; a kicker flagged that was already set | F3 |
| League pages still a draft tool in Week 12 | F3 (season stage) |
| Email said offer Warren to ladovina11; the app said Revolver420 | F2 two truths |
| /home says "Lean sell", the league page says "Rebuilder" for the same team | F2 |
| "Week 11" in the email while Sleeper showed week 12 | F2, F3 |
| "Ask ladovina11 for draft picks"; "what would I trade Warren for?" | F5 opinion without a move |
| "Buyer", "seller", "value points on our 0 to 100 scale", "fair share" | F5 engine vocabulary |
| "Talk it through with Coach" opened an empty chat | F1 (the promised path was never walked end to end) |

The six flaws:

- **F1. Nobody walks the user's path.** We test functions, not journeys: real data, phone width, signed out, from the email link, after the deadline.
- **F2. One fact, several computations.** Email, app and Coach each derive the same fact at different times or through different code, so they drift.
- **F3. Advice without a clock.** Items carry no "computed at" and "valid until," so expired and stale advice keeps rendering, and season stage is ignored.
- **F4. External data trusted raw.** Sleeper and FantasyCalc shapes reach the engine without normalization at the boundary.
- **F5. Output speaks engine, not action.** Items state an opinion or a metric instead of a concrete move a manager can make and we can later grade.
- **F6. Users detect our failures.** Logs and alarms existed; nothing read them.

## The six principles, with practices and automation

Status: **live** (running now), **shipping** (in an open PR), **next** (queued, owner named).

### 1. Every item earns its place with a concrete, provable action

An item a user sees names who, what, for what, by when, and why, and is logged as a prediction we can grade later. "Ask for picks" fails. "Offer Warren to Revolver420 for Waddle plus Barner, about even by our trade values, before Thu 11:30 AM; two of three analysts lean sell because ..." passes.

- Practice: the **item contract**. Every decision item carries `action` (named counterparty and named pieces, or a named lineup move), `why`, `valid_until`, `computed_at`, `confidence`, and a registered prediction id. No contract, no render.
- Practice: plain words. Users see "teams likely to buy," never "buyer"; "worth about the same," never "value points on our scale." Engine terms live in provenance on tap.
- Automation (next, engineer): an item-contract lint in the decision-item builder and the email composer, plus a vocabulary lint for banned engine terms in user copy, both run on the real-league snapshot in CI.
- Owner: trade advisor (trade items), product steward (all items), stats steward (prediction registration).

### 2. One truth everywhere

The email, the app and Coach show the same fact because they read the same object, not because three builders happen to agree.

- Practice: one builder per fact (CANONICAL_SOURCES). An email item links to the same item id in the app; if the item changed since the email, the app says what changed and why.
- Automation (shipping, `evals/surface-parity.test.ts`): runs the email/home path and the league page path (whose verdict loader Coach shares) on the real-league snapshot at four clocks, including the Tuesday window where the results week flips, and fails if the partner, the ask, the verdict, the week or the deadline differ. First catch: the Warren offer (email ladovina11, app Revolver420) came from the page and Coach computing the results week differently. The Coach mirror lint (`REQUIRED_IN_COACH`) is the companion guard.
- Owner: engineer builds, reviewer enforces.

### 3. Never show stale or expired advice

- Practice: every item has a clock. Expired items disappear or flip to "this window closed"; items built on data older than the decision it informs (lineups after kickoff, injuries before the final report) say so or do not show.
- Practice: season stage is an input. A Week 12 page does not lead with the draft.
- Automation (next, engineer): a clock test that renders the snapshot at `deadline + 1 minute` and at each kickoff and fails if an expired item still renders; the hourly probes run the same check on production pages.
- Owner: engineer, product steward.

### 4. Fail quiet for users, loud for us

- Practice: users see a plain line saying what on the page is affected, never engine diagnostics; we get an incident with evidence.
- Automation (shipping, PR #160): the incident log (server errors, every tagged logged error, cron failures and stopped crons, integrity issues, browser crashes), the hourly incident watch that probes key pages and every real-league page signed out, one GitHub issue per incident, red tier interrupts Isaiah, and the on-call engineer routine that turns incidents into fix PRs. Details: `docs/team/INCIDENTS.md`.
- Owner: engineer on call, reviewer.

### 5. Every user-found bug is a miss for the whole class

When Isaiah (or any user) finds a fault before we do, the fix is not done until the guard for its class exists.

- Practice: the **escape review**, five lines in the fix PR: the bug; the structural flaw (F1 to F6 or a new one); why no existing guard caught it; the guard added for the class (test, probe, lint, tag); where else the same flaw already shows (grep, snapshot run).
- Automation (shipping in #160 for the reviewer gate; next for the label): reviewer blocks a fix PR without the escape review. Incidents a user reported get the `user-found` label; the chief of staff reports user-found vs watch-found each Monday. The goal is watch-found well above user-found.
- Owner: whoever fixes; reviewer enforces; chief of staff tracks.

### 6. Predict issues from the product's purpose

Do not wait for symptoms. Before and after shipping, ask how each surface could be wrong, contradictory, stale, unactionable, broken or unreadable for each kind of user.

- Practice: the **pre-mortem** in every spec and user-facing PR: walk the matrix of league type (dynasty, redraft, best ball, deadline passed, no leagues, many leagues), season stage, signed in and signed out, phone and desktop, entry point (email link, home, direct). Name the likely failure for each and the check that covers it.
- Practice: the **frustration review**, weekly: read Coach chats, email replies and in-app feedback for signs a user was confused, contradicted, or let down ("that's wrong", "already did", "what does this mean", repeated questions, abandoned chats). Each one becomes an `incident` issue labelled `frustration` with the quote, routed by flaw.
- Automation (next): the frustration review as a step in the product steward's Monday run, reading `chat_history`, reply mail and `feedback`; the customer council already scores clarity, trust and decision quality and now tags each fix with its flaw.
- Owner: product steward (frustration review), customer council (walkthrough), stats steward (validity).

## What "senior" means for each role

Each role asks these before calling its work done. They are also in each agent file.

- **Product steward (PM):** Which of the six failure kinds could this surface produce, for which users, at which season stage? What is the action and how will we grade it? What did users get frustrated by this week, and which flaw does it point to?
- **Engineer:** Where does this fact come from, and is there exactly one builder? What happens at the deadline, at kickoff, signed out, on a phone, with a two-way player or an empty league? How would we know if it broke tonight?
- **Reviewer:** Does this PR close the class, not just the case? Is there an escape review for a user-found bug? Did someone walk the real path?
- **Trade advisor:** Is every suggestion a sendable offer with named pieces, a fairness number, a deadline and a reason, and the same offer on every surface?
- **Stats steward:** Is every number a registered prediction with a source and a range? Did any surface show a number we cannot reproduce?
- **Design QA and customer council:** Score the journey, not the screenshot. Tag every fix with its flaw so patterns show.
- **Chief of staff:** Report user-found vs watch-found incidents, open red incidents, and any flaw that recurred, every Monday.

## Rollout

1. Shipping: PR #160 (principle 4 machinery, the Travis Hunter fix, the guidance).
2. Next, in this order: item-contract and vocabulary lints (1), the clock test (3), the email/app/Coach parity test (2), the frustration review step and `user-found` reporting (5, 6). Each is a separate PR through the normal gate.
