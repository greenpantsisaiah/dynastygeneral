# Dynasty General · Fable audit (2026-09-15)

Scope: quality, positioning, and the path to commercial competitiveness, with the in-season gap the founder named as the frame. Method: three read-only code audits (in-season coverage, engineering robustness, positioning and monetization), a live render of the founder's Finders Keepers hub in week 2 against the dev server, the after-action, scout, rankings, pricing and landing pages, a competitive search, and the roster-ownership bug fixed earlier today (#83).

## Verdict

The doubt about technical competence is misplaced. The doubt about the product is warranted, and it is about two different things.

1. **The code is competent.** 93k lines of TypeScript, 913 automated checks green, zero TODOs, zero real `as any`, zero empty catches, every external call schema-validated and timeout-bounded, a four-layer LLM cost defense, verified Stripe webhooks, RLS on 35 tables, an object-parity lint that fails the build when Coach forks from the engine. This is a better-defended codebase than most funded seed-stage products. The launch risks are operational (no CI, no error tracking, no browser tests, in-process caches), and each is under a day of work.
2. **The in-season product does not exist yet.** The shipped hub is a draft hub with the hero removed. There is no in-season stage in the code (the stage-adaptation module is dead, never imported by `src/`, and its `in_season` branch is unreachable). The model reads no current-season data. The one trade panel that renders in-season is structurally guaranteed to be empty. There is no trade finder, no waiver or free-agent surface, no sell-high / buy-low read. In week 2 the hub leads with a startup-draft report banner, a Value-vs-ADP bank, "Best value: Shedeur Sanders +47" on a player you cut, and "QB run on, 4 of the last 8 picks were QBs."
3. **The marketing overclaims the model.** The pricing page attributes a Spearman 0.421 vs KTC 0.346 result to "the engine," the methodology page says "We beat KeepTradeCut on every horizon," and two homepage proof charts plus both "your roster" markers are hardcoded data under copy that says "every number has a source." The repo's own progress log says no signal beats the market and the live value is a 0.55 market-dominant blend.

The honest one-line read: you built an analyst-grade draft product with excellent bones, then the season started and the product went quiet. The founder's instinct to hold the ad is right. The reason is not competence. It is that the September product is not yet the product the ad would promise.

## Quality

### Engineering (scored 1 to 5, evidence from the robustness audit)

| Area | Score | Read |
|---|---|---|
| Codebase shape | 4 | 620 files, 34 page routes, 32 API routes, 432 commits via numbered PRs. Six files over 1000 lines; the 3200-line hub page and the 459-line inline Coach payload literal are the maintenance liabilities. |
| Reliability | 4 | Zero TODO / FIXME, zero `@ts-ignore`, 0 empty catches in 306 catch blocks, every fetch bounded (15s Sleeper, 20s player blob, 15s FantasyCalc). |
| LLM layer | 4 | Sonnet 4.6 and Opus 4.7, prompt caching on the system prompt, structured output with a self-correcting retry, SDK timeout under the function limit. Per-IP, per-user, global-USD and fail-closed guards. |
| Auth and billing | 4 | Supabase auth, Stripe with signature verification and an idempotency table, pro gate refuses to fall open in prod. Beta-open mode currently bypasses all tier gates by design. |
| Data layer | 4 | 19 migrations, 33 tables, 52 RLS policies, service role confined to one module, founder-authorized `--write` protocol on 11 ingestion scripts. All ingestion is manual; one cron. |
| Mobile | 3 | Responsive but desktop-first (211 `sm:` vs 32 `lg:`). PWA manifest wired. Mobile issues are found by hand after the fact. |
| Discipline | 5 | 21 declarative lint rules plus 4 structural checks, canonical-sources index, decision-recording comments with dates and incidents. Real, not aspirational. |

The eight launch risks, in order: no CI enforcing the 913 checks; no error tracking (production failures are `console.error` in Vercel logs); Coach payload of roughly 25k to 40k input tokens per turn with `<current_state>` uncached; no browser or E2E test; module-level caches that re-pull the 5MB player blob per cold instance; tier gates effectively off so one enthusiastic cohort exhausts the $75/day cap for everyone; the only LLM-in-the-loop eval (`evals/run.ts`, 8 scenarios) is not in `npm test`; no route-level error boundary on the hub.

### Product consistency (the trust surface, observed live on Finders Keepers, week 2)

