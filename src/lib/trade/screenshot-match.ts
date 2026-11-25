/**
 * Trade screenshot matcher (pure, no IO).
 *
 * The vision reader (`screenshot-read.ts`) returns what the screenshot
 * SAYS: abbreviated names ("C. Stroud"), position + team tags, pick
 * labels, and which manager receives which assets. This module turns
 * that into what the trade engine NEEDS: canonical player names, pick
 * labels, and the user's side (you send / you receive), resolved
 * against the league's real rosters.
 *
 * Side resolution, strongest evidence first:
 *   1. A party's manager name matches the user's league display name.
 *   2. Roster ownership: the user's roster owns players that a party
 *      receives, so the user is the OTHER party (they send those).
 *   3. A party's manager matches another league member, so the user is
 *      the remaining party.
 * When none of these fire, the read is flagged `side_confidence: "low"`
 * and the confirm step asks the user to check (with a one-tap swap).
 *
 * Pure so it is testable against fixtures of the two real Sleeper
 * formats (league-chat trade card, trade-offer screen).
 */

import { normalizePosition } from "@/lib/strategy/archetypes/schema";

export type ExtractedAsset = {
  kind: "player" | "pick";
  /** Player name as printed ("C. Stroud" or "Jayden Reed"). */
  name: string | null;
  position: string | null;
  team: string | null;
  season: number | null;
  round: number | null;
  /** Pick's original owner as printed ("via jwatts0723" / "(jwatts0723)"). */
  original_owner: string | null;
  raw_text: string;
};

export type ExtractedParty = {
  manager: string | null;
  receives: ExtractedAsset[];
};

export type ExtractedTrade = {
  format: "chat_card" | "offer_screen" | "other" | "not_a_trade";
  parties: ExtractedParty[];
  league_name: string | null;
};

export type MatchPlayer = {
  player_id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  team?: string | null;
  search_rank?: number | null;
};

export type MatchRoster = {
  roster_id: number;
  /** Display names (and usernames when known) of every owner / co-owner. */
  manager_names: string[];
  player_ids: string[];
};

export type MatchConfidence = "exact" | "likely" | "ambiguous" | "unmatched";

export type MatchedAsset = {
  kind: "player" | "pick";
  /** The label the trade engine receives ("C.J. Stroud", "2028 2nd (via jwatts0723)"). */
  label: string;
  /** What the screenshot printed, for the confirm step. */
  read_as: string;
  confidence: MatchConfidence;
  player_id: string | null;
  /** "QB · HOU" style sublabel. */
  detail: string | null;
  /** Roster that owns the player today (null for picks / free agents). */
  owner_roster_id: number | null;
  /**
   * Look-alikes the screenshot cannot tell apart from `label` (same
   * initial, surname, position, team). Non-empty means the user must
   * pick; `label` is only the roster-backed best guess.
   */
  alternatives: AssetChoice[];
};

export type AssetChoice = {
  player_id: string;
  label: string;
  detail: string;
  owner_roster_id: number | null;
};

export type ScreenshotTradeMatch = {
  you_send: MatchedAsset[];
  you_receive: MatchedAsset[];
  other_manager: string | null;
  side_confidence: "high" | "low";
  side_reason: string;
  /** Plain-language problems the confirm step should show. */
  warnings: string[];
};

