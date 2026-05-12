/**
 * AAR notification cron. Runs every 15 minutes via Vercel cron
 * (vercel.json). For each user with a sleeper_username on file,
 * fetches their leagues for the current season, checks each draft
 * status, and sends an "AAR ready" email when a draft just flipped
 * to "complete" and we haven't notified them yet.
 *
 * Idempotency: notifications table has a unique constraint on
 * (user_id, league_id, kind). The send is wrapped so a Resend failure
 * is recorded with status='failed' and retried on the next cron run.
 *
 * Auth: in production (VERCEL_ENV === "production" or NODE_ENV ===
 * "production") a Bearer CRON_SECRET is REQUIRED. If CRON_SECRET is
 * unset in production we return 503 rather than open the route. In
 * dev / preview, the secret is optional so local cron testing works
 * without the env var.
 *
 * Cost: per-run worst case is N users * M leagues each * 2 Sleeper
 * API calls. At 100 users with 5 leagues each that's 1000 calls per
 * run, well under Sleeper's rate limit. Email send only fires once
 * per (user, league, kind), so total Resend volume = number of
 * draft-completions across all tracked users (low).
 */

import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  getLeaguesForUser,
  getUserByUsername,
} from "@/lib/sleeper";
import { resolveDraftState } from "@/lib/sleeper/draft-state";
import {
  sendAarReadyEmail,
  type AarNotifyArgs,
} from "@/lib/email/aar-notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Allow up to 60 seconds. Default Vercel timeout is shorter; long-tail
// runs need room when many users have many leagues.
export const maxDuration = 60;

const NOTIFICATION_KIND = "aar_ready";

type RunResult = {
  ok: boolean;
  scanned_users: number;
  scanned_leagues: number;
  sent: number;
  failed: number;
  skipped_already_sent: number;
  /**
   * Only `stage` is returned in the response body so untrusted callers
   * cannot enumerate user_ids or read raw upstream error strings. Full
   * detail (user_id, message) is logged server-side via console.error
   * for Vercel function logs.
   */
  errors: Array<{ stage: string }>;
};

