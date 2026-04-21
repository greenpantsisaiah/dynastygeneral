export function Footer() {
  return (
    <footer className="py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 text-xs text-muted-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 font-mono uppercase tracking-[0.18em]">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Dynasty Copilot
        </div>
        <div className="font-mono uppercase tracking-[0.18em]">
          Win the decision in front of you.
        </div>
      </div>
    </footer>
  );
}
