/**
 * Inflection-window resolver. For an active window plus player inputs,
 * returns the bifurcation: Story A vs Story B probabilities, scorecard
 * of K signals with confidence labels, named historical comparators,
 * and conversation-ready framing.
 *
 * Phase 1: heuristic probabilities (hand-coded weights per signal).
 * Phase 2: replace the heuristic with a logistic regression fit on
 * historical outcome data per inflection type. The schema below is
 * stable across the transition; only the probability-computation
 * internal changes.
 *
 * Per the 2026-05-07 strategic decision: this layer is ADDITIVE. The
 * existing rubric x KTC x age-curve engine continues to produce a base
 * score. The inflection layer surfaces bifurcation as METADATA on
 * candidates in inflection windows.
 */

import type { ActiveWindow } from "./detect";
import { buildOpportunitySignal } from "./opportunity-signal";
import type {
  InflectionInputs,
  InflectionResolution,
  InflectionSignal,
  InflectionComparator,
} from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function confidenceSummary(
  signals: InflectionSignal[],
): InflectionResolution["confidence_summary"] {
  const validated_count = signals.filter(
    (s) => s.confidence === "validated" && s.direction !== "data_missing",
  ).length;
  const partial_count = signals.filter(
    (s) => s.confidence === "partial" && s.direction !== "data_missing",
  ).length;
  const weak_count = signals.filter(
    (s) => s.confidence === "weak" && s.direction !== "data_missing",
  ).length;
  const data_missing_count = signals.filter(
    (s) => s.direction === "data_missing",
  ).length;
  const total = signals.length;
  const live_signal_count = validated_count + partial_count + weak_count;

  // Honest framing: a card whose signals are mostly blind is leaning on
  // the position base rate, not on evidence. Surface that so a 64/36 split
  // built from one live signal does not read as an evidence-backed call.
  let evidence_basis: "prior_driven" | "mixed" | "evidence_backed";
  let calibration_note: string | null;
  if (data_missing_count === 0) {
    evidence_basis = "evidence_backed";
    calibration_note = null;
  } else if (live_signal_count <= 1) {
    evidence_basis = "prior_driven";
    calibration_note =
      live_signal_count === 0
        ? `No live signals yet: ${data_missing_count} of ${total} data missing. This is the position base rate, not a read on this player.`
        : `Mostly prior-driven: ${live_signal_count} of ${total} signals live. Base-rate lean, not yet evidence-backed.`;
  } else {
    evidence_basis = "mixed";
    calibration_note = `Partial read: ${live_signal_count} of ${total} signals live, ${data_missing_count} still missing.`;
  }

  const text = `${validated_count} of ${total} signals validated, ${partial_count} partial, ${weak_count} weak, ${data_missing_count} data missing.`;
  return {
    validated_count,
    partial_count,
    weak_count,
    data_missing_count,
    live_signal_count,
    evidence_basis,
    calibration_note,
    text,
  };
}

function composeHeadline(
  player: string,
  windowLabel: string,
  pA: number,
  pB: number,
  storyA: string,
  storyB: string,
): string {
  const lean = pA >= pB ? storyA : storyB;
  const leanPct = Math.round(Math.max(pA, pB) * 100);
  return `${player} is in the ${windowLabel}. Model leans ${lean} (${leanPct}%). Two stories play out for players in this window: ${storyA} or ${storyB}. The signals below say which.`;
}

function composeChatFraming(
  player: string,
  pA: number,
  pB: number,
  storyA: string,
  storyB: string,
  comparators: InflectionComparator[],
  signals: InflectionSignal[],
): string {
  const aComps = comparators.filter((c) => c.story === "a").slice(0, 2);
  const bComps = comparators.filter((c) => c.story === "b").slice(0, 2);
  const aText =
    aComps.length > 0
      ? aComps
          .map((c) => `${c.player} (${c.year ?? ""}, ${c.outcome_summary.toLowerCase()})`)
          .join("; ")
      : "TBD";
  const bText =
    bComps.length > 0
      ? bComps
          .map((c) => `${c.player} (${c.year ?? ""}, ${c.outcome_summary.toLowerCase()})`)
          .join("; ")
      : "TBD";
  const flippers = signals
    .filter((s) => s.direction !== "data_missing" && s.confidence !== "weak")
    .slice(0, 3)
    .map((s) => `${s.name.toLowerCase()}: ${s.observation ?? "(see scorecard)"}`)
    .join(" | ");
  const lean = pA >= pB ? storyA : storyB;
  const leanPct = Math.round(Math.max(pA, pB) * 100);
  return `${player}: model leans ${lean} (${leanPct}%). Comp tree: ${storyA} like ${aText}; ${storyB} like ${bText}. Things I would ask the league chat about: ${flippers || "what signals you would add"}.`;
}

