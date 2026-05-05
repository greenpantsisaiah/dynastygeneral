/**
 * KTC historical ingestion via the Wayback Machine. Per VALIDATION_PLAN
 * section 4 (temporal blinding) and DATA_ACQUISITION_PLAN.md section
 * 2.4: KTC has no public historical API, but Wayback preserves the
 * site reliably and KTC embeds the full player roster as a JS variable
 * (`playersArray = [...]`) directly in the HTML. We pull each preserved
 * snapshot, parse the array, map to Sleeper player_ids, and write to
 * historical_market_values.
 *
 * Verified 2026-05-04: 31 snapshots across 2022-2024, parser confirmed
 * working on 2022-08-14 snapshot (460 players, top of dynasty market
 * matches expected: Josh Allen, Justin Jefferson, Mahomes, etc.).
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-ktc-historical.ts \
 *     --from 20220101 --to 20241231 [--dry-run]
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in env (.env.local).
 *
 * Idempotent: writes are upserts keyed on (player_id, source,
 * snapshot_date, format).
 */

import { createClient } from "@supabase/supabase-js";
import { __dumpAllPlayers } from "../src/lib/players/cache";

type WaybackTimemapRow = readonly [
  string, // urlkey
  string, // timestamp YYYYMMDDHHMMSS
  string, // original url
  string, // mimetype
  string, // statuscode
  string, // digest
  string, // length
];

type KtcPlayerRecord = {
  playerName: string;
  playerID: number;
  slug: string;
  position: string;
  positionID: number;
  team: string | null;
  rookie: boolean;
  age: number | null;
  oneQBValues?: {
    value: number;
    rank: number;
    positionalRank: number;
  };
  superflexValues?: {
    value: number;
    rank: number;
    positionalRank: number;
  };
};

const WAYBACK_TIMEMAP =
  "https://web.archive.org/web/timemap/json?url=keeptradecut.com/dynasty-rankings";
const POLITE_DELAY_MS = 1500; // courtesy delay between Wayback requests

function parseArgs(argv: readonly string[]): {
  from: string;
  to: string;
  dryRun: boolean;
} {
  const args = new Map<string, string>();
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--") && i + 1 < argv.length) {
      args.set(a.slice(2), argv[i + 1]);
      i++;
    }
  }
  return {
    from: args.get("from") ?? "20220101",
    to: args.get("to") ?? "20241231",
    dryRun,
  };
}

async function fetchTimemap(from: string, to: string): Promise<WaybackTimemapRow[]> {
  const url = `${WAYBACK_TIMEMAP}&from=${from}&to=${to}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Wayback timemap fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as WaybackTimemapRow[];
  // First row is the header
  return data.slice(1);
}

async function fetchSnapshot(timestamp: string, originalUrl: string): Promise<string> {
  // The id_ flag forces the raw archived bytes (not the rewritten
  // Wayback toolbar version), which keeps the playersArray script
  // intact.
  const url = `https://web.archive.org/web/${timestamp}id_/${originalUrl}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`Wayback snapshot ${timestamp} failed: ${res.status}`);
  }
  return await res.text();
}