This is where the founder's doubt is correct, and it is a different thing from code quality. The surfaces do not agree with each other, and a sharp user notices in one scroll.

- **Four rank claims for one roster on one page.** Posture banner: "Rostered value ranks 2 of 12," WIN-NOW at 80% confidence. League standings: izzydabomb 12th of 12, "Long shot," Now 78. SWOT: "Mid-pack posture (composite 5th of 12)." Team identity: "lineup rank 2/12." The after-action report adds a fifth: "12th of 12 on win-now, 4th on future" under the label "Sustained Contender." Five computations, four answers, no reconciliation. Each traces to a different module (`posture/detect.ts`, `league-outlook/rank-tier.ts`, `swot/compute.ts`, `team-identity`). This is the same bug class the canonical-sources doctrine exists to prevent, at the most visible layer of the product.
- **Draft copy in week 2.** "Draft 100% in. Solid session." "Best value: Shedeur Sanders +47" (dropped in August). "Watch the board: QB run on." "Build TE insurance into your next 2-3 picks" (there are no picks). "Address via draft or trade before week 4." "Hold the 2027 R1s; they fund the 2026 window." "The picks left in your draft can still shift this one tier." The after-action banner is pinned all season.
- **Contradictory opponent reads.** Opponent characterizations label izzydabomb "Lean win-future, 88% confidence" while the posture banner says WIN-NOW. Every opponent carries the identical 88% confidence and identical templated "How to play them" copy per lean, derived from median draft-pick age. In-season, that read is stale by construction and blind to player trades (trade history is future-picks-only).
- **Sloppy chrome on a paid-intent product.** "Ja'Marr Chase (value 92.89008000000001)." "v1 prototype" and "v2 prototype" labels on hub sections. "4 extra body for depth/trade." Inflection rows reading "QB tier classification queued for v2." Kalif Raymond framed as "Continued WR1 production." The AAR's QB Stable gap suggests packaging Ja'Marr Chase, the roster's anchor, to acquire a third QB.
- **Coach capitulated, then reversed.** When you disputed the phantom QBs, Coach agreed it was wrong, then on the next turn insisted the snapshot confirmed five QBs. There is no system-prompt rule for handling a user correction (grep finds none). Today's fix removed the bad data; the behavior rule is still missing.
- **Scout excludes keeper leagues.** `/scout/[username]` filters to Sleeper `settings.type === 2`, so Finders Keepers, your primary league, is absent from your own public scout report.

None of these is hard. All of them are the reason the product does not yet feel trustworthy enough to advertise.

## The in-season gap

The founder's framing ("now it is trade, value maximization, and looking forward to next season") is exactly right, and the code confirms it is worse than it looks from the outside.

| Capability a dynasty manager needs in September | Status | Evidence |
|---|---|---|
| Current-season stats, snaps, targets | Absent | Stats fetched only for season-1 and season-2 (`page.tsx:1063-1067`, `coach/route.ts:1181-1182`). Week 3 reads 2025. |
| Injury awareness | Absent | `injury_status` parsed from Sleeper (`schemas.ts:207`), consumed nowhere. |
| Transactions (adds, drops, trades) | Absent | `getTransactions` written with a 60s cache, zero callers. |
| Value freshness | 24h TTL | `values.ts:25-32`. A Sunday injury moves value Monday. |
| Proactive trade finder across 11 opponents | Absent | Both trade paths require a hand-typed target and one LLM call (`trade-form.tsx:258-271`). |
| Trade leverage panel | Empty by construction | Skips every opponent labeled `balanced` (`analyze.ts:266`); in-season every full roster is `balanced` (`from-snapshot.ts:217-230`); `trade_window` needs a live pick number (`analyze.ts:436`). |
| Incoming trade evaluator, outbound attack | Shipped | The best in-season tools in the product. Reactive only. |
| Waivers, free-agent watch, breakout alerts | Absent, refused | Coach has a regex that detects waiver / FAAB questions and injects a refusal (`coach/route.ts:1951-1954`). Landing copy calls waivers "a solved problem." |
| Sell-high / buy-low | Static prose | AAR's hardcoded 5-block calendar promising "Mid-season check-in arrives in October" with nothing behind it. |
| Plays in-season morphs (QB Flip Window, Handcuff Watch, Buy-the-Dip, 2027 1st Sniping) | Spec-only | Five morphs in REDESIGN_INTENTIONS, zero identifiers in code. Plays panel is not rendered on the hub at all; it lives inside the draft-gated Call. |
| Weekly matchup, start/sit, projections | Absent | `getMatchups` fetched only to settle a companion wager. `projections.ts` is ADP, not points. |
| Posture, contender window, future pick cabinet, next-year pick valuation | Shipped | The genuinely good in-season pieces. They comment on the season; they do not tell the user what to do this week. |
| Companion in-season beats | Shipped, thin | Standing milestone, callbacks, weekly matchup ledger. Requires sign-in. |

