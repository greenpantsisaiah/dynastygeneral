import Link from "next/link";
import { DynastyGeneralLogo } from "@/components/dynasty-general-logo";

export function Footer() {
  return (
    <footer className="border-t border-border-soft py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 text-xs text-muted-2">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 font-mono uppercase tracking-[0.18em]">
            <DynastyGeneralLogo
              size={24}
              className="h-6 w-6 text-accent"
              aria-label=""
            />
            Dynasty General
          </div>
          <div className="font-mono uppercase tracking-[0.18em]">
            Win the decision in front of you.
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-border-soft pt-5 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/rankings" className="hover:text-foreground">
              Rankings
            </Link>
            <Link href="/library" className="hover:text-foreground">
              Library
            </Link>
            <Link href="/scout" className="hover:text-foreground">
              Scout
            </Link>
            <Link href="/built-by" className="hover:text-foreground">
              Built by
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <a
              href="mailto:isaiah@nextupleader.com"
              className="hover:text-foreground"
            >
              Contact
            </a>
          </nav>
          <div className="text-[11px] leading-relaxed text-muted-2 sm:text-right sm:max-w-md">
            Dynasty General is an independent dynasty analytics tool. It is
            not affiliated with, endorsed by, or sponsored by Sleeper,
            MyFantasyLeague, or the NFL.
          </div>
        </div>
      </div>
    </footer>
  );
}
