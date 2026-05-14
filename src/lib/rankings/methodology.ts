/**
 * Per-dial methodology content surfaced inside the rankings + soundboard
 * methodology drawers. Voice A, evidence-cited, honest about v1 limits
 * and what v2 will add.
 *
 * Keep these long-form. The user clicked "?" to learn; they want depth.
 * Every claim ships with the engine surface that backs it, the cohort
 * size where applicable, and a "v2 will add..." line so the methodology
 * stays current as the model improves.
 *
 * When you wire a dial deeper into the engine, update the matching
 * `engine_surfaces` list AND the `limitations` block. Future Library
 * articles link from `library_slug` (article surface lands in Phase 2).
 */

export type DialMethodology = {
  /** Matches DIAL_SPECS.id when applicable; rankings-page slug otherwise. */
  id: string;
  title: string;
  /** One-line definition. Shows above the body inside the drawer. */
  definition: string;
  /** Why this dial exists. Names the bias we're correcting. */
  why_it_exists: string[];
  /** Statistical model behind the dial. Cite the engine surface + cohort. */
  statistical_model: string[];
  /** Specific engine surfaces this dial currently touches. */
  engine_surfaces: string[];
  /** Honest acknowledgment of v1 gaps + what v2 will add. */
  limitations: string[];
  /** Slug for a Library deep-dive article when it lands. */
  library_slug?: string;
};

