/**
 * Number grounding: every number an LLM cites must already be in the
 * context it was handed.
 *
 * Why (2026-11-28, revert #176): the trade check's Moneyballer priced a
 * 2027 1st at "57-65" while the main reasoning said "80-95"; neither range
 * was in the context. A prompt rule alone ("never invent a number") did not
 * hold, so this is the third layer per INVARIANTS ("three-layer fixes for
 * LLM hallucinations"): the context carries the numbers (offer values), the
 * prompt names them, and this check rejects output that cites anything else.
 *
 * Pure. Tolerant of rounding (a context 57.4 grounds a cited 57) and of
 * small counts (1-3: "2 RBs", "1st round") that are structure, not prices.
 */

/** Every number written in a text, as absolute values. "57-65" -> [57, 65]; "+8%" -> [8]; "1.15x" -> [1.15]. */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Numbers that need no context: small counts and ordinals (0-3), and seasons. */
const SMALL = 3;

export function isGrounded(n: number, allowed: readonly number[]): boolean {
  if (n <= SMALL) return true;
  // Seasons ("by the 2028 draft") are dates, not prices.
  if (Number.isInteger(n) && n >= 2020 && n <= 2040) return true;
  // Rounding slack: within 1 point, or 2% for large numbers.
  const tol = Math.max(1, n * 0.02);
  for (const a of allowed) if (Math.abs(a - n) <= tol) return true;
  return false;
}

/** The numbers in `text` that `context` does not contain (deduped, in order). */
export function ungroundedNumbers(text: string, context: string | readonly number[]): number[] {
  const allowed = typeof context === "string" ? extractNumbers(context) : context;
  const bad: number[] = [];
  for (const n of extractNumbers(text)) {
    if (!isGrounded(n, allowed) && !bad.includes(n)) bad.push(n);
  }
  return bad;
}

export interface GroundingIssue {
  /** Which output field ("analysts[0]", "reasoning[2]", "recommendation"). */
  field: string;
  numbers: number[];
  text: string;
}

/** Check named output fields against the context. Empty when everything is grounded. */
export function checkGrounding(fields: Array<{ field: string; text: string | null | undefined }>, context: string): GroundingIssue[] {
  const allowed = extractNumbers(context);
  const issues: GroundingIssue[] = [];
  for (const f of fields) {
    if (!f.text) continue;
    const numbers = ungroundedNumbers(f.text, allowed);
    if (numbers.length > 0) issues.push({ field: f.field, numbers, text: f.text });
  }
  return issues;
}

/** One retry instruction naming exactly what was invented. */
export function groundingFeedback(issues: GroundingIssue[]): string {
  const lines = issues.map((i) => `- ${i.field} cites ${i.numbers.join(", ")}, which is not in the context.`);
  return [
    `## Correction required`,
    `Your previous answer cited numbers that are not in the context:`,
    ...lines,
    `Redo the decision. Quote prices only from the "Offer values" block and other numbers that appear above. If a piece is UNPRICED, say it is unpriced; do not estimate it.`,
  ].join("\n");
}

/**
 * Stricter check for claims about the offer itself. Anywhere in the
 * context is too loose a test for a price: a long context holds most
 * numbers from 0 to 100, so an invented "57-65" for a pick can match a
 * stray roster value. So in any clause that names an offer piece, every
 * number must come from the Offer values block itself (piece values, ages,
 * totals, gap, band) or be a count or a season.
 */
export interface OfferPieceRef {
  label: string;
  kind: "player" | "pick" | "unpriced";
  input: string;
}

const ORDINAL_WORD: Record<number, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth" };

function pieceTerms(p: OfferPieceRef): string[] {
  const terms = new Set<string>();
  const base = p.label.replace(/\s*\(.*\)\s*$/, "").toLowerCase().trim();
  const pick = base.match(/(20\d\d)\s+(\d)(st|nd|rd|th)/) ?? p.input.toLowerCase().match(/(20\d\d)\D+(\d)(st|nd|rd|th)/);
  if (pick) {
    const round = Number(pick[2]);
    terms.add(`${pick[2]}${pick[3]}`);
    if (ORDINAL_WORD[round]) terms.add(ORDINAL_WORD[round]);
    terms.add("pick");
  } else if (base) {
    terms.add(base);
    const last = base.split(" ").filter((w) => !/^(jr|sr|ii|iii|iv|v)\.?$/.test(w)).pop();
    if (last && last.length >= 4) terms.add(last);
  }
  return [...terms];
}

export function checkOfferClaims(
  fields: Array<{ field: string; text: string | null | undefined }>,
  pieces: readonly OfferPieceRef[],
  offerBlock: string,
): GroundingIssue[] {
  const allowed = extractNumbers(offerBlock);
  const terms = pieces.flatMap(pieceTerms);
  if (terms.length === 0) return [];
  const mentions = (clause: string) => {
    const c = clause.toLowerCase();
    return terms.some((t) => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(c));
  };
  const issues: GroundingIssue[] = [];
  for (const f of fields) {
    if (!f.text) continue;
    const bad: number[] = [];
    // Clauses: split at sentence ends and semicolons (decimals like 1.15 stay whole).
    for (const clause of f.text.split(/[.!?;](?=\s|$)/)) {
      if (!mentions(clause)) continue;
      for (const n of ungroundedNumbers(clause, allowed)) if (!bad.includes(n)) bad.push(n);
    }
    if (bad.length > 0) issues.push({ field: f.field, numbers: bad, text: f.text });
  }
  return issues;
}

/** Merge two issue lists, one entry per field. */
export function mergeIssues(a: GroundingIssue[], b: GroundingIssue[]): GroundingIssue[] {
  const out = a.map((i) => ({ ...i, numbers: [...i.numbers] }));
  for (const i of b) {
    const hit = out.find((o) => o.field === i.field);
    if (!hit) out.push({ ...i, numbers: [...i.numbers] });
    else for (const n of i.numbers) if (!hit.numbers.includes(n)) hit.numbers.push(n);
  }
  return out;
}