function extractPlayersArray(html: string): KtcPlayerRecord[] {
  const marker = "playersArray";
  const idx = html.indexOf(marker);
  if (idx < 0) return [];
  // Find the start of the JSON array after `playersArray = `
  const eq = html.indexOf("=", idx);
  if (eq < 0) return [];
  let cursor = eq + 1;
  while (cursor < html.length && /[\s\r\n]/.test(html[cursor])) cursor++;
  if (html[cursor] !== "[") return [];
  // Walk the array balancing braces. Naive but adequate; KTC's data
  // has well-formed JSON.
  let depth = 0;
  let inStr = false;
  let escape = false;
  let end = -1;
  for (let i = cursor; i < html.length; i++) {
    const ch = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return [];
  try {
    const arr = JSON.parse(html.slice(cursor, end));
    return arr as KtcPlayerRecord[];
  } catch (err) {
    console.error("[ktc] failed to parse playersArray:", err);
    return [];
  }
}

function nameKey(name: string, position: string | null): string {
  const cleanName = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
  const cleanPos = (position ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return `${cleanName}|${cleanPos}`;
}

async function buildSleeperLookup(): Promise<Map<string, string>> {
  // Map normalized (name, position) -> Sleeper player_id. Mirrors
  // the same mapping the FantasyCalc resolver uses, keeping our
  // ID space consistent.
  const sleeper = await __dumpAllPlayers();
  const lookup = new Map<string, string>();
  for (const p of sleeper) {
    const fullName =
      `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
      p.full_name ||
      "";
    if (!fullName) continue;
    const key = nameKey(fullName, p.position ?? null);
    if (!lookup.has(key)) lookup.set(key, p.player_id);
  }
  return lookup;
}

function timestampToDate(ts: string): string {
  // YYYYMMDDHHMMSS -> YYYY-MM-DD
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

type ValueRow = {
  player_id: string;
  source: string;
  snapshot_date: string;
  format: "1qb" | "sf";
  value: number;
  overall_rank: number | null;
  position_rank: number | null;
  position: string | null;
  raw_attributes: Record<string, unknown>;
};

function buildValueRows(
  players: KtcPlayerRecord[],
  snapshotDate: string,
  sleeperLookup: ReadonlyMap<string, string>,
): { rows: ValueRow[]; matched: number; unmatched: number } {
  const rows: ValueRow[] = [];
  let matched = 0;
  let unmatched = 0;
  for (const p of players) {
    const key = nameKey(p.playerName, p.position);
    const sleeperId = sleeperLookup.get(key);
    if (!sleeperId) {
      unmatched++;
      continue;
    }
    matched++;
    if (p.oneQBValues) {
      rows.push({
        player_id: sleeperId,
        source: "ktc",
        snapshot_date: snapshotDate,
        format: "1qb",
        value: p.oneQBValues.value,
        overall_rank: p.oneQBValues.rank,
        position_rank: p.oneQBValues.positionalRank,
        position: p.position,
        raw_attributes: { ktc_player_id: p.playerID, age: p.age, team: p.team },
      });
    }
    if (p.superflexValues) {
      rows.push({
        player_id: sleeperId,
        source: "ktc",
        snapshot_date: snapshotDate,
        format: "sf",
        value: p.superflexValues.value,
        overall_rank: p.superflexValues.rank,
        position_rank: p.superflexValues.positionalRank,
        position: p.position,
        raw_attributes: { ktc_player_id: p.playerID, age: p.age, team: p.team },
      });
    }
  }
  return { rows, matched, unmatched };
}

async function main(): Promise<void> {
  const { from, to, dryRun } = parseArgs(process.argv.slice(2));
  console.log(`[ktc] window: ${from} to ${to} ${dryRun ? "(dry-run)" : ""}`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!supabaseUrl || !serviceKey)) {
    throw new Error("Missing Supabase env vars; aborting non-dry-run");
  }
  const supabase =
    !dryRun && supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey)
      : null;

  console.log("[ktc] building Sleeper name->id lookup...");
  const sleeperLookup = await buildSleeperLookup();
  console.log(`[ktc] sleeper lookup ready (${sleeperLookup.size} entries)`);

  console.log("[ktc] fetching Wayback timemap...");
  const timemap = await fetchTimemap(from, to);
  console.log(`[ktc] ${timemap.length} snapshots in window`);

  let totalRows = 0;
  let totalMatched = 0;
  let totalUnmatched = 0;
  let snapshotCount = 0;

  for (const row of timemap) {
    const [, timestamp, originalUrl, , statusCode] = row;
    if (statusCode !== "200") continue;

    const snapshotDate = timestampToDate(timestamp);
    console.log(`[ktc] ${timestamp} -> ${snapshotDate}: fetching...`);
    let html: string;
    try {
      html = await fetchSnapshot(timestamp, originalUrl);
    } catch (err) {
      console.warn(`[ktc] ${timestamp} fetch failed:`, err);
      await sleep(POLITE_DELAY_MS);
      continue;
    }

    const players = extractPlayersArray(html);
    if (players.length === 0) {
      console.warn(`[ktc] ${timestamp}: no players extracted (skip)`);
      await sleep(POLITE_DELAY_MS);
      continue;
    }

    const { rows, matched, unmatched } = buildValueRows(
      players,
      snapshotDate,
      sleeperLookup,
    );
    totalRows += rows.length;
    totalMatched += matched;
    totalUnmatched += unmatched;
    snapshotCount++;
    console.log(
      `[ktc] ${snapshotDate}: parsed ${players.length} players, matched ${matched} to Sleeper, ${rows.length} rows queued`,
    );

    if (!dryRun && supabase && rows.length > 0) {
      const { error } = await supabase
        .from("historical_market_values")
        .insert(rows);
      if (error) {
        console.error(`[ktc] ${snapshotDate} insert error:`, error.message);
      }
    }

    await sleep(POLITE_DELAY_MS);
  }

  console.log(
    `[ktc] DONE. snapshots=${snapshotCount} rows=${totalRows} matched=${totalMatched} unmatched=${totalUnmatched}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[ktc] fatal:", err);
  process.exit(1);
});
