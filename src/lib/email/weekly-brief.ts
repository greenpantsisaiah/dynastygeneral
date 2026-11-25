/**
 * Weekly brief email: the contend-or-sell verdict for each of a user's
 * in-season leagues, delivered Tuesday. Pure renderer; the cron fetches
 * and decides who gets it. Reads ONLY the canonical verdict object
 * (buildContendOrSellVerdict), never recomputes.
 *
 * Free vs Pro (founder direction 2026-11-24, "use it as a squeeze"):
 * free shows every league's stance, odds, voices and WHO to sell; the
 * ranked list of managers to sell to (names + why) is Pro. Free sees how
 * many buyers were ranked and an upgrade line, never a fake or blurred
 * name.
 *
 * Compliance: every send carries a working unsubscribe link and the
 * mailing address (CAN-SPAM). The cron refuses to send without both.
 */

import type { ContendOrSellVerdict } from "@/lib/strategy/verdict/compose";
import type { Stance } from "@/lib/strategy/verdict/voices";

export type BriefTier = "free" | "pro";

export interface BriefLeague {
  leagueId: string;
  leagueName: string;
  verdict: ContendOrSellVerdict | null;
  /** Why there is no verdict (too early, playoffs, etc.). */
  note?: string;
}

export interface BriefArgs {
  ownerName: string;
  tier: BriefTier;
  leagues: BriefLeague[];
  appUrl: string;
  unsubscribeUrl: string;
  mailingAddress: string;
  /** e.g. "Week 13" */
  weekLabel: string;
}

const STANCE: Record<Stance, string> = {
  sell: "Sell",
  lean_sell: "Lean sell",
  split: "Split",
  lean_push: "Lean push",
  push: "Push",
};
const VOICE = { moneyball: "Moneyball", gambler: "Gambler", strategist: "Strategist" } as const;

