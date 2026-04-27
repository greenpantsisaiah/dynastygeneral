"use client";

/**
 * Multi-select grid for the stack-preference dial. Each option is a
 * toggle chip; user can pick any subset. "Avoid all" is mutually
 * exclusive with the others.
 */

const AVOID_KEY = "avoid_all";

export function MultiControl({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  ariaLabel?: string;
}) {
  function toggle(opt: string) {
    if (opt === AVOID_KEY) {
      const isOn = value.includes(AVOID_KEY);
      onChange(isOn ? [] : [AVOID_KEY]);
      return;
    }
    let next = value.filter((v) => v !== AVOID_KEY);
    if (next.includes(opt)) next = next.filter((v) => v !== opt);
    else next = [...next, opt];
    onChange(next);
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="grid grid-cols-2 gap-1 rounded-md border border-border-strong bg-[rgb(20,18,14)] p-1"
    >
      {options.map((o) => {
        const active = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(o.value)}
            className={`rounded px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.12em] transition ${
              active
                ? "bg-accent text-black"
                : "text-muted-2 hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
