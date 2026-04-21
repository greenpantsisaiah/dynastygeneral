import {
  getDraft,
  getDraftPicks,
  getLeague,
  getLeagueDrafts,
  getLeagueUsers,
  getRosters,
  getTradedPicks,
  type SleeperDraft,
  type SleeperDraftPick,
} from "@/lib/sleeper";
import { resolvePlayers, humanize, type HumanPlayer } from "@/lib/players/cache";
import type { SleeperPlayer } from "@/lib/sleeper/schemas";
import { slotForPickNo as snakeSlotShared } from "@/lib/sleeper/snake";

/**
 * Resolved draft state for a league. The one-call answer to
 * "what's happening in this draft right now?"
 *
 * Derived fields:
 * - next_pick_no / next_pick_label: the pick currently on the clock
 * - on_the_clock.roster_id / owner_name: who's up
 * - on_the_clock.is_me: true if the given sleeper_user_id owns that roster
 * - my_next_pick_label: the user's next upcoming pick (even if not on the clock)
 * - picks_remaining_until_me: how many picks until the user is up
 */

export type DraftStatus =
  | "pre_draft"
  | "drafting"
  | "paused"
  | "complete"
  | "no_draft";

export type OnTheClock = {
  roster_id: number | null;
  owner_name: string | null;
  is_me: boolean;
};

// One traded pick. Sleeper schema simplified for our use:
//   season + round identify which pick (e.g. 2027 R1)
//   original_owner: roster_id that originally owned this pick (their slot)
//   current_owner: roster_id that currently owns it
// When original != current, the pick has been traded.
export type TradedPick = {
  season: string;
  round: number;
  original_owner: number;
  current_owner: number;
};

export type DraftState = {
  status: DraftStatus;
  draft: SleeperDraft | null;
  draft_id: string | null;
  type: string | null; // "snake" | "linear" | "auction"
  total_teams: number;
  rounds: number;
  reversal_round: number | null; // e.g. 3 for "3rd-round reversal"; null for vanilla snake
  slot_to_roster_id: Record<number, number>; // 1-indexed slot → roster_id
  picks_so_far: SleeperDraftPick[];
  // All league traded picks (current + future seasons). Lets us spot
  // managers who punted this season for futures or mortgaged futures
  // for current production. Strong characterization signal.
  traded_picks: TradedPick[];
  next_pick_no: number | null;
  next_pick_label: string | null; // e.g. "5.9"
  on_the_clock: OnTheClock;
  my_roster_id: number | null;
  my_slot: number | null;
  my_next_pick_no: number | null;
  my_next_pick_label: string | null;
  picks_until_me: number | null;
  drafted_player_ids: Set<string>;
};

/**
 * Pick the most relevant draft for a league: prefer the one that's
 * currently drafting, else the most recent one.
 */
function pickActiveDraft(drafts: SleeperDraft[]): SleeperDraft | null {
  if (drafts.length === 0) return null;
  const drafting = drafts.find((d) => d.status === "drafting");
  if (drafting) return drafting;
  const paused = drafts.find((d) => d.status === "paused");
  if (paused) return paused;
  const preDraft = drafts.find((d) => d.status === "pre_draft");
  if (preDraft) return preDraft;
  return drafts[0];
}

function normalizeStatus(s: string | null | undefined): DraftStatus {
  if (s === "drafting") return "drafting";
  if (s === "paused") return "paused";
  if (s === "pre_draft") return "pre_draft";
  if (s === "complete") return "complete";
  return "no_draft";
}

function labelForPickNo(pickNo: number, teams: number): string {
  const round = Math.ceil(pickNo / teams);
  const within = ((pickNo - 1) % teams) + 1;
  return `${round}.${within}`;
}

function rosterIdForSlot(
  draft: SleeperDraft,
  slot: number,
): number | null {
  const map = draft.slot_to_roster_id ?? {};
  const raw = map[String(slot)];
  return typeof raw === "number" ? raw : null;
}