function weightSignals(signals: InflectionSignal[]): {
  aWeight: number;
  bWeight: number;
} {
  let aWeight = 0;
  let bWeight = 0;
  for (const s of signals) {
    const w =
      s.confidence === "validated" ? 1 : s.confidence === "partial" ? 0.5 : 0.25;
    if (s.direction === "story_a") aWeight += w;
    if (s.direction === "story_b") bWeight += w;
  }
  return { aWeight, bWeight };
}

function blendPrior(priorA: number, signals: InflectionSignal[], blend: number): {
  pA: number;
  pB: number;
} {
  const { aWeight, bWeight } = weightSignals(signals);
  const totalWeight = Math.max(aWeight + bWeight, 0.1);
  const pA = priorA * (1 - blend) + (aWeight / totalWeight) * blend;
  const pB = 1 - pA;
  return { pA, pB };
}

const AGING_RB_COMPARATORS: InflectionComparator[] = [
  { player: "Adrian Peterson", year: 2017, outcome_summary: "Rushing title at age 32 post-ACL.", story: "a" },
  { player: "Frank Gore", year: 2016, outcome_summary: "1000+ rushing yards at age 33.", story: "a" },
  { player: "Curtis Martin", year: 2004, outcome_summary: "Rushing title at age 31.", story: "a" },
  { player: "Marshawn Lynch", year: 2015, outcome_summary: "Cliff at 29; brief retirement at 30.", story: "b" },
  { player: "Chris Johnson", year: 2014, outcome_summary: "Cliff at 29 after high-mileage prime.", story: "b" },
  { player: "Steven Jackson", year: 2013, outcome_summary: "Cliff at 30 with role share decline.", story: "b" },
];

const AGING_WR_COMPARATORS: InflectionComparator[] = [
  { player: "Larry Fitzgerald", year: 2015, outcome_summary: "1200+ yards at 32 with elite QB-WR rapport.", story: "a" },
  { player: "Antonio Brown", year: 2018, outcome_summary: "1300 yards at 30, then cliff next year.", story: "a" },
  { player: "Steve Smith Sr.", year: 2014, outcome_summary: "1000+ yards at 35 with new team.", story: "a" },
  { player: "Tyreek Hill", year: 2024, outcome_summary: "Cliff at 31 (FP 21, actual rank 59).", story: "b" },
  { player: "Cooper Kupp", year: 2024, outcome_summary: "Cliff at 32 post-injury.", story: "b" },
  { player: "Calvin Johnson", year: 2015, outcome_summary: "Retired at 30 after declining production.", story: "b" },
];

const AGING_TE_COMPARATORS: InflectionComparator[] = [
  { player: "Travis Kelce", year: 2023, outcome_summary: "TE1 production continuing into mid-30s.", story: "a" },
  { player: "Jason Witten", year: 2017, outcome_summary: "Productive TE2 into age 35.", story: "a" },
  { player: "Mark Andrews", year: 2024, outcome_summary: "Cliff at 30 (FP 30, actual outside top 50).", story: "b" },
  { player: "Greg Olsen", year: 2018, outcome_summary: "Injury-cliff at 33.", story: "b" },
];

const AGING_QB_COMPARATORS: InflectionComparator[] = [
  { player: "Tom Brady", year: 2017, outcome_summary: "MVP at 40.", story: "a" },
  { player: "Drew Brees", year: 2018, outcome_summary: "Productive at 39.", story: "a" },
  { player: "Peyton Manning", year: 2015, outcome_summary: "Cliff at 39 mid-season.", story: "b" },
  { player: "Aaron Rodgers", year: 2023, outcome_summary: "Achilles plus role uncertainty at 39.", story: "b" },
];

