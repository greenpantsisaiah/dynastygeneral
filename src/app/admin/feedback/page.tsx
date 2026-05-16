import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { getAdminUser } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Feedback review queue. Surfaces every row in the `feedback` table
 * (newest first) so the founder can read in-app feedback without
 * opening the Supabase dashboard. Gated by ADMIN_EMAILS.
 *
 * Pairs with sendFeedbackNotification in /api/feedback/route.ts which
 * emails the admin on every new submission.
 */
export const metadata = {
  title: "Feedback · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type FeedbackRow = {
  id: string;
  user_id: string | null;
  rating: number | null;
  message: string;
  page_url: string | null;
  contact_email: string | null;
  created_at: string;
};

const MAX_ROWS = 500;

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  return d.toLocaleDateString();
}

function ratingTone(r: number | null): string {
  if (r == null) return "text-muted-2";
  if (r >= 4) return "text-success";
  if (r === 3) return "text-warning";
  return "text-danger";
}

export default async function FeedbackAdminPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/login?next=/admin/feedback");

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("feedback")
    .select("id, user_id, rating, message, page_url, contact_email, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    return (
      <>
        <SiteNav />
        <main className="flex-1 bg-background">
          <section className="mx-auto max-w-5xl px-6 py-12">
            <Ticker label="Admin · feedback queue" />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
              Feedback queue failed to load.
            </h1>
            <pre className="mt-4 rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-xs text-danger">
              {error.message}
            </pre>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  const rows = (data ?? []) as FeedbackRow[];

  // Resolve user emails for rows that have a user_id. Per-row auth.admin
  // lookup; for 500-row max this is reasonable. We deliberately keep
  // anonymous submitters anonymous (no IP lookup).
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id)),
  );
  const emailByUserId = new Map<string, string>();
  for (const uid of userIds) {
    try {
      const { data: u } = await supabase.auth.admin.getUserById(uid);
      const email = u?.user?.email;
      if (email) emailByUserId.set(uid, email);
    } catch {
      // ignore per-user lookup failures
    }
  }

  const total = rows.length;
  const withRating = rows.filter((r) => r.rating != null);
  const ratingsHistogram = [1, 2, 3, 4, 5].map((r) => ({
    rating: r,
    count: withRating.filter((row) => row.rating === r).length,
  }));
  const unread24h = rows.filter((r) => {
    const ts = new Date(r.created_at).getTime();
    return Date.now() - ts < 24 * 60 * 60 * 1000;
  }).length;

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="mx-auto max-w-5xl px-6 py-12">
          <Ticker label="Admin · feedback queue" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Feedback queue.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Every in-app feedback submission, newest first. Capped at{" "}
            {MAX_ROWS} rows. Notifications fire by email on each new
            submission (set FEEDBACK_NOTIFY_TO or ADMIN_EMAILS, plus
            RESEND_API_KEY, in Vercel env).
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <Stat label="Total" value={total} />
            <Stat label="Last 24h" value={unread24h} tone="accent" />
            <Stat
              label="With rating"
              value={withRating.length}
              sub={`of ${total}`}
            />
            <Stat
              label="Anonymous"
              value={rows.filter((r) => !r.user_id).length}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-border-soft bg-surface px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
            Ratings:
            {ratingsHistogram.map((b) => (
              <span key={b.rating}>
                <span className={ratingTone(b.rating)}>★{b.rating}</span>{" "}
                <span className="text-foreground">{b.count}</span>
              </span>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="mt-8 rounded-md border border-border-soft bg-surface px-5 py-8 text-center text-sm text-muted">
              No feedback in the queue yet.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {rows.map((row) => {
                const email = row.user_id
                  ? emailByUserId.get(row.user_id) ?? null
                  : null;
                const submitter = email
                  ? email
                  : row.user_id
                    ? "signed-in (no email)"
                    : "anonymous";
                return (
                  <article
                    key={row.id}
                    className="rounded-lg border border-border-soft bg-surface px-5 py-4"
                  >
                    <header className="flex flex-wrap items-baseline justify-between gap-3">
                      <div className="flex flex-wrap items-baseline gap-3">
                        {row.rating != null && (
                          <span
                            className={`font-mono text-[11px] font-semibold uppercase tracking-[0.18em] ${ratingTone(row.rating)}`}
                          >
                            ★{row.rating}
                          </span>
                        )}
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
                          {submitter}
                        </span>
                        {row.contact_email && row.contact_email !== email && (
                          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                            contact · {row.contact_email}
                          </span>
                        )}
                      </div>
                      <span
                        className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2"
                        title={new Date(row.created_at).toLocaleString()}
                      >
                        {timeAgo(row.created_at)}
                      </span>
                    </header>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {row.message}
                    </p>

                    {row.page_url && (
                      <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
                        page ·{" "}
                        <a
                          href={row.page_url}
                          rel="noopener noreferrer"
                          target="_blank"
                          className="text-accent hover:underline"
                        >
                          {row.page_url}
                        </a>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={`rounded-md border ${
        tone === "accent"
          ? "border-accent/40 bg-accent/5"
          : "border-border-soft bg-surface"
      } px-4 py-3`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-foreground">
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 font-mono text-[10px] text-muted-2">{sub}</div>
      )}
    </div>
  );
}
