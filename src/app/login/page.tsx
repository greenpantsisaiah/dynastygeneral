import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { createClient } from "@/lib/supabase/server";
import { getOptionalUser } from "@/lib/auth/session";

export const metadata = {
  title: "Sign in · Dynasty Copilot",
  description: "Magic-link sign-in. No password to remember.",
};

type SearchParams = Promise<{ sent?: string; error?: string; next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const user = await getOptionalUser();
  if (user) redirect(params.next ?? "/account");

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="mx-auto max-w-md px-6 py-20">
          <Ticker label="Sign in · magic link" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
            Welcome back.
          </h1>
          <p className="mt-3 text-sm text-muted">
            Enter your email. We send a one-click sign-in link. No password
            to remember, no marketing email by default.
          </p>

          {params.sent && (
            <div className="mt-6 rounded-md border border-success/50 bg-success/10 px-4 py-3 text-sm text-foreground">
              Check your email. The link signs you in instantly.
            </div>
          )}
          {params.error && (
            <div className="mt-6 rounded-md border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-foreground">
              Couldn't send the link. {params.error}
            </div>
          )}

          <form action={sendMagicLinkAction} className="mt-6 space-y-3">
            <input
              type="hidden"
              name="next"
              value={params.next ?? "/account"}
            />
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
                Email
              </span>
              <input
                type="email"
                name="email"
                required
                placeholder="you@example.com"
                className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Email me a sign-in link
            </button>
            <p className="text-xs text-muted-2">
              First time? We'll create your account on first sign-in. By
              continuing you agree to the{" "}
              <a href="/terms" className="text-accent hover:underline">
                Terms
              </a>{" "}
              and{" "}
              <a href="/privacy" className="text-accent hover:underline">
                Privacy Policy
              </a>
              .
            </p>
          </form>
        </section>
      </main>
      <Footer />
    </>
  );
}

async function sendMagicLinkAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const next = String(formData.get("next") ?? "/account");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`/login?error=Please+enter+a+valid+email`);
  }

  const supabase = await createClient();
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "dynastygeneral.app";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/login?sent=1`);
}
