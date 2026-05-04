/**
 * Save signal updates from the admin coding UI. One endpoint handles
 * both team_signals and player_signals writes via a `table` discriminator.
 *
 * Each save:
 *   1. Validates admin auth (ADMIN_EMAILS allow-list).
 *   2. Reads the prior value (for the audit log).
 *   3. Upserts the new value into the target table.
 *   4. Writes a signal_changes row with old_value, new_value, and rationale.
 *
 * Atomic-ish: write + audit happen in sequence rather than in a single
 * transaction. RLS-bypassing service role is used for both writes.
 * If the audit insert fails, the signal write still landed; the audit
 * log is best-effort, not a transactional gate. A future maintenance
 * pass can wrap this in a Supabase-flavored transaction if the audit
 * log proves load-bearing.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const saveSchema = z.object({
  table: z.enum(["team_signals", "player_signals"]),
  row_id: z.string().min(1).max(64),
  field: z.string().min(1).max(64),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(z.string(), z.unknown()),
  ]),
  rationale: z.string().max(500).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof saveSchema>;
  try {
    const body = await request.json();
    parsed = saveSchema.parse(body);
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  const admin = getAdminClient();
  const idColumn = parsed.table === "team_signals" ? "team" : "player_id";

  // Fetch prior value for audit log. Use a wildcard select since
  // dynamic-field selects fight Supabase's typed query builder.
  const { data: priorRow } = await admin
    .from(parsed.table)
    .select("*")
    .eq(idColumn, parsed.row_id)
    .maybeSingle();
  const priorValue =
    priorRow != null
      ? (priorRow as unknown as Record<string, unknown>)[parsed.field] ?? null
      : null;

  // Upsert: if row doesn't exist yet, create it with just the keyed
  // field + value. Otherwise update only the target field.
  const upsertPayload: Record<string, unknown> = {
    [idColumn]: parsed.row_id,
    [parsed.field]: parsed.value,
    last_updated: new Date().toISOString(),
    updated_by: user.email ?? user.id,
  };
  const { error: upsertError } = await admin
    .from(parsed.table)
    .upsert(upsertPayload, { onConflict: idColumn });
  if (upsertError) {
    return NextResponse.json(
      { error: "save_failed", detail: upsertError.message },
      { status: 500 },
    );
  }

  // Audit log. Best effort.
  await admin.from("signal_changes").insert({
    table_name: parsed.table,
    row_id: parsed.row_id,
    field: parsed.field,
    old_value: priorValue == null ? null : priorValue,
    new_value: parsed.value,
    changed_by: user.email ?? user.id,
    rationale: parsed.rationale ?? null,
  });

  return NextResponse.json({ ok: true });
}
