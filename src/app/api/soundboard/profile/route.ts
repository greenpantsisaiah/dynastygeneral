/**
 * Read/write the user's JudgmentProfile.
 *
 * GET  returns the current profile (defaults filled).
 * POST upserts the dial values and writes to cookie + DB.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  readProfileServer,
  writeProfileServer,
} from "@/lib/soundboard/storage";
import { DIAL_SPECS, type DialId } from "@/lib/soundboard/types";

export const runtime = "nodejs";

const dialIds: DialId[] = DIAL_SPECS.map((s) => s.id);

const dialsSchema = z.record(
  z.string(),
  z.union([z.number(), z.string()]),
);

const bodySchema = z.object({
  dials: dialsSchema,
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
  // Filter to known dial ids; reject silently if extras snuck through.
  // Range-clamp linear dials to -100..+100; coerce select values to
  // their declared option set.
  const cleanDials: Record<string, number | string> = {};
  const knownIds = new Set<DialId>(dialIds);
  for (const [k, v] of Object.entries(parsed.data.dials)) {
    if (!knownIds.has(k as DialId)) continue;
    const spec = DIAL_SPECS.find((s) => s.id === (k as DialId));
    if (!spec) continue;
    if (spec.axis.kind === "linear") {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      cleanDials[k] = Math.max(-100, Math.min(100, Math.round(n)));
    } else {
      const s = String(v);
      const valid = spec.axis.options.some((o) => o.value === s);
      if (!valid) continue;
      cleanDials[k] = s;
    }
  }
  const profile = await readProfileServer();
  for (const [k, v] of Object.entries(cleanDials)) {
    profile.dials[k as DialId] = v;
  }
  profile.last_edited_at = new Date().toISOString();
  await writeProfileServer(profile);
  return NextResponse.json({ ok: true, profile });
}
