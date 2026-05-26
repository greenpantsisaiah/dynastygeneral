/**
 * Ingest the "data right" Stage 3 unlock signals into production
 * `player_signals`: NFL draft capital (Tier 1) and an athletic composite
 * computed from the free nflverse combine (Tier 2). Authorized by founder
 * on 2026-05-26 after the read-only validation showed draft capital is a
 * real marginal projection signal (residualized -0.10 overall, -0.40 for
 * young; n=626) and the athletic composite, while weak as a projection
 * signal, lights up the inflection "Athletic decline" rows that currently
 * render data_missing. Per ARCHITECTURE_UNIFICATION_PLAN.md Phase 3 and
 * DATA_ACQUISITION_PHASE3.md.
 *
 * Sources (free + redistributable):
 *   - DynastyProcess crosswalk db_playerids.csv (GPL-3.0): sleeper_id <->
 *     gsis_id <-> pfr_id, plus draft_ovr per player. The load-bearing
 *     enabler.
 *   - nflverse combine.csv (CC-BY-4.0): per-player combine measurables
 *     keyed by pfr_id (forty, vertical, broad_jump, cone, shuttle).
 *
 * Writes (production Supabase, service-role; only with --write):
 *   - player_signals.draft_pick_no  (the overall NFL draft pick)
 *   - player_signals.draft_round    (derived: ceil(pick/32))
 *   - player_signals.position       (from crosswalk; ensures new rows are
 *                                    classifiable downstream)
 *   - player_signals.ras            (our position-relative athletic
 *                                    composite from nflverse combine; the
 *                                    column is repurposed because the
 *                                    proprietary RAS score is not
 *                                    redistributable; source_attribution
 *                                    makes the distinction explicit)
 *   - player_signals.source_attribution  (per-field source + license)
 *   - player_signals.confidence_per_field (validated vs partial)
 *   - player_signals.last_updated, updated_by
 *
 * Upsert is keyed on player_id (Sleeper id); only the columns this script
 * sets are touched. The athletic composite is a position-relative
 * percentile average of the available measurables (forty / cone / shuttle
 * lower-is-better; vertical / broad higher-is-better). It is NOT the
 * proprietary Kent Lee Platte RAS score, which has no free
 * redistributable license.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-unlock-signals.ts
 *     (default dry-run; prints what would be written, writes nothing)
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-unlock-signals.ts --write
 *     (actually writes; service-role key required)
 *
 * The script is re-runnable (upsert, not insert). Unmatched players are
 * logged per row so any crosswalk gap is visible, never silent.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

const CROSSWALK_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";
const COMBINE_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/combine/combine.csv";
const CHUNK = 500;

function parseArgs(argv: string[]): { write: boolean } {
  let write = false;
  for (const a of argv) if (a === "--write") write = true;
  return { write };
}

// Minimal CSV parser: handles quoted fields with commas / escaped quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        cur = "";
        rows.push(row);
        row = [];
      } else if (c === "\r") {
        // skip
      } else cur += c;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

type CrosswalkRow = {
  sleeper_id: string;
  pfr_id: string | null;
  position: string | null;
  draft_ovr: number | null;
};

async function loadCrosswalk(): Promise<Map<string, CrosswalkRow>> {
  console.log(`[unlock] fetching crosswalk: ${CROSSWALK_URL}`);
  const resp = await fetch(CROSSWALK_URL);
  if (!resp.ok)
    throw new Error(`crosswalk fetch failed: ${resp.status} ${resp.statusText}`);
  const rows = parseCsv(await resp.text());
  const header = rows[0];
  const cSleeper = header.indexOf("sleeper_id");
  const cPfr = header.indexOf("pfr_id");
  const cPos = header.indexOf("position");
  const cDraft = header.indexOf("draft_ovr");
  if ([cSleeper, cPfr, cPos, cDraft].some((i) => i < 0))
    throw new Error("crosswalk missing required columns");
  const out = new Map<string, CrosswalkRow>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const sid = r[cSleeper];
    if (!sid) continue;
    const draft = Number(r[cDraft]);
    out.set(sid, {
      sleeper_id: sid,
      pfr_id: r[cPfr] || null,
      position: r[cPos] || null,
      draft_ovr: Number.isFinite(draft) && draft > 0 ? draft : null,
    });
  }
  console.log(`[unlock] crosswalk: ${out.size} sleeper_id rows`);
  return out;
}

type CombineMeas = {
  pfr_id: string;
  pos: string;
  forty?: number;
  vertical?: number;
  broad?: number;
  cone?: number;
  shuttle?: number;
};

async function loadCombine(): Promise<CombineMeas[]> {
  console.log(`[unlock] fetching nflverse combine: ${COMBINE_URL}`);
  const resp = await fetch(COMBINE_URL);
  if (!resp.ok)
    throw new Error(`combine fetch failed: ${resp.status} ${resp.statusText}`);
  const rows = parseCsv(await resp.text());
  const h = rows[0];
  const cPfr = h.indexOf("pfr_id");
  const cPos = h.indexOf("pos");
  const cForty = h.indexOf("forty");
  const cVert = h.indexOf("vertical");
  const cBroad = h.indexOf("broad_jump");
  const cCone = h.indexOf("cone");
  const cShut = h.indexOf("shuttle");
  if (cPfr < 0 || cPos < 0)
    throw new Error("combine missing pfr_id or pos column");
  const out: CombineMeas[] = [];
  const num = (s: string | undefined) => {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[cPfr]) continue;
    out.push({
      pfr_id: r[cPfr],
      pos: r[cPos] ?? "",
      forty: num(r[cForty]),
      vertical: num(r[cVert]),
      broad: num(r[cBroad]),
      cone: num(r[cCone]),
      shuttle: num(r[cShut]),
    });
  }
  console.log(`[unlock] combine: ${out.length} rows`);
  return out;
}

/**
 * Position-relative percentile of each measurable, averaged into a 0..1
 * composite. Forty / cone / shuttle are lower-better (we invert the
 * percentile). A player needs at least 2 measurables to receive a
 * composite, so a single-test combine line doesn't masquerade as a full
 * read.
 */