const ROOKIE_COMPARATORS: InflectionComparator[] = [
  { player: "Justin Jefferson", year: 2020, outcome_summary: "Immediate elite Year-1 (top-3 WR finish).", story: "a" },
  { player: "Drake London", year: 2022, outcome_summary: "Year-1 alpha target despite shaky QB room.", story: "a" },
  { player: "Garrett Wilson", year: 2022, outcome_summary: "Immediate WR1 from Day-3 OZ pick.", story: "a" },
  { player: "Treylon Burks", year: 2022, outcome_summary: "Year-1 bust; limited PT, fractured WR room.", story: "b" },
  { player: "Quentin Johnston", year: 2023, outcome_summary: "Year-1 bust; target share never materialized.", story: "b" },
  { player: "Anthony Richardson", year: 2023, outcome_summary: "Year-1 disappointment; raw QB development.", story: "b" },
];

const POST_INJURY_COMPARATORS: InflectionComparator[] = [
  { player: "Saquon Barkley", year: 2024, outcome_summary: "RB1 production post-multi-year injury history.", story: "a" },
  { player: "Adrian Peterson", year: 2012, outcome_summary: "MVP Year-1 post-ACL.", story: "a" },
  { player: "Cooper Kupp", year: 2023, outcome_summary: "Strong return from high-ankle.", story: "a" },
  { player: "Cam Akers", year: 2022, outcome_summary: "Diminished post-Achilles; never reclaimed lead role.", story: "b" },
  { player: "JK Dobbins", year: 2022, outcome_summary: "Multiple returns, never sustained a full season.", story: "b" },
  { player: "Brandon Aiyuk", year: 2024, outcome_summary: "ACL ended season; ranked 22 by ADP, finished 278.", story: "b" },
];

