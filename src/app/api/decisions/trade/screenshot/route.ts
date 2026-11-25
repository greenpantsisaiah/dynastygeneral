/**
 * POST /api/decisions/trade/screenshot
 *
 * Reads a Sleeper trade screenshot (league-chat trade card or trade
 * offer screen) and returns the trade as the incoming-trade form needs
 * it: you send / you receive, matched to real players on the league's
 * rosters, plus anything the user must confirm (low-confidence matches,
 * look-alike names, uncertain sides). It never evaluates the trade; the
 * user confirms the read, then the normal /api/decisions/trade call
 * runs. One vision call per upload; same gates as the trade engine.
 */

import { z } from "zod";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { checkBudget } from "@/lib/budget";
import { guardLlmEnforcement } from "@/lib/ops/llm-guard";
import { checkProGate } from "@/lib/auth/paywall";
import { __dumpAllPlayers } from "@/lib/players/cache";
import {
  getLeagueUsers,
  getRosters,
  getUserByUsername,
} from "@/lib/sleeper/client";
import { isRosterOwnedBy } from "@/lib/sleeper/roster-identity";
import {
  ALLOWED_IMAGE_TYPES,
  readTradeScreenshot,
} from "@/lib/trade/screenshot-read";
import {
  ScreenshotReadError,
  matchScreenshotTrade,
  type MatchRoster,
} from "@/lib/trade/screenshot-match";

export const runtime = "nodejs";
export const maxDuration = 45;

const LEAGUE_ID_RE = /^[a-zA-Z0-9_-]{1,32}$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{1,60}$/;
// ~3.75 MB decoded. The client downscales to a 2000px long edge JPEG
// (typically 200-500 KB) before upload, so this only stops abuse.
const MAX_BASE64_CHARS = 5_000_000;

const bodySchema = z.object({
  league_id: z.string().regex(LEAGUE_ID_RE),
  sleeper_username: z.string().regex(USERNAME_RE).nullish(),
  media_type: z.enum(ALLOWED_IMAGE_TYPES),
  image_base64: z
    .string()
    .min(100)
    .max(MAX_BASE64_CHARS)
    .regex(/^[A-Za-z0-9+/]+=*$/),
});

export async function POST(req: Request) {
  const gate = await checkProGate();
  if (!gate.ok) return gate.response;

  const guard = guardLlmEnforcement();
  if (guard) return guard;

  const rate = await checkRateLimit("trade-screenshot", clientIpFrom(req));
  if (!rate.allowed) {
    const wait = Math.ceil(rate.reset_ms / 1000);
    return Response.json(
      { ok: false, error: `Too many screenshot uploads. Wait ${wait}s.` },
      { status: 429, headers: { "retry-after": String(wait) } },
    );
  }
  const budget = await checkBudget();
  if (!budget.allowed) {
    return Response.json(
      { ok: false, error: "Daily analysis capacity reached. Try again tomorrow." },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "Upload wasn't readable. Try the screenshot again." },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "That file isn't a supported screenshot. Use a PNG or JPEG under 3 MB." },
      { status: 400 },
    );
  }
  const { league_id, sleeper_username, media_type, image_base64 } = parsed.data;

  try {
    // League data and the vision read run in parallel.
    const [read, rosters, users, me, pool] = await Promise.all([
      readTradeScreenshot({ base64: image_base64, mediaType: media_type }),
      getRosters(league_id),
      getLeagueUsers(league_id),
      sleeper_username ? getUserByUsername(sleeper_username) : Promise.resolve(null),
      __dumpAllPlayers(),
    ]);

    const nameById = new Map<string, string[]>();
    for (const u of users) {
      const names = [u.display_name, (u as { username?: string }).username]
        .filter((n): n is string => typeof n === "string" && n.length > 0);
      nameById.set(u.user_id, names);
    }
    const matchRosters: MatchRoster[] = rosters.map((r) => ({
      roster_id: r.roster_id,
      manager_names: [r.owner_id, ...(r.co_owners ?? [])]
        .filter((id): id is string => Boolean(id))
        .flatMap((id) => nameById.get(id) ?? []),
      // roster.players is Sleeper's server of record outside a live
      // draft; trades are proposed between drafts. A player missing here
      // still resolves through the full player pool.
      player_ids: r.players ?? [],
    }));
    const myRoster = me
      ? rosters.find((r) => isRosterOwnedBy(r, me.user_id)) ?? null
      : null;

    const match = matchScreenshotTrade({
      extracted: read.extracted,
      pool,
      rosters: matchRosters,
      myRosterId: myRoster?.roster_id ?? null,
    });
    if (!myRoster) {
      match.side_confidence = "low";
      match.warnings.unshift(
        "Your Sleeper username isn't on this page, so the sides are a guess. Check them.",
      );
    }

    return Response.json({
      ok: true,
      engine_mode: read.mode,
      format: read.extracted.format,
      league_name: read.extracted.league_name,
      ...match,
    });
  } catch (err) {
    if (err instanceof ScreenshotReadError) {
      return Response.json({ ok: false, error: err.message }, { status: 422 });
    }
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[decisions:trade:screenshot]", e.message, e.stack);
    return Response.json(
      { ok: false, error: "Screenshot reader didn't return. Retry in a moment." },
      { status: 500 },
    );
  }
}
