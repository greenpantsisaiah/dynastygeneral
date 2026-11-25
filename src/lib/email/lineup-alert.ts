/**
 * Lineup alert email: a starter who will score zero (ruled out, on bye,
 * or an empty slot) in a game that has not started. Factual only: the
 * bench options are ranked by season average, and the copy says so,
 * because the engine has no weekly projection yet.
 *
 * Pure renderer. Every send carries the unsubscribe link and the postal
 * address (CAN-SPAM); the cron refuses to send without both.
 */

import { escapeHtml } from "./weekly-brief";
import type { LineupProblem } from "@/lib/lineup/out-starters";

export interface AlertLeague {
  leagueId: string;
  leagueName: string;
  problems: LineupProblem[];
}

export interface LineupAlertArgs {
  leagues: AlertLeague[];
  unsubscribeUrl: string;
  mailingAddress: string;
}

const SLOT_LABEL: Record<string, string> = {
  FLEX: "flex",
  SUPER_FLEX: "superflex",
  WRRB_FLEX: "RB/WR flex",
  REC_FLEX: "WR/TE flex",
  DEF: "defense",
};

/** Kickoff in Eastern time, the NFL's own clock: "Sun 1:00 PM ET". */
export function lockLabel(iso: string): string {
  const d = new Date(iso);
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
  return `${s} ET`;
}

export function sleeperLeagueUrl(leagueId: string): string {
  return `https://sleeper.com/leagues/${encodeURIComponent(leagueId)}/team`;
}

function slotName(slot: string): string {
  return SLOT_LABEL[slot] ?? slot;
}

/** One-sentence statement of the problem. */
export function problemLine(p: LineupProblem): string {
  const who = p.player ? `${p.player.name} (${p.player.position ?? "?"})` : "";
  if (p.kind === "empty") return `Your ${slotName(p.slot)} spot is empty.`;
  if (p.kind === "bye") return `${who} is on bye and still in your ${slotName(p.slot)} spot.`;
  const status = p.player?.injury_status ?? "out";
  return `${who} is listed ${status} and still in your ${slotName(p.slot)} spot.`;
}

export function optionLine(p: LineupProblem): string {
  if (p.options.length === 0) {
    return "No healthy bench player fits this spot. Check free agents in Sleeper.";
  }
  const opts = p.options.map((o) => `${o.name} (${o.position}${o.ppg != null ? `, ${o.ppg} pts per game this season` : ", no games yet"})`);
  return `On your bench: ${opts.join(" or ")}.`;
}

function total(args: LineupAlertArgs): number {
  return args.leagues.reduce((n, l) => n + l.problems.length, 0);
}

export function lineupAlertSubject(args: LineupAlertArgs): string {
  const n = total(args);
  const first = args.leagues.find((l) => l.problems.length > 0);
  const p = first?.problems[0];
  if (n === 1 && first && p) {
    if (p.kind === "empty") return `Empty lineup spot in ${first.leagueName}, locks ${lockLabel(p.lock!)}`;
    return `${p.player?.name} won't play and is in your ${first.leagueName} lineup`;
  }
  const leagues = args.leagues.filter((l) => l.problems.length > 0).length;
  return leagues === 1 ? `${n} starters will score zero in ${first?.leagueName ?? "one of your leagues"}` : `${n} starters will score zero in ${leagues} of your leagues`;
}

export function renderLineupAlertText(args: LineupAlertArgs): string {
  const lines: string[] = [];
  for (const l of args.leagues) {
    if (l.problems.length === 0) continue;
    lines.push(l.leagueName);
    for (const p of l.problems) {
      lines.push(`  ${problemLine(p)} Locks ${lockLabel(p.lock!)}.`);
      lines.push(`  ${optionLine(p)}`);
    }
    lines.push(`  Open ${l.leagueName} in Sleeper: ${sleeperLeagueUrl(l.leagueId)}`, "");
  }
  lines.push(
    "Dynasty General can't change Sleeper lineups for you; the link opens your team.",
    "Bench options are ranked by season average, not a weekly projection. Status comes from Sleeper's injury report.",
    "",
    `Stop lineup alerts: ${args.unsubscribeUrl}`,
    args.mailingAddress,
  );
  return lines.join("\n");
}

export function renderLineupAlertHtml(args: LineupAlertArgs): string {
  const e = escapeHtml;
  const blocks = args.leagues
    .filter((l) => l.problems.length > 0)
    .map((l) => {
      const items = l.problems
        .map(
          (p) =>
            `<p style="margin:12px 0 2px;font-size:15px"><b>${e(problemLine(p))}</b><br><span style="font-family:monospace;font-size:12px;color:#f87171">Locks ${e(lockLabel(p.lock!))}</span></p><p style="margin:2px 0;color:#bbb;font-size:13px">${e(optionLine(p))}</p>`,
        )
        .join("");
      return `<div style="margin:22px 0;border-top:1px solid #222;padding-top:14px"><div style="font-family:monospace;text-transform:uppercase;letter-spacing:.14em;font-size:10px;color:#f5a524">${e(l.leagueName)}</div>${items}
<p style="margin:14px 0 0"><a href="${e(sleeperLeagueUrl(l.leagueId))}" style="display:inline-block;padding:10px 16px;background:#f5a524;color:#0a0a0a;text-decoration:none;font-weight:600;font-size:13px">Open ${e(l.leagueName)} in Sleeper</a></p></div>`;
    })
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e5e5e5">
<div style="font-family:monospace;text-transform:uppercase;letter-spacing:.18em;font-size:10px;color:#888">Lineup alert · Dynasty General</div>
<h1 style="font-size:22px;margin:8px 0 0">${e(lineupAlertSubject(args))}</h1>${blocks}
<p style="font-size:11px;line-height:1.5;color:#777;margin-top:24px">Dynasty General can't change Sleeper lineups for you; the button opens your team. Bench options are ranked by season average, not a weekly projection. Status comes from Sleeper's injury report.</p>
<p style="font-size:11px;line-height:1.5;color:#777"><a href="${e(args.unsubscribeUrl)}" style="color:#777">Stop lineup alerts</a>.<br>${e(args.mailingAddress)}</p>
</body></html>`;
}