function resolveAgingCliffRB(p: InflectionInputs): InflectionResolution {
  const signals: InflectionSignal[] = [];

  const prev = p.prev_season_carries;
  const prevPrev = p.prev_prev_season_carries;
  if (prev != null && prevPrev != null) {
    const delta = prev - prevPrev;
    let direction: InflectionSignal["direction"];
    let observation: string;
    if (delta <= -50) {
      direction = "story_b";
      observation = `Carries dropped ${Math.abs(delta)} year over year (${prevPrev} to ${prev}).`;
    } else if (delta >= 30) {
      direction = "story_a";
      observation = `Carries up ${delta} year over year (${prevPrev} to ${prev}).`;
    } else {
      direction = "neutral";
      observation = `Stable workload (${prevPrev} to ${prev} carries).`;
    }
    signals.push({
      name: "Workload trend",
      description: "Year-over-year change in rushing carries (touches).",
      confidence: "validated",
      direction,
      observation,
      citation: "Football Outsiders RB age-curve cohort studies",
    });
  } else {
    signals.push({
      name: "Workload trend",
      description: "Year-over-year change in rushing carries (touches).",
      confidence: "validated",
      direction: "data_missing",
      observation: "Prior-season carries not available in current snapshot.",
    });
  }

  const mileage = p.career_carries;
  if (mileage != null) {
    let direction: InflectionSignal["direction"];
    let observation: string;
    if (mileage >= 2000) {
      direction = "story_b";
      observation = `${mileage} career carries (very high mileage tier).`;
    } else if (mileage >= 1500) {
      direction = "story_b";
      observation = `${mileage} career carries (high mileage tier).`;
    } else if (mileage >= 1000) {
      direction = "neutral";
      observation = `${mileage} career carries (moderate mileage).`;
    } else {
      direction = "story_a";
      observation = `${mileage} career carries (low mileage for age).`;
    }
    signals.push({
      name: "Career mileage",
      description: "Total career rushing carries; high mileage accelerates cliff.",
      confidence: "validated",
      direction,
      observation,
      citation: "Multiple cohort studies; PFF career-workload tracking",
    });
  } else {
    signals.push({
      name: "Career mileage",
      description: "Total career rushing carries; high mileage accelerates cliff.",
      confidence: "validated",
      direction: "data_missing",
      observation: "Career carries not yet plumbed from outcome dataset.",
    });
  }

  const drafted = p.same_team_same_position.filter(
    (other) => other.player_id !== p.player_id && other.is_rookie,
  );
  const youngerRBs = p.same_team_same_position.filter(
    (other) =>
      other.player_id !== p.player_id &&
      other.age != null &&
      p.age != null &&
      other.age <= p.age - 3,
  );
  if (drafted.length > 0) {
    signals.push({
      name: "Successor on roster",
      description: "Team drafted or signed a younger RB at same position.",
      confidence: "validated",
      direction: "story_b",
      observation: `${drafted.length} rookie RB(s) on roster behind this player.`,
      citation: "Depth-chart math; succession signal in dynasty studies",
    });
  } else if (youngerRBs.length >= 1) {
    signals.push({
      name: "Successor on roster",
      description: "Team has a notably younger RB at same position.",
      confidence: "validated",
      direction: "neutral",
      observation: `${youngerRBs.length} younger RB(s) on roster but none rookie.`,
    });
  } else {
    signals.push({
      name: "Successor on roster",
      description: "Team has a notably younger RB at same position.",
      confidence: "validated",
      direction: "story_a",
      observation: "No younger RB on the roster; veteran retains the lead role.",
    });
  }

  signals.push(
    buildOpportunitySignal({
      position: "RB",
      prev: p.prev_season_opportunity,
      prevPrev: p.prev_prev_season_opportunity,
    }),
  );

  signals.push({
    name: "Athletic decline indicators",
    description: "Broken-tackle rate, breakaway speed retention, 40-yard speed indicators.",
    confidence: "partial",
    direction: "data_missing",
    observation: "PFF / NextGen athletic metrics not yet in our pipeline. Queued for v2.",
  });

  signals.push({
    name: "OL trajectory",
    description: "Offensive line grade and continuity. Aging RB on declining OL = sharper cliff.",
    confidence: "partial",
    direction: "data_missing",
    observation: "OL grade ingestion queued for v2 (PFF source).",
  });

  const { pA, pB } = blendPrior(0.4, signals, 0.4);
  return {
    window: "aging_cliff_rb",
    story_a_label: "Continued lead role",
    story_b_label: "Cliff",
    p_story_a: round2(pA),
    p_story_b: round2(pB),
    confidence_summary: confidenceSummary(signals),
    signals,
    comparators: AGING_RB_COMPARATORS,
    headline: composeHeadline(p.player_name, "RB end-of-career risk window", pA, pB, "Continued lead role", "Cliff"),
    league_chat_framing: composeChatFraming(p.player_name, pA, pB, "Continued lead role", "Cliff", AGING_RB_COMPARATORS, signals),
  };
}