const pct = (p: number) => `${Math.round(p * 100)}%`;
const valuePts = (n: number) => `${Math.round(n)} value point${Math.round(n) === 1 ? "" : "s"}`;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Beta framing + feedback ask (Isaiah 2026-11-25: emails are replyable,
// read by him, and should warmly invite feedback). The cron sets
// reply_to so a reply reaches a person.
const BETA_INTRO =
  "This brief is in beta, and you are one of the first managers to get it. It will get sharper with your help.";
const FEEDBACK_BODY =
  "Just hit reply. Tell me what you wish this told you, what felt off, or the decision you are stuck on this week. I read every reply myself.";
const FEEDBACK_ASK = `Tell me how Dynasty General can serve you better. ${FEEDBACK_BODY}\nIsaiah, founder`;

export function briefSubject(args: BriefArgs): string {
  const first = args.leagues.find((l) => l.verdict);
  if (!first?.verdict) return `${args.weekLabel} brief: your leagues`;
  const v = first.verdict;
  return `${args.weekLabel}: ${STANCE[v.panel.headline]} in ${first.leagueName}, title odds ${pct(v.odds.title_pct)}`;
}

function leagueText(l: BriefLeague, tier: BriefTier, appUrl: string): string[] {
  const out = [`${l.leagueName}`];
  const v = l.verdict;
  if (!v) {
    out.push(`  ${l.note ?? "No verdict this week."}`);
    return out;
  }
  out.push(
    `  ${STANCE[v.panel.headline]}. Title odds ${pct(v.odds.title_pct)} (${v.league.rank_by_title_odds} of ${v.league.teams}), playoffs ${pct(v.odds.playoff_pct)}. ${v.panel.consensus ? "The voices agree." : "The voices disagree."}`,
  );
  for (const vr of v.panel.voices) out.push(`  ${VOICE[vr.voice]}, ${STANCE[vr.stance]}: ${vr.line}`);
  for (const c of v.candidates) {
    out.push(
      `  Sell candidate: ${c.player.name} (${c.player.position}${c.player.age != null ? `, ${c.player.age}` : ""}), about ${valuePts(c.decay.value_lost)} gone by August per the age curve.`,
    );
    if (tier === "pro") {
      for (const b of c.buyers) out.push(`    Sell to ${b.label}: ${b.reason}.`);
    } else if (c.buyers.length > 0) {
      out.push(`    ${c.buyers.length} managers ranked as buyers. Pro names them and why.`);
    }
  }
  out.push(`  Open the league: ${appUrl}/leagues/${l.leagueId}`);
  return out;
}

export function renderWeeklyBriefText(args: BriefArgs): string {
  const lines = [
    args.ownerName ? `${args.weekLabel} brief for ${args.ownerName}.` : `${args.weekLabel} brief.`,
    BETA_INTRO,
    "",
  ];
  if (args.leagues.length === 0) lines.push(`Add your Sleeper username and the brief will carry a keep-going-or-sell read for your leagues: ${args.appUrl}/connect`, "");
  for (const l of args.leagues) lines.push(...leagueText(l, args.tier, args.appUrl), "");
  if (args.tier === "free") lines.push(`Pro names the managers most likely to buy, across up to 10 leagues: ${args.appUrl}/pricing`, "");
  lines.push(
    FEEDBACK_ASK,
    "",
    "Odds come from simulating the rest of your season from this season's scores. They are estimates with real uncertainty, not guarantees.",
    "",
    `Unsubscribe: ${args.unsubscribeUrl}`,
    args.mailingAddress,
  );
  return lines.join("\n");
}

export function renderWeeklyBriefHtml(args: BriefArgs): string {
  const e = escapeHtml;
  const leagueBlocks = args.leagues
    .map((l) => {
      const v = l.verdict;
      const head = `<div style="font-family:monospace;text-transform:uppercase;letter-spacing:.14em;font-size:10px;color:#f5a524">${e(l.leagueName)}</div>`;
      if (!v) {
        return `<div style="margin:24px 0">${head}<p style="color:#888;font-size:13px">${e(l.note ?? "No verdict this week.")}</p></div>`;
      }
      const voices = v.panel.voices
        .map((vr) => `<li style="margin:4px 0"><b>${VOICE[vr.voice]}, ${STANCE[vr.stance]}.</b> <span style="color:#bbb">${e(vr.line)}</span></li>`)
        .join("");
      const cands = v.candidates
        .map((c) => {
          const buyers =
            args.tier === "pro"
              ? c.buyers.map((b) => `<li>Sell to <b>${e(b.label)}</b>: ${e(b.reason)}.</li>`).join("")
              : c.buyers.length > 0
                ? `<li style="color:#f5a524">${c.buyers.length} managers ranked as buyers. <a href="${e(args.appUrl)}/pricing" style="color:#f5a524">Pro names them and why.</a></li>`
                : "";
          return `<p style="margin:10px 0 2px"><b>${e(c.player.name)}</b> <span style="color:#888">${e(c.player.position)}${c.player.age != null ? ` · ${c.player.age}` : ""}</span><br><span style="color:#bbb;font-size:13px">About ${valuePts(c.decay.value_lost)} gone by August per the age curve. Selling costs ${Math.max(0, -c.title_delta * 100).toFixed(1)} pts of title odds.</span></p><ul style="margin:2px 0 0 16px;padding:0;font-size:13px">${buyers}</ul>`;
        })
        .join("");
      return `<div style="margin:24px 0;border-top:1px solid #222;padding-top:16px">${head}
<h2 style="font-size:18px;margin:6px 0">${STANCE[v.panel.headline]}: title odds ${pct(v.odds.title_pct)}, ${v.league.rank_by_title_odds} of ${v.league.teams}</h2>
<p style="color:#bbb;font-size:13px;margin:0">Playoffs ${pct(v.odds.playoff_pct)}. ${v.panel.consensus ? "The voices agree." : "The voices disagree."}</p>
<ul style="margin:10px 0 0 16px;padding:0;font-size:13px">${voices}</ul>${cands}
<p style="margin:14px 0 0"><a href="${e(args.appUrl)}/leagues/${encodeURIComponent(l.leagueId)}" style="color:#f5a524;font-size:13px">Open ${e(l.leagueName)}</a></p></div>`;
    })
    .join("");
  const upsell =
    args.tier === "free"
      ? `<p style="margin:24px 0"><a href="${e(args.appUrl)}/pricing" style="display:inline-block;padding:10px 16px;background:#f5a524;color:#0a0a0a;text-decoration:none;font-family:monospace;text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:600">See who to sell to</a></p>`
      : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e5e5e5">
<div style="font-family:monospace;text-transform:uppercase;letter-spacing:.18em;font-size:10px;color:#888">${e(args.weekLabel)} brief · Dynasty General · Beta</div>
<h1 style="font-size:22px;margin:8px 0 0">Keep going or sell${args.ownerName ? `, ${e(args.ownerName)}` : ""}?</h1>
<p style="color:#bbb;font-size:13px;line-height:1.6;margin:8px 0 0">${e(BETA_INTRO)}</p>
${args.leagues.length === 0 ? `<p style="color:#bbb;font-size:14px;line-height:1.6">Add your Sleeper username and this email will carry a keep-going-or-sell read for your leagues: title odds, who to sell, and the managers most likely to buy. <a href="${e(args.appUrl)}/connect" style="color:#f5a524">Add it here</a>.</p>` : ""}${leagueBlocks}${upsell}
<div style="margin:28px 0 0;padding:16px;border:1px solid #2a2a2a;border-radius:6px">
<p style="font-size:14px;line-height:1.6;margin:0;color:#e5e5e5"><b>Tell me how Dynasty General can serve you better.</b></p>
<p style="font-size:13px;line-height:1.6;margin:6px 0 0;color:#bbb">${e(FEEDBACK_BODY)}</p>
<p style="font-size:13px;line-height:1.6;margin:10px 0 0;color:#bbb">Isaiah, founder</p>
</div>
<p style="font-size:11px;line-height:1.5;color:#777;margin-top:24px">Odds come from simulating the rest of your season from this season's scores. They are estimates with real uncertainty, not guarantees.</p>
<p style="font-size:11px;line-height:1.5;color:#777"><a href="${e(args.unsubscribeUrl)}" style="color:#777">Unsubscribe</a> from the weekly brief.<br>${e(args.mailingAddress)}</p>
</body></html>`;
}