function computeAthletic(rows: CombineMeas[]): Map<string, number> {
  const out = new Map<string, number>();
  const byPos = new Map<string, CombineMeas[]>();
  for (const r of rows) {
    const pos = (r.pos || "").toUpperCase();
    if (!pos) continue;
    const arr = byPos.get(pos) ?? [];
    arr.push(r);
    byPos.set(pos, arr);
  }
  const percentile = (
    vals: (number | undefined)[],
    lowerBetter: boolean,
  ): (number | null)[] => {
    const present = vals
      .map((v, i) => ({ v, i }))
      .filter((x) => x.v != null) as { v: number; i: number }[];
    const sorted = [...present].sort((a, b) => a.v - b.v);
    const rank = new Map<number, number>();
    sorted.forEach((x, idx) => rank.set(x.i, (idx + 1) / sorted.length));
    return vals.map((_, i) => {
      const p = rank.get(i);
      return p == null ? null : lowerBetter ? 1 - p : p;
    });
  };
  for (const [, pc] of byPos) {
    const p40 = percentile(pc.map((c) => c.forty), true);
    const pV = percentile(pc.map((c) => c.vertical), false);
    const pB = percentile(pc.map((c) => c.broad), false);
    const pC = percentile(pc.map((c) => c.cone), true);
    const pS = percentile(pc.map((c) => c.shuttle), true);
    for (let i = 0; i < pc.length; i++) {
      const xs = [p40[i], pV[i], pB[i], pC[i], pS[i]].filter(
        (x) => x != null,
      ) as number[];
      if (xs.length >= 2) out.set(pc[i].pfr_id, mean(xs));
    }
  }
  return out;
}

type Row = {
  player_id: string;
  position: string | null;
  draft_pick_no: number | null;
  draft_round: number | null;
  ras: number | null;
  source_attribution: Record<string, unknown>;
  confidence_per_field: Record<string, string>;
  last_updated: string;
  updated_by: string;
};

const SKILL_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