function resolveAgingCliffWR(p: InflectionInputs): InflectionResolution {
  const signals: InflectionSignal[] = [];

  const prev = p.prev_season_targets;
  const prevPrev = p.prev_prev_season_targets;
  if (prev != null && prevPrev != null) {
    const delta = prev - prevPrev;
    let direction: InflectionSignal["direction"];
    let observation: string;
    if (delta <= -20) {
      direction = "story_b";
      observation = `Targets dropped ${Math.abs(delta)} year over year (${prevPrev} to ${prev}).`;
    } else if (delta >= 15) {
      direction = "story_a";
      observation = `Targets up ${delta} year over year (${prevPrev} to ${prev}).`;
    } else {
      direction = "neutral";
      observation = `Stable target share (${prevPrev} to ${prev}).`;
    }
    signals.push({
      name: "Target trend",
      description: "Year-over-year change in receiving targets.",
      confidence: "validated",
      direction,
      observation,
      citation: "FO + PFF aging WR cohort studies",
    });
  } else {
    signals.push({
      name: "Target trend",
      description: "Year-over-year change in receiving targets.",
      confidence: "validated",
      direction: "data_missing",
      observation: "Prior-season targets not in current pipeline.",
    });
  }

  const drafted = p.same_team_same_position.filter(
    (other) => other.player_id !== p.player_id && other.is_rookie,
  );
  const youngerWRs = p.same_team_same_position.filter(
    (other) =>
      other.player_id !== p.player_id &&
      other.age != null &&
      p.age != null &&
      other.age <= p.age - 4,
  );
  if (drafted.length > 0) {
    signals.push({
      name: "Ascending WR on roster",
      description: "Team drafted a WR who could displace target share.",
      confidence: "validated",
      direction: "story_b",
      observation: `${drafted.length} rookie WR(s) on roster.`,
    });
  } else if (youngerWRs.length >= 1) {
    signals.push({
      name: "Ascending WR on roster",
      description: "Team has a notably younger WR.",
      confidence: "validated",
      direction: "neutral",
      observation: `${youngerWRs.length} younger WR(s) on roster but none rookie.`,
    });
  } else {
    signals.push({
      name: "Ascending WR on roster",
      description: "Team has a notably younger WR at same position.",
      confidence: "validated",
      direction: "story_a",
      observation: "No clear successor; veteran remains alpha.",
    });
  }

  signals.push(
    buildOpportunitySignal({
      position: "WR",
      prev: p.prev_season_opportunity,
      prevPrev: p.prev_prev_season_opportunity,
    }),
  );

  signals.push({
    name: "Separation / route-run efficiency",
    description: "PFF separation and route-run grades; declines precede cliff.",
    confidence: "partial",
    direction: "data_missing",
    observation: "PFF metrics not yet in our pipeline.",
  });

  signals.push({
    name: "QB tier",
    description: "Quality of QB; aging WR with elite QB ages better.",
    confidence: "partial",
    direction: "data_missing",
    observation: "QB tier classification queued for v2.",
  });

  const { pA, pB } = blendPrior(0.35, signals, 0.4);
  return {
    window: "aging_cliff_wr",
    story_a_label: "Continued WR1 production",
    story_b_label: "Cliff",
    p_story_a: round2(pA),
    p_story_b: round2(pB),
    confidence_summary: confidenceSummary(signals),
    signals,
    comparators: AGING_WR_COMPARATORS,
    headline: composeHeadline(p.player_name, "WR end-of-career risk window", pA, pB, "Continued WR1", "Cliff"),
    league_chat_framing: composeChatFraming(p.player_name, pA, pB, "Continued WR1 production", "Cliff", AGING_WR_COMPARATORS, signals),
  };
}

function resolveAgingCliffTE(p: InflectionInputs): InflectionResolution {
  const signals: InflectionSignal[] = [];
  const prev = p.prev_season_targets;
  const prevPrev = p.prev_prev_season_targets;
  if (prev != null && prevPrev != null) {
    const delta = prev - prevPrev;
    const direction: InflectionSignal["direction"] =
      delta <= -15 ? "story_b" : delta >= 10 ? "story_a" : "neutral";
    signals.push({
      name: "Target trend",
      description: "Year-over-year target change.",
      confidence: "validated",
      direction,
      observation: `Targets ${prevPrev} to ${prev} (delta ${delta}).`,
    });
  } else {
    signals.push({
      name: "Target trend",
      description: "Year-over-year target change.",
      confidence: "validated",
      direction: "data_missing",
      observation: "Prior-season targets not available.",
    });
  }
  const drafted = p.same_team_same_position.filter(
    (other) => other.player_id !== p.player_id && other.is_rookie,
  );
  signals.push({
    name: "Successor on roster",
    description: "Team drafted a rookie TE.",
    confidence: "validated",
    direction: drafted.length > 0 ? "story_b" : "story_a",
    observation:
      drafted.length > 0
        ? `${drafted.length} rookie TE(s) drafted to displace.`
        : "No clear successor.",
  });
  signals.push(
    buildOpportunitySignal({
      position: "TE",
      prev: p.prev_season_opportunity,
      prevPrev: p.prev_prev_season_opportunity,
    }),
  );

  signals.push({
    name: "12-personnel rate",
    description: "How often the offense uses 2-TE sets; TE-friendly schemes age better.",
    confidence: "partial",
    direction: "data_missing",
    observation: "Scheme classification not yet in pipeline.",
  });
  signals.push({
    name: "OC tenure",
    description: "TE production correlates with OC continuity.",
    confidence: "partial",
    direction: "data_missing",
    observation: "OC tenure not yet in pipeline.",
  });
  const { pA, pB } = blendPrior(0.35, signals, 0.4);
  return {
    window: "aging_cliff_te",
    story_a_label: "Continued TE1 production",
    story_b_label: "Cliff",
    p_story_a: round2(pA),
    p_story_b: round2(pB),
    confidence_summary: confidenceSummary(signals),
    signals,
    comparators: AGING_TE_COMPARATORS,
    headline: composeHeadline(p.player_name, "TE end-of-career risk window", pA, pB, "Continued TE1", "Cliff"),
    league_chat_framing: composeChatFraming(p.player_name, pA, pB, "Continued TE1 production", "Cliff", AGING_TE_COMPARATORS, signals),
  };
}