function isProductionEnv(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

function logErrorAndCollect(
  result: RunResult,
  stage: string,
  detail: { user_id?: string; league_id?: string; message: string },
): void {
  console.error(
    `[cron:aar-notifications:${stage}]`,
    JSON.stringify({
      user_id: detail.user_id ?? null,
      league_id: detail.league_id ?? null,
      message: detail.message,
    }),
  );
  result.errors.push({ stage });
}

export async function GET(request: Request): Promise<Response> {
  const result: RunResult = {
    ok: true,
    scanned_users: 0,
    scanned_leagues: 0,
    sent: 0,
    failed: 0,
    skipped_already_sent: 0,
    errors: [],
  };

  // Auth check. In production CRON_SECRET is REQUIRED; we refuse the
  // route entirely if it is unset so an unauthenticated caller cannot
  // iterate every user's leagues and trigger Sleeper fetches + Resend
  // emails. In dev/preview the secret is optional for local testing.
  const cronSecret = process.env.CRON_SECRET;
  const isProd = isProductionEnv();
  if (isProd && !cronSecret) {
    console.error(
      "[cron:aar-notifications] CRON_SECRET missing in production; refusing to run.",
    );
    return NextResponse.json(
      { ok: false, error: "cron_secret_unconfigured" },
      { status: 503 },
    );
  }
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://dynastygeneral.app";

  let admin: ReturnType<typeof getAdminClient>;
  try {
    admin = getAdminClient();
  } catch (err) {
    console.error(
      "[cron:aar-notifications:admin_client_unavailable]",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { ok: false, error: "admin_client_unavailable" },
      { status: 500 },
    );
  }

  // Pull users who have a sleeper_username set. These are the people
  // who have engaged with the product. We don't notify users who
  // haven't told us their Sleeper handle, since we couldn't link
  // them to a Sleeper account anyway.
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("user_id, sleeper_username, full_name")
    .not("sleeper_username", "is", null);

  if (profilesError) {
    console.error(
      "[cron:aar-notifications:profiles_query_failed]",
      profilesError.message,
    );
    return NextResponse.json(
      { ok: false, error: "profiles_query_failed" },
      { status: 500 },
    );
  }
  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ...result, ok: true, note: "no_profiles" });
  }

  // Fetch user emails in one batch via the auth admin API. Maps
  // user_id -> email.
  const userIds = profiles.map((p) => p.user_id as string);
  const emailByUserId = new Map<string, string>();
  for (const uid of userIds) {
    try {
      const { data: authUser, error: authErr } =
        await admin.auth.admin.getUserById(uid);
      if (authErr || !authUser?.user?.email) continue;
      emailByUserId.set(uid, authUser.user.email);
    } catch (err) {
      logErrorAndCollect(result, "auth_lookup", {
        user_id: uid,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Current NFL season for league lookup. We don't need nfl_state for
  // this; assume current calendar year. Could be refined to use
  // getNflState() but that's an extra Sleeper call per cron run that
  // doesn't change within a day.
  const season = String(new Date().getFullYear());

  for (const profile of profiles) {
    const userId = profile.user_id as string;
    const sleeperUsername = profile.sleeper_username as string;
    const ownerName =
      (profile.full_name as string | null) ?? sleeperUsername;
    const email = emailByUserId.get(userId);
    if (!email) continue;

    result.scanned_users += 1;

    // Resolve their Sleeper user_id from username.
    let sleeperUserId: string | null = null;
    try {
      const user = await getUserByUsername(sleeperUsername);
      sleeperUserId = user?.user_id ?? null;
    } catch (err) {
      logErrorAndCollect(result, "sleeper_user", {
        user_id: userId,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (!sleeperUserId) continue;

    // Pull their leagues for the current season.
    let leagues: Awaited<ReturnType<typeof getLeaguesForUser>> = [];
    try {
      leagues = await getLeaguesForUser(sleeperUserId, season);
    } catch (err) {
      logErrorAndCollect(result, "sleeper_leagues", {
        user_id: userId,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    for (const league of leagues) {
      result.scanned_leagues += 1;
      let draftState: Awaited<
        ReturnType<typeof resolveDraftState>
      > | null = null;
      try {
        draftState = await resolveDraftState(
          league.league_id,
          sleeperUserId,
        );
      } catch (err) {
        logErrorAndCollect(result, "sleeper_draft_state", {
          user_id: userId,
          league_id: league.league_id,
          message: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      if (!draftState || draftState.status !== "complete") continue;

      // Idempotency check: have we already sent this notification?
      const { data: existing } = await admin
        .from("notifications")
        .select("id, status")
        .eq("user_id", userId)
        .eq("league_id", league.league_id)
        .eq("kind", NOTIFICATION_KIND)
        .maybeSingle();

      if (existing && existing.status === "sent") {
        result.skipped_already_sent += 1;
        continue;
      }

      // Send the email.
      const args: AarNotifyArgs = {
        to: email,
        ownerName,
        leagueName: league.name,
        leagueId: league.league_id,
        appUrl,
      };
      const sendResult = await sendAarReadyEmail(args);

      if (sendResult.ok) {
        // Upsert as sent. If a prior failed row exists, replace it
        // with the success record.
        await admin
          .from("notifications")
          .upsert(
            {
              user_id: userId,
              league_id: league.league_id,
              kind: NOTIFICATION_KIND,
              status: "sent",
              error_message: null,
              sent_at: new Date().toISOString(),
            },
            { onConflict: "user_id,league_id,kind" },
          );
        result.sent += 1;
      } else {
        // Record failure so we know to retry. Upsert keeps a single
        // row per (user, league, kind); a future success will replace
        // the failed row.
        await admin
          .from("notifications")
          .upsert(
            {
              user_id: userId,
              league_id: league.league_id,
              kind: NOTIFICATION_KIND,
              status: "failed",
              error_message: sendResult.reason ?? "unknown",
              sent_at: new Date().toISOString(),
            },
            { onConflict: "user_id,league_id,kind" },
          );
        result.failed += 1;
        logErrorAndCollect(result, "email_send", {
          user_id: userId,
          league_id: league.league_id,
          message: sendResult.reason ?? "unknown",
        });
      }
    }
  }

  return NextResponse.json(result);
}
