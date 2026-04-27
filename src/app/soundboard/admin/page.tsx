import { redirect } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { getAdminUser } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  DIAL_SPECS,
  FEEDBACK_SHAPE_LABELS,
  type FeedbackShape,
} from "@/lib/soundboard/types";

export const metadata = {
  title: "Soundboard · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type FeedbackRow = {
  id: string;
  user_id: string | null;
  dial_id: string;
  shape: FeedbackShape;
  comment: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
};

type SuggestionRow = {
  id: string;
  user_id: string | null;
  proposal: string;
  context: Record<string, unknown> | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  dials: Record<string, number | string> | null;
  notes: Record<string, string> | null;
  last_edited_at: string | null;
};

export default async function SoundboardAdminPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/login?next=/soundboard/admin");

  // Service-role read so RLS doesn't filter to admin's own rows.
  const supabase = getAdminClient();
  const [{ data: feedback }, { data: suggestions }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("mixer_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("mixer_suggestions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("judgment_profiles")
        .select("user_id, dials, notes, last_edited_at")
        .not("last_edited_at", "is", null)
        .order("last_edited_at", { ascending: false })
        .limit(100),
    ]);

  const feedbackRows = (feedback ?? []) as FeedbackRow[];
  const suggestionRows = (suggestions ?? []) as SuggestionRow[];
  const profileRows = (profiles ?? []) as ProfileRow[];
  // Profiles with at least one note are the calibration signal.
  const profilesWithNotes = profileRows.filter(
    (p) => p.notes && Object.values(p.notes).some((n) => (n ?? "").trim()),
  );
  const feedbackByDial = new Map<string, FeedbackRow[]>();
  for (const row of feedbackRows) {
    const list = feedbackByDial.get(row.dial_id) ?? [];
    list.push(row);
    feedbackByDial.set(row.dial_id, list);
  }
  const dialNameById = new Map(DIAL_SPECS.map((s) => [s.id, s.name]));

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-4xl px-6 py-12">
            <Ticker label="Soundboard · admin · feedback queue" />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
              Soundboard feedback
            </h1>
            <p className="mt-3 text-sm text-muted">
              Per-dial WHY notes, suggestions, and parked argument
              submissions land here. Notes are the live calibration
              signal; arguments are parked until engine wiring lands.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Stat
                label="Profiles with notes"
                value={profilesWithNotes.length}
              />
              <Stat
                label="Suggestions (lifetime)"
                value={suggestionRows.length}
              />
              <Stat
                label="Arguments (parked)"
                value={feedbackRows.length}
              />
            </div>

            <h2 className="mt-10 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
              Recent dial notes
            </h2>
            {profilesWithNotes.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No notes yet. Move a dial from /soundboard and add a one-line WHY to verify the queue.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {profilesWithNotes.map((p) => {
                  const noteEntries = Object.entries(p.notes ?? {}).filter(
                    ([, v]) => (v ?? "").trim(),
                  );
                  return (
                    <div
                      key={p.user_id}
                      className="rounded-lg border border-border-strong bg-surface px-5 py-4"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-[10px] text-muted-2">
                          user: {p.user_id}
                        </span>
                        <span className="font-mono text-[10px] text-muted-2">
                          {p.last_edited_at
                            ? new Date(p.last_edited_at).toLocaleString()
                            : ""}
                        </span>
                      </div>
                      <ul className="mt-3 space-y-2">
                        {noteEntries.map(([dialId, note]) => {
                          const value = (p.dials ?? {})[dialId];
                          return (
                            <li key={dialId} className="text-sm">
                              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                                {dialNameById.get(dialId as never) ??
                                  `Unknown: ${dialId}`}
                                {value !== undefined && (
                                  <span className="ml-2 text-muted-2">
                                    = {String(value)}
                                  </span>
                                )}
                              </span>
                              <p className="mt-1 text-foreground">{note}</p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            <h2 className="mt-12 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
              Arguments by dial (parked)
            </h2>
            {feedbackRows.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Argue is parked until engine wiring lands. No new submissions expected.
              </p>
            ) : (
              <div className="mt-4 space-y-6">
                {DIAL_SPECS.map((spec) => {
                  const rows = feedbackByDial.get(spec.id) ?? [];
                  if (rows.length === 0) return null;
                  return (
                    <div
                      key={spec.id}
                      className="rounded-lg border border-border-strong bg-surface px-5 py-4"
                    >
                      <div className="flex items-baseline justify-between">
                        <div className="text-base font-semibold text-foreground">
                          {spec.name}
                        </div>
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                          {rows.length} arg{rows.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <ul className="mt-3 space-y-2 divide-y divide-border-soft">
                        {rows.map((r) => (
                          <li key={r.id} className="pt-2 text-sm">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
                                {FEEDBACK_SHAPE_LABELS[r.shape]}
                              </span>
                              <span className="font-mono text-[10px] text-muted-2">
                                {new Date(r.created_at).toLocaleString()}
                              </span>
                            </div>
                            {r.comment && (
                              <p className="mt-1 text-foreground">
                                {r.comment}
                              </p>
                            )}
                            <div className="mt-1 font-mono text-[10px] text-muted-2">
                              user: {r.user_id ?? "anonymous"}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {/* Orphan rows (dial_id not in current spec list) */}
                {Array.from(feedbackByDial.entries())
                  .filter(([id]) => !dialNameById.has(id as never))
                  .map(([id, rows]) => (
                    <div
                      key={id}
                      className="rounded-lg border border-warning/40 bg-warning/5 px-5 py-4"
                    >
                      <div className="text-sm font-semibold text-warning">
                        Unknown dial: {id}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {rows.length} arg(s) for a dial id no longer in
                        DIAL_SPECS. Likely renamed; archive after review.
                      </p>
                    </div>
                  ))}
              </div>
            )}

            <h2 className="mt-12 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
              Suggestions
            </h2>
            {suggestionRows.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No suggestions yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {suggestionRows.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-border-strong bg-surface px-5 py-4 text-sm"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                        Proposal
                      </span>
                      <span className="font-mono text-[10px] text-muted-2">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-2 text-foreground whitespace-pre-wrap">
                      {r.proposal}
                    </p>
                    <div className="mt-2 font-mono text-[10px] text-muted-2">
                      user: {r.user_id ?? "anonymous"}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-10 flex flex-wrap items-center gap-4 text-xs text-muted-2">
              <Link href="/soundboard" className="hover:text-accent">
                ← Back to Soundboard
              </Link>
              <Link href="/account" className="hover:text-accent">
                Account →
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border-strong bg-surface px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}
