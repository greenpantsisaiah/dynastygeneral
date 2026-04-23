/**
 * GET /api/players/search?q=<query>
 *
 * Lightweight player + future-pick autocomplete. Returns top 10 matches
 * sorted by search_rank. Designed for the trade form's token input;
 * not a general-purpose search API.
 *
 * Future picks are synthesized server-side: any query like "2027",
 * "2027 1", or "1.01" gets matched against the upcoming-pick templates.
 */

import { NextResponse } from "next/server";
import { __dumpAllPlayers, humanize } from "@/lib/players/cache";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";

export const runtime = "nodejs";
// Cached at the edge for 10 minutes per query; the underlying player
// cache is hours-stale anyway and queries repeat.
export const revalidate = 600;

const DYNASTY_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);
const MAX_RESULTS = 10;

const ROUND_ORDINALS: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "5th",
};

function buildPickSuggestions(q: string, currentYear: number): SearchHit[] {
  // Match patterns: bare year ("2027"), year+round ("2027 2"), or
  // dotted format ("2.01"). Free-form picks pass through the form
  // anyway; this just helps the user not have to type them in full.
  const out: SearchHit[] = [];
  const yearMatch = q.match(/^(20\d{2})\s*(?:(\d)(?:st|nd|rd|th)?)?$/i);
  const dotMatch = q.match(/^(\d)\.(\d{1,2})$/);
  const seasons: number[] = [];
  if (yearMatch) {
    const yr = parseInt(yearMatch[1], 10);
    if (yr >= currentYear && yr <= currentYear + 5) seasons.push(yr);
  } else if (q.length === 0 || /^20/.test(q)) {
    // bare empty / starts with 20: suggest next 2 years
    seasons.push(currentYear, currentYear + 1, currentYear + 2);
  }
  for (const yr of seasons) {
    const explicitRound = yearMatch?.[2]
      ? parseInt(yearMatch[2], 10)
      : null;
    const rounds = explicitRound ? [explicitRound] : [1, 2, 3, 4];
    for (const round of rounds) {
      const ordinal = ROUND_ORDINALS[round] ?? `${round}th`;
      const label = `${yr} ${ordinal}`;
      out.push({
        id: `pick:${yr}:${round}`,
        label,
        sublabel: "rookie pick",
        kind: "pick",
      });
    }
  }
  if (dotMatch) {
    out.push({
      id: `pick-slot:${dotMatch[0]}`,
      label: dotMatch[0],
      sublabel: "draft slot",
      kind: "pick",
    });
  }
  return out.slice(0, 4);
}

type SearchHit = {
  id: string;
  label: string;
  sublabel: string;
  kind: "player" | "pick";
};

// Cap query length so an attacker can't send 10KB strings into the
// case-insensitive substring scan. Real player names + pick formats
// fit comfortably in 32 chars.
const MAX_QUERY_LENGTH = 32;

export async function GET(req: Request) {
  const rate = await checkRateLimit("players-search", clientIpFrom(req));
  if (!rate.allowed) {
    return NextResponse.json(
      { results: [], error: "rate_limited" },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil(rate.reset_ms / 1000)) },
      },
    );
  }
  const url = new URL(req.url);
  let q = (url.searchParams.get("q") ?? "").trim();
  if (q.length > MAX_QUERY_LENGTH) q = q.slice(0, MAX_QUERY_LENGTH);
  const currentYear = new Date().getFullYear();

  // Synthesize pick suggestions FIRST so they appear up top when query
  // looks year-shaped. Drop any beyond the player count so we don't
  // overflow the dropdown.
  const pickHits = buildPickSuggestions(q, currentYear);

  // Player matches: prefix on full name OR last name. Cheap substring
  // (case-insensitive) is fine for top-500-by-search-rank candidates.
  const all = await __dumpAllPlayers();
  const qLower = q.toLowerCase();
  const playerHits: SearchHit[] = [];
  if (q.length >= 1) {
    const candidates = all
      .filter((p) => {
        const pos = (p.position ?? "").toUpperCase();
        if (!DYNASTY_POSITIONS.has(pos)) return false;
        if (typeof p.search_rank !== "number" || p.search_rank <= 0)
          return false;
        return true;
      })
      .filter((p) => {
        const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`
          .toLowerCase();
        const full = (p.full_name ?? name).toLowerCase();
        return full.startsWith(qLower) || full.includes(` ${qLower}`);
      })
      .sort((a, b) => (a.search_rank ?? 9999) - (b.search_rank ?? 9999))
      .slice(0, MAX_RESULTS);

    for (const p of candidates) {
      const h = humanize(p);
      playerHits.push({
        id: h.id,
        label: h.name,
        sublabel: `${h.position ?? ""}${h.team ? `-${h.team}` : ""}${
          h.age ? `, age ${h.age}` : ""
        }`.trim(),
        kind: "player",
      });
    }
  }

  // Picks first (when relevant), then players. Cap total at MAX_RESULTS.
  const results = [...pickHits, ...playerHits].slice(0, MAX_RESULTS);
  return NextResponse.json({ results });
}