The blunt summary from the coverage audit: nothing currently on the in-season hub tells a manager to do a specific thing this week.

## Positioning

### What the code honestly supports

The headline "Read the room before you make the trade" is defensible and should stay. It is an opponent-behavior claim, not a prediction-accuracy claim, and the product genuinely computes per-opponent profiles, per-league named context, and one decision per pick. The most honest paragraph on the site ("No predicting the future. It tells you what your opponents have done, not what they will do") is also the correct positioning; today it lives in a footnote while the overclaim lives in headlines.

### What must come off before any ad runs

1. The "Calibration receipt: engine v1 averages Spearman 0.421 (KTC 0.346, FantasyPros 0.365)" line on `/pricing` and "We beat KeepTradeCut on every horizon" on `/methodology`. Named-competitor performance claims the live engine does not reproduce. MODEL_LIVE_PLAN's own progress log: "Claiming the live board beats the market on the back of it is NOT defensible." MODEL_CARD 9.6 pre-committed: "Until then, no marketing claims of relative performance." The 2024 single-year column drives the average, and the scoreboard methodology says single-season scores "should not be cited as headline numbers." This is the Lanham Act false-comparative-advertising shape.
2. "Every claim ships with a chart. Every chart ships with its sample size and source" and "Every number has a source," for as long as the Build shape and Opponent fingerprint charts are hardcoded arrays (`home-charts.tsx:201-218, 311-312`) and both "your roster" markers are `p50 + 15` and `p75 - 10` (`home-charts.tsx:36-38, 411`). A dynasty subreddit takes this apart in an afternoon.
3. "82 rosters in 5 calibration leagues" as the lead subhead. Accurate, but it is a threshold-tuning cohort, not validation, two lanes run at n = 48 and n = 60, and leading with n = 82 invites the one comparison the product loses. Demote to a proof point.

Two funnel bugs: the MFL coming-soon page links to `/#waitlist`, which is not mounted; and `/scout`, the public no-login shareable surface, has no homepage entry point.

### The scoreboard

Indexed at sitemap priority 0.9, publishes engine v0/v1 backtest rows dated 2026-05-08, and has not been re-run against the live engine or labeled as such. The CSV also carries five duplicate 2022 v0 rows with different Spearman values; the page's last-write-wins dedupe shows 0.3756 while MODEL_CARD reports 0.442 for the same cell.

### The model claim, decided

The repo has already run the experiment. Every Phase B signal (route participation, RB role tier, scheme and coaching, three OL proxies) is sourced, wired, backtested, and none clears the market on top of KTC plus age. The live value is 0.55 market prior, mean |delta| 1.8 on a 0 to 100 scale. That is not a failure; it is the answer. The commercial edge in-season does not come from a better value number. It comes from applying market values to this league's specific 11 rosters, picks, postures, and fingerprints, and turning that into an action. Nobody in the competitive set does that.

### Competitive read (September 2026)

The AI trade calculator is now table stakes: KeepTradeCut, DLF, RotoWire, Draft Sharks ($6/month), RotoBot AI, Dynasty Trade HQ, Dynasty Dealmaker, Dynatyze, Fantasy Draft Pros (which also ships a waiver assistant), Dynasty Nerds ($40 roster reviews), FantasyPros. Every one of them grades a trade you already typed in. None of them reads your specific league, scans your 11 opponents, and tells you which three offers to send today and why each manager says yes. That is the wedge, it is the founder's own stated in-season need (the joeboch thread is exactly this workflow done by hand), and it is buildable on canonicals that already exist.

The one honest positioning line the shipped product supports today, from the positioning audit:

> Every opponent in your league, read before you offer the trade.

The line the product should earn by November:

> The trade finder that knows your league.

## Next steps

Sequenced. Each phase is shippable on its own and the ad waits for Phase 2.

