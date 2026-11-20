import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DEFAULT_TUNING } from "../../src/core/tuning.js";

test("game.contract.json v1.1 tuning matches DEFAULT_TUNING and standardized numbers", () => {
  const contractPath = path.resolve(process.cwd(), "game.contract.json");
  const raw = JSON.parse(fs.readFileSync(contractPath, "utf8")) as {
    contract_version: string;
    tuning: typeof DEFAULT_TUNING;
  };
  assert.equal(raw.contract_version, "1.1");
  assert.equal(raw.tuning.player_speed, 6.0);
  assert.equal(raw.tuning.carry_capacity, 10);
  assert.equal(raw.tuning.lantern_cost, 10);
  assert.equal(raw.tuning.lantern_count_night1, 5);
  assert.equal(raw.tuning.dash_speed, 14.0);
  assert.equal(raw.tuning.dash_duration_s, 0.2);
  assert.equal(raw.tuning.dash_cooldown_s, 1.5);
  assert.equal(raw.tuning.night1_duration_s, 300);
  assert.equal(raw.tuning.night2_duration_s, 330);
  assert.equal(raw.tuning.night3_duration_s, 360);
  assert.equal(raw.tuning.fall_enabled, true);
  assert.deepEqual(raw.tuning, DEFAULT_TUNING);
});
