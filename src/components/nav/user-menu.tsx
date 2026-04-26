"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Props = {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  tier: "free" | "pro";
};

export function UserMenu({ name, email, avatarUrl, tier }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const initials = name
    ? name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : email
      ? email[0].toUpperCase()
      : "?";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-2 rounded-md border border-border-strong bg-surface px-2 text-xs font-medium text-foreground transition hover:border-accent/60"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">
            {initials}
          </span>
        )}
        <span className="hidden max-w-[120px] truncate sm:inline">
          {name ?? email?.split("@")[0] ?? "Account"}
        </span>
        {tier === "pro" ? (
          <span className="rounded-full bg-success/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-success">
            Pro
          </span>
        ) : (
          <span className="rounded-full bg-muted/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
            Free
          </span>
        )}
        <svg
          className={`h-3 w-3 text-muted transition ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-border-strong bg-background shadow-xl">
          <div className="border-b border-border-soft px-4 py-3">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent">
                  {initials}
                </span>
              )}
              <div className="min-w-0 flex-1">
                {name && (
                  <p className="truncate text-sm font-medium text-foreground">
                    {name}
                  </p>
                )}
                {email && (
                  <p className="truncate text-xs text-muted">{email}</p>
                )}
              </div>
            </div>
            {tier === "pro" ? (
              <div className="mt-2 inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-success">
                Pro plan
              </div>
            ) : (
              <div className="mt-2 inline-flex items-center rounded-full border border-border-strong bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Free plan
              </div>
            )}
          </div>
          <div className="py-1">
            <MenuLink href="/account" onClick={() => setOpen(false)}>
              Account settings
            </MenuLink>
            <MenuLink href="/leagues" onClick={() => setOpen(false)}>
              My leagues
            </MenuLink>
            <MenuLink href="/soundboard" onClick={() => setOpen(false)}>
              Soundboard
            </MenuLink>
            <MenuLink href="/pricing" onClick={() => setOpen(false)}>
              {tier === "pro" ? "Manage plan" : "Upgrade to Pro"}
            </MenuLink>
          </div>
          <div className="border-t border-border-soft py-1">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center px-4 py-2 text-left text-sm text-muted transition hover:bg-surface hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center px-4 py-2 text-sm text-muted transition hover:bg-surface hover:text-foreground"
    >
      {children}
    </Link>
  );
}