### Phase 0 · Truth and trust (this week, before any ad, roughly 3 days)

- Marketing truth pass: remove the three claims above, label illustrative charts, mount the waitlist, link Scout from the homepage, re-label the scoreboard as "v0/v1 backtest, 2026-05-08, not the live engine" and fix the duplicate 2022 rows.
- One canonical league standing. Collapse the five rank computations into one `resolveLeagueStanding` read (value rank, record rank, win-now rank, future rank, each named once) consumed by posture, standings, SWOT, team identity, AAR, and Coach. Add it to `CANONICAL_SOURCES.md` and the object-parity lint.
- Strip draft copy from the in-season hub: AAR banner off after week 1, WatchlistStrip off, "Best value" and "Watch the board" and "Sharp positioning" off, every "next N picks" template routed through stage. Wire `selectSurfaceLayout` or delete it; make `classifyStage` read NFL state so `in_season` is reachable.
- Coach correction rule: when a user disputes roster or data, Coach restates exactly what the snapshot contains, names the source, and offers a refresh; it never agrees to a claim the snapshot contradicts and never reverses without new data.
- Ops: GitHub Actions running `npm test` and `npm run build` on every PR; Sentry (or equivalent) on the hub and Coach route; a route-level `error.tsx` for the hub; player blob into Upstash so cold instances stop re-pulling 5MB.
- Scout: include keeper leagues (`settings.type` 1 with keeper settings) or say why not.

### Phase 1 · The in-season data spine (weeks 1 to 3)

Everything in-season is downstream of this.

- Current-season weekly stats from Sleeper (`/stats/nfl/regular/{season}/{week}` and the season aggregate) into the same `buildOpportunityProfile` canonical, so snap share, targets, and red-zone usage are this year's and update Tuesday.
- Transactions feed wired (adds, drops, trades, FAAB) so opponent fingerprints read player trades, not just future picks.
- `injury_status` consumed: on the roster read, the Coach context, the inflection cards, and value deltas.
- FantasyCalc value TTL to 1 to 6 hours in-season, with a per-player value history so week-over-week deltas exist.
- Usage-trend canonical: week-over-week snap and target change per player, one helper, consumed by everything below.

### Phase 2 · The Trade Finder (weeks 2 to 5, the ad-able feature)

Deterministic candidate generation, LLM only for the message.

- For each of the 11 opponents: need-fit from the startable-depth canonical (their thin room vs your surplus), posture fit (contender buys production, rebuilder buys picks and youth), fingerprint (flipper, hoarder, seller, quiet, now including player trades), stated plans and notes, and receptivity (recent activity, roster holes, injury exposure).
- Produce three ranked offers inside the ±15% band with a named "why they say yes," the KTC anchors, and the pick-scale conversion, plus a copy-ready message. Rendered as the in-season hero in The Call's slot. Coach cites the same objects (object-parity lint).
- The founder dogfoods it across seven leagues for one week before it is marketed. This replaces the empty TradeStrategyPanel and the round-8-capped TradeOpportunitiesPanel.

### Phase 3 · Value maximization (weeks 4 to 6)

