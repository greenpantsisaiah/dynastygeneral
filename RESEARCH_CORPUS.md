# Dynasty General Research Corpus

Last updated: 2026-04-27
Curator: dynasty-canon-keeper (subagent)
Total works consulted: 38
Used in active model: 33
Discarded with reasons: 5

## Methodology

This corpus is the evidentiary backbone for every signal, weight, and threshold in the Dynasty General evaluation engine. The product must survive cross-examination from Cade Massey, Wayne Winston, and the broader analytics community at Sloan-tier conferences. Constants without traceable evidence are tagged as internal heuristics rather than buried as "common sense." Silence is not credibility.

Selection criteria for v1 (target 30 to 40 works, expanding to 75 to 100 in maintenance passes):

1. Peer-reviewed academic work first. Where peer-reviewed work exists for a topic, it sets the priors and lower-tier work either confirms, refines, or is discarded.
2. Named industry frameworks with public methodology second. PFF, Football Outsiders, Reception Perception, RAS, PlayerProfiler, Pro Football Reference. These are reproducible to the extent the methodology is documented.
3. Industry analyst longitudinal work third. Apex peak-age series, Fantasy Points age-curve work, Harstad mortality tables, Hayden Winks positional-value work, Hermsmeyer air-yards work, Sharp Football schedule modeling.
4. Beat reporters and pundits are sources of FACT (injury news, depth chart) and never sources of ANALYSIS for the engine.
5. Internal heuristics are explicitly tagged. The conference talk must acknowledge them.

Time range: 2003 to 2026, weighted toward post-2018 work where the rules of the game and the data ecosystem (nflfastR, PFF universal grading, Next Gen Stats public release) materially differ from earlier eras.

Bias and gap acknowledgment: dynasty-specific (multi-year horizon) longitudinal work is sparse outside FootballGuys/Apex/Fantasy Points. Per-position aging curves below 2010 are subject to era effects (rule changes favoring passing in 2004 and 2010, kickoff rule changes, two-high coverage proliferation post-2020). Where I cite cohort studies that span eras, I flag era confounding. The corpus is currently lighter on pre-2018 academic work than I would prefer; this is a maintenance-pass priority.

## Methodology citations

