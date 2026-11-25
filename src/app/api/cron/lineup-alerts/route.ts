/**
 * Lineup alert cron. Every 30 minutes: for each account, find starters
 * in in-season leagues who will score zero (ruled out, on bye, or an
 * empty slot) in a game that locks within ALERT_WINDOW_HOURS, and email
 * them once, bundled per run. Bench options are ranked by season
 * average; there is no projection here (founder direction 2026-11-25:
 * out alerts first, graded lineup advice later, gated on beating
 * Sleeper's projection).
 *
 * Gates (all must hold or nothing sends):
 * - flag lineup_out_alert_email on for the user (dark by default; a bulk
 *   send is red tier in the team charter, so the first real send needs
 *   Isaiah's yes),
 * - RESEND_API_KEY, EMAIL_MAILING_ADDRESS and an unsubscribe secret,
 * - the user has not opted out of lineup alerts,
 * - the problem has not been emailed before (one notifications row per
 *   problem per week, so a problem is never sent twice).
 *
 * Exits early when no game locks inside the window, so off-day runs cost
 * one schedule fetch. `?dry=1` detects and counts without sending or
 * writing, and returns the problems found (preview use).
 */

import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getLeaguesForUser, getNflState, getRosters, getUserByUsername } from "@/lib/sleeper";
import { isRosterOwnedBy } from "@/lib/sleeper/roster-identity";
import { resolvePlayers } from "@/lib/players/cache";
import { getSeasonStats } from "@/lib/players/season-stats";
import { getWeekGames } from "@/lib/nfl/schedule";
import { flagOn } from "@/lib/flags/server";
import {
  detectLineupProblems,
  ppgFor,
  problemKey,
  type PlayerMeta,
} from "@/lib/lineup/out-starters";
import {
  lineupAlertSubject,
  renderLineupAlertHtml,
  renderLineupAlertText,
  type AlertLeague,
} from "@/lib/email/lineup-alert";
import { LINEUP_ALERTS_LIST, OPT_OUT, unsubscribeUrl } from "@/lib/email/unsubscribe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Alert when the slot locks within this many hours. Covers Sunday inactives (about 90 minutes before kickoff) with time to act. */
const ALERT_WINDOW_HOURS = 3;
const TIME_BUDGET_MS = 240_000;
/** Leagues checked per account per run. */
const LEAGUE_CAP = 15;