function resolveAgingCliffQB(p: InflectionInputs): InflectionResolution {
  const signals: InflectionSignal[] = [
    {
      name: "Mobility retention",
      description: "Rushing-yard production trend; mobile QBs cliff harder than pocket passers.",
      confidence: "partial",
      direction: "data_missing",
      observation: "QB rushing-yard tracking by year queued for v2.",
    },
    {
      name: "Supporting cast",
      description: "WR room quality and OL stability.",
      confidence: "partial",
      direction: "data_missing",
      observation: "Cast quality classification queued for v2.",
    },
    {
      name: "OC continuity",
      description: "Same OC year-over-year; mid-30s QBs benefit from system stability.",
      confidence: "partial",
      direction: "data_missing",
      observation: "OC tracking queued for v2.",
    },
  ];
  const priorA = 0.55;
  const priorB = 0.45;
  return {
    window: "aging_cliff_qb",
    story_a_label: "Continued production",
    story_b_label: "Cliff",
    p_story_a: round2(priorA),
    p_story_b: round2(priorB),
    confidence_summary: confidenceSummary(signals),
    signals,
    comparators: AGING_QB_COMPARATORS,
    headline: composeHeadline(p.player_name, "QB end-of-career window", priorA, priorB, "Continued production", "Cliff"),
    league_chat_framing: composeChatFraming(p.player_name, priorA, priorB, "Continued production", "Cliff", AGING_QB_COMPARATORS, signals),
  };
}

function resolveRookieDebut(p: InflectionInputs): InflectionResolution {
  const signals: InflectionSignal[] = [];

  const pick = p.draft_pick_overall;
  if (pick != null) {
    let direction: InflectionSignal["direction"];
    let observation: string;
    if (pick <= 15) {
      direction = "story_a";
      observation = `Drafted at pick ${pick} (top-15; high hit-rate tier).`;
    } else if (pick <= 50) {
      direction = "neutral";
      observation = `Drafted at pick ${pick} (top-50; moderate tier).`;
    } else {
      direction = "story_b";
      observation = `Drafted at pick ${pick} (Day 3 tier; lower hit rate).`;
    }
    signals.push({
      name: "Draft capital",
      description: "Where the player was drafted; hit rates step down by round.",
      confidence: "validated",
      direction,
      observation,
      citation: "Massey-Thaler 2013 + Football Outsiders rookie hit-rate tables",
    });
  } else {
    signals.push({
      name: "Draft capital",
      description: "Where the player was drafted.",
      confidence: "validated",
      direction: "data_missing",
      observation: "Draft pick number not in current snapshot.",
    });
  }

  const established = p.same_team_same_position.filter(
    (other) =>
      other.player_id !== p.player_id &&
      other.years_exp != null &&
      other.years_exp >= 1,
  );
  let direction: InflectionSignal["direction"];
  let observation: string;
  if (established.length === 0) {
    direction = "story_a";
    observation = "No established players ahead at position; clear path to volume.";
  } else if (established.length === 1) {
    direction = "neutral";
    observation = "1 established player ahead; clear secondary role.";
  } else if (established.length === 2) {
    direction = "neutral";
    observation = "2 established players ahead; competitive secondary.";
  } else {
    direction = "story_b";
    observation = `${established.length} established players ahead; crowded room limits Year-1 ceiling.`;
  }
  signals.push({
    name: "Position-room saturation",
    description: "Count of established players ahead at the same position on the team.",
    confidence: "validated",
    direction,
    observation,
    citation: "Depth-chart math; rookie target / touch share studies",
  });

  signals.push({
    name: p.position === "RB" ? "OL run-block grade" : "QB tier",
    description:
      p.position === "RB"
        ? "OL grade strongly correlates with rookie RB Year-1 output."
        : "QB quality strongly correlates with rookie WR/TE Year-1 output.",
    confidence: "validated",
    direction: "data_missing",
    observation:
      p.position === "RB"
        ? "PFF OL run-block grade queued for v2 ingestion."
        : "QB tier classification queued for v2.",
  });

  signals.push({
    name: "Scheme fit",
    description: "Scheme alignment with athletic profile (air-raid speed, gap-RB power).",
    confidence: "partial",
    direction: "data_missing",
    observation: "Scheme tag for receiving / rushing scheme queued for v2.",
  });

  const { pA, pB } = blendPrior(0.35, signals, 0.5);
  return {
    window: "rookie_debut",
    story_a_label: "Year-1 breakout",
    story_b_label: "Slow start / bust",
    p_story_a: round2(pA),
    p_story_b: round2(pB),
    confidence_summary: confidenceSummary(signals),
    signals,
    comparators: ROOKIE_COMPARATORS,
    headline: composeHeadline(p.player_name, "Rookie debut window", pA, pB, "Year-1 breakout", "Slow start / bust"),
    league_chat_framing: composeChatFraming(p.player_name, pA, pB, "Year-1 breakout", "Slow start / bust", ROOKIE_COMPARATORS, signals),
  };
}