export async function resolveDraftState(
  leagueId: string,
  mySleeperUserId?: string | null,
): Promise<DraftState> {
  const [drafts, league, rosters, users, tradedPicksRaw] = await Promise.all([
    getLeagueDrafts(leagueId),
    getLeague(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId),
    getTradedPicks(leagueId).catch(() => []),
  ]);

  // Normalize traded picks to our internal shape and only keep ones
  // that have actually changed hands. Original-owner == current-owner
  // means the pick was traded then returned (or schema noise); skip.
  const tradedPicks = tradedPicksRaw
    .filter((t) => t.roster_id !== t.owner_id)
    .map((t) => ({
      season: t.season,
      round: t.round,
      original_owner: t.roster_id,
      current_owner: t.owner_id,
    }));

  const active = pickActiveDraft(drafts);
  if (!active) {
    return emptyState(
      "no_draft",
      league?.total_rosters ?? rosters.length,
      tradedPicks,
    );
  }

  const [draft, picks] = await Promise.all([
    getDraft(active.draft_id),
    getDraftPicks(active.draft_id),
  ]);
  if (!draft) {
    return emptyState(
      "no_draft",
      league?.total_rosters ?? rosters.length,
      tradedPicks,
    );
  }

  const totalTeams = league?.total_rosters ?? rosters.length ?? 12;
  const settings = (draft.settings ?? {}) as Record<string, unknown>;
  const rounds = typeof settings.rounds === "number" ? settings.rounds : 0;
  const reversalRound =
    typeof settings.reversal_round === "number" && settings.reversal_round >= 2
      ? (settings.reversal_round as number)
      : null;

  // Numeric copy of slot_to_roster_id for downstream consumers.
  const slotToRoster: Record<number, number> = {};
  for (const [k, v] of Object.entries(draft.slot_to_roster_id ?? {})) {
    const slot = Number(k);
    if (Number.isFinite(slot) && typeof v === "number") slotToRoster[slot] = v;
  }

  const status = normalizeStatus(draft.status);
  const picksMade = picks.filter((p) => p.player_id !== null);
  const nextPickNo = picksMade.length + 1;
  const maxPicks = rounds > 0 ? rounds * totalTeams : Infinity;
  const inProgress = nextPickNo <= maxPicks && status !== "complete";

  // On the clock
  let onClockRosterId: number | null = null;
  if (inProgress) {
    const slotCalc = snakeSlotShared(nextPickNo, totalTeams, {
      type: draft.type,
      reversalRound,
    });
    onClockRosterId = rosterIdForSlot(draft, slotCalc.slot);
  }

  // Resolve owner names
  const userByRoster = new Map<number, string>();
  const byUserId = new Map<string, string>();
  for (const u of users) {
    const meta = (u.metadata ?? {}) as Record<string, unknown>;
    const name =
      (typeof meta.team_name === "string" && meta.team_name) ||
      u.display_name ||
      `User ${u.user_id}`;
    byUserId.set(u.user_id, name);
  }
  for (const r of rosters) {
    const name = r.owner_id ? byUserId.get(r.owner_id) : undefined;
    if (name) userByRoster.set(r.roster_id, name);
  }

  // My roster
  const myRoster = mySleeperUserId
    ? rosters.find((r) => r.owner_id === mySleeperUserId)
    : undefined;
  const myRosterId = myRoster?.roster_id ?? null;

  // My slot in the draft. Derived from slot_to_roster_id (authoritative).
  let mySlot: number | null = null;
  if (myRosterId != null) {
    for (const [slotStr, rid] of Object.entries(slotToRoster)) {
      if (rid === myRosterId) {
        mySlot = Number(slotStr);
        break;
      }
    }
  }

  // My next pick: walk forward from nextPickNo, find the next pick slot that belongs to me
  let myNextPickNo: number | null = null;
  let picksUntilMe: number | null = null;
  if (inProgress && myRosterId != null) {
    for (let n = nextPickNo; n <= Math.min(maxPicks, nextPickNo + totalTeams * 3); n++) {
      const s = snakeSlotShared(n, totalTeams, {
        type: draft.type,
        reversalRound,
      });
      if (rosterIdForSlot(draft, s.slot) === myRosterId) {
        myNextPickNo = n;
        picksUntilMe = n - nextPickNo;
        break;
      }
    }
  }

  return {
    status,
    draft,
    draft_id: draft.draft_id,
    type: draft.type,
    total_teams: totalTeams,
    rounds,
    reversal_round: reversalRound,
    slot_to_roster_id: slotToRoster,
    picks_so_far: picks,
    traded_picks: tradedPicks,
    next_pick_no: inProgress ? nextPickNo : null,
    next_pick_label: inProgress ? labelForPickNo(nextPickNo, totalTeams) : null,
    on_the_clock: {
      roster_id: onClockRosterId,
      owner_name:
        onClockRosterId != null
          ? userByRoster.get(onClockRosterId) ?? null
          : null,
      is_me: onClockRosterId != null && onClockRosterId === myRosterId,
    },
    my_roster_id: myRosterId,
    my_slot: mySlot,
    my_next_pick_no: myNextPickNo,
    my_next_pick_label:
      myNextPickNo != null ? labelForPickNo(myNextPickNo, totalTeams) : null,
    picks_until_me: picksUntilMe,
    drafted_player_ids: new Set(
      picksMade.map((p) => p.player_id).filter((id): id is string => !!id),
    ),
  };
}

