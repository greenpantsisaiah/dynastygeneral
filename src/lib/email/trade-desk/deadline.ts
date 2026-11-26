/**
 * When to trade by, as a day and time (desk1 review, 2026-11-26: "Deadline:
 * Week 12" made the reader do date math). Sleeper's trade_deadline names a
 * week, not a moment, and its docs do not say whether trades lock at that
 * week's first kickoff or after its last game. The brief tells the reader
 * the SAFE time: the first kickoff of the deadline week. Acting earlier
 * than needed costs nothing; acting later than the real lock loses the
 * trade.
 *
 * Week N's first kickoff is the Thursday of week N (Sleeper's
 * season_start_date is the Wednesday before week 1). Thanksgiving's first
 * game kicks off at 11:30 AM CT; a normal Thursday night game at 7:15 PM
 * CT. Week 18 has no Thursday game, so only the day prints.
 */

const DAY_MS = 86_400_000;

export interface TradeBy {
  week: number;
  /** "Thu Dec 3, 7:15 PM CT" */
  label: string;
  /** Midnight UTC of the kickoff day, for sorting and tests. */
  day: Date;
  /** The kickoff moment as an ISO time (Central time; noon CT when only the day is known). */
  iso: string;
}

/** Central time offset in hours for a date (CDT -5 from the second Sunday of March to the first Sunday of November, else CST -6). */
export function ctOffset(d: Date): number {
  const y = d.getUTCFullYear();
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(y, month, 1));
    return Date.UTC(y, month, 1 + ((7 - first.getUTCDay()) % 7) + 7 * (n - 1));
  };
  const t = d.getTime();
  return t >= nthSunday(2, 2) && t < nthSunday(10, 1) ? -5 : -6;
}
function isoAt(day: Date, hour: number, minute: number): string {
  const off = ctOffset(day);
  return new Date(day.getTime() + ((hour - off) * 60 + minute) * 60_000).toISOString();
}

function isThanksgiving(d: Date): boolean {
  // Fourth Thursday of November.
  return d.getUTCMonth() === 10 && d.getUTCDay() === 4 && d.getUTCDate() >= 22 && d.getUTCDate() <= 28;
}

export function tradeBy(deadlineWeek: number | null, seasonStartDate: string | null | undefined): TradeBy | null {
  if (deadlineWeek == null || !seasonStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(seasonStartDate)) return null;
  const start = new Date(`${seasonStartDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  let firstThu = start.getTime();
  while (new Date(firstThu).getUTCDay() !== 4) firstThu += DAY_MS;
  const fmt = (d: Date, wd = "Thu") =>
    `${wd} ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(d)}`;
  if (deadlineWeek >= 18) {
    const sat = new Date(firstThu + (deadlineWeek - 1) * 7 * DAY_MS + 2 * DAY_MS);
    return { week: deadlineWeek, label: fmt(sat, "Sat"), day: sat, iso: isoAt(sat, 12, 0) };
  }
  const thu = new Date(firstThu + (deadlineWeek - 1) * 7 * DAY_MS);
  const tg = isThanksgiving(thu);
  const time = tg ? "11:30 AM CT" : "7:15 PM CT";
  return { week: deadlineWeek, label: `${fmt(thu)}, ${time}`, day: thu, iso: tg ? isoAt(thu, 11, 30) : isoAt(thu, 19, 15) };
}
