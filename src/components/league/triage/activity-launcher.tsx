/**
 * Activity launcher for the triage hub. Per the redesign: the hub is
 * a triage page, not a content tower. Each card routes the user to a
 * focused activity surface.
 *
 * Cards adapt to draft stage (the "make this pick" card is more
 * prominent during an active draft).
 */

import Link from "next/link";

export type ActivityLauncherProps = {
  leagueId: string;
  username: string | null;
  draftActive: boolean;
  picksUntilMe: number | null;
};

export function ActivityLauncher({
  leagueId,
  username,
  draftActive,
  picksUntilMe,
}: ActivityLauncherProps) {
  const usernameQs = username ? `?username=${encodeURIComponent(username)}` : "";
  const cards = [
    {
      title: "Your team",
      blurb: "Identity, EV bank leaderboard, comparator, risk fingerprint.",
      href: `/leagues/${leagueId}/team${usernameQs}`,
      tone: "default" as const,
      visible: true,
    },
    {
      title: "Trade leverage",
      blurb: "Where the soft spots are, who needs what, what to send.",
      href: `/leagues/${leagueId}/trade${usernameQs}`,
      tone: "default" as const,
      visible: true,
    },
    {
      title: "Plan ahead",
      blurb: "Future picks, contender outlook, keeper slate.",
      href: `/leagues/${leagueId}/strategy${usernameQs}`,
      tone: "default" as const,
      visible: true,
    },
    {
      title: "Intel",
      blurb: "Library articles, league-wide inflections, what changed.",
      href: `/leagues/${leagueId}/intel${usernameQs}`,
      tone: "default" as const,
      visible: true,
    },
    {
      title: "Coach",
      blurb: "Conversational analyst with full league context.",
      href: `/leagues/${leagueId}/coach${usernameQs}`,
      tone: "default" as const,
      visible: true,
    },
  ];
  return (
    <section className="my-8" aria-label="Activity launcher">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2 mb-3">
        Where to next
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards
          .filter((c) => c.visible)
          .map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className={`block rounded-lg border bg-surface px-4 py-4 transition-colors ${
                c.tone === "default"
                  ? "border-border-soft hover:border-accent"
                  : "border-border-strong hover:border-accent"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-foreground font-semibold text-sm">
                  {c.title}
                </div>
                <span className="font-mono text-[14px] text-muted-2">→</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                {c.blurb}
              </p>
            </Link>
          ))}
      </div>
      {draftActive && picksUntilMe != null && picksUntilMe <= 1 && (
        <p className="mt-4 text-[11px] leading-snug text-muted-2">
          {picksUntilMe === 0
            ? "On the clock. The Call below is your move."
            : "1 pick away. The Call below is the standing recommendation."}
        </p>
      )}
    </section>
  );
}