export const DIAL_METHODOLOGY: Record<string, DialMethodology> = {
  youth_weight: {
    id: "youth_weight",
    title: "Youth",
    definition:
      "How aggressively to weight a player's position on the age curve.",
    why_it_exists: [
      "Consensus dynasty pricing treats age uniformly across positions. A 27-year-old WR and a 27-year-old RB are not the same asset, and the market knows it but does not always reflect it in price.",
      "Our model treats peak windows as position-specific: RB 23-26, WR 24-29, TE 26-30, QB 23-33. The bands are calibrated against starter-tier production observed across the 2022-2025 NFL seasons.",
    ],
    statistical_model: [
      "Source: positionAgeMult function in src/lib/strategy/lane-identity/lanes.ts",
      "Band breakpoints derived from per-position production cohorts across 2022-2025 NFL seasons, restricted to top-N starters per position so the curve reflects realistic NFL roles rather than league-wide averages.",
      "Cross-validated against the 82-roster lane-identity calibration cohort used elsewhere on the product (see /library for the cohort writeup).",
      "Recent refits (2026-05-12): QB peak band widened to 23-33 because year-1-3 starters at QB now post peak-band production. TE peak band narrowed to 26-30 because age 25 produces 0.78 of peak, not 1.0.",
    ],
    engine_surfaces: [
      "Age-curve component in the player scoring function",
      "Lane identity youth contribution (lanes.ts)",
      "Future-vs-now weighting in Decision-card synthesis",
    ],
    limitations: [
      "v1 uses fixed band breakpoints with a step transition. v2 will use a continuous Gaussian + sigmoid blend per position so neighboring ages don't cliff.",
      "v1 doesn't yet adjust for usage-driven aging (a 28-year-old WR with low target share ages differently than one with high target share). Per-player usage-aware aging is a v3 candidate.",
    ],
    library_slug: "age-curves",
  },
  bellcow_pref: {
    id: "bellcow_pref",
    title: "Bellcow preference",
    definition:
      "How much to prefer workhorse RBs over committee and passdown shapes.",
    why_it_exists: [
      "Dynasty managers know not all RBs are equal. Saquon and Bijan are different assets than a rotational back with the same KTC value. The Bellcow dial lets you push the model toward the role shape you actually want to roster.",
      "Pass-catching RBs (Achane, Gibbs, Pollard-shape) are also distinct. The product's larger model reads pass-catching share separately, and this dial is the first lever to start surfacing that distinction in rankings.",
    ],
    statistical_model: [
      "v1: positional rank inside FantasyCalc consensus serves as a workhorse proxy. Top-12 RBs read as bellcow-shaped; RB 25-30 read as committee; RB 30+ read as deep handcuff or passdown specialist.",
      "Why a proxy: the consensus market is itself a function of perceived role tier. The market under-prices known committees and over-prices clear bellcows, so positional rank already carries role information.",
      "v2 (in progress): plug in rb_role_tier from player_signals (workhorse / committee / passdown_specialist / handcuff) plus rb_passdown_share_prior_year. The schema is in supabase/migrations/0009_signals.sql; the data is being populated from beat-reporter snap-share aggregates.",
    ],
    engine_surfaces: [
      "RB-specific scoring component on /rankings",
      "Lane identity RB Bellcow lane",
      "Decision-card synthesis when RB is the gap position",
    ],
    limitations: [
      "v1 does not yet distinguish pass-catching RBs from rotational ones. Achane and a generic third-down back may score similarly under v1 if both sit RB 12-18. v2 fixes this.",
      "Rookies have no prior-year pass-down share, so v2 will fall back to a draft-capital + role-projection composite for first-year RBs.",
    ],
    library_slug: "rb-role-tiers",
  },
  continuity_weight: {
    id: "continuity_weight",
    title: "Coaching continuity",
    definition:
      "How much to credit players whose offensive coordinator has been stable on their team.",
    why_it_exists: [
      "Year-over-year scheme continuity is a measurable predictor of production stability. A WR1 on a team with a 3-year OC is a different bet than a WR1 on a team with a first-year OC running a new scheme.",
      "The dynasty market systematically under-prices continuity. KTC and FantasyCalc react to talent + age + contract; neither has a coherent way to incorporate OC tenure or first-year scheme changes.",
    ],
    statistical_model: [
      "Source: team_signals.oc_tenure_yrs and team_signals.oc_first_year_with_team_flag (supabase/migrations/0009_signals.sql).",
      "Currently NEUTRAL in v1 because the 32-team team_signals table is mid-calibration. The slider is rendered disabled and has no effect on the live ranking. We do not move a dial that does not yet do anything.",
      "When calibrated: stable OC (3+ years) gets a positive multiplier; first-year OC gets a negative multiplier; second-year OC reads as neutral.",
    ],
    engine_surfaces: [
      "Player-level production stability adjustment (pending table fill)",
      "Lane identity continuity contribution (pending table fill)",
    ],
    limitations: [
      "Currently neutral. The slider is disabled and labeled as such. We won't ship a dial that pretends to do something it doesn't.",
      "When wired, v1 will use OC tenure only. v2 will fold in HC tenure + scheme tag stability (so a new OC running the same scheme as the prior staff scores closer to continuity than a new OC running a brand-new scheme).",
    ],
    library_slug: "coaching-continuity",
  },
  horizon: {
    id: "horizon",
    title: "Horizon",
    definition: "Win-now urgency vs future build.",
    why_it_exists: [
      "Every dynasty manager's posture is somewhere on a win-now / future spectrum. The product reads your posture from your roster shape (lane identity), but the Horizon dial lets you override it when you know something the engine does not (a planned trade, a contract you're committing to, etc.).",
    ],
    statistical_model: [
      "Wired into Decision-card lane-identity threshold scaling.",
      "Layered with emergent trajectory: either signal can soften the constraint. The engine does not blindly apply Horizon if your roster shape says otherwise.",
    ],
    engine_surfaces: [
      "Win-now vs future scoring across Decision lanes",
      "Lane-identity threshold scaling",
    ],
    limitations: [
      "Soundboard-only today. The /rankings page does not yet read Horizon; that's the next wiring pass.",
    ],
  },
  rookie_tilt: {
    id: "rookie_tilt",
    title: "Rookie tilt",
    definition: "Cautious vs aggressive on rookies.",
    why_it_exists: [
      "Some managers chase every rookie. Some treat year-one production as noise and wait. Both are defensible; the dial lets you express which one you are.",
      "Rookie ADP is its own variant on Sleeper for a reason: it sits on a different distribution than the veteran market. The dial leans on or against that variant.",
    ],
    statistical_model: [
      "Cross-checks rookie ADP variant (adp_rookie) plus current NFL draft window state.",
      "Reads FantasyCalc dynasty rank for the rookie cohort.",
    ],
    engine_surfaces: [
      "Stored. Engine wiring in progress.",
    ],
    limitations: [
      "Stored but not yet read by the engine. The next wiring pass adds rookie_tilt as a multiplier on rookie-flagged players in the scoring function.",
    ],
  },
  risk_tolerance: {
    id: "risk_tolerance",
    title: "Risk tolerance",
    definition: "Chalk picks vs upside swings.",
    why_it_exists: [
      "Some managers want the safest projection-implied pick. Some want the variance that wins championships. The dial is the lever between the two.",
    ],
    statistical_model: [
      "Tier-crunch detector reads ADP volatility per slot.",
      "5-pick-deep plan + opponent gap analysis informs swing tolerance.",
    ],
    engine_surfaces: ["Stored. Engine wiring pending."],
    limitations: [
      "Stored but not yet read by the engine. The next wiring pass adds risk_tolerance as a weighting on the variance signal already computed for each candidate.",
    ],
  },
  trade_aggression: {
    id: "trade_aggression",
    title: "Trade aggression",
    definition: "Sit tight vs propose deals.",
    why_it_exists: [
      "How forward you want Coach to be on suggesting deals. At full aggression, Coach proactively proposes trades on every Decision card; at full sit-tight, Coach proposes only when an asymmetric opportunity surfaces.",
    ],
    statistical_model: [
      "Scans 11 opponents per league for need alignment.",
      "KTC-anchored pricing bound at +/- 15% of fair.",
    ],
    engine_surfaces: ["Stored. Engine wiring pending."],
    limitations: [
      "Stored but not yet read by Coach's trade-suggest prompt. The next wiring pass adds trade_aggression as an explicit instruction in the Coach context.",
    ],
  },
  consensus_lean: {
    id: "consensus_lean",
    title: "Consensus lean",
    definition: "Lean with the market vs against the field.",
    why_it_exists: [
      "The market is right most of the time and very wrong some of the time. Contrarian dynasty managers hunt the second case. The dial expresses how much you trust the market on close calls.",
    ],
    statistical_model: [
      "Weights KTC majority signal in the ranking cascade.",
      "Counter-view detector tightens or loosens accordingly.",
    ],
    engine_surfaces: ["Stored. Engine wiring pending."],
    limitations: [
      "Stored but not yet read by the engine. The next wiring pass adds consensus_lean as a tiebreaker in the three-tier ranking cascade.",
    ],
  },
};
