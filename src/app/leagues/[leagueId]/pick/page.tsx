import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import {
  rankAvailablePlayers,
  resolveDraftState,
  type DraftState,
} from "@/lib/sleeper/draft-state";
import { getUserByUsername } from "@/lib/sleeper";
import { formatPlayerShort, type HumanPlayer } from "@/lib/players/cache";
import { PickForm } from "./pick-form";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ username?: string; season?: string }>;
};

export default async function PickPage({ params, searchParams }: PageProps) {
  const { leagueId } = await params;
  const { username = "", season = "" } = await searchParams;
  const cleaned = username.trim().replace(/^@/, "");

  const back = `/leagues/${leagueId}${
    cleaned || season
      ? `?${new URLSearchParams({
          ...(cleaned ? { username: cleaned } : {}),
          ...(season ? { season } : {}),
        }).toString()}`
      : ""
  }`;

  // Resolve who the user is on Sleeper (if they told us) so we can detect
  // "you're on the clock."
  const sleeperUser = cleaned ? await getUserByUsername(cleaned) : null;

  // Draft state + best-available runs in parallel with each other but
  // depends on the user lookup above.
  let draftState: DraftState | null = null;
  let available: HumanPlayer[] = [];
  try {
    draftState = await resolveDraftState(
      leagueId,
      sleeperUser?.user_id ?? null,
    );
    if (draftState.draft_id) {
      available = await rankAvailablePlayers(draftState, { limit: 60 });
    }
  } catch (err) {
    console.error("[pick:draft-state]", err);
  }

  const draftActive =
    !!draftState &&
    (draftState.status === "drafting" || draftState.status === "paused");

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-grid">
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
          <div className="flex items-center justify-between">
            <Ticker
              label={
                draftActive && draftState
                  ? `Draft ${draftState.status} · ${draftState.type ?? "snake"}`
                  : "Pick decision · live"
              }
            />
            <Link
              href={back}
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2 hover:text-foreground"
            >
              ← Back to hub
            </Link>
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {draftState?.on_the_clock.is_me
              ? "You're on the clock."
              : "On the clock."}
          </h1>

          {draftState && draftActive && <DraftStatePanel state={draftState} />}

          <p className="mt-6 max-w-2xl text-muted">
            {draftActive
              ? "Live draft detected. Pick and available players are pre-filled. Edit anything you want, add notes, then get the recommendation."
              : "Drop the pick you're on and the players still available. You'll get a recommendation, the opportunity cost, and an alternative if the call is close."}
          </p>

          <PickForm
            leagueId={leagueId}
            sleeperUsername={cleaned}
            defaultCurrentPick={
              draftState?.on_the_clock.is_me
                ? (draftState.next_pick_label ?? "")
                : (draftState?.my_next_pick_label ?? "")
            }
            defaultPlayers={available.map(formatPlayerShort)}
          />
        </div>
      </main>
    </>
  );
}

function DraftStatePanel({ state }: { state: DraftState }) {
  const lines: React.ReactNode[] = [];

  if (state.on_the_clock.is_me && state.next_pick_label) {
    lines.push(
      <div key="on-clock" className="text-foreground">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          ON THE CLOCK
        </span>{" "}
        · pick {state.next_pick_label} (#{state.next_pick_no})
      </div>,
    );
  } else if (
    state.on_the_clock.owner_name &&
    state.next_pick_label &&
    state.picks_until_me != null
  ) {
    lines.push(
      <div key="waiting" className="text-foreground">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
          CURRENT PICK
        </span>{" "}
        · {state.next_pick_label} · {state.on_the_clock.owner_name}
      </div>,
    );
    if (state.my_next_pick_label) {
      lines.push(
        <div key="my-next" className="text-muted">
          Your next pick:{" "}
          <span className="text-foreground">{state.my_next_pick_label}</span>
          {" · "}
          {state.picks_until_me} pick{state.picks_until_me === 1 ? "" : "s"} away
        </div>,
      );
    }
  } else if (state.next_pick_label) {
    lines.push(
      <div key="next" className="text-foreground">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
          NEXT PICK
        </span>{" "}
        · {state.next_pick_label}
      </div>,
    );
  }

  if (lines.length === 0) return null;

  return (
    <div className="mt-6 rounded-lg border border-border-soft bg-surface px-5 py-4 text-sm">
      <div className="space-y-1.5">{lines}</div>
    </div>
  );
}
