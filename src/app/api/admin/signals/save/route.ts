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

// Explicit allow-list of writable column names per signal table.
// Mirrors the schema in supabase/migrations/0009_signals.sql. Prior
// implementation accepted any user-supplied `field` string and used it
// directly as a Supabase upsert key, letting a stolen admin session
// write arbitrary columns to the signals tables. Adding a column to
// either table requires adding it here AND in the migration.
// Excluded by design: primary keys (player_id, team) are the row_id
// discriminator already; meta columns (last_updated, updated_by) are
// auto-managed by the upsert payload below.
const WRITABLE_FIELDS: Record<"team_signals" | "player_signals", string[]> = {
  player_signals: [
    "position",
    "team",
    "age",
    "snap_share_prior_year",
    "route_participation_prior_year",
    "target_share_prior_year",
    "rush_share_prior_year",
    "weighted_opportunity_prior_year",
    "high_value_touches_prior_year",
    "yprr_prior_year",
    "adot_prior_year",
    "epa_per_play_prior_year",
    "cpoe_prior_year",
    "draft_round",
    "draft_pick_no",
    "ras",
    "college_dominator",
    "breakout_age",
    "weight_lb",
    "height_in",
    "contract_years_remaining",
    "recent_extension_flag",
    "contract_year_flag",
    "rb_role_tier",
    "rb_traded_offseason_flag",
    "rb_role_at_new_team_projected",
    "rb_passdown_share_prior_year",
    "compounding_news_count",
    "source_attribution",
    "confidence_per_field",
  ],
  team_signals: [
    "ol_continuity_score",
    "ol_grade_run",
    "ol_grade_pass",
    "rookie_ol_starters_count",
    "rookie_ol_position_breakdown",
    "hc_id",
    "hc_first_time_flag",
    "hc_tenure_yrs",
    "hc_background_tag",
    "oc_id",
    "oc_tenure_yrs",
    "oc_first_year_with_team_flag",
    "scheme_tag",
    "staff_novelty_composite",
    "scheme_pace",
    "pass_rate_neutral",
    "personnel_12_rate",
    "source_attribution",
  ],
};

const saveSchema = z
  .object({
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
  })
  .refine(
    (v) => WRITABLE_FIELDS[v.table].includes(v.field),
    { message: "field_not_writable", path: ["field"] },
  );

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
    console.error(
      "[admin:signals:save:invalid_body]",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
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
    console.error("[admin:signals:save:upsert]", upsertError.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
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
