export interface LeaderboardEntry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

export interface LeaderboardFile {
  entries: LeaderboardEntry[];
}

// Supports [A-Za-z0-9_] (required) plus Vietnamese diacritic letters (bonus), 3-12 chars
const NAME_REGEX = /^[\p{L}0-9_]{3,12}$/u;

export function isValidLeaderboardName(name: string): boolean {
  return NAME_REGEX.test(name);
}

export function formatIsoWithLocalTimezone(date: Date = new Date()): string {
  const pad = (n: number): string => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const tzOffsetMin = -date.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? "+" : "-";
  const tzH = pad(tzOffsetMin / 60);
  const tzM = pad(tzOffsetMin % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${tzH}:${tzM}`
  );
}

export function sortAndTrimLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = Date.parse(a.achieved_at);
      const tb = Date.parse(b.achieved_at);
      return ta - tb;
    })
    .slice(0, 10);
}

export function addLeaderboardEntry(
  entries: LeaderboardEntry[],
  candidate: Omit<LeaderboardEntry, "achieved_at"> & { achieved_at?: string }
): LeaderboardEntry[] {
  const trimmed = candidate.name.trim();
  if (!isValidLeaderboardName(trimmed)) {
    throw new Error("Tên phải từ 3–12 ký tự (chữ cái, số hoặc dấu gạch dưới _)");
  }
  const entry: LeaderboardEntry = {
    name: trimmed,
    score: Math.max(0, Math.floor(candidate.score)),
    nights_won: Math.max(0, Math.min(3, Math.floor(candidate.nights_won))),
    achieved_at: candidate.achieved_at ?? formatIsoWithLocalTimezone(),
    seed: Math.floor(candidate.seed)
  };
  return sortAndTrimLeaderboard([...entries, entry]);
}