function emptyState(
  status: DraftStatus,
  totalTeams: number,
  tradedPicks: TradedPick[] = [],
): DraftState {
  return {
    status,
    draft: null,
    draft_id: null,
    type: null,
    total_teams: totalTeams,
    rounds: 0,
    reversal_round: null,
    slot_to_roster_id: {},
    picks_so_far: [],
    traded_picks: tradedPicks,
    next_pick_no: null,
    next_pick_label: null,
    on_the_clock: { roster_id: null, owner_name: null, is_me: false },
    my_roster_id: null,
    my_slot: null,
    my_next_pick_no: null,
    my_next_pick_label: null,
    picks_until_me: null,
    drafted_player_ids: new Set(),
  };
}

// ── Available-player ranking ──────────────────────────────────────────────

const DYNASTY_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

export async function rankAvailablePlayers(
  state: DraftState,
  opts: { limit?: number } = {},
): Promise<HumanPlayer[]> {
  const limit = opts.limit ?? 60;
  if (!state.draft_id) return [];

  // Pull the full player cache. resolvePlayers takes specific ids, so we
  // instead reach through the cached Map; add a helper below.
  const all = await getAllCachedPlayers();
  const drafted = state.drafted_player_ids;

  const ranked = all
    .filter((p) => !drafted.has(p.player_id))
    .filter((p) => {
      const pos = (p.position ?? "").toUpperCase();
      if (!DYNASTY_POSITIONS.has(pos)) return false;
      return true;
    })
    .filter((p) => typeof p.search_rank === "number" && p.search_rank > 0)
    .sort((a, b) => (a.search_rank ?? 9999) - (b.search_rank ?? 9999));

  return ranked.slice(0, limit).map(humanize);
}

/**
 * Fetch all players from the cache as an array. Internal to this module;
 * we avoid exposing the full Map to the rest of the app.
 */
async function getAllCachedPlayers(): Promise<SleeperPlayer[]> {
  // Lazy import to keep this file's server-only surface tight
  const mod = await import("@/lib/players/cache");
  // Resolve a bogus id to force cache warm, then dig into the cache.
  // We need access to the full map. Add an internal accessor.
  return await mod.__dumpAllPlayers();
}