const ORDINAL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };
export function ordinal(n: number): string {
  return ORDINAL[n] ?? `${n}th`;
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Lowercase, strip punctuation, drop generational suffixes. */
export function nameTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/['-]/g, "")
    .split(/\s+/)
    .filter((t) => t && !SUFFIXES.has(t));
}

function normHandle(raw: string | null | undefined): string {
  return (raw ?? "").toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
}

function normPos(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Canonical DEF = DST merge; keep non-fantasy positions as printed.
  return normalizePosition(raw.trim()) ?? raw.trim().toUpperCase();
}

function playerLabel(p: MatchPlayer): string {
  return (
    p.full_name ||
    [p.first_name, p.last_name].filter(Boolean).join(" ") ||
    p.player_id
  );
}

/**
 * Resolve one printed player against the player pool. Prefers players
 * rostered in this league (a trade card only shows rostered players),
 * then position + team agreement, then Sleeper search rank.
 *
 * Look-alike guard: Sleeper cards print "B. Robinson", so two active
 * players can share a first initial, surname, position, and even a team
 * (Bijan Robinson and Brian Robinson Jr. were both "B. Robinson, RB").
 * Every other active player the PRINTED text cannot tell apart from the
 * pick is returned in `alternatives` and the match is `ambiguous`, so
 * the confirm step asks "which player do you mean?" instead of
 * guessing. Computed from the live player pool on every read, so the
 * look-alike list maintains itself as rosters change.
 */
export function matchPlayer(
  asset: ExtractedAsset,
  pool: MatchPlayer[],
  ownerByPlayerId: Map<string, number>,
): {
  player: MatchPlayer;
  confidence: MatchConfidence;
  alternatives: MatchPlayer[];
} | null {
  const printed = nameTokens(asset.name ?? asset.raw_text);
  if (printed.length === 0) return null;
  const last = printed[printed.length - 1];
  const first = printed.length > 1 ? printed[0] : null;
  // "C. Stroud" prints an initial; "Jayden Reed" prints the full first.
  const firstIsInitial = first !== null && first.length <= 2;
  const pos = normPos(asset.position);
  const team = asset.team ? asset.team.toUpperCase().trim() : null;

  type Scored = {
    p: MatchPlayer;
    score: number;
    nameExact: boolean;
    /** Printed name, position, and team all agree: indistinguishable. */
    lookalike: boolean;
  };
  const scored: Scored[] = [];
  for (const p of pool) {
    const lastTokens = nameTokens(p.last_name ?? "");
    const pLast = lastTokens.length > 0 ? lastTokens.join("") : null;
    if (!pLast || pLast !== last) continue;
    const pFirst = nameTokens(p.first_name ?? "").join("");
    let nameExact = false;
    if (first) {
      if (firstIsInitial) {
        // "C.J." prints as "C." on Sleeper cards: compare first letter.
        if (!pFirst.startsWith(first[0])) continue;
      } else if (pFirst !== first) {
        // Allow nickname drift only when position + team both agree.
        if (!(pos && team && normPos(p.position) === pos && p.team === team)) {
          continue;
        }
      } else {
        nameExact = true;
      }
    }
    const posAgrees = !pos || normPos(p.position) === pos;
    const teamAgrees = !team || p.team === team;
    const rostered = ownerByPlayerId.has(p.player_id);
    const active = rostered || Boolean(p.team);
    let score = 0;
    if (rostered) score += 100;
    if (pos && posAgrees) score += 40;
    else if (pos && p.position) score -= 60;
    if (team && teamAgrees) score += 30;
    else if (team && p.team) score -= 10;
    if (nameExact) score += 20;
    score -= Math.min((p.search_rank ?? 9999) / 1000, 9);
    scored.push({
      p,
      score,
      nameExact,
      lookalike: posAgrees && teamAgrees && active && (nameExact || firstIsInitial || !first),
    });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const runnerUp = scored[1];
  const alternatives = best.lookalike
    ? scored.slice(1).filter((s) => s.lookalike && !(best.nameExact && !s.nameExact)).map((s) => s.p)
    : [];
  if (alternatives.length > 0) {
    return { player: best.p, confidence: "ambiguous", alternatives };
  }
  const posOk = !pos || normPos(best.p.position) === pos;
  const teamOk = !team || best.p.team === team;
  const clearWinner =
    !runnerUp ||
    best.score - runnerUp.score >= 25 ||
    (best.nameExact && !runnerUp.nameExact);
  const rostered = ownerByPlayerId.has(best.p.player_id);
  const confidence: MatchConfidence =
    posOk && teamOk && clearWinner && (rostered || best.nameExact)
      ? "exact"
      : "likely";
  return { player: best.p, confidence, alternatives: [] };
}

function playerDetail(p: MatchPlayer): string {
  return [p.position, p.team ?? "FA"].filter(Boolean).join(" · ");
}

function pickLabel(a: ExtractedAsset): { label: string; ok: boolean } {
  if (a.season && a.round) {
    const via = a.original_owner ? ` (via ${a.original_owner.replace(/^@/, "")})` : "";
    return { label: `${a.season} ${ordinal(a.round)}${via}`, ok: true };
  }
  return { label: a.raw_text.trim(), ok: false };
}

function resolveAssets(
  assets: ExtractedAsset[],
  pool: MatchPlayer[],
  ownerByPlayerId: Map<string, number>,
  warnings: string[],
): MatchedAsset[] {
  const out: MatchedAsset[] = [];
  for (const a of assets) {
    if (a.kind === "pick") {
      const { label, ok } = pickLabel(a);
      if (!ok) warnings.push(`Could not read the year or round for "${a.raw_text}".`);
      out.push({
        kind: "pick",
        label,
        read_as: a.raw_text,
        confidence: ok ? "exact" : "unmatched",
        player_id: null,
        detail: a.original_owner ? `Original owner ${a.original_owner}` : "Rookie pick",
        owner_roster_id: null,
        alternatives: [],
      });
      continue;
    }
    const hit = matchPlayer(a, pool, ownerByPlayerId);
    if (!hit) {
      warnings.push(`No player match for "${a.raw_text}". Fix it before evaluating.`);
      out.push({
        kind: "player",
        label: a.name ?? a.raw_text,
        read_as: a.raw_text,
        confidence: "unmatched",
        player_id: null,
        detail: [a.position, a.team].filter(Boolean).join(" · ") || null,
        owner_roster_id: null,
        alternatives: [],
      });
      continue;
    }
    if (hit.confidence === "likely") {
      warnings.push(`"${a.raw_text}" read as ${playerLabel(hit.player)}. Confirm.`);
    }
    if (hit.confidence === "ambiguous") {
      const names = [hit.player, ...hit.alternatives].map(playerLabel).join(" or ");
      warnings.push(`"${a.raw_text}" could be ${names}. Pick the right one.`);
    }
    out.push({
      kind: "player",
      label: playerLabel(hit.player),
      read_as: a.raw_text,
      confidence: hit.confidence,
      player_id: hit.player.player_id,
      detail: playerDetail(hit.player),
      owner_roster_id: ownerByPlayerId.get(hit.player.player_id) ?? null,
      alternatives: hit.alternatives.map((p) => ({
        player_id: p.player_id,
        label: playerLabel(p),
        detail: playerDetail(p),
        owner_roster_id: ownerByPlayerId.get(p.player_id) ?? null,
      })),
    });
  }
  return out;
}

export function matchScreenshotTrade(args: {
  extracted: ExtractedTrade;
  pool: MatchPlayer[];
  rosters: MatchRoster[];
  /** The user's roster id in this league, if known. */
  myRosterId: number | null;
}): ScreenshotTradeMatch {
  const { extracted, pool, rosters, myRosterId } = args;
  const warnings: string[] = [];

  const ownerByPlayerId = new Map<string, number>();
  for (const r of rosters) for (const id of r.player_ids) ownerByPlayerId.set(id, r.roster_id);

  const parties = extracted.parties.filter((p) => p.receives.length > 0);
  if (parties.length !== 2) {
    throw new ScreenshotReadError(
      parties.length > 2
        ? "This reads as a trade with more than two teams. Enter it by hand for now."
        : "Could not find both sides of a trade in this screenshot.",
    );
  }

  const resolved = parties.map((p) => ({
    manager: p.manager,
    assets: resolveAssets(p.receives, pool, ownerByPlayerId, warnings),
  }));

  const rosterOfManager = (name: string | null): number | null => {
    const h = normHandle(name);
    if (!h) return null;
    for (const r of rosters) {
      if (r.manager_names.some((m) => normHandle(m) === h)) return r.roster_id;
    }
    return null;
  };

  // Which party IS the user. -1 = unknown.
  let me = -1;
  let reason = "";
  let confident = true;

  // 1. Manager name match.
  if (myRosterId !== null) {
    const idx = resolved.findIndex((p) => rosterOfManager(p.manager) === myRosterId);
    if (idx >= 0) {
      me = idx;
      reason = `Matched @${resolved[idx].manager?.replace(/^@/, "")} to your team.`;
    }
  }

  // 2. Roster ownership: the party receiving MY players is the other side.
  if (me < 0 && myRosterId !== null) {
    const owns = resolved.map(
      (p) => p.assets.filter((a) => a.owner_roster_id === myRosterId).length,
    );
    if (owns[0] !== owns[1]) {
      me = owns[0] > owns[1] ? 1 : 0;
      reason = "Your roster owns the players on the other side.";
    }
  }

  // 3. The other manager is a known league member; you are the rest.
  if (me < 0) {
    const known = resolved.map((p) => rosterOfManager(p.manager));
    const otherIdx = known.findIndex((rid) => rid !== null && rid !== myRosterId);
    if (otherIdx >= 0) {
      me = otherIdx === 0 ? 1 : 0;
      reason = `@${resolved[otherIdx].manager?.replace(/^@/, "")} is the other manager.`;
    }
  }

  if (me < 0) {
    me = 0;
    confident = false;
    reason = "Could not tell which side is yours. Check the sides.";
  }

  const mine = resolved[me];
  const theirs = resolved[me === 0 ? 1 : 0];

  // Sanity: a player I "receive" that already sits on my roster means
  // the sides are probably flipped.
  if (
    myRosterId !== null &&
    mine.assets.some((a) => a.owner_roster_id === myRosterId)
  ) {
    confident = false;
    reason = "Some players you would receive are already on your roster. Check the sides.";
  }

  // The trade does not involve the user at all.
  if (myRosterId !== null) {
    const myRosterInvolved =
      [...mine.assets, ...theirs.assets].some((a) => a.owner_roster_id === myRosterId) ||
      rosterOfManager(mine.manager) === myRosterId;
    const bothNamedOthers =
      resolved.every((p) => {
        const rid = rosterOfManager(p.manager);
        return rid !== null && rid !== myRosterId;
      });
    if (!myRosterInvolved && bothNamedOthers) {
      warnings.push("Neither side of this trade is your team. The read assumes you are one side.");
      confident = false;
    }
  }

  const otherManager = theirs.manager ? theirs.manager.replace(/^@/, "") : null;
  return {
    // The user SENDS what the other party receives.
    you_send: theirs.assets,
    you_receive: mine.assets,
    other_manager: otherManager,
    side_confidence: confident ? "high" : "low",
    side_reason: reason,
    warnings,
  };
}

export class ScreenshotReadError extends Error {}
