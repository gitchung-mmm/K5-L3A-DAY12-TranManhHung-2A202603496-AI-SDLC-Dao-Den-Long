import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DEFAULT_TUNING } from "../../src/core/tuning.js";

test("game.contract.json v1.3 matches DEFAULT_TUNING and exposes bench_cmd & soak_cmd", () => {
  const contractPath = path.resolve(process.cwd(), "game.contract.json");
  const raw = JSON.parse(fs.readFileSync(contractPath, "utf8")) as {
    contract_version: string;
    run_cmd: string;
    headless_cmd: string;
    bench_cmd: string;
    soak_cmd: string;
    tuning: typeof DEFAULT_TUNING;
  };
  assert.equal(raw.contract_version, "1.3");
  assert.ok(raw.run_cmd.length > 0);
  assert.ok(raw.headless_cmd.length > 0);
  assert.ok(raw.bench_cmd.length > 0);
  assert.ok(raw.soak_cmd.length > 0);
  assert.deepEqual(raw.tuning, DEFAULT_TUNING);
});
