import type { SleeperRoster } from "@/lib/sleeper";

export type StrategyState = "contender" | "rebuild" | "balanced" | "undetermined";

export type InferredStrategy = {
  state: StrategyState;
  confidence: number; // 0..1
  signals: string[];
};

/**
 * Very lightweight MVP inference. This is the "bootstrap" heuristic before
 * we have real player age/valuation data loaded. It scores on record,
 * waiver position, and any metadata we have.
 *
 * It should return *something* confidently-shaped so the UI can render a
 * real recommendation card while we build the deeper engine.
 */
export function inferStrategyFromRoster(
  roster: SleeperRoster | undefined,
  totalRosters: number,
): InferredStrategy {
  if (!roster || !roster.settings) {
    return {
      state: "undetermined",
      confidence: 0,
      signals: ["No roster data yet"],
    };
  }

  const settings = roster.settings as Record<string, unknown>;
  const wins = asNumber(settings.wins);
  const losses = asNumber(settings.losses);
  const ties = asNumber(settings.ties);
  const games = wins + losses + ties;
  const winPct = games > 0 ? wins / games : 0.5;

  const waiverPos = asNumber(settings.waiver_position);
  const middle = (totalRosters + 1) / 2;

  const signals: string[] = [];
  let contenderScore = 0;
  let rebuildScore = 0;

  if (games >= 4) {
    if (winPct >= 0.65) {
      contenderScore += 2;
      signals.push(
        `Record ${wins}-${losses}${ties ? `-${ties}` : ""} (${Math.round(winPct * 100)}%)`,
      );
    } else if (winPct <= 0.4) {
      rebuildScore += 2;
      signals.push(
        `Record ${wins}-${losses}${ties ? `-${ties}` : ""} (${Math.round(winPct * 100)}%)`,
      );
    } else {
      signals.push(
        `Record ${wins}-${losses}${ties ? `-${ties}` : ""}: middle of pack`,
      );
    }
  } else {
    signals.push("Not enough games to read record");
  }

  if (waiverPos > 0 && totalRosters > 0) {
    if (waiverPos <= Math.ceil(totalRosters / 3)) {
      rebuildScore += 1;
      signals.push(`High waiver priority (#${waiverPos})`);
    } else if (waiverPos >= totalRosters - Math.floor(totalRosters / 3)) {
      contenderScore += 1;
      signals.push(`Low waiver priority (#${waiverPos})`);
    } else {
      signals.push(`Waiver #${waiverPos}: middle`);
    }
  }

  // Rostered pick count can be inferred from future picks later. For now
  // just note we don't have that wired.
  let state: StrategyState;
  if (contenderScore > rebuildScore + 1) state = "contender";
  else if (rebuildScore > contenderScore + 1) state = "rebuild";
  else if (contenderScore === 0 && rebuildScore === 0) state = "undetermined";
  else state = "balanced";

  const spread = Math.abs(contenderScore - rebuildScore);
  const confidence =
    state === "undetermined" ? 0 : Math.min(0.25 + spread * 0.2, 0.9);

  // Silence unused var warning while keeping the variable for future use
  void middle;

  return { state, confidence, signals };
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function strategyLabel(s: StrategyState): string {
  switch (s) {
    case "contender":
      return "Contender";
    case "rebuild":
      return "Rebuild";
    case "balanced":
      return "Balanced";
    default:
      return "Undetermined";
  }
}

export function strategyAccentClass(s: StrategyState): string {
  switch (s) {
    case "contender":
      return "text-success";
    case "rebuild":
      return "text-accent";
    case "balanced":
      return "text-foreground";
    default:
      return "text-muted-2";
  }
}