function buildRows(args: {
  crosswalk: Map<string, CrosswalkRow>;
  athleticByPfr: Map<string, number>;
}): Row[] {
  const { crosswalk, athleticByPfr } = args;
  const now = new Date().toISOString();
  const updatedBy = "ingest-unlock-signals@2026-05-26";
  const out: Row[] = [];
  let droppedNonSkill = 0;
  for (const [sid, c] of crosswalk) {
    // Drop non-skill players per DATA_ACQUISITION_PHASE3.md; the rubric
    // and inflection model only consume QB/RB/WR/TE.
    const pos = (c.position ?? "").toUpperCase();
    if (!SKILL_POSITIONS.has(pos)) {
      droppedNonSkill++;
      continue;
    }
    const hasDraft = c.draft_ovr != null;
    const ras = c.pfr_id ? athleticByPfr.get(c.pfr_id) ?? null : null;
    if (!hasDraft && ras == null) continue; // nothing to write
    const attribution: Record<string, unknown> = {};
    const confidence: Record<string, string> = {};
    if (hasDraft) {
      attribution.draft_pick_no = {
        source: "dynastyprocess/db_playerids",
        license: "GPL-3.0",
        fetched_at: now,
      };
      attribution.draft_round = { derived_from: "draft_pick_no" };
      confidence.draft_pick_no = "validated";
      confidence.draft_round = "validated";
    }
    if (ras != null) {
      attribution.ras = {
        source: "nflverse/combine",
        license: "CC-BY-4.0",
        method:
          "position-relative percentile (forty/cone/shuttle inverted, vertical/broad direct); average of available measurables",
        fetched_at: now,
        note: "NOT the proprietary Kent Lee Platte RAS score",
      };
      confidence.ras = "partial";
    }
    out.push({
      player_id: sid,
      position: pos,
      draft_pick_no: c.draft_ovr,
      draft_round: c.draft_ovr ? Math.ceil(c.draft_ovr / 32) : null,
      ras,
      source_attribution: attribution,
      confidence_per_field: confidence,
      last_updated: now,
      updated_by: updatedBy,
    });
  }
  if (droppedNonSkill > 0)
    console.log(`[unlock] dropped ${droppedNonSkill} non-skill players (per Phase 3 plan)`);
  return out;
}

async function main() {
  const { write } = parseArgs(process.argv.slice(2));
  console.log(
    `[unlock] mode: ${write ? "WRITE (production Supabase)" : "DRY-RUN (no writes)"}`,
  );

  if (write) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase env vars; aborting --write");
    }
  }

  const crosswalk = await loadCrosswalk();
  const combine = await loadCombine();
  const athleticByPfr = computeAthletic(combine);
  console.log(
    `[unlock] athletic composite resolved for ${athleticByPfr.size} pfr_id`,
  );

  const rows = buildRows({ crosswalk, athleticByPfr });
  const withDraft = rows.filter((r) => r.draft_pick_no != null).length;
  const withRas = rows.filter((r) => r.ras != null).length;
  console.log(
    `[unlock] rows to upsert: ${rows.length} (with draft_pick_no: ${withDraft}, with ras: ${withRas})`,
  );

  // Sample for review: a spread (top draft, late draft, athletic high/low).
  const sample: Row[] = [];
  const byDraft = rows
    .filter((r) => r.draft_pick_no != null)
    .sort((a, b) => (a.draft_pick_no as number) - (b.draft_pick_no as number));
  sample.push(...byDraft.slice(0, 3));
  sample.push(...byDraft.slice(-3));
  const byRas = rows
    .filter((r) => r.ras != null)
    .sort((a, b) => (b.ras as number) - (a.ras as number));
  sample.push(...byRas.slice(0, 2));
  console.log("\n[unlock] sample rows (first 3 by draft + last 3 + top 2 by ras):");
  for (const r of sample) {
    console.log(
      `  ${r.player_id} pos=${r.position} draft_pick_no=${r.draft_pick_no} draft_round=${r.draft_round} ras=${r.ras?.toFixed(3) ?? "null"}`,
    );
  }

  if (!write) {
    console.log("\n[unlock] DRY-RUN complete. No writes performed.");
    console.log("Re-run with --write to perform the upsert.");
    return;
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  console.log(`\n[unlock] writing ${rows.length} rows in chunks of ${CHUNK}...`);
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await sb
      .from("player_signals")
      .upsert(chunk, { onConflict: "player_id" });
    if (error) {
      console.error(
        `[unlock] chunk ${i / CHUNK} upsert error:`,
        error.message,
      );
      process.exit(1);
    }
    written += chunk.length;
    if ((i / CHUNK) % 4 === 0) console.log(`  written ${written}/${rows.length}`);
  }
  console.log(`[unlock] DONE. ${written} rows upserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
