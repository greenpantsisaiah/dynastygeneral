# Dynasty General Research Corpus

Last updated: 2026-05-03 (v1 SEED + predictive-frameworks expansion)
Curator: dynasty-canon-keeper (subagent)
Total works consulted: 81 (38 v1 + 43 v2 predictive expansion)
Used in active model: 73
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

### "Draft against a positional run and you bank value on both sides" -> SPLIT VERDICT (one side mechanical, the other conditional on tier depth)

The claim (founder question 2026-05-23: "the room ran WR 2-3 times, I went elsewhere; am I now getting WR at better EV AND did I get my QB/RB/TE at better EV?") has two halves that resolve differently. Decompose before answering, and pin down the denominator: "better EV" can mean value-over-ADP (cost paid vs consensus) or final roster value (absolute talent banked). The run nearly guarantees the first on the off-run picks; the second on the run position is the contested half.

- **Half A (the OFF-run positions came cheaper while the run was on): SUPPORTED, near-mechanical, format-independent.** A run is a demand spike concentrated on one position. In a snake draft, every pick spent on the run is a pick NOT spent bidding against you at the other positions, so the best available QB/RB/TE slides below consensus cost to the manager who declines to chase. This is the textbook value-based-drafting response to a run: harvest the now-cheaper non-run positions; the tier drop-off, not raw position count, is the unit of decision.
  - Citations: Athlon Sports / Yahoo, "How to Handle Positional Runs in a Fantasy Football Draft" (https://athlonsports.com/fantasy/fantasy-football-draft-strategy-navigating-positional-runs; Yahoo mirror https://sports.yahoo.com/articles/handle-positional-runs-fantasy-football-174622343.html): "A positional run should influence but not control a draft... it may mean the better move is to take value at running back or wide receiver while the room overcorrects. A draft room can create openings when too many managers start focusing on the same position." Tier 4 (named industry strategy). FantasyPros VBD/VOR explainers (https://www.fantasypros.com/2025/06/fantasy-football-draft-strategy-value-based-drafting-vorp-vols-vona/); Fantasy Football Analytics VOR (https://fantasyfootballanalytics.net/2024/08/winning-fantasy-football-with-projections-value-over-replacement-and-value-based-drafting.html); Subvertadown VBD baselines (https://subvertadown.com/article/guide-to-understanding-the-different-baselines-in-value-based-drafting-vbd-vols-vs-vorp-vs-man-games-and-beer-). Tier 3 to 4.

- **Half B (the RUN position comes cheaper to you later): CONDITIONAL on the shape of that position's value curve below the run, and weaker in dynasty.** A run depletes the position. Late value materializes only if (1) the position is DEEP this cycle (a long flat tier, so survivors past the run are close in value to those that went in it) AND (2) the run filled the position-needy rosters, lowering future demand so survivors slide past ADP. If the position is TOP-HEAVY (a steep cliff after the elite), the run empties the startable tier and what remains is replacement-level: the manager bought below ADP on a low-ADP asset and is left with a real hole at a now-scarce spot. Buying cheap is not buying value.
  - Effect size: positional scarcity has flattened, especially at WR ("the pool flatter, deeper and more matchup-dependent than ever," FantasyPros / FTN "Why VBD is a Dinosaur," https://ftnfantasy.com/nfl/why-value-based-drafting-is-a-dinosaur-in-2025-fantasy-football), which AMPLIFIES the wait-on-WR case (low cost of waiting) without implying elite WRs fall late. Redraft dead-zone data: RBs at ADP RB25-46 finish top-12 10.0% of seasons vs WR41-61 at 4.3%, and top-24 27.3% vs 17.1% (RotoViz / FantasyPros Zero RB). So late-round LEAGUE-WINNERS skew RB (volatility plus injury churn); the wait-on-WR edge runs through DEPTH (small drop-off, many startable bodies), not late ceiling. A WR dead zone is also documented after roughly pick 96. Net: the WR-wait works because waiting costs little, not because round-10 WRs hit like round-10 RBs. VALIDATED on real dynasty market data: see "VALIDATED: positional-run tier depth" below. WR is the single most ignorable position for a run (deepest pool, flattest mid-curve); QB in SF is the cliffiest.
  - Citations: RotoViz Zero RB body (Siegele, https://www.rotoviz.com/author/ssiegele/; 2025 blueprint https://www.rotoviz.com/2025/05/the-zero-rb-draft-strategy-blueprint-for-2025-rotoviz-overtime/); FantasyPros Zero RB (https://www.fantasypros.com/2024/02/zero-rb-best-ball-strategy-2024-fantasy-football/): Zero RB advance rate roughly 23% vs 16.6% baseline (2021-2022), strategy "exploits WR depth by loading early on difference-making wide receivers... before pivoting to running back in round seven and beyond." Tier 3 to 4 (named industry, best-ball cohort data, single-season redraft).

- **The deciding variable is tier depth, not the run.** Boris Chen's tiers (Gaussian-mixture clustering on consensus ranks, http://www.borischen.co/) make the test visible: a run matters when it threatens to EMPTY a tier (act before the cliff); it is noise when a deep tier of similar players remains (let it pass, take value elsewhere). Half B holds exactly when the run did NOT cross a tier cliff on the run position.

- **Behavioral grounding (why a post-run discount exists at all).** Runs are partly herding plus recency overreaction. De Bondt and Thaler 1985, "Does the Stock Market Overreact?", Journal of Finance 40(3): 793-805 (https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.1985.tb05004.x). Tier 1, peer-reviewed. The foundational overreaction-then-mean-reversion result: extreme movers reverse over the following window, asymmetrically larger for the "losers." Draft analog: the run position is mildly OVERpaid during the run (declining to chase avoids the overpay) and its survivors can over-discount afterward. But overreaction is partial; talent depletion is real, so a late survivor is not "the same player minus a discount."

- **Dynasty caveat (the asker's format).** The strongest Half-B empirics are single-season redraft / best-ball, where waiver churn and within-season injury rates do the work. In dynasty the EV horizon is multi-year (KTC / FantasyCalc value held for seasons), so the talent-depletion cost of waiting is higher and the discount must be larger to clear. Same format-dependence already logged under "Don't draft RBs early in dynasty (Zero RB)" -> FORMAT_DEPENDENT. The mechanism survives the format change; the magnitude shrinks.

- **Product wiring (do NOT add a parallel "run" signal).** A run is already encoded in existing canonicals; it is an observation, not a new input. (1) `survivalPctFor` / `analyzeOpponentsInGap` (decision-synthesis/synthesize.ts) read per-position demand in the gap before the user's next pick; a run is a spike in that demand. (2) `buildLeaguePositionContext` (`teams_light`, `over_rostered`) drops at the run position after the run fills the needy rosters, which is the mechanical source of the post-run discount and should drive any "you can wait on WR now" copy. (3) `buildPositionDepth` / startable-tier (roster-fit.ts) is the tier-cliff test for Half B: late WR value is real only when survivors are still in the leaguewide startable tier. (4) the EV bank measures whether value-over-replacement was actually banked. Guidance: detect a run as elevated recent same-position pick density, never recommend chasing it, surface the off-run faller (Half A), and promise late run-position value (Half B) ONLY when startable depth remains below the run, discounted further for the dynasty horizon.

- Coach response language: "Two different questions. The QBs, RBs, and TEs you took while the room ran WR: yes, those almost certainly came in under cost, because every pick they spent on WR was a pick not spent bidding against you elsewhere. The WRs you get later: better value only if WR is deep this year. If the runs emptied the startable WR tier, you bought cheap WRs, not valuable ones, and you have a hole at a now-scarce spot. Check the drop-off. If a flat tier of similar WRs is still on the board, waiting cost you little and the WR-needy teams are now full, so survivors slide to you. If there is a cliff, the run was the signal to have acted. In dynasty the wait is riskier than the redraft slogans imply, because you hold these assets for years."

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
11. Continuous arbitrage vs fill-then-trade in dynasty startup drafts: which strategy ends with a higher-value roster? No observational answer is possible (counterfactual). Experiment spec below. Surfaced by the 2026-05-20 binary-guardrail retirement; the cautious "hold equity" thresholds (`unrecoverable_severity`, `EARLY_ROUND_THRESHOLD`) need this before they ship as hard rules rather than format-consensus heuristics.
12. Draft-flow value displacement (positional runs): in real 12-team drafts (KTC / FantasyCalc snapshots), quantify two effects. (a) Half A: does a manager who declines a same-position run bank measurably higher value-over-ADP on the off-run picks taken during the run window? Expected yes; magnitude is the open number. (b) Half B: do that manager's later picks at the run position come at higher value-over-ADP, and is the effect conditioned on the position's tier depth below the run (deep/flat tier = positive, top-heavy/cliff = negative)? Expected: positive only when startable depth remained. This is observable from pick logs plus a value curve (unlike open question 11, which is counterfactual), so it is a backtest, not a simulation. Connects the new "draft against a positional run" common-knowledge entry to real data and to the `survivalPctFor` / `buildLeaguePositionContext` / `buildPositionDepth` canonicals named there.

## Validated findings + experiment specs (2026-05-21)

### VALIDATED: pick-value convexity (the premise behind the guardrail retirement)

The 2026-05-20 retirement of the binary starter-gap guardrail rests on one empirical claim: dynasty pick value decays steeply by round (convex), so late-round picks carry near-zero arbitrage equity and a guardrail that treats every pick as equal "equity to protect" is wrong. This is the Massey-Thaler 2013 / Stuart (Football Perspective) finding; `scripts/validate-pick-value-convexity.ts` reproduces it on real KTC market data (`historical_market_values`, latest snapshot 2024-12-09, top 240 by rank, 12-team round mapping).

Result:
- **SF**: mean round-over-round value drop in rounds 1-6 is 845, in rounds 6+ is 200. Early drop is 4.2x the late drop (CONVEX). 65% of above-replacement surplus value sits in rounds 1-6.
- **1QB**: early drop 680 vs late drop 233, 2.9x (CONVEX). 61% of surplus in rounds 1-6.

Conclusion: the convex curve is confirmed on real dynasty data, independent of the cited papers. `EARLY_ROUND_THRESHOLD = 6` is grounded: the majority of pick equity is concentrated in rounds 1-6, so gating the cautious "hold equity" read on round <= 6 is defensible. Caveat: the snapshot is from 2024-12-09 (latest in the DB); convexity is a structural property and stable across snapshots, but the next KTC ingest should re-run this to confirm the curve has not shifted. Re-run command is in the script header.

### VALIDATED: positional-run tier depth (the deciding variable for "draft against a run")

The "draft against a positional run" common-knowledge entry above hinges on Half B: the run position comes cheaper to you later ONLY if its value curve below the run is deep/flat (waiting is cheap) rather than a steep cliff after the elite. That is the per-position COST OF WAITING THROUGH A RUN, and it is a property of the real market value curve, measurable now. `scripts/validate-positional-run-tier-depth.ts` reproduces it on real KTC data (`historical_market_values`, source ktc, latest snapshot 2024-12-09, top 240 overall, 12-team round mapping), non-circular (market data, NOT the engine's own scoring).

Metric: value RETAINED (%) if you let a run of k at a position pass and take the next available one, averaged across the draftable pool (skipping the elite top you would not be waiting on). Higher retained = flatter = the run is more ignorable = Half B holds.

Result (run of 4, mean across pool; SF / 1QB):
- **WR: 93% / 94% retained.** Deepest pool (88-91 draftable in the top 240). MOST ignorable: a 4-deep WR run costs ~6-7% of value. Even a run of 8 retains ~88%.
- **RB: 92% / 92%.** Also deep (57-59 in pool). A mid-curve RB run is ignorable.
- **TE: 88% / 86%.** Shallow pool (~30). Moderate: a run of 8 drops retention to 75-77%; weigh the tier cliff.
- **QB: 82% / 84%.** Shallowest (~30, fewer in SF). Cliffiest at the top: SF run of 8 retains only 66%. In SF the elite QB tier is a real cliff.

Structural note that survives both formats: the steep part of EVERY position's curve is the ELITE tier (e.g., the SF WR1-per-team line already sits ~41% below the positional top value), then the curve flattens into depth. So the rule the data supports is two-sided: do NOT miss the elite tier on a run (steep, a real warning), but a run through the MIDDLE of WR or RB is genuinely ignorable (~6-8% of value). This matches the founder's lived case (declining 2-3 WR runs in a 12-team league and getting WR value later): defensible because WR is the deepest, flattest position, so the cost of waiting was low.

Limitation (honest): this measures the DECIDING VARIABLE (cost of waiting by position), not the realized draft-day edge. It does not prove a manager who declined a run banked higher value-over-ADP; that is open question 12 and needs completed-draft pick logs (pick_no, position, roster) the schema does not store. Half A (off-run positions cheaper during the run) is near-mechanical and is not quantified here. Re-run command is in the script header; re-run after the next KTC ingest to confirm the curve has not shifted.

### EXPERIMENT SPEC: continuous arbitrage vs fill-then-trade

Status: NOT YET RUN. Documented so a future pass executes it rather than guessing.

**Hypothesis (H1)**: a manager who deploys pick equity continuously (takes +EV surplus-to-need swaps and market-gap trades inside the ±15% fairness band at any point in the draft) ends with a higher-value roster than a manager who refuses to trade picks until every starter slot is filled. **H0**: no outcome difference, or fill-then-trade wins.

**Why this cannot be answered observationally.** Historical league data shows only what each manager actually did; there is no counterfactual "what would the same manager's roster be worth had they used the other policy." Trade logs alone cannot separate strategy effect from manager-skill and league-luck confounds. This is why the question is an open problem, not a SQL query. Anyone who claims an observational answer is fooling themselves; Massey/Winston would catch it immediately.

**Required design: counterfactual simulation, not a backtest of real drafts.**
- **Value model**: the empirical value-by-overall_rank curve validated above (real KTC snapshots), NOT the engine's own `startupPickValue` (using the engine to validate the engine is circular).
- **Draft model**: N-team snake (sweep N in {10, 12}), R rounds (sweep R in {15, 20}), Monte Carlo over the user's draft slot (1..N) with >= 2000 runs per cell for tight CIs.
- **Two policies under test**: FILL_FIRST (no pick trades until starters filled, then BPA) vs ARBITRAGE (accept any +EV surplus-to-need or market-gap trade inside ±15% at any time).
- **Opponent model is the hard part and the main confounder.** Trade availability is endogenous: arbitrage only wins if soft counterparties exist to trade with. The opponent mix (share of overpaying vs sharp managers) must be a swept parameter, and the result reported as a function of it. A sim that hard-codes abundant +EV trades will trivially conclude arbitrage wins; that is the circular trap to avoid. The honest output is a curve: "arbitrage edge in roster value as a function of the fraction of soft opponents," with the break-even fraction named.
- **Metric**: final roster value = sum of starter-slot values (format-correct) + discounted bench depth, averaged across runs, reported with CIs. Secondary: multi-season value trajectory using historical KTC curves to capture dynasty (not just startup) outcomes.
- **Falsification**: if ARBITRAGE does not beat FILL_FIRST across a realistic range of soft-opponent fractions (say 20-50%), H1 is rejected and the product's EV-arbitrage thesis (REDESIGN_INTENTIONS Principle 8) needs revisiting.

**Data needed that we do NOT yet have**: a calibrated opponent trade-acceptance model (acceptance probability and overpay magnitude conditioned on counterparty type). This is the same missing dataset that blocks calibrating the `opponent.ts` panic-label leverage scores and `pick-quality.ts` sophistication cutoffs. One data-collection effort (logging real trade offers, acceptances, and counterparty profiles in-product) unblocks all three.

## Maintenance notes

- Last update: 2026-05-23 (added "draft against a positional run" common-knowledge entry + open question 12 + VALIDATED positional-run tier depth via `scripts/validate-positional-run-tier-depth.ts` on real KTC data). Prior: 2026-05-21 (validated findings + experiment specs). SEED v1: 2026-04-27.
- Planned next-pass topics: concussion recovery curves, OC tenure quantification, 2011-CBA-era surplus-value re-analysis, dynasty market efficiency formal study (commission internal backtest against KTC historical values), peer-reviewed contract-year NFL study search.
- Known stale entries: Football Outsiders methodology pages may move post-FTN acquisition; URLs verified 2026-04-27.
- Citation correction logged: founder spec referenced Massey & Thaler in JEP; actual venue is Management Science 59(7), 1479-1495, 2013. The Berkeley working-paper PDF (https://eml.berkeley.edu/~webfac/malmendier/e218_sp06/Thaler.pdf) is the freely-available pre-publication version.
- Citation watchlist: a 2024 arXiv revisit of the Loser's Curse (https://arxiv.org/abs/2411.10400) extends the analysis with utility-function variation. Should be read and incorporated in the next maintenance pass.
- INTERNAL HEURISTIC tags currently in use: rushing-share threshold for "rushing-dependent" QB, gap vs zone RB aging, OC scheme tenure for TE, off-field-risk fantasy-impact mapping. These must each be either backtested or retired before the conference talk.
- v2 expansion (2026-05-03): predictive-frameworks-for-offseason-transitions section appended below per founder direction. The engine has to be in the prediction business; v1 was heavy on backward-looking signals. Heavy reliance on Tier 3-4 sources is honest because peer-reviewed offseason-transition work is rare; 13 specific gaps logged in that section's open questions.

## Predictive frameworks for offseason transitions

This section was added 2026-05-03 in response to the founder's directive (verbatim): the engine has to be in the prediction business, and predictions must process offseason transitions (offensive line shifts, coaching changes, RB role changes, post-trade landings) using research, not independent reasoning. Every claim below is sourced or honestly tagged as a gap. Inclusion criteria match the v1 corpus: peer-reviewed work first, named industry frameworks second, longitudinal cohort studies third, beat reporters fourth (FACT only), internal heuristics fifth (explicitly tagged).

A standing limitation: most published offseason-transition work is industry-tier rather than peer-reviewed. The corpus treats this honestly. Where peer-reviewed evidence is missing, the entry says so and the engine should weight the signal accordingly.

### Cluster 1: Offensive line transitions

#### OL continuity score and predictive validity

- Football Outsiders, "2018 Offensive Line Continuity Scores" and methodology: https://www.footballoutsiders.com/stat-analysis/2019/2018-offensive-line-continuity-scores. Continuity Score combines three variables (number of starters used, number of week-to-week starting-lineup changes, longest starting streak of any single five-man unit). The correlation between continuity score and offensive DVOA was 0.440; passing-offense DVOA 0.378, rushing-offense DVOA 0.362. Tier 2 (named industry framework, public methodology). USE: continuity score as a stability prior on next-season RB and QB outcomes. Limitation: correlation is contemporaneous (continuity in season N correlates with DVOA in season N), not strictly leading; the engine should not claim "continuity in 2025 predicts 2026 RB1 production at r = 0.44," only that low-continuity rosters carry materially higher variance.
- Football Outsiders Adjusted Line Yards methodology: https://www.footballoutsiders.com/info/methods. ALY isolates OL contribution from RB contribution (OL is 100 percent responsible for losses, 20 percent more responsible than average for first 4 yards gained, 50 percent less responsible 5 to 10 yards, zero past 10). Tier 2. USE: ALY as the load-bearing OL-quality signal for projecting next-season RB yardage, paired with continuity score for variance estimation. Already cited in v1 corpus under cross-position OL impact; reused here in transition context.
- 4for4, "How Offensive Line Play Impacts Fantasy Football": https://www.4for4.com/2025/preseason/how-offensive-line-play-impacts-fantasy-football. Documents that direct correlation between OL grade alone and individual RB fantasy production is modest (correlation coefficient roughly 0.25 at the player level, weaker still at 100-attempt thresholds). Tier 3-4. USE: as a cautionary anchor. The signal is real at the team level (ALY, continuity) and substantially weaker at the individual-RB-projection level. The engine must not over-claim.
- PFF, "Fantasy Football: Offensive line rankings for 2024": https://www.pff.com/news/fantasy-football-offensive-line-rankings-for-2024. Documents that team rushing grade correlates 0.77 with yards per attempt and team run-blocking grade correlates 0.50 with yards per attempt. Tier 2. USE: PFF run-blocking grade as the input for the individual-RB OL-context modifier; pair with ALY at the team level.
- Pro Football Network and PFF, "Examining success factors for young offensive linemen from college to the NFL": https://www.pff.com/news/nfl-examining-success-factors-young-offensive-linemen-college-nfl. Tier 2. USE: methodological reference for the rookie-OL development curve in the next sub-section.

Verdict mapping: continuity score and ALY map to a "team-level OL stability" snapshot field. Player-level RB projection should treat OL upgrade or downgrade as a variance modifier (wider distribution when continuity is low) rather than as a point-estimate adjustment.

#### OL grade upgrade or downgrade effect on next-season RB1 production

- 4for4 (above): the year-over-year link between OL grade change and individual RB production change is weak in isolation. Tier 3-4. DISCARD as a primary signal. USE only as a corroborating context modifier.
- Sharp Football and Fantasy Points 2025 OL rankings preseason packages (https://www.fantasypoints.com/nfl/articles/2025/nfl-offensive-line-rankings): industry rankings adjust for personnel changes and continuity but do not publish a clean year-over-year regression of "OL grade Δ predicts RB1 Δ." Tier 3. CITATION_UNVERIFIED for a quantified delta-on-delta study.
- Open question: a peer-reviewed or industry-quantified longitudinal study of "RB1 production change as a function of OL grade change," controlled for QB, scheme, and committee status. The corpus does not surface one. Logged in maintenance as a high-priority gap.

Common-knowledge debunk for this sub-cluster: "An OL upgrade automatically lifts the RB1 to a top-12 finish." TRUE_BUT_OVERWEIGHTED. Effect size at the individual level is small (correlation roughly 0.25; 4for4) once team-level rushing efficiency is controlled for. The engine should not promote an RB into a higher tier on OL upgrade alone; it should widen the variance band.

Arbitrage / outlier pattern: when an above-average frame RB joins a top-tier OL with high continuity (5-man unit returning), the lower-tail risk shrinks measurably. Henry-frame RBs going behind continuous OLs (Tennessee 2019-2020 returning OL) are the canonical historical breaker. Conditions: continuity score top-quartile, returning RB with frame >= 220 lb, gap or zone scheme stable from prior year.

#### Rookie OL development curve

- PFF, "Examining success factors for young offensive linemen from college to the NFL": https://www.pff.com/news/nfl-examining-success-factors-young-offensive-linemen-college-nfl. Year 1 to Year 2 PFF offensive grade correlation across all rookie OL is 0.56. Position-broken: tackles 0.67 correlation (most stable), centers 0.38 (least stable). On average, year-2 grades exceed year-1 grades for guards, centers, and interior linemen, but not for tackles, who tend to maintain rather than improve. Tier 2. USE: rookie-OL projection prior. The engine should treat rookie tackles as nearer-to-final-grade in year 1 (so the weight on RB downstream of a rookie tackle should not assume year-2 leap), while interior rookies (guards, centers) should carry a year-2 improvement prior.
- PFF, "NFL Offensive Line Success: Why building through the NFL draft is the key": https://www.pff.com/news/nfl-offensive-line-success-why-building-through-the-nfl-draft-is-the-key. Trajectory steeper for early-round OL prospects than late-round. Tier 2. USE: scale the rookie-OL development prior by draft round.
- Open question: rookie OL grade by 12 weeks vs full-season grade as an early-warning signal for year-2 leap. The corpus does not surface a clean study. Logged.

Verdict mapping: rookie OL position (tackle vs interior) and draft round become snapshot fields the engine can use to widen or narrow the next-year RB-context band. Specifically, an RB behind a rookie interior OL carries a year-2 upside prior; an RB behind a rookie tackle carries flat expectation.

#### OC change effect on OL grade (scheme vs personnel)

- Football Outsiders Continuity Score (above): variable is lineup stability, not scheme. The 0.440 contemporaneous correlation captures personnel-driven stability; scheme stability is separate and less directly studied.
- Sharp Football, "Only 3 NFL Offensive Coordinators Have Been With Team Longer Than One Year" (entering 2019): https://www.sharpfootballanalysis.com/analysis/only-3-nfl-offensive-coordinators-have-been-with-team-longer-than-one-year/. League-wide OC churn is high; only Pete Carmichael Jr. (Saints, 10 years), Josh McDaniels (Patriots, 7), and Ken Whisenhunt (Chargers, 3) had more than 2 years tenure entering 2019. Tier 3. USE: OC tenure as a context modifier. New-OC year carries materially higher variance regardless of personnel continuity.
- CBS Sports, "Full list of 2026 NFL coordinator grades: Evaluating every OC and DC hire this offseason": https://www.cbssports.com/nfl/news/nfl-coaching-grades-2026-offensive-defensive-coordinator-hires/. 21 of 32 NFL clubs hired new OCs for 2026; 17 new offensive play-callers. Tier 4. USE: as the contemporaneous prior on league-wide OC volatility.
- CITATION_UNVERIFIED for a quantified study of "OL grade change under same OC vs new OC, holding personnel constant." Open question, logged.

Verdict: scheme persistence (same OC vs new OC) belongs in the snapshot as a binary plus tenure-years field. The engine should treat any team with both new OC and rookie OL personnel as the highest-variance band for next-season RB and QB projection.

### Cluster 2: Coaching change effects

#### First-year HC volatility and offensive identity in year 1

- Pro Football History, "Breaking Down the Success of First-Time NFL Head Coaches": https://pro-football-history.com/blog/10/121/breaking-down-the-success-of-firsttime-nfl-head-coaches. First-time HCs post a 41.7 percent playoff likelihood and a 0.447 winning percentage in year 1; rookie HCs improve team win totals by an average of 2.0, with 26 of 40 leading teams to better records. Win rates progress from 31.39 percent year 1 to 50.86 percent year 3 across the cohort that survives. Tier 4 (industry blog with cohort numbers; methodology is partially documented but not peer-reviewed). USE: first-year HC carries below-replacement win-rate prior with high cohort-level variance.
- Bleacher Report, "Ranking New NFL Head Coaches Based on Possibility of Success in Year 1": https://bleacherreport.com/articles/25211807-ranking-new-nfl-head-coaches-based-possibility-success-year-1. Documents the compounding-risk pattern: first-time HC + first-time GM + first-year coordinators is the maximum-variance combination. Tier 5 (analyst piece, not a study). USE: as the qualitative anchor for a "staff-novelty composite" snapshot field, not as a quantified weight.
- Open question: a quantified study of "year-1 offensive scheme identity persistence vs prior season under new HC." The corpus does not surface a peer-reviewed source.

#### Year-over-year scheme persistence under same OC vs new OC

- Sharp Football OC tenure work (above): OC-level scheme persistence is fragile because OC tenure is short. Tier 3.
- Fantasy Points, "2025 Fantasy Football Impact: New Coaches": https://www.fantasypoints.com/nfl/articles/2025/fantasy-football-impact-new-coaches. Documents that scheme tweaks happen even when teams retain coordinators; the concept of "minor adjustments" vs "scheme overhaul" is industry-recognized but not formally quantified. Tier 3.
- numberFire, "Fantasy Football: How Much Do Coaches Impact Wide Receiver Usage?": https://www.numberfire.com/nfl/news/19379/fantasy-football-how-much-do-coaches-impact-wide-receiver-usage/david-mccaffery. Team construct appears more valuable than coach when predicting volume and fantasy production. When a receiver changed both teams and coaches simultaneously, about half of the volume signal was lost. Tier 3. USE: coaching change matters less than team context for individual-WR volume; weight team context above coach in the projection blend.

#### Specific scheme tags and their position impact

- The Ringer, "How the Shanahan System Turns Afterthoughts Into Star Running Backs": https://www.theringer.com/2020/01/22/nfl/kyle-mike-shanahan-zone-blocking-raheem-mostert-running-backs. Mike Shanahan's outside-zone scheme produced six 1,000-yard rushers in Denver behind the Alex Gibbs OL system; the modern Shanahan tree (Kyle Shanahan, Sean McVay, Matt LaFleur, Mike McDaniel) inherits the same mechanism. Tier 4. USE: Shanahan-tree tag carries a "RB ceiling-elevation under outside zone" prior, with the well-documented caveat that the system can elevate undrafted or late-round RBs (Mostert, Wilson) at the expense of locking in any single bellcow.
- SumerSports, "Shanahan Schemes": https://sumersports.com/the-zone/shanahan-schemes/. Tier 3. USE: corroborating coverage of the Shanahan-tree mechanism.
- Yahoo Sports, "25 in 2025: How the famed Shanahan tree has evolved as NFL defenses adjusted to it": https://sports.yahoo.com/nfl/article/25-in-2025-how-the-famed-shanahan-tree-has-evolved-as-nfl-defenses-adjusted-to-it-195740737.html. Tier 4. USE: scheme-evolution prior, the Shanahan-tree advantage erodes as defenses adapt.
- Joseph Ferraiola, "Sean McVay Offensive Scheme Study": https://josephferraiola.substack.com/p/sean-mcvay-offensive-scheme-study. McVay uses outside zone on 39.8 percent of run plays (1st in NFL since 2017) and condenses WR splits in 11 personnel; bigger slot WRs (Kupp-frame) function as quasi-TEs. Tier 4. USE: McVay-tag carries a "slot-bigs sustain target share" prior; pure-Z deep WRs are de-emphasized.
- Wikipedia, "Air raid offense": https://en.wikipedia.org/wiki/Air_raid_offense. 4-WR shotgun base; RB role is reduced. Tier 5. USE: as the qualitative scheme tag; air-raid-tagged offenses depress RB ceilings and elevate WR3+ target shares.

Note on Reid tree: the v1 corpus documents Reid-tree QBs (Mahomes, Hurts via Sirianni-adjacent). For the transition layer, the load-bearing Reid-tree fact is high TE target rate within stable 11-personnel base; the search did not surface a clean Reid-tree-RB-impact study. CITATION_UNVERIFIED for a Reid-tree-specific RB or WR fantasy-impact paper. Logged.

#### OC inheritance pattern (do players follow when an OC changes teams?)

- Fantasy Life, "NFL Offensive Coordinator Rankings": https://www.fantasylife.com/articles/fantasy/nfl-offensive-coordinator-rankings-for-2025. Documents that scheme-fit translates: backs in the Monken system (Cleveland, then NYG) sustain featured-back production; the same OC's TE usage benefited Cameron Brate in Tampa Bay. Tier 4. USE: OC scheme-fit carries an inheritance prior, but the engine should not over-claim; the inheritance signal is qualitative without quantified hit rate.
- Fantasy Points 2025 new-coaches piece (above): McDaniel-system RBs (De'Von Achane back-to-back RB5) imply system-mediated upside transfers when a key OC moves. Tier 3.
- Open question: a quantified study of "fantasy production change for a player when his OC moves to a new team without him" vs "fantasy production change when the OC stays and the player moves to a new team with the same OC." The corpus does not surface a clean version. Logged.

#### Personnel group preferences (12-personnel rate stability under same OC)

- Sharp Football, "NFL Offensive Personnel Usage, All 32 Teams": https://www.sharpfootballanalysis.com/stats-nfl/nfl-offensive-personnel/. Tier 3. USE: the league-wide year-by-year 12-personnel rate is the baseline against which team-level deviations are interpreted.
- Underdog Network, "How TE Usage in 11- and 12-Personnel Impacts Fantasy Football" (cited in v1 corpus under TE 12-personnel): 12-personnel rate hit 22.1 percent in 2023, the highest of the 2000s. Tier 3.
- NFL.com, "New trend alert for NFL offenses": https://www.nfl.com/news/new-trend-alert-for-nfl-offenses-ranking-top-five-pass-catching-groups. Documents that personnel-grouping decisions are OC-mediated; Klint Kubiak in New Orleans called 12-personnel at the 8th-highest rate, and Seattle is expected to lift their 12-personnel rate under his hire. Tier 4. USE: 12-personnel rate is OC-sticky (a Kubiak-type OC carries the tendency across teams) but team-discontinuous (team rate changes when OC changes).
- SumerSports, "A Look Into Offensive Personnel Diversity": https://sumersports.com/the-zone/a-look-into-offensive-personnel-diversity/. Tier 3. USE: corroborates the OC-driven nature of personnel rate shifts.

Common-knowledge debunk for this cluster: "A new HC means the WR1 collapses." TRUE_BUT_OVERWEIGHTED. Effect size from numberFire is roughly 0.72 fewer PPR points per game with a new HC at p = 0.096 (statistically marginal); Sticky Stats / SumerSports work shows team context dominates. Coach response language: "A new HC affects WR volume by less than a point per game on average. The bigger swings come from QB change and from changing teams entirely; a new HC alone is not a sell trigger."

Arbitrage / outlier: when an OC with a documented scheme-tag moves to a team whose roster matches the scheme (e.g., a Shanahan-tree OC inheriting an outside-zone-fit OL plus zone-decisive RB), the inherited-system bonus is real but conditional. The engine should flag scheme-fit matches as upside-tilt rather than hardcode an upgrade.

### Cluster 3: RB role transitions (bellcow vs committee)

#### Bellcow definitional thresholds

- Fantasy Points, "The Bell-Cow Report": https://www.fantasypoints.com/nfl/articles/2020/the-bell-cow-report. Establishes the framework: bellcow RBs rank highly in snaps, carries, targets, AND in percentage of team running back snaps, carries, and targets. Tier 3. USE: bellcow as a multi-axis classification, not a single-stat threshold.
- Fantasy Points, "Bell-Cow or Bust: The Optimal RB Strategy": https://www.fantasypoints.com/nfl/articles/season/2020/bell-cow-or-bust-the-optimal-rb-strategy. Hard threshold: 75 percent snap share in a season. Roughly 4.2 RBs per season meet this bar. Tier 3. USE: 75 percent snap share as the strict-bellcow definition.
- PhillyVoice, "Fantasy football: Which NFL teams have bell cow running backs": https://www.phillyvoice.com/fantasy-football-running-back-committees-bell-cow-starters-snap-percentage-touches-advice-tips-draft/. Some analysts use a 60 percent market-share threshold for a softer bellcow definition. Tier 4. USE: 60 percent snap share as a "lead-back" tier, distinct from strict bellcow.
- Footballguys, "The Running Back By Committee Conundrum": https://www.footballguys.com/article/2025-running-back-by-committee-conundrum. Since 2021, 19 backs have handled at least 67 percent of their team's snaps per game across at least 15 games, equating to roughly 4.8 backs each year meeting that threshold. Tier 3. USE: 67 percent snap share over 15+ games as the dynasty-relevant bellcow operational threshold (because it accounts for sustained workload, not single-game spikes).
- Fantasy Points, "Statistically Significant: Weighted Opp.": https://www.fantasypoints.com/nfl/articles/2024/statistically-significant-weighted-opportunity. Weighted opportunity (carries × 0.58 + targets × 1.59) correlates 0.95 with PPR fantasy points. Tier 3. USE: weighted opportunity is the per-week bellcow detector.

The engine should track three tiers: lead back (>= 60 percent snap share), bellcow (>= 67 percent snap share over 15+ games), strict bellcow (>= 75 percent season snap share). Trades and free-agency signings should be evaluated against the projected tier at the new team, not a binary bellcow flag.

#### Year-over-year bellcow retention

- Footballguys, "The Running Back By Committee Conundrum" (above): bellcow seasons declined from 42 (2013-2017) to 35 (2018-2022). The trend is toward fewer bellcows league-wide. Tier 3. USE: as the population-level prior; the probability that a current bellcow remains bellcow next season is below the prior generation's rate.
- Alex Bishka, "Rushing Stability": https://alex-bishka.github.io/Fantasy/Blogs/sticky-stats/rushing-sticky-season-totals. There is no single rushing stat that is reliable year-over-year AND a decent predictor for fantasy production. Tier 4 (independent analyst). USE: as the cautionary anchor; the engine should not project year N+1 bellcow status from year N rushing efficiency alone. Snap share and target share are stickier than rushing-yards or YPC.
- PFF, "Do NFL running backs regress? Facts and fiction": https://www.pff.com/news/nfl-breaking-down-fact-and-fiction-about-how-and-when-nfl-running-backs-begin-to-regress-2021. There is no correlation between an RB's workload one year and the change in his RYOE from career average the next year. The huge workload is not affecting RYOE. Tier 2. USE: the engine should NOT mechanically downgrade a bellcow purely for high prior-year workload; instead, downgrade for age + frame + scheme-fit changes.
- Open question: a quantified retention rate (the probability that a year-N bellcow remains a year-N+1 bellcow), conditional on age, contract, and team-context change. The corpus does not surface a clean number. CITATION_UNVERIFIED for that specific quantification. Logged.

#### Committee resolution patterns

- Fantasy Life, "NFL Offensive Coordinator Rankings" (above): featured backs in Monken's system have historically emerged; Achane's RB5 finishes under McDaniel signaled a committee-to-featured resolution. Tier 4. USE: scheme-fit is a leading indicator of committee resolution.
- Footballguys committee piece (above): committees usually exist by default (no dominant back), not by design. The trigger for committee-to-bellcow resolution is talent emergence, injury to the other committee member, or a coach's preference declaration. Tier 3. USE: the engine should track the committee's "hierarchy stability" each offseason; signals like contract restructure, draft capital expended on a successor, and beat-reporter quotes accumulate into a posterior on resolution.
- DraftKings, "Next Man Up: Sorting Out The Packers' Backfield": https://www.draftkings.com/playbook/nfl/next-man-sorting-packers-backfield. Tier 5 (DFS column). USE: as the qualitative pattern reference; numerical claims must come from elsewhere.

#### Post-trade RB outcomes

- Stats with Sasa, "The fantasy impact of NFL trades": https://www.statswithsasa.com/2024/10/17/the-fantasy-impact-of-nfl-trades/. Over 64 percent of traded RBs improve after the trade; the median traded RB scores 6.8 percent more fantasy points after the trade. Tier 4 (independent analyst, methodology partially documented). USE: post-trade RB outcomes skew positive at the median; the engine should NOT default to a "traded RBs disappoint year 1" prior. Notable named cases: Christian McCaffrey (CAR to SF), Kenyan Drake (MIA to ARI). The piece also notes Amari Cooper's 60 percent fantasy production lift post-trade (WR-cited but in the same study).
- CITATION_UNVERIFIED for a peer-reviewed treatment of post-trade RB year-1 hit rate at the new team. The Sasa piece is the cleanest available; corpus should mark this finding as Tier 4 confidence and seek a stronger replication in maintenance.
- Open question: whether the +6.8 percent median lift holds when traded RBs are subset to "moved in offseason" vs "moved mid-season." The Sasa piece is mid-season-trade-heavy. Logged.

#### Pass-down RB stickiness vs early-down stickiness

- PFF, "Metrics that Matter: The value of a carry, the value of a target" (cited in v1 corpus): targets are worth roughly 2.74x carries in PPR. Tier 2. USE: re-cited here for the durability claim. A pass-down RB role is more durable across coaching changes because the receiving function ports better across schemes than gap-vs-zone RB-running fit.
- v1 corpus already flags "PFF target-value research implies pass-catching role is more durable than rushing role." Reaffirmed here. Tier 2. USE: under coaching transition, the engine should weight an RB's prior-year target-share above his prior-year carry-share when projecting next-year role.
- Open question: a quantified study of "target-share retention vs carry-share retention across coaching changes." Logged. CITATION_UNVERIFIED for that specific quantification.

#### Next man up vs committee resolution after a starter departs

- Bleacher Report, "Making Sense of Every NFL Backfield After 2026 NFL Draft": https://bleacherreport.com/articles/25422876-making-sense-every-nfl-backfield-after-2026-nfl-draft. Tier 5 (column with examples, not a study). USE: as the qualitative reference for the named-case patterns.
- NFL.com Vikings RB transition: Aaron Jones to Minnesota after Green Bay departure. Tier 5. USE: example of veteran RB ported to a new system at lead-back tier.
- Pattern documented in the search but not formally quantified: Hubbard moving back to lead role in Carolina after Dowdle's departure; Gibbs taking the Detroit backfield after Montgomery trade; Singletary stepping in for Barkley in NYG. CITATION_UNVERIFIED for a quantified hit-rate study on "successor RB year-1 production after the prior bellcow departs." Logged.

Common-knowledge debunk for this cluster: "Post-trade RBs always disappoint in year 1." FALSE. The Stats with Sasa numbers (64 percent improve, median +6.8 percent fantasy points) directly contradict the claim. Coach response language: "The data goes the other way. Traded RBs improve more often than not, and the median traded RB scores roughly 7 percent more after the trade. The pessimism comes from a few high-profile flameouts. Treat each case on the conditions, not on the genre."

Arbitrage / outlier pattern: post-trade RBs land into one of three role profiles. (1) Featured back replacing a departed bellcow (Hubbard 2025 Carolina pattern, Aaron Jones 2024 Minnesota pattern): high upside, conditional on scheme fit. (2) Committee splitter (Singletary 2024 NYG): capped ceiling, high floor for half a season then drift. (3) Pass-down complement (Tony Pollard 2024 Tennessee tier): durable role, lower ceiling but coaching-change-resilient. The engine should classify the projected role at the new team BEFORE projecting points; conflating the three is the most common analyst error.

### Cluster 4: Predictive frameworks for the transitions themselves

#### How well does the dynasty market reprice post-event vs pre-event?

- KeepTradeCut, "Dynasty Football Trade Calculator": https://keeptradecut.com/trade-calculator. Crowdsourced values from over 25 million data points. KTC repricing happens within days to weeks of major events (trades, free-agent signings, coaching hires) because the crowd updates continuously. Tier 3 (named industry framework, public methodology). USE: KTC reprice latency is approximately the news cycle, not a season; the engine should treat KTC as a near-real-time market.
- FantasyCalc, "Dynasty Trade Calculator": https://fantasycalc.com/trade-calculator. Algorithmically generated values from hundreds of thousands of real trades. Tier 3. USE: FantasyCalc as a corroborating market signal; deviation between KTC and FantasyCalc is itself a tradeable signal (FC lags actual trades; KTC lags consensus opinion).
- KTC FAQ: https://keeptradecut.com/frequently-asked-questions. Documents the "averages of how dynasty owners value players" framing. Tier 3.
- Open question: a peer-reviewed or quantified study of "dynasty market efficiency: where does KTC mis-price post-event?" The v1 corpus already flagged this gap (open question 7). The product itself is positioned to generate this evidence via internal backtests. Logged.

Common-knowledge claim status: "By July, all offseason news is already baked into KTC." TRUE_BUT_OVERWEIGHTED. The market does reprice within days of major events; the residual mis-pricing tends to concentrate in (a) under-covered positions (TE, late-round rookies), (b) compounding-news cases (multiple events stacked: trade plus coaching change plus depth-chart shift), and (c) the immediate aftermath of the NFL Draft, when crowd attention is split across hundreds of new entries. The engine should NOT assume KTC has fully repriced compounding-news cases.

#### Beat reporter and depth-chart signal credibility

- The v1 corpus already flags beat reporters as Tier 4: sources of FACT, never sources of ANALYSIS. Re-cited here for the transition layer.
- Ourlads, "2026 NFL Depth Charts and Rosters": https://www.ourlads.com/nfldepthcharts/. The NFL requires teams to release a "credible" weekly depth chart, but empirical observation across the league shows depth-chart-1 listing does not always predict actual starts (named example: Charlton played 20+ snaps without starting despite being depth-chart-1 at DE). Tier 5 (industry directory, not a study). USE: training-camp depth-chart-1 listings carry signal but should not be treated as deterministic.
- Open question: a quantified study of "training-camp starter announcement reliability through Week 1," controlling for position and franchise. CITATION_UNVERIFIED for a clean version. Logged.

#### Free-agent landing-spot effect on next-season fantasy outcome

- numberFire, "Fantasy Football: How Much Do Coaches Impact Wide Receiver Usage?": https://www.numberfire.com/nfl/news/19379/fantasy-football-how-much-do-coaches-impact-wide-receiver-usage/david-mccaffery. When a WR changes both teams and coaches simultaneously, about half of the volume signal is lost. Tier 3. USE: free-agent landing-spot signal degrades when the receiver moves to a coach he hasn't played for; engine should bake context fragility into the FA-signing prior.
- Footballguys, "Coaching and Philosophy Changes": https://www.footballguys.com/article/14woodcoachingphilosophychanges. Tier 4. USE: corroborating coverage of philosophy-change effects on inherited skill players.
- PFF, "Fantasy Football: Wide Receiver Free Agent Preview": https://www.pff.com/news/fantasy-football-wide-receiver-free-agent-preview-rankings-landing-spots-and-impact. Tier 2 (descriptive industry analysis, not a study). USE: as the qualitative reference; quantified hit rates are not provided.
- Open question: a longitudinal study of "free-agent signing followed by next-season fantasy outcome correlation," ideally controlling for QB change and scheme change. CITATION_UNVERIFIED. Logged.

Common-knowledge debunk for this cluster: "A free-agent signing automatically improves the receiving WR's fantasy outlook." TRUE_BUT_OVERWEIGHTED. Half the signal is lost when the WR moves to a new system AND a new coach; landing on a top QB matters more than the marquee value of the contract. Coach response language: "Free-agency landing spots are real signals, but the volume bump is conditional on QB tier and scheme fit. Half the production signal evaporates when both team and coach are new. The engine flags 'high QB tier + same scheme family' as the upside cases and 'new QB tier + new scheme' as the variance cases."

#### Coaching-staff hire timing and rookie-HC bust rate early in the year

- Pro Football History first-time HC piece (above): year-1 winning percentage 0.447 across the cohort; year-3 progression to 0.508 for survivors. The cohort is partially survivor-biased (HCs who lose their job early are not in the year-3 sample). Tier 4. USE: with a survivor-bias caveat. The engine should apply a rookie-HC penalty to next-year team-context projection but should NOT extrapolate the year-3 progression onto every individual year-1 case (selection effect).
- The Ringer, "Ranking the Top NFL Head Coaching Candidates for 2026": https://www.theringer.com/2025/12/17/nfl/ranking-top-nfl-head-coaching-candidates-2026-robert-saleh-mike-mccarthy-marcus-freeman-bill-belichick. Tier 5 (analyst ranking). USE: as a qualitative coaching-credentialing reference, not a study.
- Open question: rookie-HC year-1 bust rate broken by background (offensive coordinator, defensive coordinator, college coach, position coach). CITATION_UNVERIFIED for a clean cohort study. Logged.

#### Bayesian update frameworks for offseason news

- Nathan Braun, "Bayesian Fantasy Football Writeup": https://nathanbraun.com/bayesian-fantasy-football/. Documents the prior-plus-update structure: preseason draft rankings as prior, weekly results as the update mechanism. Tier 3 (industry-tier methodology with code, not peer-reviewed). USE: methodological template for the engine's offseason-update layer.
- Adam Harstad, "Fantasy, in Theory: Bayes and Bob": https://www.footballguys.com/article/HarstadFiT3. Documents that the bulk of predictive power comes from preseason expectations; Bayesian update on top of the prior improves on the margin, not in the bulk. Tier 3. USE: the engine should NOT under-weight the preseason prior in favor of weekly news; the marginal-improvement framing is durable.
- Scott Rome, "Bayesian Hierarchical Modeling Applied to Fantasy Football Projections": https://srome.github.io/Bayesian-Hierarchical-Modeling-Applied-to-Fantasy-Football-Projections/. Documents a hierarchical-modeling treatment of fantasy projections with explicit priors and posteriors per player. Tier 3 (independent ML practitioner). USE: as the methodological reference for the engine's per-player posterior layer.
- PFF, "2020 NFL QB Rankings: Using Bayesian Updating to rank all 32 projected starters": https://www.pff.com/news/nfl-2020-quarterback-rankings. Documents an industry-tier Bayesian-updating implementation for QB rankings. Tier 2. USE: as the load-bearing PFF-tier industry example for QB-specific Bayesian updating; the structure (career-mean prior plus per-game updates) ports to the engine's offseason layer.
- Wharton Sports Analytics, "Wharton Sports Analytics Journal" 2025 fall edition: https://wsb.wharton.upenn.edu/wharton-sports-analytics-journal/2025-fall-edition/. Documents temporal linear regression for WR touchdown projection across 1990 to 2024 data; finds usage and efficiency more predictive than raw prior-year touchdowns. Tier 2 (university-affiliated, peer-reviewed-adjacent). USE: as methodological corroboration for usage-over-output projection in the offseason layer.

Common-knowledge debunk for this cluster: "The market needs the regular season to reprice; offseason news is mostly noise." FALSE. The KTC repricing latency is days to weeks for major events, not months; the Bayesian framework documented above explicitly treats offseason intelligence as a meaningful prior-update source. Coach response language: "The market repriced this within a week. Offseason news is a real input, not noise. The signal is strongest when multiple events stack (trade plus coaching change plus depth-chart shift); a single-event reprice from KTC has typically already happened by the time you read the headline."

Arbitrage / outlier pattern: compounding-news cases. When three or more transitions affect a single player in one offseason (e.g., new team + new HC + new QB), the dynasty market under-prices the variance compression. The engine should flag these as "high-variance, mis-priced both directions" and let the user's risk preference (Soundboard horizon dial) bias the call.

### Maintenance notes for this section

- Last update: 2026-05-03.
- Inclusion criteria: every entry has a URL or a CITATION_UNVERIFIED tag. No source is fabricated. Where the strongest available evidence is Tier 4 industry blog rather than peer-reviewed, the entry says so explicitly.
- Open questions logged in this section that should be elevated in the next maintenance pass: (1) quantified delta-on-delta study of OL grade change vs RB1 production change, (2) rookie-OL-development by week-12 vs full-season, (3) OL grade change under same OC vs new OC holding personnel constant, (4) year-1 HC offensive-identity persistence vs prior season, (5) Reid-tree-specific RB and WR fantasy-impact study, (6) fantasy production change when OC moves vs when player moves with same OC, (7) bellcow year-N to year-N+1 retention rate conditional on age and team change, (8) target-share vs carry-share retention across coaching changes, (9) successor RB year-1 production after prior bellcow departs, (10) dynasty market efficiency study of post-event mis-pricing, (11) training-camp starter announcement reliability through Week 1, (12) free-agent landing-spot study controlled for QB and scheme change, (13) rookie-HC year-1 bust rate by coaching background.
- Heavy reliance on Tier 3 to Tier 4 industry sources in this section is honest: peer-reviewed offseason-transition work is rare. The product's credibility depends on flagging the gap rather than papering over it. The engine should weight signals in this section accordingly: contemporaneous correlations like the 0.440 OL continuity DVOA correlation are usable as variance modifiers but NOT as deterministic point-estimate adjustments.
- Citation watchlist for this section: the Stats with Sasa "fantasy impact of NFL trades" piece is the cleanest available source on traded-RB outcomes; if a peer-reviewed replication surfaces, it should supersede.
