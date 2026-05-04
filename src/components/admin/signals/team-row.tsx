"use client";

/**
 * Inline editor for one team_signals row. Each manual-coding field
 * is its own input; on blur or change, fires a PATCH to
 * /api/admin/signals/save with the field name + new value. Optimistic
 * local state; reverts on error.
 *
 * Designed for plane-mode usability: tab between fields, no modal.
 * The rationale field is shared per-row and gets sent with every
 * field-save in that row's session (so a single "trade just
 * announced" rationale covers the half-dozen fields the founder
 * updates after the news).
 */

import { useState } from "react";
import {
  HC_BACKGROUND_TAGS,
  SCHEME_TAGS,
  type HcBackgroundTag,
  type SchemeTag,
  type TeamSignalsRow as TeamRow,
} from "@/lib/signals/schema";

type Props = { initial: TeamRow };

type FieldValue = string | number | boolean | null;

async function saveField(
  team: string,
  field: keyof TeamRow,
  value: FieldValue,
  rationale: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch("/api/admin/signals/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        table: "team_signals",
        row_id: team,
        field,
        value,
        rationale: rationale || undefined,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      return { ok: false, reason: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export function TeamSignalsRow({ initial }: Props) {
  const [row, setRow] = useState<TeamRow>(initial);
  const [rationale, setRationale] = useState("");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  async function update<K extends keyof TeamRow>(
    field: K,
    value: TeamRow[K],
  ) {
    const prior = row[field];
    setRow((r) => ({ ...r, [field]: value }));
    setSavingField(field as string);
    setErrorField(null);
    const result = await saveField(
      row.team,
      field,
      value as FieldValue,
      rationale,
    );
    setSavingField(null);
    if (!result.ok) {
      setErrorField(field as string);
      setRow((r) => ({ ...r, [field]: prior }));
    }
  }

  const isCoded = row.scheme_tag != null;

  return (
    <div
      className={`rounded-md border ${
        isCoded
          ? "border-success/30 bg-success/5"
          : "border-border-soft bg-surface"
      } px-3 py-2.5`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-foreground">
            {row.team}
          </span>
          {isCoded && (
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-success">
              coded
            </span>
          )}
        </div>
        {savingField && (
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
            saving {savingField}…
          </span>
        )}
        {errorField && (
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-danger">
            error on {errorField}
          </span>
        )}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Scheme tag">
          <select
            value={row.scheme_tag ?? ""}
            onChange={(e) =>
              update(
                "scheme_tag",
                (e.target.value || null) as SchemeTag | null,
              )
            }
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          >
            <option value="">unset</option>
            {SCHEME_TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="HC ID">
          <input
            type="text"
            value={row.hc_id ?? ""}
            onChange={(e) =>
              setRow((r) => ({ ...r, hc_id: e.target.value || null }))
            }
            onBlur={(e) =>
              update("hc_id", e.target.value || null)
            }
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          />
        </Field>

        <Field label="HC tenure (yrs)">
          <input
            type="number"
            min={0}
            value={row.hc_tenure_yrs ?? ""}
            onChange={(e) =>
              setRow((r) => ({
                ...r,
                hc_tenure_yrs:
                  e.target.value === "" ? null : Number(e.target.value),
              }))
            }
            onBlur={(e) =>
              update(
                "hc_tenure_yrs",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          />
        </Field>

        <Field label="HC first-time?">
          <select
            value={
              row.hc_first_time_flag == null
                ? ""
                : row.hc_first_time_flag
                  ? "true"
                  : "false"
            }
            onChange={(e) => {
              const v =
                e.target.value === ""
                  ? null
                  : e.target.value === "true";
              update("hc_first_time_flag", v);
            }}
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          >
            <option value="">unset</option>
            <option value="true">yes</option>
            <option value="false">no</option>
          </select>
        </Field>

        <Field label="HC background">
          <select
            value={row.hc_background_tag ?? ""}
            onChange={(e) =>
              update(
                "hc_background_tag",
                (e.target.value || null) as HcBackgroundTag | null,
              )
            }
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          >
            <option value="">unset</option>
            {HC_BACKGROUND_TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="OC ID">
          <input
            type="text"
            value={row.oc_id ?? ""}
            onChange={(e) =>
              setRow((r) => ({ ...r, oc_id: e.target.value || null }))
            }
            onBlur={(e) => update("oc_id", e.target.value || null)}
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          />
        </Field>

        <Field label="OC tenure (yrs)">
          <input
            type="number"
            min={0}
            value={row.oc_tenure_yrs ?? ""}
            onChange={(e) =>
              setRow((r) => ({
                ...r,
                oc_tenure_yrs:
                  e.target.value === "" ? null : Number(e.target.value),
              }))
            }
            onBlur={(e) =>
              update(
                "oc_tenure_yrs",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          />
        </Field>

        <Field label="OC first-year w/ team?">
          <select
            value={
              row.oc_first_year_with_team_flag == null
                ? ""
                : row.oc_first_year_with_team_flag
                  ? "true"
                  : "false"
            }
            onChange={(e) => {
              const v =
                e.target.value === ""
                  ? null
                  : e.target.value === "true";
              update("oc_first_year_with_team_flag", v);
            }}
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          >
            <option value="">unset</option>
            <option value="true">yes</option>
            <option value="false">no</option>
          </select>
        </Field>

        <Field label="Rookie OL starters">
          <input
            type="number"
            min={0}
            max={5}
            value={row.rookie_ol_starters_count ?? 0}
            onChange={(e) =>
              setRow((r) => ({
                ...r,
                rookie_ol_starters_count: Number(e.target.value),
              }))
            }
            onBlur={(e) =>
              update("rookie_ol_starters_count", Number(e.target.value))
            }
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          />
        </Field>

        <Field label="Staff novelty (0-3)">
          <input
            type="number"
            min={0}
            max={3}
            value={row.staff_novelty_composite ?? 0}
            onChange={(e) =>
              setRow((r) => ({
                ...r,
                staff_novelty_composite: Number(e.target.value),
              }))
            }
            onBlur={(e) =>
              update("staff_novelty_composite", Number(e.target.value))
            }
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          />
        </Field>

        <Field label="Rationale (this row)" colSpan={3}>
          <input
            type="text"
            placeholder="why these values"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  colSpan,
}: {
  label: string;
  children: React.ReactNode;
  colSpan?: number;
}) {
  const colSpanClass =
    colSpan === 3 ? "sm:col-span-2 lg:col-span-3" : "";
  return (
    <label className={`flex flex-col gap-1 text-xs ${colSpanClass}`}>
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
        {label}
      </span>
      {children}
    </label>
  );
}
