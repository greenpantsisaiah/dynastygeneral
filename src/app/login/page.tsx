import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { getOptionalUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/safe-next";
import { GoogleSignInButton } from "@/components/auth/google-sign-in";
import { EmailSignInForm } from "@/components/auth/email-sign-in";

export const metadata = {
  title: "Sign In",
  description: "Sign in to Dynasty Copilot with Google or email to access your dynasty leagues.",
  alternates: { canonical: "/login" },
};

type SearchParams = Promise<{ error?: string; next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const user = await getOptionalUser();
  const safeNext = safeNextPath(params.next);
  if (user) redirect(safeNext);

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="mx-auto max-w-md px-6 py-20">
          <Ticker label="Sign in · one click" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
            Welcome back.
          </h1>
          <p className="mt-3 text-sm text-muted">
            Sign in with Google or email. No marketing email by default.
          </p>

          {params.error && (
            <div className="mt-6 rounded-md border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-foreground">
              {params.error}
            </div>
          )}

          <div className="mt-6 space-y-4">
            <GoogleSignInButton next={safeNext} />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border-soft" />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                or
              </span>
              <div className="h-px flex-1 bg-border-soft" />
            </div>

            <EmailSignInForm next={safeNext} />

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
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
