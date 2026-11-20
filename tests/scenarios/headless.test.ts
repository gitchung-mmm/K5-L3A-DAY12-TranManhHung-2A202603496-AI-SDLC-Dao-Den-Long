import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const HEADLESS_ENTRY = path.resolve(process.cwd(), "dist/cli/headless.js");

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ddl-test-"));
}

test("headless CLI outputs valid JSONL and is byte-identical across runs (deterministic)", () => {
  assert.ok(fs.existsSync(HEADLESS_ENTRY), "dist/cli/headless.js must be built before running scenario tests");
  const dir = makeTmpDir();
  const scenarioPath = path.join(dir, "scenario.json");
  const inputsPath = path.join(dir, "inputs.json");
  const out1 = path.join(dir, "out1.jsonl");
  const out2 = path.join(dir, "out2.jsonl");

  fs.writeFileSync(
    scenarioPath,
    JSON.stringify({
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      random_motes: true,
      random_shades: true,
      motes: [[0, 0, 2.0]],
      shades: [{ pos: [8, 0, 0] }],
      time_left_s: 300
    })
  );
  fs.writeFileSync(
    inputsPath,
    JSON.stringify({
      frames: [
        { tick: 0, move: [0, 1], cam_yaw_deg: 0 },
        { tick: 30, move: [0, 0], pulse: true },
        { tick: 31, pulse: false }
      ]
    })
  );

  const r1 = spawnSync(
    process.execPath,
    [
      HEADLESS_ENTRY,
      "--seed",
      "42",
      "--night",
      "1",
      "--scenario",
      scenarioPath,
      "--inputs",
      inputsPath,
      "--ticks",
      "120",
      "--out",
      out1,
      "--snapshot-every",
      "10"
    ],
    { encoding: "utf8" }
  );
  assert.equal(r1.status, 0, r1.stderr);

  const r2 = spawnSync(
    process.execPath,
    [
      HEADLESS_ENTRY,
      "--seed",
      "42",
      "--night",
      "1",
      "--scenario",
      scenarioPath,
      "--inputs",
      inputsPath,
      "--ticks",
      "120",
      "--out",
      out2,
      "--snapshot-every",
      "10"
    ],
    { encoding: "utf8" }
  );
  assert.equal(r2.status, 0, r2.stderr);

  const content1 = fs.readFileSync(out1, "utf8");
  const content2 = fs.readFileSync(out2, "utf8");
  assert.equal(content1, content2);

  const lines = content1.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].type, "snapshot");
  assert.equal(lines[0].tick, 0);
  const last = lines[lines.length - 1];
  assert.equal(last.type, "end");
  assert.equal(last.ticks, 120);
});

test("headless CLI exits with code 2 on invalid inputs/scenario contract", () => {
  const dir = makeTmpDir();
  const badInputs = path.join(dir, "bad-inputs.json");
  const badScenario = path.join(dir, "bad-scenario.json");
  const out = path.join(dir, "err.jsonl");

  // Non-increasing tick
  fs.writeFileSync(
    badInputs,
    JSON.stringify({
      frames: [
        { tick: 5, move: [0, 1] },
        { tick: 5, move: [0, 0] }
      ]
    })
  );
  const resInputs = spawnSync(
    process.execPath,
    [HEADLESS_ENTRY, "--seed", "1", "--night", "1", "--inputs", badInputs, "--ticks", "10", "--out", out],
    { encoding: "utf8" }
  );
  assert.equal(resInputs.status, 2);
  assert.ok(resInputs.stderr.length > 0);

  // Invalid JSON in scenario
  fs.writeFileSync(badScenario, "{not valid json");
  const resScenario = spawnSync(
    process.execPath,
    [HEADLESS_ENTRY, "--seed", "1", "--night", "1", "--scenario", badScenario, "--ticks", "10", "--out", out],
    { encoding: "utf8" }
  );
  assert.equal(resScenario.status, 2);
  assert.ok(resScenario.stderr.length > 0);
});
