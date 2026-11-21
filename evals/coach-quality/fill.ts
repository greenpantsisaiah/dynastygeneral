/**
 * Coach quality eval: per-league placeholder filling + the "plain Claude"
 * paste.
 *
 * Pure functions over the <current_state> payload Coach already receives,
 * so the question text and the baseline paste name the same real players
 * and opponents Coach sees. No network.
 */

/** Loose read of the Coach <current_state> payload (src/lib/coach/turn.ts). */
export type StatePlayer = {
  name: string;
  pos: string | null;
  team?: string | null;
  age: number | null;
  value: number | null;
};

export type CoachState = {
  league?: {
    name?: string;
    season?: string;
    format?: string;
    scoring?: string[];
    total_teams?: number;
    format_rules?: Record<string, unknown>;
  };
  me?: {
    owner?: string | null;
    record?: string;
    players?: StatePlayer[];
  } | null;
  opponents?: Array<{
    owner: string;
    roster?: StatePlayer[];
  }>;
};

export type LeagueUnderTest = {
  leagueId: string;
  name: string;
  state: CoachState;
};

const SKILL = new Set(["QB", "RB", "WR", "TE"]);

function byValue(players: StatePlayer[]): StatePlayer[] {
  return [...players].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
}

function rosterValue(players: StatePlayer[] | undefined): number {
  return (players ?? []).reduce((s, p) => s + (p.value ?? 0), 0);
}

/**
 * Placeholder values for one league. Deterministic: the same league state
 * always yields the same names, so reruns compare like with like.
 */
export function placeholdersFor(
  primary: LeagueUnderTest,
  all: LeagueUnderTest[],
): Record<string, string> {
  const mine = byValue(
    (primary.state.me?.players ?? []).filter((p) => p.pos && SKILL.has(p.pos)),
  );
  const pick = (pred: (p: StatePlayer) => boolean, fallback?: StatePlayer) =>
    mine.find(pred)?.name ?? fallback?.name ?? "my best player";

  const top = mine[0];
  const old = pick(
    (p) => (p.pos === "RB" || p.pos === "WR") && (p.age ?? 0) >= 27,
    mine[1] ?? top,
  );
  const young = pick(
    (p) => (p.age ?? 99) <= 24 && (p.value ?? 0) > 0,
    mine[2] ?? top,
  );
  const qb = pick((p) => p.pos === "QB", top);
  const te = pick((p) => p.pos === "TE", top);

  // Opponents ordered by total roster value: opp_a is the strongest
  // roster (a natural trade target / rival), opp_b the second strongest.
  const opps = [...(primary.state.opponents ?? [])].sort(
    (a, b) => rosterValue(b.roster) - rosterValue(a.roster),
  );
  const oppA = opps[0];
  const oppB = opps[1] ?? opps[0];
  const oppTop = (o?: { roster?: StatePlayer[] }) =>
    byValue((o?.roster ?? []).filter((p) => p.pos && SKILL.has(p.pos)))[0]
      ?.name ?? "their best player";

  return {
    my_top: top?.name ?? "my best player",
    my_old: old,
    my_young: young,
    my_qb: qb,
    my_te: te,
    opp_a: oppA?.owner ?? "the top team",
    opp_a_top: oppTop(oppA),
    opp_b: oppB?.owner ?? "another manager",
    opp_b_top: oppTop(oppB),
    league_name: primary.name,
    league_count: String(all.length),
    league_names: all.map((l) => l.name).join(", "),
  };
}

export function fillQuestion(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(/\{([a-z_]+)\}/g, (m, key: string) => values[key] ?? m);
}

function formatLine(state: CoachState): string {
  const l = state.league ?? {};
  const fr = (l.format_rules ?? {}) as Record<string, unknown>;
  const qb = fr.is_superflex ? "Superflex" : "1QB";
  const tep = fr.te_premium ? ", TE premium" : "";
  const scoring = (l.scoring ?? []).join("/") || "PPR";
  return `${l.total_teams ?? "?"}-team ${l.format ?? "dynasty"}, ${qb}, ${scoring}${tep}`;
}

function rosterLines(players: StatePlayer[] | undefined): string {
  const groups = new Map<string, string[]>();
  for (const p of players ?? []) {
    const pos = p.pos ?? "?";
    const label = p.age != null ? `${p.name} (${p.age})` : p.name;
    groups.set(pos, [...(groups.get(pos) ?? []), label]);
  }
  const order = ["QB", "RB", "WR", "TE", "K", "DST"];
  const keys = [...groups.keys()].sort(
    (a, b) =>
      (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) -
      (order.indexOf(b) === -1 ? 99 : order.indexOf(b)),
  );
  return keys.map((k) => `${k}: ${groups.get(k)!.join(", ")}`).join("\n");
}

/**
 * What a manager realistically pastes into ChatGPT / Claude: the league
 * format, their record, and their roster (names + ages). When the question
 * names an opponent, they paste that opponent's roster too. No values, no
 * engine output: that is exactly the edge Coach is supposed to have.
 */
export function baselinePaste(args: {
  leagues: LeagueUnderTest[];
  opponentsMentioned: string[];
}): string {
  const parts: string[] = [];
  for (const lg of args.leagues) {
    const s = lg.state;
    parts.push(
      [
        `League: ${lg.name} (${formatLine(s)})`,
        `My record: ${s.me?.record ?? "unknown"}`,
        "My roster:",
        rosterLines(s.me?.players),
      ].join("\n"),
    );
    for (const owner of args.opponentsMentioned) {
      const o = (s.opponents ?? []).find((x) => x.owner === owner);
      if (o) parts.push(`${owner}'s roster:\n${rosterLines(o.roster)}`);
    }
  }
  return parts.join("\n\n");
}

/**
 * Compact per-league summary the judge uses for cross-league questions
 * (full <current_state> for every league would not fit a sane budget).
 */
export function compactLeagueSummary(lg: LeagueUnderTest): string {
  const s = lg.state;
  const opps = (s.opponents ?? [])
    .map(
      (o) =>
        `- ${o.owner} (roster value ${Math.round(rosterValue(o.roster))}): ` +
        byValue(o.roster ?? [])
          .slice(0, 8)
          .map((p) => `${p.name} ${p.pos ?? ""} ${p.value ?? "?"}`)
          .join(", "),
    )
    .join("\n");
  const mine = byValue(s.me?.players ?? [])
    .map((p) => `${p.name} ${p.pos ?? ""} age ${p.age ?? "?"} val ${p.value ?? "?"}`)
    .join("; ");
  return [
    `### ${lg.name} (${formatLine(s)})`,
    `My record ${s.me?.record ?? "?"}, roster value ${Math.round(rosterValue(s.me?.players))}`,
    `My players: ${mine}`,
    `Opponents (top assets):`,
    opps,
  ].join("\n");
}
