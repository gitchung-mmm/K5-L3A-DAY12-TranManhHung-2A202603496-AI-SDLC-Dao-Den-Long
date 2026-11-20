import assert from "node:assert/strict";
import test from "node:test";
import {
  addLeaderboardEntry,
  isValidLeaderboardName,
  sortAndTrimLeaderboard
} from "../../src/core/leaderboard.js";

test("leaderboard validates 3-12 char names including Vietnamese diacritics", () => {
  assert.equal(isValidLeaderboardName("May_01"), true);
  assert.equal(isValidLeaderboardName("Mây_Đảo"), true);
  assert.equal(isValidLeaderboardName("ab"), false);
  assert.equal(isValidLeaderboardName("TooLongName_123"), false);
  assert.equal(isValidLeaderboardName("bad name!"), false);
});

test("leaderboard sorts by score desc, tie-breaks by earlier achieved_at, and trims to top 10", () => {
  let entries = addLeaderboardEntry([], {
    name: "SecondTie",
    score: 500,
    nights_won: 2,
    seed: 1,
    achieved_at: "2026-11-20T16:10:00+07:00"
  });
  entries = addLeaderboardEntry(entries, {
    name: "FirstTie",
    score: 500,
    nights_won: 2,
    seed: 2,
    achieved_at: "2026-11-20T16:05:00+07:00"
  });
  for (let i = 0; i < 12; i++) {
    entries = addLeaderboardEntry(entries, {
      name: `Player_${i}`,
      score: 100 * i,
      nights_won: i % 4,
      seed: 10 + i,
      achieved_at: `2026-11-20T16:${String(20 + i).padStart(2, "0")}:00+07:00`
    });
  }

  const sorted = sortAndTrimLeaderboard(entries);
  assert.equal(sorted.length, 10);
  assert.equal(sorted[0].score, 1100);
  const idxFirst = sorted.findIndex((e) => e.name === "FirstTie");
  const idxSecond = sorted.findIndex((e) => e.name === "SecondTie");
  assert.ok(idxFirst >= 0 && idxSecond >= 0 && idxFirst < idxSecond);
});
