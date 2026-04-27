/**
 * Read/write the user's JudgmentProfile.
 *
 * GET  returns the current profile (defaults filled).
 * POST upserts the dial values and writes to cookie + DB.
 *
 * Dial value types are axis-driven: linear -> number, select/seg* ->
 * string (must be a declared option), range -> [number,number] within
 * declared bounds, multi -> string[] of declared options. Anything
 * shape-violating is silently dropped so a stale UI client can't
 * poison the persisted shape.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  readProfileServer,
  writeProfileServer,
} from "@/lib/soundboard/storage";
import {
  DIAL_NOTE_MAX_LENGTH,
  DIAL_SPECS,
  type DialId,
  type DialValue,
} from "@/lib/soundboard/types";

export const runtime = "nodejs";

const dialIds: DialId[] = DIAL_SPECS.map((s) => s.id);

const dialValueSchema = z.union([
  z.number(),
  z.string(),
  z.tuple([z.number(), z.number()]),
  z.array(z.string()),
]);

const dialsSchema = z.record(z.string(), dialValueSchema);

const notesSchema = z.record(z.string(), z.string());

const bodySchema = z.object({
  dials: dialsSchema,
  notes: notesSchema.optional(),
});

export async function GET() {
  const profile = await readProfileServer();
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.message },
      { status: 400 },
    );
  }
  const cleanDials: Record<string, DialValue> = {};
  const knownIds = new Set<DialId>(dialIds);
  for (const [k, v] of Object.entries(parsed.data.dials)) {
    if (!knownIds.has(k as DialId)) continue;
    const spec = DIAL_SPECS.find((s) => s.id === (k as DialId));
    if (!spec) continue;
    const cleaned = sanitizeDialValue(spec.axis, v);
    if (cleaned !== undefined) cleanDials[k] = cleaned;
  }

  const cleanNotes: Partial<Record<DialId, string>> = {};
  if (parsed.data.notes) {
    for (const [k, v] of Object.entries(parsed.data.notes)) {
      if (!knownIds.has(k as DialId)) continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      cleanNotes[k as DialId] = trimmed.slice(0, DIAL_NOTE_MAX_LENGTH);
    }
  }

  const profile = await readProfileServer();
  for (const [k, v] of Object.entries(cleanDials)) {
    profile.dials[k as DialId] = v;
  }
  if (parsed.data.notes !== undefined) {
    profile.notes = cleanNotes;
  }
  profile.last_edited_at = new Date().toISOString();
  await writeProfileServer(profile);
  return NextResponse.json({ ok: true, profile });
}

function sanitizeDialValue(
  axis: (typeof DIAL_SPECS)[number]["axis"],
  raw: unknown,
): DialValue | undefined {
  switch (axis.kind) {
    case "linear": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return undefined;
      return Math.max(-100, Math.min(100, Math.round(n)));
    }
    case "select":
    case "seg3":
    case "seg5": {
      const s = String(raw);
      return axis.options.some((o) => o.value === s) ? s : undefined;
    }
    case "range": {
      if (!Array.isArray(raw) || raw.length !== 2) return undefined;
      const [a, b] = raw.map((n) => (typeof n === "number" ? n : Number(n)));
      if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
      const lo = Math.max(axis.min, Math.min(axis.max, Math.round(Math.min(a, b))));
      const hi = Math.max(axis.min, Math.min(axis.max, Math.round(Math.max(a, b))));
      if (lo === hi) return undefined;
      return [lo, hi];
    }
    case "multi": {
      if (!Array.isArray(raw)) return undefined;
      const valid = new Set(axis.options.map((o) => o.value));
      const dedup = new Set<string>();
      for (const item of raw) {
        if (typeof item === "string" && valid.has(item)) dedup.add(item);
      }
      return Array.from(dedup);
    }
  }
}
