/**
 * Replays a committed real-league snapshot (evals/fixtures/real-leagues)
 * through the live pipeline by serving Sleeper and FantasyCalc requests
 * from the snapshot instead of the network. Cloud sessions cannot reach
 * Sleeper, so this is how a render "with real data" runs there
 * (docs/team/QUALITY_BAR.md). Unknown URLs throw, so a render can never
 * silently mix live and captured data.
 */

import type { RealLeagueSnapshot } from "../../evals/fixtures/real-leagues/load";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

export function installSnapshotFetch(snap: RealLeagueSnapshot): () => void {
  const original = globalThis.fetch;
  const leagues = new Map(snap.leagues.map((l) => [l.league.league_id, l]));
  const drafts = new Map<string, Record<string, unknown>>();
  const picks = new Map<string, unknown[]>();
  for (const l of snap.leagues) {
    for (const d of l.drafts) drafts.set(String(d.draft_id), d);
    for (const [id, p] of Object.entries(l.draft_picks)) picks.set(id, p);
  }

  const replay = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "api.sleeper.com") return json([]); // stats + projections: not captured
    if (url.hostname === "api.sleeper.app") {
      const p = url.pathname.replace(/^\/v1/, "");
      let m: RegExpMatchArray | null;
      if (p === "/state/nfl") return json(snap.nfl_state);
      if (p === "/players/nfl") return json(snap.players);
      if ((m = p.match(/^\/user\/([^/]+)$/))) {
        const id = decodeURIComponent(m[1]).toLowerCase();
        return json(id === snap.user.username.toLowerCase() || id === snap.user.user_id ? snap.user : null);
      }
      if ((m = p.match(/^\/user\/([^/]+)\/leagues\/nfl\/[^/]+$/))) return json(snap.leagues.map((l) => l.league));
      if ((m = p.match(/^\/league\/([^/]+)(\/.*)?$/))) {
        const l = leagues.get(decodeURIComponent(m[1]));
        if (!l) return json(null);
        const rest = m[2] ?? "";
        if (rest === "") return json(l.league);
        if (rest === "/rosters") return json(l.rosters);
        if (rest === "/users") return json(l.users);
        if (rest === "/traded_picks") return json(l.traded_picks);
        if (rest === "/drafts") return json(l.drafts);
        if (rest.startsWith("/matchups/")) {
          const wk = rest.split("/")[2];
          // A missing week must fail loudly: an empty schedule silently
          // shrinks the remaining season and inflates every playoff chance.
          if (!(wk in l.matchups)) throw new Error(`snapshot-replay: week ${wk} matchups not captured for ${l.league.name}; re-capture`);
          return json(l.matchups[wk]);
        }
        if (rest.startsWith("/transactions/")) return json([]);
        if (rest === "/winners_bracket" || rest === "/losers_bracket") return json([]);
      }
      if ((m = p.match(/^\/draft\/([^/]+)\/picks$/))) return json(picks.get(m[1]) ?? []);
      if ((m = p.match(/^\/draft\/([^/]+)$/))) return json(drafts.get(m[1]) ?? null);
      if (p.startsWith("/stats/") || p.startsWith("/projections/")) return json([]);
    }
    if (url.hostname === "api.fantasycalc.com") {
      const key = `${url.searchParams.get("numQbs")}:${url.searchParams.get("ppr")}`;
      const v = (snap.fantasycalc as Record<string, unknown>)[key];
      if (v) return json(v);
    }
    if (process.env.SNAPSHOT_REPLAY_ALLOW_NETWORK === "1") return original(input, init);
    throw new Error(`snapshot-replay: no captured response for ${url.href}`);
  };
  globalThis.fetch = replay as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}
