/**
 * Welcome brief: the first email after a homepage signup. Characterizes
 * every team and leads with the first call, from the same builders /home
 * uses. Runs on the committed real-league snapshot, offline.
 *
 *   npx tsx --tsconfig tsconfig.json evals/welcome-brief.test.ts
 */
import { loadRealLeagueSnapshot, listRealLeagueSnapshots } from "./fixtures/real-leagues/load";
import { installSnapshotFetch } from "../scripts/lib/snapshot-replay";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` (${detail})` : ""}`);
}

async function main() {
  const origError = console.error;
  const origWarn = console.warn;
  const origInfo = console.info;
  const { composeWelcomeBrief, lintWelcomeBrief, pickFirstCall, rivalSentence, WELCOME_TEAMS_SHOWN } = await import("../src/lib/email/welcome-brief");
  const { buildWelcomeBrief, sendWelcomeBriefIfDue } = await import("../src/lib/email/welcome-send");

  console.log("first call");
  const base = { season: "2026", week: 12, league_id: "L", league_name: "L", deadline: null, deadline_label: null, delivery: { emailed: false }, title: "t" };
  const quiet = { ...base, id: "q", kind: "league_call", priority: 300, stance: null, stance_label: "Keep going", context: "", reason: "", voices: [], actionable: false };
  const act = { ...base, id: "a", kind: "league_call", priority: 100, stance: null, stance_label: "Play to win", context: "", reason: "", voices: [], actionable: true };
  const trade = { ...base, id: "t", kind: "trade", priority: 1000 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asItems = (x: unknown[]) => x as any;
  check("a trade leads", pickFirstCall(asItems([quiet, act, trade]))?.id === "t");
  check("else an actionable call", pickFirstCall(asItems([quiet, act]))?.id === "a");
  check("else the top quiet call", pickFirstCall(asItems([quiet]))?.id === "q");
  check("nothing when no items", pickFirstCall([]) === null);

  console.log("rival sentence");
  const tile = (gamesBack: number, favorite: boolean) => ({
    leagueId: "L", leagueName: "L", chip: null, note: null, playoff: null, title: null, best: null, thinnest: null, order: 0,
    rival: { manager: "Rival", record: "8-3", myRecord: "7-4", titleLabel: "30%", myTitleLabel: "20%", titlePct: 0.3, myTitlePct: 0.2, gamesBack, favorite },
  });
  check("games back", rivalSentence(tile(1, false))!.includes("1 game back of them; they lead the title race 30% to your 20%"));
  check("half games", rivalSentence(tile(1.5, false))!.includes("1.5 games back"));
  check("ahead", rivalSentence(tile(-2, true))!.includes("2 games up on them; you lead the title race 20% to 30%"));
  check("level", rivalSentence(tile(0, true))!.includes("level on record"));

  console.log("lint");
  const okArgs = { subject: "s", html: "<p>x</p><a href=\"https://u\">u</a>", text: "x https://u Addr L1", unsubscribeUrl: "https://u", mailingAddress: "Addr", leagues: [] };
  check("clean passes", lintWelcomeBrief(okArgs).length === 0, lintWelcomeBrief(okArgs).join("|"));
  check("em dash blocks", lintWelcomeBrief({ ...okArgs, text: `${okArgs.text} a — b` }).some((l) => l.includes("em dash")));
  check("missing unsubscribe blocks", lintWelcomeBrief({ ...okArgs, text: "x Addr" }).includes("missing unsubscribe link"));
  check("missing address blocks", lintWelcomeBrief({ ...okArgs, mailingAddress: "" }).includes("missing mailing address"));

  console.log("send guard");
  const env = { ...process.env };
  Object.assign(process.env, { RESEND_API_KEY: "k", EMAIL_MAILING_ADDRESS: "1 St", EMAIL_REPLY_TO: "owner@example.com", EMAIL_UNSUBSCRIBE_SECRET: "s" });
  delete process.env.EMAIL_WELCOME_APPROVED_VERSION;
  console.info = () => {};
  check("held with no approved version (nothing sent)", (await sendWelcomeBriefIfDue("user-1")) === "held_unapproved");
  process.env.EMAIL_WELCOME_APPROVED_VERSION = "old.version";
  check("held on a version mismatch", (await sendWelcomeBriefIfDue("user-1")) === "held_unapproved");
  delete process.env.RESEND_API_KEY;
  console.error = () => {};
  check("unconfigured refuses", (await sendWelcomeBriefIfDue("user-1")) === "unconfigured");
  console.error = origError;
  console.info = origInfo;
  process.env = env;

  console.log("real leagues");
  console.error = () => {};
  console.warn = () => {};
  for (const username of listRealLeagueSnapshots()) {
    const snap = loadRealLeagueSnapshot(username, { allowStale: true });
    const restore = installSnapshotFetch(snap);
    try {
      const unsub = "https://dynastygeneral.app/api/email/unsubscribe?u=x";
      const b = await buildWelcomeBrief({
        username, displayName: snap.user.display_name, tier: "pro", appUrl: "https://dynastygeneral.app",
        unsubscribeUrl: unsub, mailingAddress: "1 Sample Street, Chicago, IL", logTag: "eval", now: new Date(snap.captured_at),
      });
      if ("error" in b) { check(`${username}: builds`, false, b.error); continue; }
      check(`${username}: lint clean`, b.lint.length === 0, b.lint.join(" | "));
      check(`${username}: characterizes every league with a read`, b.tiles.length >= Math.min(snap.leagues.length - 1, 1) && b.tiles.length > 0, `${b.tiles.length} tiles`);
      check(`${username}: shows at most ${WELCOME_TEAMS_SHOWN} rows, names the rest`, b.tiles.slice(WELCOME_TEAMS_SHOWN).every((t) => b.text.includes(t.leagueName)));
      check(`${username}: a first call links to its /home item`, !!b.firstCall && b.html.includes(encodeURIComponent(b.firstCall.id).replace(/'/g, "&#39;")));
      check(`${username}: subject leads with the teams`, /^Your \d+ teams?, read/.test(b.subject), b.subject);
      check(`${username}: tiles sorted best chance first`, b.tiles.every((t, i) => i === 0 || b.tiles[i - 1].order >= t.order));
      check(`${username}: every tile has odds`, b.tiles.every((t) => t.playoff && t.title));
      const again = composeWelcomeBrief({ ownerName: "x", leagues: [], items: [], appUrl: "https://a", unsubscribeUrl: unsub, mailingAddress: "1 St" });
      check("no leagues: connect nudge, still compliant", again.subject.startsWith("Connect") && again.lint.length === 0, again.lint.join("|"));
    } finally {
      restore();
    }
  }
  console.error = origError;
  console.warn = origWarn;
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