- Sell / Buy / Hold board per rostered player: value delta over 2 and 4 weeks, age curve, usage trend, injury, posture. One reason line each, provenance on tap. This is the founder's "value maximization" and it is the highest value-per-unit-of-work gap on the list.
- Free-agent watch: the unrostered pool with usage-trend triggers (the founder's memory note already calls FA monitoring a headline value prop). Remove the Coach waiver refusal once data exists.
- Two in-season plays as real morphs: Handcuff Watch (anchor injury or snap anomaly) and Buy-the-Dip (top-30 value plus a two-game dip). Both are specified; both fit the existing play machinery.

### Phase 4 · Next season (November onward)

- Keeper decision engine (Finders Keepers is a keeper league; the keeper decision is the biggest single dynasty moment between February and August and the product does not address it).
- 2027 pick market: your pick cabinet vs the class-strength read, who is selling futures, 2027 1st Sniping as a real play.
- Offseason posture plan: the "mid-season check-in" the AAR promises, generated from the Phase 3 board rather than hardcoded prose.

### On the model plan

Recommendation: park Phase D (Forward Production) and Phase E behind Phases 1 to 3 above. The MIT-grade claim is a marketing liability today and a research project for later. The commercial product is league-aware action on market values, and that does not need to beat KTC. Reframe MODEL_CARD 9.7's "higher-conviction calls than consensus, mixed per-year" as the public model statement and let the scoreboard carry the numbers with caveats. This is a founder decision; the plan doc should record it either way.

### Pricing

The rails are built (monthly, annual, day pass, volume gates, Stripe). Price when the Trade Finder ships, not before. The comparable set sits at $6/month (Draft Sharks) to $40 one-off (Dynasty Nerds reviews); a $7 to $9/month Pro with the day pass for draft week is defensible once there is an in-season reason to come back every Tuesday. Keep beta open until then, but set the enforced caps now so a cohort cannot take Coach down for everyone.

## The ad

Do not run it yet. Run it the week the Trade Finder has survived seven leagues of the founder's own use. The creative writes itself from that feature: a screenshot of three named offers with "why they say yes," the line "Every opponent in your league, read before you offer the trade," and a Scout link as the no-login landing page. Voice A, numbers with units, nothing about beating anyone.

---

# Part 2 · Data, the two models, and the 2 to 3 year claim (added 2026-09-15)

Founder question: why did all the scraping only reach 82 rosters, and how do we balance (1) letting users tune the model to their own opinions with (2) having the best default model, honestly, without getting sued, on a 2 to 3 year path, while being viable now.

Method: a fourth read-only audit against the live production database (row counts are live reads, not doc claims), plus three empirical probes run today against Sleeper's public API and the DynastyProcess archive.

## Why 82

The scraping and the 82 are unrelated. The scraping produced 26,710 KTC market rows and 3,877 outcome rows. The 82 rosters came from no scraping at all. `scripts/build-cohort.ts` has seven Sleeper league IDs hard-coded in an array literal, all of them leagues the founder belongs to, and stops. The analyzer then dropped two pre-draft leagues, so the analyzed cohort is 58 rosters in 5 leagues; the product ships "82 rosters, 5 leagues," one number from each side of the filter. The bake script that produced the shipped percentile bins is not in the repo.

Nothing technical capped it. Sleeper's read API is free, unauthenticated, and unlimited in practice. A working crawler already exists in the repo (`scripts/backtest-positional-run-edge.ts:79-104` walks user to leagues to previous seasons); it was written for a different question and never pointed at the cohort.

What a crawl reaches, measured today from Finders Keepers alone:

| Probe | Result |
|---|---|
| Distinct 2026 leagues one hop from the 12 managers | 343 (159 dynasty or keeper) |
| New leagues from expanding just 3 of those at hop 2 | 146 more |
| Seasons retained per league chain | Imaginary Football back to 2020, 7 seasons, with rosters, weekly matchups, draft picks, and transactions all still readable |
| Completed trades in one dynasty league, 2025 season | 30, each with both sides, picks, and timestamps |

Two hops reach thousands of dynasty leagues. At 5,000 leagues that is roughly 60,000 roster-seasons with next-season records, 100,000+ real dynasty trades with market value recoverable at the trade date, and tens of thousands of real drafts. No competitor has built on this. It is the dataset that makes the product's claims validated instead of calibrated, and it is a weekend of scripting away.

## What the model actually rests on today (live counts)

| Dataset | Live state | What caps it |
|---|---|---|
| KTC historical values | 26,710 rows, 27 snapshot dates 2022-01 to 2024-12 (docs say 31). One date ingested five times. **No 2023 preseason snapshot exists**; the gap runs March to October 2023, so every "2023 preseason baseline" in the A4 backtests silently resolved to a March snapshot. Half the decision-year cells rest on it. | Wayback availability, KTC top-500 page, insert-not-upsert. |
| FantasyPros ECR | 2022 to 2024 preseason from a 3-day paid trial, synthetic Aug-15 dates, frozen forever. | Trial over; ToS forbids scraping. |
| Outcomes | 2022 to 2024 season totals only. **2025 is missing** eight months after the season ended; one command away. No weekly rows. | Nobody re-ran the script. |
| RB signal codes | 182 player-years, all LLM-coded (the model card says "174 hand-coded," wrong on both counts), lost the bake-off to the free snap-derived tier, unused live. | Spend per extraction; RB only. |
| `player_signals` live | 1,932 rows; draft capital 76%, athletic composite 70%, snap and target share 31%, route participation 17%, twelve columns at 0%. No season key, so it cannot be backtested. | nflverse coverage; single-snapshot table. |
| `team_signals` and `team_signals_history` | 32 rows current and 128 rows 2021 to 2024, all columns 100% populated, temporally blinded. The cleanest dataset in the repo; it produced an honest null result. | Complete. |
| Scoreboard | 30 rows, n of 62 to 91 per cell. The 2022 v1 cell has four duplicate rows (0.376 to 0.442); the page renders 0.376 and the model card quotes 0.442. The specified composite loss function is computed nowhere. | Append-only backtest runs. |
| Prospective forecast log | **Does not exist.** `expectations` holds 4 unresolved rows from one founder mock draft in May. Zero standing calls, zero trade verdicts, zero in-season decisions have ever been recorded with the market value at decision time. FantasyCalc values are fetched, cached 24h, and dropped; there is no value history table. | Never built. Validation Plan Test C called for 600 logged decisions by August. |
| Dial data | 4 `judgment_profiles` rows, 4 users, no aggregation, no link to outcomes. | 4 users. |
| Free archive never tapped | DynastyProcess publishes 362 dated snapshots of dynasty values and a 39MB FantasyPros ECR archive back to roughly 2018, GPL-3 repo, and the codebase already fetches its crosswalk. | Never attempted. |

The blunt read: everything the product tells a user is computed at render and discarded. It is currently impossible to answer "was the product right" about any recommendation it has ever made. That, not the 82, is the data gap that matters.

## The two models, resolved

The honest structure is not "tunable model versus best model." It is one ledger with three authors.

**The default is the market, and that is a feature.** In every backtest the repo ran, the crowd market (KTC, FantasyCalc) was the hardest baseline; no free signal beat it on top of market plus age. So the default model is market consensus plus the adjustments we can defend today (the age curves, validated 2022 to 2025 with the survivorship caveat; format multipliers). Chrome says so: "Default: market consensus. Departures are yours." That is the most honest posture available, it needs no relative-accuracy claim, and it is what the 0.55 blend already is.

**The tuned model is the user's.** The dials turn the market into a doctrine. Every dial departure becomes a named, priced bet: "your youth dial at +30 ranks Carnell Tate 14 spots above consensus." The product's job is to make those bets explicit, log them, and resolve them. That is the fun the founder describes (outcomes and interactions nothing else shows) and the honesty (the product never claimed to know; it showed your call against the market and kept score). The companion beats already phrase vindication and critique; they need the ledger underneath.

**The ledger is the bridge.** Every recommendation (standing call, trade verdict, sell or buy flag, dial-driven departure) is written to `expectations` with the market value at decision time, the market-default alternative, a resolution condition, and the doctrine snapshot that produced it. A weekly job resolves rows against outcomes. Over one season this yields three track records: the user's versus the market, the default's versus the market, and the crowd's (which doctrine patterns beat the market in which formats). In year 2, crowd doctrines that demonstrably outperform can be promoted into the default with receipts, through the validate-first discipline the repo already practices (holdout, founder gate, changelog entry citing the evidence). In year 3, if the default's prospective log beats the market on decision value with a confidence interval excluding zero, claim 2 is earned, pre-registered, and unassailable. If it does not, the product is still the only league-aware decision tool, and the honest brand is intact. Either outcome is a business.

**Redefine what "best model" measures.** "Player value Spearman versus KTC" is the wrong fight: unwinnable with free data, and the most legally exposed claim in the product. The claims worth making are about the world, at n in the thousands, naming no competitor:

- Roster-shape outcomes: "Rosters that fit Win-Now Floor at the IN threshold won X more games the following season, n = 40,000 roster-seasons, 2020 to 2025."
- Trade realism: "Across 100,000 accepted dynasty trades, the median accepted deal was within X% by market value; rebuilders accepted Y." The ±15% band becomes empirical, and the Trade Finder's "why they say yes" becomes a measured acceptance probability.
- Calibration: survival percentages and contender odds published with Brier scores. Being calibrated is a claim you can always make honestly.
- Decision track record: the prospective log, published, with n and CI.

That is "the best data model" in the sense that matters: the only one built on how dynasty leagues actually play out, and the only dataset a competitor cannot replicate from public rankings.

## Honesty rules for the 2 to 3 years (the no-lawsuit part)

1. No named-competitor accuracy claim unless it is prospective, pre-registered, on the same metric, over a stated window, with n and CI, and the methodology is public. Retrospective backtests are labeled "backtest, not the live engine," never headlines.
2. World-claims from the crawl name n, seasons, and method; name no competitor; publish aggregates only. Crawled user identities are hashed; no per-user or per-league publication (the cohort script's own privacy note, applied at scale).
3. Defaults change only with receipts: a changelog entry citing the evidence and the holdout.
4. Every number in chrome carries source, as-of date, and n (Principle 0, now enforced for data as well as copy).
5. Open legal items closed before the crawl runs at scale: Sleeper commercial-use terms (open since May), the nflverse CC-BY attribution line on any surface rendering its numbers, an attorney glance at the GPL-3 DynastyProcess crosswalk, and the FantasyPros rule that the ECR archive is an internal baseline only, never republished at player level.
6. The vocabulary is "track record," "calibrated," "validated on N," never "beats X."

## The data plan (adds to Phase 0 and runs alongside Phase 1)

| Step | Work | Hours | Unlocks |
|---|---|---|---|
| D0 | Ingest 2025 outcomes (and 2018 to 2021 while there). Dedupe `backtest_runs`, reconcile the 2022 cell, relabel the scoreboard. Fix the 82/58 label and the "hand-coded" wording. Refresh TRUTH_AUDIT numbers. | 4 | Retires two model-card caveats, clears the n >= 100 floor for QB, removes the Lanham exposure. |
| D1 | DynastyProcess values archive into `historical_market_values` (362 dated snapshots; FP ECR archive as internal baseline only). Re-run the A4 backtests and log the deltas. | 6 | Fills the 2023 preseason hole, removes the top-500 ceiling and the KTC ToS ambiguity, tripling market-snapshot coverage. |
| D2 | Sleeper graph crawl: seed from the founder's leagues, breadth-first through league members, `previous_league_id` chains back to 2018. Store league-seasons, roster-seasons with players, draft picks, weekly matchups, completed trades. First pass 5,000 dynasty and keeper leagues. Hashed user ids. | 16 | The proprietary corpus. |
| D3 | Derived sets: cohort rebake at scale with next-season outcomes; trade corpus with market value at trade date; survival and contender-odds calibration; league Value-vs-ADP distributions. Replace every "calibrated on 82" with "validated on N." | 24 | Validated world-claims; the empirical fairness band for the Trade Finder. |
| D4 | `player_value_history` table, written on every FantasyCalc refresh and backfilled from D1. | 6 | Week-over-week deltas; value at decision time. |
| D5 | The ledger: write standing calls, trade verdicts, sell or buy flags, and dial departures to `expectations`; weekly resolve cron; personal, default, and crowd track-record views; scoreboard v2 as the prospective log with a pre-registration doc. | 16 | Claim 2's evidence base starts accumulating from the first week it ships. |
| D6 | Dial telemetry joined to ledger rows; year-2 doctrine analysis with holdout. | 8 | The crowd-to-default promotion path. |

Parked, with reasons already recorded: paid PFF (three free proxies at zero), a FantasyPros re-pull (ToS), more nflverse signal hunting (the limit is the signals, not the weights), and Forward Production as a beats-market bet (reframe as the in-season projection surface once weekly data exists, judged on calibration, not on beating KTC).

## The 2 to 3 year arc, stated plainly

- **Year 1 (2026 to 2027 season).** Ship the ledger and the crawl. Replace calibration copy with validated world-claims. Publish the prospective log with its methodology. Public posture: market-anchored, league-aware, user-tuned, with a track record you can inspect.
- **Year 2.** First full-season prospective results. First evidence-backed default change, with receipts. Trade realism and roster-shape findings become the Library's spine and the marketing's proof.
- **Year 3.** If the default's logged decisions beat the market's implied decisions with CI excluding zero, say so, name the window, link the log. If not, say that too. Either way the product has spent three years being the only tool that showed its work.

## The autoloop

The gaps from all four audits are listed in `GAP_REGISTER.md` with IDs, phase, acceptance criteria, status, and whether a founder gate applies. The loop: pick the highest open ungated gap, build it in a fresh worktree, run build and test, ship it through the PR flow, mark it done in the register, report in plain language, repeat. Founder gates stay human: production `--write` ingests, public marketing copy, the pricing flip, any default-model change, and the legal items. Everything else runs autonomously.
