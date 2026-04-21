import {
  getLeaguesForUser,
  getNflState,
  getUserByUsername,
  isDynastyLeague,
} from "@/lib/sleeper";

/**
 * Lightweight live-count endpoint for the waitlist form. Given a Sleeper
 * username, returns the dynasty + other league counts for the current
 * season. No auth; hits only the public Sleeper API.
 */

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const username = url.searchParams
    .get("username")
    ?.trim()
    .replace(/^@/, "");
  if (!username) {
    return Response.json(
      { ok: false, error: "Enter a Sleeper username." },
      { status: 400 },
    );
  }

  try {
    const user = await getUserByUsername(username);
    if (!user) {
      return Response.json(
        { ok: false, error: "No Sleeper account matches that username." },
        { status: 404 },
      );
    }
    const state = await getNflState();
    const season = state?.season ?? String(new Date().getFullYear());
    const leagues = await getLeaguesForUser(user.user_id, season);
    const dynasty = leagues.filter(isDynastyLeague).length;
    const other = leagues.length - dynasty;
    return Response.json({
      ok: true,
      username: user.username,
      display_name: user.display_name,
      season,
      dynasty,
      other,
    });
  } catch (err) {
    console.error("[sleeper:count]", err);
    return Response.json(
      { ok: false, error: "Sleeper didn't respond. Retry in a moment." },
      { status: 500 },
    );
  }
}
