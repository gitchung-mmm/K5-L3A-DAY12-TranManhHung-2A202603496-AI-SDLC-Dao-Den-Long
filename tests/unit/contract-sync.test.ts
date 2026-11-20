import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DEFAULT_TUNING } from "../../src/core/tuning.js";

test("game.contract.json v1.2 tuning matches DEFAULT_TUNING and Ticket-03 rules", () => {
  const contractPath = path.resolve(process.cwd(), "game.contract.json");
  const raw = JSON.parse(fs.readFileSync(contractPath, "utf8")) as {
    contract_version: string;
    tuning: typeof DEFAULT_TUNING;
  };
  assert.equal(raw.contract_version, "1.2");
  assert.equal(raw.tuning.night1_duration_s, 240);
  assert.equal(raw.tuning.night2_duration_s, 270);
  assert.equal(raw.tuning.night3_duration_s, 300);
  assert.equal(raw.tuning.fuel_max, 100);
  assert.equal(raw.tuning.fuel_decay_per_s, 1.0);
  assert.equal(raw.tuning.fuel_per_mote, 10);
  assert.equal(raw.tuning.relight_cost, 5);
  assert.equal(raw.tuning.win_ratio, 0.6);
  assert.equal(raw.tuning.drain_per_s, 5);
  assert.equal(raw.tuning.low_fuel_threshold, 30);
  assert.equal(raw.tuning.capacity_max, 20);
  assert.equal(raw.tuning.score.per_mote, 5);
  assert.equal(raw.tuning.score.per_second_left, 0);
  assert.deepEqual(raw.tuning, DEFAULT_TUNING);
});