function resolvePostInjury(p: InflectionInputs): InflectionResolution {
  const signals: InflectionSignal[] = [
    {
      name: "Compounding-news count",
      description: "How many news items in the offseason mention this player's injury, role, or trade.",
      confidence: "partial",
      direction:
        p.compounding_news_count != null && p.compounding_news_count >= 4
          ? "story_b"
          : "neutral",
      observation:
        p.compounding_news_count != null
          ? `${p.compounding_news_count} compounding-news items in offseason.`
          : "Not coded for this player.",
      citation: "v1 RB signal extraction (in-house)",
    },
    {
      name: "Injury type and recency",
      description: "ACL vs Achilles vs soft-tissue chronic; recovery curves differ sharply.",
      confidence: "validated",
      direction: "data_missing",
      observation: "Injury-history signal queued for v2 extraction.",
      citation: "Sports-medicine literature on ACL/Achilles return curves",
    },
    {
      name: "Age at injury",
      description: "Players under 26 recover better than 28+ for ACL/Achilles/concussion windows.",
      confidence: "validated",
      direction: "data_missing",
      observation: "Tied to v2 injury-history extraction.",
    },
    {
      name: "Position athleticism dependency",
      description: "Speed / explosion players recover slower than possession-style players.",
      confidence: "validated",
      direction: "data_missing",
      observation: "Athleticism profile queued for v2.",
    },
    {
      name: "Pre-injury career mileage",
      description: "High-mileage players have worse post-injury recovery outcomes.",
      confidence: "partial",
      direction: "data_missing",
      observation: "Career mileage tied to v2 outcome ingestion expansion.",
    },
  ];
  const priorA = 0.3;
  const priorB = 0.7;
  return {
    window: "post_major_injury",
    story_a_label: "Full return",
    story_b_label: "Diminished return",
    p_story_a: round2(priorA),
    p_story_b: round2(priorB),
    confidence_summary: confidenceSummary(signals),
    signals,
    comparators: POST_INJURY_COMPARATORS,
    headline: composeHeadline(p.player_name, "Post-major-injury return window", priorA, priorB, "Full return", "Diminished return"),
    league_chat_framing: composeChatFraming(p.player_name, priorA, priorB, "Full return", "Diminished return", POST_INJURY_COMPARATORS, signals),
  };
}

export function resolveInflectionWindow(
  window: ActiveWindow,
  inputs: InflectionInputs,
): InflectionResolution {
  switch (window) {
    case "aging_cliff_rb":
      return resolveAgingCliffRB(inputs);
    case "aging_cliff_wr":
      return resolveAgingCliffWR(inputs);
    case "aging_cliff_te":
      return resolveAgingCliffTE(inputs);
    case "aging_cliff_qb":
      return resolveAgingCliffQB(inputs);
    case "rookie_debut":
      return resolveRookieDebut(inputs);
    case "post_major_injury":
      return resolvePostInjury(inputs);
  }
}
