"use client";

/**
 * Single dial tile in the war-room console. Dispatches by axis kind:
 * linear gets the tactical Knob; range gets the dual-handle bar;
 * select / seg3 / seg5 get the segmented selector; multi gets the
 * toggle grid.
 *
 * Tile shows: glyph + name, the form-factor control, the current
 * value, and an inline "Why?" field rendered only when the dial value
 * differs from default. "What it does" surface list opens via a
 * tooltip-on-hover so each tile stays compact.
 */

import { useState } from "react";
import { Knob } from "./knob";
import { RangeControl } from "./range-control";
import { SegmentedControl } from "./segmented-control";
import { MultiControl } from "./multi-control";
import { DialGlyph } from "./icons";
import {
  DIAL_NOTE_MAX_LENGTH,
  isAtDefault,
  type DialSpec,
  type DialValue,
} from "@/lib/lab/dial-types";

export function SoundboardDial({
  spec,
  value,
  note,
  onChange,
  onNoteChange,
}: {
  spec: DialSpec;
  value: DialValue;
  note: string;
  onChange: (v: DialValue) => void;
  onNoteChange: (v: string) => void;
}) {
  const [showSurface, setShowSurface] = useState(false);
  const moved = !isAtDefault(spec, value);

  return (
    <div
      className={`group relative flex flex-col rounded-lg border bg-[rgb(18,16,12)] px-3 py-3 transition ${
        moved
          ? "border-accent/40 shadow-[inset_0_0_24px_rgba(255,170,60,0.06)]"
          : "border-border-strong"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-foreground">
          <DialGlyph kind={spec.icon} className="h-3.5 w-3.5 text-accent/70" />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
            {spec.name}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowSurface((v) => !v)}
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2 hover:text-accent"
        >
          ?
        </button>
      </div>

      <div className="mt-2 flex flex-1 items-center justify-center min-h-[110px]">
        {renderControl(spec, value, onChange)}
      </div>

      <div className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        {renderReadout(spec, value)}
      </div>

      {moved && (
        <input
          type="text"
          value={note}
          onChange={(e) =>
            onNoteChange(e.target.value.slice(0, DIAL_NOTE_MAX_LENGTH))
          }
          placeholder="Why? (optional)"
          maxLength={DIAL_NOTE_MAX_LENGTH}
          className="mt-2 w-full rounded-sm border border-border-soft bg-[rgb(12,10,8)] px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
        />
      )}

      {showSurface && (
        <div className="mt-2 rounded-sm border border-border-soft bg-[rgb(12,10,8)] px-2 py-1.5">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
            Consults
          </div>
          <ul className="mt-1 space-y-0.5 text-[11px] text-foreground">
            {spec.surface.map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
          {!spec.wired && (
            <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-warning/80">
              Pending wiring
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderControl(
  spec: DialSpec,
  value: DialValue,
  onChange: (v: DialValue) => void,
) {
  switch (spec.axis.kind) {
    case "linear": {
      const v = typeof value === "number" ? value : 0;
      return (
        <Knob
          value={v}
          onChange={(n) => onChange(n)}
          ariaLabel={spec.name}
          size={92}
        />
      );
    }
    case "range": {
      const v: [number, number] = Array.isArray(value)
        ? (value as [number, number])
        : (spec.default as [number, number]);
      return (
        <RangeControl
          min={spec.axis.min}
          max={spec.axis.max}
          value={v}
          onChange={(n) => onChange(n)}
          ariaLabel={spec.name}
        />
      );
    }
    case "select":
    case "seg3":
    case "seg5": {
      const v = typeof value === "string" ? value : String(spec.default);
      return (
        <SegmentedControl
          options={spec.axis.options}
          value={v}
          onChange={(s) => onChange(s)}
          ariaLabel={spec.name}
        />
      );
    }
    case "multi": {
      const v = Array.isArray(value)
        ? (value as string[]).filter((x) => typeof x === "string")
        : [];
      return (
        <MultiControl
          options={spec.axis.options}
          value={v}
          onChange={(arr) => onChange(arr)}
          ariaLabel={spec.name}
        />
      );
    }
  }
}

function renderReadout(spec: DialSpec, value: DialValue): string {
  switch (spec.axis.kind) {
    case "linear": {
      const v = typeof value === "number" ? value : 0;
      if (v === 0) return spec.axis.left + " ← → " + spec.axis.right;
      return v > 0 ? `+${v} → ${spec.axis.right}` : `${v} → ${spec.axis.left}`;
    }
    case "range": {
      if (Array.isArray(value)) return `${value[0]}-${value[1]} band`;
      return "";
    }
    case "select":
    case "seg3":
    case "seg5": {
      const v = typeof value === "string" ? value : String(spec.default);
      const opt = spec.axis.options.find((o) => o.value === v);
      return opt?.label ?? v;
    }
    case "multi": {
      const v = Array.isArray(value) ? (value as string[]) : [];
      if (v.length === 0) return "no selections";
      if (v.includes("avoid_all")) return "avoid all";
      return `${v.length} selected`;
    }
  }
}
