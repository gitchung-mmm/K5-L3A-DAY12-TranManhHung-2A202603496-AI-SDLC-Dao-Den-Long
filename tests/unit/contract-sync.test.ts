import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DEFAULT_TUNING } from "../../src/core/tuning.js";

test("game.contract.json tuning matches DEFAULT_TUNING", () => {
  const contractPath = path.resolve(process.cwd(), "game.contract.json");
  const raw = JSON.parse(fs.readFileSync(contractPath, "utf8")) as {
    contract_version: string;
    tuning: typeof DEFAULT_TUNING;
  };
  assert.equal(raw.contract_version, "1.0");
  assert.equal(raw.tuning.lantern_count_night1, 5);
  assert.deepEqual(raw.tuning, DEFAULT_TUNING);
});