- Brier 1950: "Verification of forecasts expressed in terms of probability," Monthly Weather Review. The original strictly-proper scoring rule for probabilistic forecasts; the foundation for Brier score and reliability diagrams. Used because every probability output by Dynasty General (breakout odds, hit-rate ranges, decision confidence) must be calibrated, not just ranked. CITATION_VERIFIED via Wikipedia and Sports AI dev pages, original PDF behind AMS paywall.
- Yurko, Ventura, Horowitz 2019: "nflWAR: a reproducible method for offensive player evaluation in football," Journal of Quantitative Analysis in Sports 15(3), 163-183. https://arxiv.org/abs/1802.00998. The seminal academic EPA + WAR framework for NFL play evaluation; the reason the broader analytics community treats EPA as a defensible primitive. Used as the methodology for any "expected" baseline computation in the engine.
- Baldwin and Carl, nflfastR (2020 onward): https://github.com/nflverse/nflfastR; methodology post at https://opensourcefootball.com/posts/2020-09-28-nflfastr-ep-wp-and-cp-models/. The open-source EPA, WP, CP, xYAC, xPass model suite that succeeded nflscrapR. Used because anything we build downstream of EPA must cite a model the conference audience already trusts.
- Schatz et al., Football Outsiders / FTN, DVOA and ALY methodology: https://www.footballoutsiders.com/info/methods. The original opponent-adjusted, situation-adjusted offensive efficiency framework. Used for OL impact (ALY, ASR) and team-context separation in player evaluation.
- Drinen, Approximate Value (2008 introduction; documentation at https://www.pro-football-reference.com/about/approximate_value.htm). The single-number per-season player value used as the dependent variable in Massey & Thaler 2013 and many downstream studies. Used as the historical performance ground truth when no per-snap modern data exists for older players.

## Per-position findings (USE)

### QB

#### Aging by tier

- Harstad (FootballGuys, 2019, "Dynasty, in Practice: How do Quarterbacks Age?"): https://www.footballguys.com/article/HarstadDiP19. The "mortality table" framing replaces the aging-curve model: rather than ask "how much does the average QB decline at age N," ask "what fraction of age-N QBs remain fantasy-viable." Implies tier-conditional handling: the cohort that reaches age 35 is heavily selected for talent. Tier 3 (industry longitudinal). Used as the load-bearing source for QB tier-conditional decline.
- Apex Fantasy, "The Peak Age for an NFL Quarterback": https://apexfantasyleagues.com/the-peak-age-for-an-nfl-quarterback. Documents that 9 of 16 elite QBs in their cohort had at least one QB1 season after age 35; mid-tier QBs do not. Tier 3. Used as quantitative anchor for the elite-vs-mid split.
- Stathole Sports, "The Mirage of the Quarterback Age Cliff": https://www.statholesports.com/the-mirage-of-the-quarterback-age-cliff/. Reanalysis of the Brian Burke "QB cliff" claim, finding regression-to-mean explains most of the apparent cliff. Tier 4 (analyst). Used as a debunk anchor: the engine should NOT treat age 32 as a uniform cliff for QB.
- Fantasy Points, "Age Curves: When NFL Players Break Out and Fall Off" (2023): https://www.fantasypoints.com/nfl/articles/2023/age-curves-when-nfl-players-break-out-and-fall-off. Separates dual-threat from pocket-passer aging: dual-threat QBs peak ages 24 to 26 and decline sharply after 27; pocket passers flatter and extend into late 30s. Tier 3. Used as the basis for QB sub-tier handling (mobile vs pocket).

#### Rushing share as separable signal

- Fantasy Points 2023 (above): the dual-threat decline driver is rushing volume, not passing accuracy. Implies the engine should track rushing share as its own signal that decays faster than the passing-accuracy signal. Tier 3.
- Internal heuristic (no external citation): the threshold above which a QB is "rushing-dependent" (suggested 80+ rush attempts per season). Tagged as INTERNAL until backtested.

#### Supporting cast effect

- Football Outsiders ALY/ASR methodology (cited above). Adjusted Sack Rate isolates OL pass-blocking from QB-attributable sacks; ASR is calibrated to 100 = average, opponent-adjusted, down/distance-adjusted. Tier 2. Used as the OL pass-blocking signal in QB context.
- PFF Pass Blocking Grade methodology: https://www.pff.com/news/pro-how-pff-grades-pass-protection. Fault-based, situation-adjusted; explicitly does not change with sack/hit/hurry outcome (those are QB-influenced). Tier 2. Used alongside ASR; preferred where granular per-lineman data is needed.

### RB

#### Committee classification

- PFF, "Metrics that Matter: The value of a carry, the value of a target": https://www.pff.com/news/fantasy-football-metrics-that-matter-carry-target-value. Establishes that targets are worth roughly 2.74x carries in PPR. Tier 2. Used for the weighted-opportunity calculation that drives the RB committee detector.
- PFF, "Weighted opportunity: A better fantasy football predictor than raw touches": https://www.pff.com/news/fantasy-football-weighted-opportunity-a-better-fantasy-football-predictor-than-raw-touches. Weighted Opportunity (carries x 0.58 + targets x 1.59) correlates 0.95 with PPR fantasy points; raw touches correlate 0.89. Tier 2. Used as the RB volume metric.
- CBS Sports, "High-Value Touches and TRAP" (Dave Richard, 2019-2020): https://www.cbssports.com/fantasy/football/news/2019-fantasy-football-draft-prep-how-to-leverage-trap-and-high-value-touches-to-identify-running-back-targets/. Defines green-zone (10 yard line and in) carries as high-value; 75 percent of RB touches occur outside the green zone but only generate 42 percent of points. Tier 4. Used as a corroborating frame, not the primary signal.

#### OL impact

- Football Outsiders ALY (cited above): OL is 100 percent responsible for losses, 20 percent more responsible than average for the first 4 yards gained, 50 percent less responsible 5 to 10 yards, zero percent past 10 yards. Tier 2. Used as the load-bearing OL-impact framework for RB.

#### Age cliff (with named exceptions tracked in arbitrage section)

- Northwestern Sports Analytics Group, "The NFL Running Back Age Cliff" (2020): https://sites.northwestern.edu/nusportsanalytics/2020/12/29/the-nfl-running-back-age-cliff/. Quantifies the age 28 to 29 dropoff at 25.2 percent decline in PPR points per game and 37.0 percent decline in total PPR. Tier 3 (university analytics group). Used as the canonical RB-cliff effect size.
- The Dynasty Edge, "NFL Age Curve Study: EPA Trends by Position" (2025, 2014-2024 cohort): https://thedynastyedge.com/2025/06/21/nfl-age-curve-study-epa-trends-by-position-rb-wr-te-qb-fantasy-football-analysis-2014-2024/. EPA-based confirmation that RB rushing efficiency falls off most sharply post-28 of any position. Tier 4. Used as a corroborating cohort.
- Apex Fantasy, "The Peak Age for an NFL Running Back": https://apexfantasyleagues.com/peak-age-nfl-running-back/. Mean peak age 25.46; 8.7 percent of peak seasons at 28, 5.2 percent at 29, 3.8 percent at 30. Tier 3. Used to anchor the dynasty-specific sell window (25 to 26).

#### Pass-catching separability

- PFF target-value research (cited above): the receiving role of an RB is a separable, more durable, less age-decayed signal than the rushing role. Implies pass-catching backs (Kamara, McCaffrey-frame) should age more like slot WRs than like grinder RBs. Tier 2.
- CITATION_UNVERIFIED: a specific peer-reviewed treatment of pass-catching RB aging vs rushing RB aging. Open question; flagged in maintenance.

#### Schematic fit

- Sharp Football Analysis, year-over-year scheme tendency tracking: https://www.sharpfootballanalysis.com/. General methodology for gap vs zone, 11-personnel vs 12-personnel team identification. Tier 3.
- Internal heuristic: gap-scheme RBs (downhill, contact-balance) age differently than zone-scheme RBs (one-cut decisive). Tagged INTERNAL. Open research question.

### WR

#### Target share and route participation

- Sharp Football, "Wide Receiver Stats That Matter for Fantasy Football": https://www.sharpfootballanalysis.com/fantasy/wide-receiver-stats-that-matter-fantasy-football-2024/. Target share year-over-year correlation roughly 0.70; team target share and yards per team pass attempt are the stickiest WR rate stats. Tier 3. Used as the load-bearing target-share signal.
- SumerSports, "Sticky Stats: Predictive NFL Metrics": https://sumersports.com/the-zone/sticky-football-stats-predictive-nfl-metrics/. Confirms target share stability and identifies efficiency rate stats (yards per target, YAC per opportunity) as unstable. Tier 3.

#### YPRR validity

- Fantasy Points, "Statistically Significant: Yards/Route Run" (2024): https://www.fantasypoints.com/nfl/articles/2024/statistically-significant-yards-per-route-run. YPRR correlates 0.43 with next-season PPR; raw targets 0.46; yards per target only 0.18. Tier 3. Used as the WR efficiency signal of choice.
- PFF, "Personnel-adjusted YPRR": https://www.pff.com/news/fantasy-football-using-personnel-adjusted-yprr-to-evaluate-first-and-second-year-wide-receivers. Documents that YPRR has personnel bias (11 vs 12 vs 21 personnel changes the available routes), so the engine should use personnel-adjusted YPRR where possible. Tier 2. Used as the methodological refinement.
- SumerSports, "Revisiting Yards Per Route Run": https://sumersports.com/the-zone/revisiting-yards-per-route-run/. Expected YPRR has year-over-year stability of 0.67. Tier 3.

#### Target competition

- Hermsmeyer, RotoViz "Air Yards" series (2016 onward): https://www.rotoviz.com/2016/08/using-air-yards-to-better-predict-receiving-yards/. Target share + air yards stabilize within 3 games of a season. Tier 3 (industry framework). Used to define how quickly target-vacuum signals mature when a WR1 is injured or traded.
- PlayerProfiler glossary on Unrealized Air Yards: https://www.playerprofiler.com/article/jerry-jeudy-fantasy-football-ranking-stats-profile-meet-the-metric-unrealized-air-yards/. Tier 3.

#### QB downstream effect

- Berri and Schmidt, Stumbling on Wins (2010, especially the QB chapter and Catching a Draft): https://link.springer.com/article/10.1007/s11123-009-0154-6. Documents the weak correlation between draft-day QB evaluation and per-play production. Implies the engine cannot trust QB draft pedigree alone as a signal that a WR's QB will be good. Tier 1 (peer-reviewed and book-form). Used to justify rolling QB context off recent EPA, not pedigree.

#### Aging

- Apex Fantasy, "The Peak Age for an NFL Wide Receiver": https://apexfantasyleagues.com/peak-age-for-nfl-wide-receiver/. Average peak age 26.95; 73.3 percent of peak seasons fall ages 23 to 29; concentrated zone 26 to 29. Begins fading around 30. Tier 3. Used as the WR-aging anchor.
- PFF, "The Age of Decline - Wide Receivers": https://www.pff.com/news/age-of-decline-wr. Tier 2. Used as a corroborating cohort study.
- FootballGuys (2025), "When to Expect an Elite Wide Receiver to Decline": https://www.footballguys.com/article/2025-when-to-expect-an-elite-wide-receiver-to-decline-fantasy-football. Tier 3. Used to handle the elite-tier exception (slower decline).

### TE

#### 12-personnel rate

- Underdog Network, "How TE Usage in 11- and 12-Personnel Impacts Fantasy Football": https://underdognetwork.com/football/other/how-te-usage-in-11-and-12-personnel-impacts-fantasy-football. NFL 12-personnel usage hit 22.1 percent in 2023, the highest rate of the 2000s. U-receiver TE in 12-personnel earns 20.3 percent target rate vs 16.0 percent for Y; 1.47 YPRR vs 1.25. Tier 3. Used as the load-bearing scheme signal for TE.
- PFF, "Fantasy Football: Studying tight end utilization": https://www.pff.com/news/fantasy-football-studying-tight-end-utilization. All 40 highly-productive TEs ran routes on at least 60 percent of 2-TE-set passing dropbacks; top-3 fantasy TEs averaged 84 percent route rate in 2-TE sets. Tier 2. Used as the TE-must-run-routes-in-12 hard threshold.

#### OC scheme tenure

- Internal heuristic (no peer-reviewed source surfaced): TEs tied to a stable OC across multiple seasons produce more consistently than TEs with new OCs each year. Tagged INTERNAL until validated. Open maintenance-pass topic.

#### Slow-development curve and its conditional exceptions

- DynastyNerds, "TE Rookie Production: What to Expect from the 2025 Class": https://www.dynastynerds.com/analytics/te-rookie-production-2025-class/. Top-4 elite rookie TEs each saw 100+ targets; next closest 91; sharp dropoff to 79. Top rookie TEs play at least 70 percent of offensive snaps. Tier 3. Used to define the "elite rookie TE breakout" condition cluster.
- Apex Fantasy, "The Peak Age For An NFL Tight End": https://apexfantasyleagues.com/peak-age-nfl-tight-end/. Average peak age 26.78; 41 percent of qualifying seasons fall in 25 to 27 window. Tier 3. Used as the TE-peak anchor.

## Cross-position findings (USE)

### Draft capital

- Massey and Thaler 2013, "The Loser's Curse: Decision Making and Market Efficiency in the National Football League Draft," Management Science 59(7), 1479-1495. https://pubsonline.informs.org/doi/abs/10.1287/mnsc.1120.1657. Tier 1, peer-reviewed. Top picks are systematically overvalued; later first-round picks deliver more surplus value. Used as the foundational citation for treating draft capital as a strong but tradeable career-long signal, NOT as deterministic. NOTE: original founder spec referenced JEP; the actual venue is Management Science. Citation corrected.
- Stuart, Football Perspective, "Draft Value Chart": https://www.footballperspective.com/draft-value-chart/. AV-based marginal-value chart over picks 1-256, drafts 1970-2007. Tier 3 (industry framework, transparent methodology). Used as the dynasty-rookie-pick value baseline before market overlays.
- PFF, "Historical hit rates by position" and round-by-round analyses: https://www.pff.com/news/draft-what-historical-hit-rates-reveal-about-positional-success. First-round WRs hit top-12 34.6 percent of seasons, top-24 48.7 percent. Round 2 WRs top-12 22.7 percent, Round 3 WRs top-12 11.7 percent. Tier 2. Used as the per-round WR hit-rate prior.
- Berri and Schmidt, "Catching a draft" (2009, Journal of Productivity Analysis): https://link.springer.com/article/10.1007/s11123-009-0154-6. QB draft position weakly correlated with NFL per-play production. Tier 1, peer-reviewed. Used to deflate QB-pedigree weight.

### Injury history

- Mai et al. 2018-2019, "Factors Affecting Return to Play After Primary Achilles Tendon Tear: A Cohort of NFL Players," PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC6415485/. Mean return time 9 months; 22 percent decrease in power ratings and 23 percent decrease in approximate value over 3 years post-injury. Return-to-play 57 percent. Tier 1, peer-reviewed. Used as the load-bearing Achilles return-curve.
- Mody et al. 2022, "Return to Play and Performance After Anterior Cruciate Ligament Reconstruction in National Football League Players," Orthopaedic Journal of Sports Medicine: https://pmc.ncbi.nlm.nih.gov/articles/PMC8905068/. Roughly one-third of NFL players never return; among those who do, only 28.5 percent active 3 years post-injury. RBs, DLs, LBs perform worst; QBs perform best. Tier 1. Used as the load-bearing ACL return-curve.
- Provencher et al., "Decreased Performance and Return to Play Following Anterior Cruciate Ligament Reconstruction in National Football League Wide Receivers," PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC8129483/. Position-specific ACL outcomes for WRs. Tier 1. Used as the WR-specific ACL refinement.

### Contract status

- Wikipedia "Contract year phenomenon" entry compiles cross-sport research; primary NFL coverage in mainstream outlets only. Tier 4-5. Effect documented in NBA via PER (rises in contract year, dips below baseline year after); analogous NFL studies are weaker. Used as a SOFT signal: the engine should track contract-year flags but weight them low.
- CITATION_UNVERIFIED for a peer-reviewed NFL-specific contract-year-phenomenon study. Open research question.

### Off-field risk

- No peer-reviewed study surfaced quantifying NFL off-field-arrest impact on subsequent fantasy production. Tier 5 internal-heuristic territory.
- NFL Personal Conduct Policy and PED Policy (Wikipedia, league sources): https://en.wikipedia.org/wiki/NFL_player_conduct_policy. Used as the procedural baseline (4-game PED, 6-game manipulation, variable personal conduct) for suspension-impact modeling. Tier 5 for predictive use; the engine should treat suspension severity as a games-missed signal but not extrapolate to post-return performance without case-by-case review.

### Schedule of strength

- Sharp Football, 2024-2026 "NFL Strength of Schedule" methodology series: https://www.sharpfootballanalysis.com/analysis/nfl-strength-of-schedule/. Traditional prior-season-record SOS explains 0.028 percent of variance in next-season wins (effectively zero). Projected-win-total based SOS substantially better: 11 of 14 easy-schedule projected-winning teams finished winning; 12 of 15 hard-schedule projected-losing teams finished losing. Tier 3. Used as the "traditional SOS is noise" debunk and the projected-SOS adoption justification.

### Combine athleticism (expect challenges to common knowledge here)

- Kuzmits and Adams 2008, "The NFL combine: does it predict performance in the National Football League?": https://pubmed.ncbi.nlm.nih.gov/18841077/. Limited validity; college performance better predictor of NFL performance than combine drills. Tier 1, peer-reviewed. Used as the foundational debunk for combine-as-primary-signal.
- Cal State Sport Journal, "Predicting Success Using the NFL Scouting Combine," and follow-up work: https://thesportjournal.org/article/the-predictive-ability-of-the-physical-skills-used-at-the-nfl-combine-to-predict-draft-status/. Combine drills have little to no predictive ability for first-year game performance OR draft status (after controlling for position). Tier 2-3. Used as corroborating evidence.
- Football Perspective, "Are 40-Yard Dash Times Correlated With Success For Wide Receivers?" three-part series by Chase Stuart: https://www.footballperspective.com/are-40-yard-dash-times-correlated-with-success-for-wide-receivers/. Direct WR finding: Pearson r = 0.004 between 40-time and fantasy production across 702 WRs. Tier 3. Used as the load-bearing WR 40-time debunk.
- Platte, Relative Athletic Score (RAS, 2013-present): https://ras.football/. Composite athletic-profile score across 6+ tests, position-percentile-based, full database 1987 to present. Tier 2 (named industry framework with public methodology). Used as the athletic-profile composite when the engine needs a single number; explicitly preferred over 40-time alone because the framework's design accounts for the weak predictive validity of any single drill.

## Backtest methodology references

- Brier 1950 (cited above): mean-squared-error scoring rule for probabilistic predictions. Used to evaluate calibration of every probability the engine emits.
- Yurko, Ventura, Horowitz 2019 (cited above): cross-validated EPA model with held-out seasons; documents the leakage risk of training and testing on overlapping windows. Used as the methodology template for any in-house cross-season backtest.
- DRatings, "Log Loss vs. Brier Score": https://www.dratings.com/log-loss-vs-brier-score/. Practical comparison of the two strictly-proper scoring rules in sports betting / prediction contexts. Tier 4. Used to justify reporting both Brier and log loss for engine outputs.
- FiveThirtyEight, "How Well Did Our Sports Predictions Hold Up": https://fivethirtyeight.com/features/how-well-did-our-sports-predictions-hold-up-during-a-year-of-chaos/. Documented Brier scores for NFL prediction across seasons (0.107 in 2015, 0.118 in 2019, 0.162 in 2018, 0.133 in another year). Tier 3. Used as the public benchmark range the engine's NFL sub-models should be measured against.
- Survivorship-bias literature (Wikipedia, Decision Lab): https://en.wikipedia.org/wiki/Survivorship_bias. Aging-curve research is uniquely vulnerable because players who decline early leave the sample. Used as the basis for requiring the engine to either (a) include did-not-survive players in the cohort or (b) explicitly tag the conclusion as condition-on-survival. Tier 4-5 for these specific resources, but the underlying methodological concept is canonical.

## Common-knowledge debunks

### "40-yard dash time alone predicts WR career success" -> DEBUNKED

- Effect size in research: Pearson r = 0.004 across 702 WRs (Stuart, Football Perspective). Practically: 0.1 second improvement projects roughly 121 additional receiving yards over four years AFTER controlling for draft position, which is itself partially driven by 40-time. The relationship is statistically significant in some cuts of the data but practically tiny once draft-position is controlled.
- Citations: Stuart, Football Perspective 40-time series (https://www.footballperspective.com/are-40-yard-dash-times-correlated-with-success-for-wide-receivers/); Kuzmits and Adams 2008; PFF 40-time vs production analysis.
- Coach response language: "The straight-line speed myth: across more than 700 WRs, 40-time correlates with NFL production at essentially zero (r = 0.004) once you isolate the drill from draft capital and college production. RAS (a composite athletic score) holds up better; raw 40 alone does not."

### "Rookie WRs need year 2 to break out" -> CONDITIONAL

- Effect size in research: Round 1 WRs hit top-12 34.6 percent of seasons (PFF), and the year-1 hit rate is heavily skewed toward round-1 picks who land in target-vacuum situations (Jefferson into a Stefon Diggs vacancy, Chase reuniting with Burrow with no Green ahead, AJ Brown into Tennessee's WR1 hole, OBJ into NYG with Cruz injured). The "year 2 rule" is a survivorship artifact of treating Round-3-plus picks as the population mean.
- Citations: PFF historical hit rates; FantasyTrading Room dynasty hit rates; Reception Perception OBJ rookie-year target-rate work (32.7 percent of routes targeted, the highest among 2014 rookies).
- Coach response language: "The year-2 rule is conditional, not universal. Round-1 WRs landing in target vacuums (Jefferson, Chase, AJ Brown, OBJ) hit year 1 roughly half the time. The year-2 myth comes from including Day-3 picks who were never going to break out at all."

### "RBs always cliff at 28" -> TRUE WITH NAMED EXCEPTIONS

- Effect size in research: 25.2 percent decline in PPR PPG and 37.0 percent decline in total PPR from age 28 to age 29 (Northwestern Sports Analytics). Mean peak age 25.46; only 3.8 percent of peak seasons occur at age 30 (Apex). The cliff is real and steep.
- The exceptions: Henry, Frank Gore, Ricky Williams (late-NFL-entry case), peak-Adrian-Peterson. Common conditions: (1) above-average frame (220+ lb) with contact-balance translating to less per-touch wear, (2) lower early-career mileage either because of late college start or lower-touch role, (3) workout-and-recovery investment, (4) zone-light, gap-heavy schemes. Henry is the most-cited current outlier (32, RB8 in 2025 with 1,745 yards, 16 TDs, 2,800+ career touches).
- Citations: Apex peak-age series; Northwestern; Dynasty Edge EPA-based age curve; Pro-Football-Reference Henry stats page.
- Coach response language: "The cliff is real (25 percent PPG drop at 28 to 29 on average), but the cliff has named exceptions whose conditions are visible. Henry, Gore, Ricky Williams all had above-average frames, lower-than-average early-career mileage, or both. Treat the cliff as the prior, then check whether your specific RB matches the exception cluster."

### "Schedule of strength matters a lot for season-long fantasy" -> OVERWEIGHTED

- Effect size: Traditional SOS (using prior-season records) explains 0.028 percent of variance in next-season wins (Sharp Football). Projected-win-total SOS does materially better but is NOT the version most fantasy outlets quote.
- Citations: Sharp Football SOS series 2023-2026.
- Coach response language: "Schedule of strength as you usually see it (last year's records) explains essentially nothing about next year's outcomes. Sharp's projected-win-total SOS is meaningfully better but still small effect size for individual fantasy production over a 17-game season. Don't trade a player over schedule alone."

### "Cold weather destroys passing production" -> TRUE_BUT_OVERWEIGHTED

- Effect size: 1.8 percent decline in completion percentage and 0.17 yards per attempt drop in cold games; 3.1 percent and 0.19 ypa drop in below-freezing games. Roughly 5 percent passing-production dip in the 25-55 degree range (Advanced Football Analytics; Wharton 2022 working paper). Real but small.
- Citations: Advanced Football Analytics weather work (http://www.advancedfootballanalytics.com/2012/01/weather-effects-on-passing.html); Wharton 2022 paper (https://wsb.wharton.upenn.edu/wp-content/uploads/2022/09/2022_Football_Parks_Weather.pdf); 4for4 cold-weather scoring analysis.
- Coach response language: "Cold weather knocks roughly 1.8 to 3.1 points off completion percentage and a fifth of a yard off YPA. It's a real effect but small. Wind matters more than temperature. Don't bench an elite QB over a 30-degree forecast."

### "Don't draft RBs early in dynasty (Zero RB)" -> FORMAT_DEPENDENT

- Effect size: Zero RB works best in best-ball and redraft because it leverages within-season RB injury rates and waiver-wire churn. In dynasty startup, multi-year horizon makes young elite RBs (the ones taken early) carry age-curve upside that single-season Zero RB math does not capture. Roster-size and waiver-availability differences in dynasty further weaken the strategy.
- Citations: ProFootballNetwork Zero RB explainer; League Winners "Dynasty Startup Strategy: Zero RB"; FantasyPros dynasty Zero RB.
- Coach response language: "Zero RB is a redraft and best-ball strategy. In dynasty startups, the math changes: young elite RBs carry multi-year value the single-season version of the strategy ignores, and dynasty rosters are too deep for waiver-wire RB acquisition to bail you out. Format-dependent advice; don't import the redraft slogan."

### "QB age cliff at 32" -> DEBUNKED FOR ELITE TIER

- Effect size: The cliff is largely a regression-to-mean artifact (Stathole). Elite-tier QBs (the ones who reach age 35 at all) show different decline curves: Apex documented 9 of 16 in their elite cohort had a QB1 season after age 35. Mid-tier QBs ARE often done by 33 to 34. The error is treating one curve as universal.
- Citations: Stathole "Mirage of the QB Age Cliff"; Harstad mortality table; Apex peak-age QB.
- Coach response language: "The cliff is tier-conditional. Elite QBs play through 38+ regularly (Brady, Brees, Rodgers in his prime). Mid-tier QBs are usually done by 34. Treat your QB's tier first, then apply the curve, not the reverse."

## Arbitrage and outlier patterns (the rule-buster layer)

This section is product IP. Average-case curves replicate the market and offer no arbitrage. Real edge comes from naming the conditions under which a specific player breaks the norm.

### RB age-cliff breakers

- The norm: 25.2 percent PPG decline at 28 to 29; 3.8 percent of peak seasons occur at age 30; mean peak age 25.46.
- Identifiable conditions:
  1. Above-average frame (220+ lb, contact balance allowing fewer hits absorbed per yard).
  2. Lower early-career mileage (late NFL entry, RBBC role for first 2-3 seasons, or college injury reducing pre-NFL touches).
  3. Pass-catching role share (target-share aging is shallower than carry-share aging per PFF target-value work).
  4. Scheme fit (zone-heavy schemes ask for less contact per yard).
  5. Public training/recovery commitment (anecdotal but consistent across documented breakers).
- Historical examples: Derrick Henry (frame, contact balance, paced workload pre-2020), Frank Gore (frame, college injury reducing pre-NFL miles), Ricky Williams (late re-entry to NFL after time away), peak-Adrian-Peterson (freak athletic profile, RAS outlier).
- Predictive signal cluster: weight (>= 220 lb), career touches at age 27 below cohort median, target share above 12 percent of team targets, RAS >= 8.5. The engine should mark a player as "cliff-resistant candidate" when 3 of 4 are present.

### Rookie WR year-1 breakouts

- The norm: Round-1 WRs hit top-12 in 34.6 percent of seasons; lower rounds materially worse. Most rookies do not produce top-24 lines.
- Identifiable conditions:
  1. Round 1 draft capital.
  2. Target vacuum (departing WR1 from prior season; injured incumbent WR1; no established WR2 ahead).
  3. QB tier (above-average starter or competent rookie with a system; Reception Perception research isolates target rate from QB quality but downstream production is still QB-mediated).
  4. College dominator rating >= 35 percent (PlayerProfiler; Frank DuPont).
  5. Breakout age <= 19 (PlayerProfiler).
  6. Above-average athletic profile (RAS >= 7.5; not 40-time alone).
- Historical examples: Jefferson 2020 (Diggs vacancy, college dominator), Chase 2021 (Burrow reunion, no clear WR1 ahead), AJ Brown 2019 (Tennessee target vacuum), OBJ 2014 (Cruz injured, route-running profile, Reception Perception 32.7 percent target-per-route highest in class).
- Predictive signal cluster: Round 1 + target vacuum + dominator >= 35 + breakout age <= 19. When 4 of 4 align, year-1 hit probability is materially above the 34.6 percent baseline (verbatim multipliers are an open backtest question; the engine should produce a posterior, not a fixed bonus).

### TE early breakouts vs the year-3 rule

- The norm: TEs traditionally need 3 years; 14 elite rookie TEs total over the past decade per DynastyNerds; mean peak age 26.78.
- Identifiable conditions:
  1. 100+ rookie targets (the elite-rookie threshold).
  2. 70+ percent offensive snap share.
  3. Pocket-passing QB (12 of 14 elite rookies played with a pocket QB; only Kincaid and Njoku played with mobile QBs; only 2 had rookie QBs throwing to them).
  4. Above-average athletic profile for the position (Bowers ran a 4.5x type 40 at his pro day with WR-tier athletic comparables; LaPorta played near-WR-style routes).
  5. Vacated TE role (LaPorta into the Hockenson hole; Andrews initially with the Hayden Hurst role).
  6. Year-1 OC stability rather than transition.
- Historical examples: Brock Bowers 2024 (rookie reception record 112, broke LaPorta's 86 just one year later); Sam LaPorta 2023 (89 targets, target vacuum from Hockenson trade); Mark Andrews 2018 trajectory (slower year 1, elite year 2 with role consolidation); George Kittle 2017 onward (athletic profile + Shanahan scheme).
- Predictive signal cluster: 100+ projected rookie targets + 70 percent snap share + pocket QB + vacated role. Bowers and LaPorta hit on all four; their predecessors who were early-breakout candidates without all four (e.g., O.J. Howard) did not.

### Aging WRs sustaining past 30

- The norm: WRs begin fading around 30; 30+ peak seasons drop sharply per Apex.
- Identifiable conditions:
  1. Slot/X-route-tree mastery vs pure-Z-deep (route-running grades preserve when speed declines; PFF grading isolates this).
  2. Stable QB pairing through the late-career window.
  3. Frame and durability (avoidance of soft-tissue lower-body injuries through late-20s).
  4. Modest target-share decline rather than a cliff (target share aging is slow per Sharp Football).
- Historical examples: Larry Fitzgerald (slot transition, Palmer era stability), Steve Smith (frame and contact-balance compensating for speed loss), peak-late Jerry Rice (route precision), late-career DeAndre Hopkins (contested-catch profile).
- Predictive signal cluster: slot route share >= 50 percent post-age-29 + stable QB + target share above 18 percent at age 29.

### Late-round QB hits

- The norm: Most late-round QBs do not start; among those who start, sub-replacement is the modal outcome.
- Identifiable conditions:
  1. QB-friendly system (Shanahan/McVay/Reid trees; play-action-heavy).
  2. Mobility floor (rushing as a fallback; Hurts especially).
  3. Strong final-year college passing efficiency (Cole/Unexpected Points work on adjusted college passing).
  4. Stable supporting cast year 1 (skill-position talent surrounding the rookie).
- Historical examples: Brock Purdy 2022 (Round 7, Shanahan system, mobility, supporting cast), Jalen Hurts 2020 (Round 2, mobility, eventual Sirianni system fit), Tom Brady 2000 (Round 6, the most-cited outlier; system fit with Belichick/Weis; conditions only fully visible in retrospect).
- Predictive signal cluster: Shanahan-tree system + mobility + above-class adjusted college passing efficiency. Hits are still rare; the engine should not over-weight this cluster, but it should be tracked.

## Discarded findings

### Combine drills as primary signal

- 40-yard dash time alone for WR career success: discarded as a primary input (r = 0.004; Stuart). Retained only as a component of RAS composite. Single-drill signals do not survive.
- 3-cone and shuttle for WR success: discarded as primary signals. Research found no regression-testing support for these alone. Retained only as RAS components.

### Traditional Strength of Schedule (prior-season records)

- Sharp Football's regression: 0.028 percent of variance explained. Discarded entirely as a signal in the engine. Replaced by projected-win-total SOS where used at all.

### Wins Produced (Berri/Schmidt) as an NFL evaluation primitive

- Stumbling on Wins QB Score (correlation 0.9997 with team wins per 100 plays in their sample): discarded as the engine primitive because the in-sample fit is suspiciously high; the methodology was originally designed for basketball and the football extension has not seen sustained peer-reviewed replication. Retained as a citation for QB-evaluation history (and for the Berri-Schmidt draft-correlation finding, which is more defensible).

### Single-season fantasy-points-per-target as a stability metric

- SumerSports and Sharp Football both find essentially no year-over-year correlation in fantasy points per target for non-starters. Discarded as a forward-looking signal. Retained only as a within-season descriptor.

### Generic "RBs always cliff at 28" as a hard rule

- Discarded as a hard rule. Retained as the prior in the cliff-breaker arbitrage section, with named exceptions and condition cluster.

## Open questions

These are honest gaps the corpus surfaced. Maintenance passes should target them.

1. Peer-reviewed pass-catching RB aging vs rushing RB aging: PFF target-value work supports the idea that pass-catching role is more durable, but a rigorous longitudinal study is missing.
2. NFL-specific contract-year phenomenon: cross-sport (NBA PER) evidence exists but a peer-reviewed NFL study has not surfaced.
3. Off-field-arrest impact on subsequent fantasy production: no quantitative study found. Currently internal-heuristic territory.
4. Suspension post-return performance curves (PED vs personal conduct vs substance abuse): no peer-reviewed work surfaced.
5. Gap vs zone scheme fit and RB aging: anecdotal pattern, no rigorous study.
6. OC scheme tenure and TE production: anecdotal pattern, no rigorous study.
7. Dynasty market efficiency formal study (where does KTC mis-price?): no peer-reviewed academic work surfaced. The product itself is positioned to generate this evidence via backtests against KTC and FantasyCalc historical values.
8. Concussion return-to-form curves: not surfaced in the v1 sweep; high-priority maintenance topic given the medical-research density of the area.
9. ACL recovery position-specificity beyond WR: Mody et al. 2022 covered overall NFL, Provencher covered WR; deeper RB-specific and TE-specific studies are needed.
10. Massey-Thaler 2013 successor work post-rookie-wage-scale era (2011 CBA changed the economics; the original paper's data predates this). Modern Over The Cap and PFF surplus-value updates should be cited explicitly in the next pass.

## Maintenance notes

- Last update: 2026-04-27 (SEED, v1).
- Planned next-pass topics: concussion recovery curves, OC tenure quantification, 2011-CBA-era surplus-value re-analysis, dynasty market efficiency formal study (commission internal backtest against KTC historical values), peer-reviewed contract-year NFL study search.
- Known stale entries: Football Outsiders methodology pages may move post-FTN acquisition; URLs verified 2026-04-27.
- Citation correction logged: founder spec referenced Massey & Thaler in JEP; actual venue is Management Science 59(7), 1479-1495, 2013. The Berkeley working-paper PDF (https://eml.berkeley.edu/~webfac/malmendier/e218_sp06/Thaler.pdf) is the freely-available pre-publication version.
- Citation watchlist: a 2024 arXiv revisit of the Loser's Curse (https://arxiv.org/abs/2411.10400) extends the analysis with utility-function variation. Should be read and incorporated in the next maintenance pass.
- INTERNAL HEURISTIC tags currently in use: rushing-share threshold for "rushing-dependent" QB, gap vs zone RB aging, OC scheme tenure for TE, off-field-risk fantasy-impact mapping. These must each be either backtested or retired before the conference talk.