function isProd(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

export async function GET(request: Request): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";

  const cronSecret = process.env.CRON_SECRET;
  if (isProd() && !cronSecret) {
    return NextResponse.json({ ok: false, error: "cron_secret_unconfigured" }, { status: 503 });
  }
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const mailingAddress = process.env.EMAIL_MAILING_ADDRESS?.trim();
  if (!dry && (!apiKey || !mailingAddress)) {
    return NextResponse.json(
      { ok: false, error: "email_unconfigured", missing: { RESEND_API_KEY: !apiKey, EMAIL_MAILING_ADDRESS: !mailingAddress } },
      { status: 503 },
    );
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dynastygeneral.app";
  const from = process.env.EMAIL_FROM ?? "alerts@dynastygeneral.app";

  const nfl = await getNflState();
  if (!nfl || nfl.season_type !== "regular" || !nfl.week) {
    return NextResponse.json({ ok: true, note: "not_regular_season" });
  }
  const season = nfl.season;
  const week = nfl.week;
  const now = new Date();

  const games = await getWeekGames(season, week);
  const horizon = now.getTime() + ALERT_WINDOW_HOURS * 3_600_000;
  const lockSoon = [...games.values()].some((g) => {
    const t = Date.parse(g.kickoff);
    return g.state === "pre" && t > now.getTime() && t <= horizon;
  });
  if (!lockSoon) return NextResponse.json({ ok: true, note: "no_lock_in_window", games: games.size });

  const admin = getAdminClient();
  const { data: profiles, error } = await admin.from("profiles").select("id, sleeper_username");
  if (error) {
    console.error("[cron:lineup-alerts:profiles]", error.message);
    return NextResponse.json({ ok: false, error: "profiles_query_failed" }, { status: 500 });
  }
  const ids = (profiles ?? []).map((p) => p.id as string);
  const weekPrefix = `lineup_alert_${season}_w${week}_`;
  const [{ data: optouts }, { data: sentRows }] = await Promise.all([
    admin.from("notifications").select("user_id").in("user_id", ids).eq("league_id", OPT_OUT.league_id).eq("kind", OPT_OUT.kind(LINEUP_ALERTS_LIST)),
    admin.from("notifications").select("user_id, kind, status").in("user_id", ids).like("kind", `${weekPrefix}%`),
  ]);
  const optedOut = new Set((optouts ?? []).map((r) => r.user_id as string));
  const alreadySent = new Set(
    (sentRows ?? []).filter((r) => r.status === "sent").map((r) => `${r.user_id as string}|${r.kind as string}`),
  );

  const stats = await getSeasonStats(season).catch((err) => {
    console.error("[cron:lineup-alerts:stats]", err instanceof Error ? `${err.message}\n${err.stack}` : err);
    return new Map();
  });

  const result = { ok: true, dry, week: `${season}_w${week}`, users_checked: 0, with_problems: 0, problems: 0, sent: 0, failed: 0, skipped: 0, deferred: 0, flag_off: 0 };
  const preview: Array<{ user: string; leagues: AlertLeague[] }> = [];
  const { Resend } = dry ? { Resend: null } : await import("resend");
  const resend = Resend && apiKey ? new Resend(apiKey) : null;

  for (const profile of profiles ?? []) {
    const userId = profile.id as string;
    if (!flagOn("lineup_out_alert_email", userId)) {
      result.flag_off++;
      continue;
    }
    const username = (profile.sleeper_username as string | null) ?? null;
    if (!username || optedOut.has(userId)) {
      result.skipped++;
      continue;
    }
    if (Date.now() - started > TIME_BUDGET_MS) {
      result.deferred++;
      continue;
    }
    result.users_checked++;

    const alertLeagues: AlertLeague[] = [];
    const keys: Array<{ leagueId: string; kind: string }> = [];
    try {
      const su = await getUserByUsername(username);
      const leagues = su ? (await getLeaguesForUser(su.user_id, season)).filter((l) => l.status === "in_season") : [];
      for (const lg of leagues.slice(0, LEAGUE_CAP)) {
        try {
          const rosters = await getRosters(lg.league_id);
          const mine = rosters.find((r) => isRosterOwnedBy(r, su!.user_id));
          if (!mine) continue;
          const rosterPlayers = mine.players ?? [];
          const metaRaw = await resolvePlayers(rosterPlayers);
          const meta = new Map<string, PlayerMeta>();
          for (const [id, p] of metaRaw) {
            meta.set(id, {
              player_id: id,
              name: p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || id),
              position: p.position ?? null,
              fantasy_positions: p.fantasy_positions ?? [],
              team: p.team ?? null,
              injury_status: p.injury_status ?? null,
            });
          }
          const rec = lg.scoring_settings?.rec ?? 0;
          const ppgById = new Map(rosterPlayers.map((id) => [id, ppgFor(stats.get(id), rec)]));
          const problems = detectLineupProblems({
            rosterPositions: lg.roster_positions ?? [],
            starters: mine.starters ?? [],
            rosterPlayers,
            unavailable: [...(mine.taxi ?? []), ...(mine.reserve ?? [])],
            meta,
            games,
            ppgById,
            now,
            windowHours: ALERT_WINDOW_HOURS,
          }).filter((p) => !alreadySent.has(`${userId}|${problemKey(season, week, lg.league_id, p)}`));
          if (problems.length === 0) continue;
          alertLeagues.push({ leagueId: lg.league_id, leagueName: lg.name, problems });
          for (const p of problems) keys.push({ leagueId: lg.league_id, kind: problemKey(season, week, lg.league_id, p) });
        } catch (err) {
          console.error("[cron:lineup-alerts:league]", lg.league_id, err instanceof Error ? `${err.message}\n${err.stack}` : err);
        }
      }
    } catch (err) {
      console.error("[cron:lineup-alerts:sleeper]", userId, err instanceof Error ? `${err.message}\n${err.stack}` : err);
    }
    if (alertLeagues.length === 0) continue;
    result.with_problems++;
    result.problems += keys.length;
    if (dry) {
      preview.push({ user: userId, leagues: alertLeagues });
      continue;
    }

    const unsub = unsubscribeUrl(appUrl, userId, LINEUP_ALERTS_LIST);
    if (!unsub) return NextResponse.json({ ok: false, error: "unsubscribe_secret_unconfigured" }, { status: 503 });
    let email: string | null = null;
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      email = data?.user?.email ?? null;
    } catch (err) {
      console.error("[cron:lineup-alerts:auth]", userId, err instanceof Error ? err.message : err);
    }
    if (!email || !resend) continue;

    const args = { leagues: alertLeagues, unsubscribeUrl: unsub, mailingAddress: mailingAddress ?? "" };
    const { error: sendErr } = await resend.emails.send({
      from,
      to: email,
      subject: lineupAlertSubject(args),
      html: renderLineupAlertHtml(args),
      text: renderLineupAlertText(args),
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    const sentAt = new Date().toISOString();
    await admin.from("notifications").upsert(
      keys.map((k) => ({
        user_id: userId,
        league_id: k.leagueId,
        kind: k.kind,
        status: sendErr ? "failed" : "sent",
        error_message: sendErr?.message ?? null,
        sent_at: sentAt,
      })),
      { onConflict: "user_id,league_id,kind" },
    );
    if (sendErr) result.failed++;
    else result.sent++;
  }
  return NextResponse.json(dry ? { ...result, preview } : result);
}
