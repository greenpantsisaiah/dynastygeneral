/**
 * rerankByConsensus regression tests.
 *
 *   npx tsx --tsconfig tsconfig.json evals/rerank.test.ts
 *
 * The cascade is the load-bearing decision behind why every surface
 * agrees on player order. Tests assert: KTC tier wins over ADP tier
 * wins over heuristic fallback, ordering within tier is correct,
 * and stability is preserved for tier-3 items.
 */

import { rerankByConsensus } from "../src/lib/players/rerank";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, note?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${note ? ` (${note})` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${note ? ` (${note})` : ""}`);
  }
}

type Item = { id: string; adp?: number | null };

function ids(items: Item[]): string {
  return items.map((i) => i.id).join(",");
}

function run() {
  console.log("── KTC tier wins over ADP tier ──");
  {
    const items: Item[] = [
      { id: "noKtc_lowAdp", adp: 10 }, // tier 2
      { id: "ktc_player", adp: 100 }, // tier 1 (has KTC)
    ];
    const values = { ktc_player: 50 };
    const sorted = rerankByConsensus(items, values);
    check(
      "KTC-valued player sorts above lower-ADP non-KTC",
      sorted[0].id === "ktc_player",
      ids(sorted),
    );
  }

  console.log("\n── KTC ordering within tier (higher first) ──");
  {
    const items: Item[] = [
      { id: "low_value" },
      { id: "high_value" },
      { id: "mid_value" },
    ];
    const values = { low_value: 10, high_value: 80, mid_value: 40 };
    const sorted = rerankByConsensus(items, values);
    check(
      "highest KTC value first",
      sorted[0].id === "high_value" &&
        sorted[1].id === "mid_value" &&
        sorted[2].id === "low_value",
      ids(sorted),
    );
  }

  console.log("\n── ADP ordering within tier (lower first) ──");
  {
    const items: Item[] = [
      { id: "adp_high", adp: 100 },
      { id: "adp_low", adp: 5 },
      { id: "adp_mid", adp: 50 },
    ];
    const sorted = rerankByConsensus(items, {});
    check(
      "lowest ADP first when no KTC",
      sorted[0].id === "adp_low" &&
        sorted[1].id === "adp_mid" &&
        sorted[2].id === "adp_high",
      ids(sorted),
    );
  }

  console.log("\n── ADP tier wins over heuristic tier ──");
  {
    const items: Item[] = [
      { id: "no_adp_first" }, // tier 3, will preserve input order if same tier
      { id: "has_adp", adp: 200 }, // tier 2
    ];
    const sorted = rerankByConsensus(items, {});
    check(
      "ADP-tagged sorts above no-ADP",
      sorted[0].id === "has_adp",
      ids(sorted),
    );
  }

  console.log("\n── tier-3 preserves input order (stable) ──");
  {
    const items: Item[] = [
      { id: "third" },
      { id: "first" },
      { id: "second" },
    ];
    const sorted = rerankByConsensus(items, {});
    check(
      "no signals: original order preserved",
      sorted[0].id === "third" &&
        sorted[1].id === "first" &&
        sorted[2].id === "second",
      ids(sorted),
    );
  }

  console.log("\n── LaPorta scenario (the audit case) ──");
  {
    // Three TEs as available.ts would have them after pos filter,
    // sorted internally by dynasty_rank: Gadsden first, Pitts second,
    // Sadiq third, LaPorta fourth (because his search_rank 79 is
    // higher than Gadsden's 70.5 effective via age boost). KTC
    // values reverse this: LaPorta is the most valuable.
    const items: Item[] = [
      { id: "gadsden", adp: 85.7 },
      { id: "pitts", adp: 77.2 },
      { id: "sadiq", adp: 81.5 },
      { id: "laporta", adp: 69 },
    ];
    const values = {
      laporta: 38,
      pitts: 33,
      gadsden: 26,
      sadiq: 21,
    };
    const sorted = rerankByConsensus(items, values);
    check(
      "LaPorta surfaces #1 by KTC despite being #4 by dynasty_rank",
      sorted[0].id === "laporta",
      ids(sorted),
    );
  }

  console.log("\n── Mixed: some KTC, some ADP-only, some neither ──");
  {
    const items: Item[] = [
      { id: "ktc_low" },
      { id: "adp_only", adp: 50 },
      { id: "ktc_high" },
      { id: "nothing" },
      { id: "adp_low", adp: 10 },
    ];
    const values = { ktc_low: 20, ktc_high: 80 };
    const sorted = rerankByConsensus(items, values);
    check(
      "tiers strict: KTCs first (high>low), ADPs next (low>high), rest last",
      sorted[0].id === "ktc_high" &&
        sorted[1].id === "ktc_low" &&
        sorted[2].id === "adp_low" &&
        sorted[3].id === "adp_only" &&
        sorted[4].id === "nothing",
      ids(sorted),
    );
  }

  console.log("\n── Item shape: id field is alternative to player_id ──");
  {
    const items = [
      { player_id: "p1", adp: 50 },
      { id: "p2", adp: 30 },
    ];
    const values = { p1: 10 };
    const sorted = rerankByConsensus(items, values);
    check(
      "lookup works with both id and player_id keys",
      sorted[0].player_id === "p1", // KTC-valued via player_id
      ids(sorted.map((s) => ({ id: s.player_id ?? s.id ?? "" }))),
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
