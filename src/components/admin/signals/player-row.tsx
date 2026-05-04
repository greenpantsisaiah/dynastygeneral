"use client";

/**
 * Inline editor for one player_signals row. RB-position rows show
 * the full role-tier coding suite; other positions show a leaner
 * subset (compounding-news count, contract flags). The position
 * comes in via props so we can branch the field set without a
 * second component.
 */

import { useState } from "react";
import {
  RB_NEW_TEAM_PROFILES,
  RB_ROLE_TIERS,
  type PlayerSignalsRow,
  type RbNewTeamProfile,
  type RbRoleTier,
} from "@/lib/signals/schema";

type FieldValue = string | number | boolean | null;

type PlayerInfo = {
  player_id: string;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  rank: number;
};

async function saveField(
  player_id: string,
  field: keyof PlayerSignalsRow,
  value: FieldValue,
  rationale: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch("/api/admin/signals/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        table: "player_signals",
        row_id: player_id,
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

export function PlayerSignalsRowEditor({
  player,
  initial,
}: {
  player: PlayerInfo;
  initial: PlayerSignalsRow;
}) {
  const [row, setRow] = useState<PlayerSignalsRow>(initial);
  const [rationale, setRationale] = useState("");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  async function update<K extends keyof PlayerSignalsRow>(
    field: K,
    value: PlayerSignalsRow[K],
  ) {
    const prior = row[field];
    setRow((r) => ({ ...r, [field]: value }));
    setSavingField(field as string);
    setErrorField(null);
    const result = await saveField(
      player.player_id,
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

  const isCoded =
    player.position === "RB"
      ? row.rb_role_tier != null
      : row.compounding_news_count > 0 || row.contract_year_flag != null;

  const isRb = player.position === "RB";

  return (
    <div
      className={`rounded-md border ${
        isCoded
          ? "border-success/30 bg-success/5"
          : "border-border-soft bg-surface"
      } px-3 py-2.5`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">
            {player.name}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            {player.position}
            {player.team ? `-${player.team}` : ""}
            {player.age != null ? ` · age ${player.age}` : ""}
            {` · rank ${player.rank}`}
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
        {isRb && (
          <>
            <Field label="RB role tier">
              <select
                value={row.rb_role_tier ?? ""}
                onChange={(e) =>
                  update(
                    "rb_role_tier",
                    (e.target.value || null) as RbRoleTier | null,
                  )
                }
                className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
              >
                <option value="">unset</option>
                {RB_ROLE_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Traded this offseason?">
              <select
                value={
                  row.rb_traded_offseason_flag == null
                    ? ""
                    : row.rb_traded_offseason_flag
                      ? "true"
                      : "false"
                }
                onChange={(e) => {
                  const v =
                    e.target.value === ""
                      ? null
                      : e.target.value === "true";
                  update("rb_traded_offseason_flag", v);
                }}
                className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
              >
                <option value="">unset</option>
                <option value="true">yes</option>
                <option value="false">no</option>
              </select>
            </Field>

            <Field label="Role at new team (if traded)">
              <select
                value={row.rb_role_at_new_team_projected ?? ""}
                onChange={(e) =>
                  update(
                    "rb_role_at_new_team_projected",
                    (e.target.value || null) as RbNewTeamProfile | null,
                  )
                }
                className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
              >
                <option value="">unset</option>
                {RB_NEW_TEAM_PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        <Field label="Compounding-news count">
          <input
            type="number"
            min={0}
            max={6}
            value={row.compounding_news_count ?? 0}
            onChange={(e) =>
              setRow((r) => ({
                ...r,
                compounding_news_count: Number(e.target.value),
              }))
            }
            onBlur={(e) =>
              update("compounding_news_count", Number(e.target.value))
            }
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          />
        </Field>

        <Field label="Contract-year flag">
          <select
            value={
              row.contract_year_flag == null
                ? ""
                : row.contract_year_flag
                  ? "true"
                  : "false"
            }
            onChange={(e) => {
              const v =
                e.target.value === ""
                  ? null
                  : e.target.value === "true";
              update("contract_year_flag", v);
            }}
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          >
            <option value="">unset</option>
            <option value="true">yes</option>
            <option value="false">no</option>
          </select>
        </Field>

        <Field label="Recent extension?">
          <select
            value={
              row.recent_extension_flag == null
                ? ""
                : row.recent_extension_flag
                  ? "true"
                  : "false"
            }
            onChange={(e) => {
              const v =
                e.target.value === ""
                  ? null
                  : e.target.value === "true";
              update("recent_extension_flag", v);
            }}
            className="w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
          >
            <option value="">unset</option>
            <option value="true">yes</option>
            <option value="false">no</option>
          </select>
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
