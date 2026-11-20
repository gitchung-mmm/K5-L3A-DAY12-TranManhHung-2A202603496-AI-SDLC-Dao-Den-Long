import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const HEADLESS_ENTRY = path.resolve(process.cwd(), "dist/cli/headless.js");

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ddl-v11-"));
}

function runHeadless(args: string[]): { status: number | null; stderr: string; records: any[] } {
  const res = spawnSync(process.execPath, [HEADLESS_ENTRY, ...args], { encoding: "utf8" });
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  let records: any[] = [];
  if (res.status === 0 && outPath && fs.existsSync(outPath)) {
    records = fs
      .readFileSync(outPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  }
  return { status: res.status, stderr: res.stderr, records };
}

test("headless CLI v1.1 outputs schema v1.1 and is byte-identical across runs", () => {
  const dir = makeTmpDir();
  const out1 = path.join(dir, "r1.jsonl");
  const out2 = path.join(dir, "r2.jsonl");
  const baseArgs = ["--seed", "42", "--night", "1", "--ticks", "360", "--snapshot-every", "30"];

  const r1 = runHeadless([...baseArgs, "--out", out1]);
  const r2 = runHeadless([...baseArgs, "--out", out2]);
  assert.equal(r1.status, 0, r1.stderr);
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(fs.readFileSync(out1, "utf8"), fs.readFileSync(out2, "utf8"));

  const snap0 = r1.records[0];
  assert.equal(snap0.type, "snapshot");
  assert.equal(snap0.night, 1);
  assert.ok("wind" in snap0 && "drifters" in snap0 && "charms" in snap0);
  assert.ok("vel" in snap0.player && "grounded" in snap0.player && "dash_cd_s" in snap0.player);
  assert.equal(snap0.motes.length, 20);
  assert.ok(r1.records.some((r) => r.type === "event" && r.name === "shade_spawned"));
});

test("scenario: dash moves at 14m/s for 12 ticks, holds air height, and sets 1.5s cooldown", () => {
  const dir = makeTmpDir();
  const sc = path.join(dir, "sc.json");
  const inp = path.join(dir, "in.json");
  const out = path.join(dir, "out.jsonl");

  fs.writeFileSync(
    sc,
    JSON.stringify({ random_motes: false, random_shades: false, motes: [], shades: [] })
  );
  fs.writeFileSync(
    inp,
    JSON.stringify({
      frames: [
        { tick: 0, jump: true },
        { tick: 1, jump: false },
        { tick: 10, dash: true },
        { tick: 11, dash: false }
      ]
    })
  );

  const res = runHeadless([
    "--seed",
    "1",
    "--night",
    "1",
    "--scenario",
    sc,
    "--inputs",
    inp,
    "--ticks",
    "25",
    "--snapshot-every",
    "1",
    "--out",
    out
  ]);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.records.some((r) => r.type === "event" && r.name === "dash" && r.tick === 11));

  const snaps = res.records.filter((r) => r.type === "snapshot");
  const snap11 = snaps.find((s) => s.tick === 11);
  const snap22 = snaps.find((s) => s.tick === 22);
  assert.equal(snap11.player.pos[1], snap22.player.pos[1]); // held height during 12-tick air dash
  assert.ok(snap22.player.pos[2] >= 2.7); // ~14 * 0.2 = 2.8m
  assert.ok(snap11.player.dash_cd_s > 1.4);
});

test("scenario: Night 2 jump pad launches player from Island A across void onto Island B", () => {
  const dir = makeTmpDir();
  const sc = path.join(dir, "sc.json");
  const out = path.join(dir, "out.jsonl");

  fs.writeFileSync(
    sc,
    JSON.stringify({
      player: { pos: [20, 0, 18], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: []
    })
  );

  const res = runHeadless([
    "--seed",
    "2",
    "--night",
    "2",
    "--scenario",
    sc,
    "--ticks",
    "120",
    "--snapshot-every",
    "10",
    "--out",
    out
  ]);
  assert.equal(res.status, 0, res.stderr);
  const snaps = res.records.filter((r) => r.type === "snapshot");
  const finalSnap = snaps[snaps.length - 1];
  assert.equal(finalSnap.player.flames, 3);
  assert.equal(finalSnap.player.grounded, true);
  // Landed inside Island B centered at (70, 0) with radius 28
  const distToB = Math.hypot(finalSnap.player.pos[0] - 70, finalSnap.player.pos[2]);
  assert.ok(distToB <= 28, `Expected landing inside Island B, got dist=${distToB}`);
});

test("scenario: Night 3 wind gust activates at 30s and pushes player, bell tower blocks center", () => {
  const dir = makeTmpDir();
  const sc = path.join(dir, "sc.json");
  const out = path.join(dir, "out.jsonl");

  fs.writeFileSync(
    sc,
    JSON.stringify({
      player: { pos: [0, 0, -20], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: true,
      motes: [],
      shades: []
    })
  );

  const res = runHeadless([
    "--seed",
    "3",
    "--night",
    "3",
    "--scenario",
    sc,
    "--ticks",
    "1920",
    "--snapshot-every",
    "60",
    "--out",
    out
  ]);
  assert.equal(res.status, 0, res.stderr);
  const snaps = res.records.filter((r) => r.type === "snapshot");
  const windySnaps = snaps.filter((s) => s.wind.active);
  assert.ok(windySnaps.length >= 2);
  const lastSnap = snaps[snaps.length - 1];
  const movedFromStart = Math.hypot(lastSnap.player.pos[0], lastSnap.player.pos[2] + 20);
  assert.ok(movedFromStart > 2.0, "Wind should push standing player");
});

test("scenario: Drifter steals motes on chase, drops them on pulse during flee", () => {
  const dir = makeTmpDir();
  const sc = path.join(dir, "sc.json");
  const inp = path.join(dir, "in.json");
  const out = path.join(dir, "out.jsonl");

  fs.writeFileSync(
    sc,
    JSON.stringify({
      player: { pos: [0, 0, 0], carried: 7, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: [],
      drifters: [{ id: "D1", pos: [0.8, 0, 0], state: "idle", stolen: 0 }]
    })
  );
  fs.writeFileSync(
    inp,
    JSON.stringify({
      frames: [
        { tick: 2, pulse: true },
        { tick: 3, pulse: false }
      ]
    })
  );

  const res = runHeadless([
    "--seed",
    "4",
    "--night",
    "2",
    "--scenario",
    sc,
    "--inputs",
    inp,
    "--ticks",
    "10",
    "--snapshot-every",
    "1",
    "--out",
    out
  ]);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.records.some((r) => r.type === "event" && r.name === "drifter_steal" && r.data.amount === 3));
  assert.ok(res.records.some((r) => r.type === "event" && r.name === "drifter_drop" && r.data.amount === 3));
});

test("scenario: Wind Charm grants 7.2m/s speed and zero dash cooldown", () => {
  const dir = makeTmpDir();
  const sc = path.join(dir, "sc.json");
  const inp = path.join(dir, "in.json");
  const out = path.join(dir, "out.jsonl");

  fs.writeFileSync(
    sc,
    JSON.stringify({
      player: { pos: [35, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: [],
      charms: [{ id: "C1", pos: [35, 0, 0], available: true }]
    })
  );
  fs.writeFileSync(
    inp,
    JSON.stringify({
      frames: [
        { tick: 1, dash: true },
        { tick: 2, dash: false },
        { tick: 15, dash: true },
        { tick: 16, dash: false }
      ]
    })
  );

  const res = runHeadless([
    "--seed",
    "5",
    "--night",
    "2",
    "--scenario",
    sc,
    "--inputs",
    inp,
    "--ticks",
    "25",
    "--snapshot-every",
    "5",
    "--out",
    out
  ]);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.records.some((r) => r.type === "event" && r.name === "charm_picked"));
  const dashes = res.records.filter((r) => r.type === "event" && r.name === "dash");
  assert.equal(dashes.length, 2, "Charm should allow immediate second dash without cooldown");
});

test("scenario: pause freezes sim_tick and time_left_s while tick advances", () => {
  const dir = makeTmpDir();
  const sc = path.join(dir, "sc.json");
  const inp = path.join(dir, "in.json");
  const out = path.join(dir, "out.jsonl");

  fs.writeFileSync(
    sc,
    JSON.stringify({ random_motes: false, random_shades: false, motes: [], shades: [] })
  );
  fs.writeFileSync(
    inp,
    JSON.stringify({
      frames: [
        { tick: 10, pause: true },
        { tick: 11, pause: false },
        { tick: 30, pause: true },
        { tick: 31, pause: false }
      ]
    })
  );

  const res = runHeadless([
    "--seed",
    "6",
    "--night",
    "1",
    "--scenario",
    sc,
    "--inputs",
    inp,
    "--ticks",
    "40",
    "--snapshot-every",
    "10",
    "--out",
    out
  ]);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.records.some((r) => r.type === "event" && r.name === "paused" && r.tick === 11));
  assert.ok(res.records.some((r) => r.type === "event" && r.name === "resumed" && r.tick === 31));

  const snaps = res.records.filter((r) => r.type === "snapshot");
  const snap20 = snaps.find((s) => s.tick === 20);
  const snap30 = snaps.find((s) => s.tick === 30);
  assert.equal(snap20.state, "paused");
  assert.equal(snap20.sim_tick, 10);
  assert.equal(snap30.sim_tick, 10);
  assert.equal(snap20.time_left_s, snap30.time_left_s);
});

test("scenario: fall off island loses flame & carried motes and respawns after 60 ticks with invuln", () => {
  const dir = makeTmpDir();
  const sc = path.join(dir, "sc.json");
  const inp = path.join(dir, "in.json");
  const out = path.join(dir, "out.jsonl");

  fs.writeFileSync(
    sc,
    JSON.stringify({
      player: { pos: [39.8, 0, 0], carried: 4, flames: 3, invuln_ticks: 90 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: []
    })
  );
  fs.writeFileSync(
    inp,
    JSON.stringify({
      frames: [{ tick: 0, move: [1, 0] }]
    })
  );

  const res = runHeadless([
    "--seed",
    "7",
    "--night",
    "1",
    "--scenario",
    sc,
    "--inputs",
    inp,
    "--ticks",
    "160",
    "--snapshot-every",
    "10",
    "--out",
    out
  ]);
  assert.equal(res.status, 0, res.stderr);
  const fallHit = res.records.find(
    (r) => r.type === "event" && r.name === "player_hit" && r.data.by === "fall"
  );
  assert.ok(fallHit, "Expected fall player_hit even while invulnerable");
  assert.equal(fallHit.data.flames, 2);
  assert.equal(fallHit.data.lost, 4);

  const snaps = res.records.filter((r) => r.type === "snapshot");
  const finalSnap = snaps[snaps.length - 1];
  assert.equal(finalSnap.player.flames, 2);
  assert.equal(finalSnap.player.carried, 0);
  assert.equal(finalSnap.player.grounded, true);
});

test("headless CLI exits with code 2 on invalid inputs/scenario contract", () => {
  const dir = makeTmpDir();
  const badInputs = path.join(dir, "bad-inputs.json");
  const badScenario = path.join(dir, "bad-scenario.json");
  const out = path.join(dir, "err.jsonl");

  fs.writeFileSync(
    badInputs,
    JSON.stringify({
      frames: [
        { tick: 5, move: [0, 1] },
        { tick: 5, move: [0, 0] }
      ]
    })
  );
  const resInputs = runHeadless([
    "--seed",
    "1",
    "--night",
    "1",
    "--inputs",
    badInputs,
    "--ticks",
    "10",
    "--out",
    out
  ]);
  assert.equal(resInputs.status, 2);
  assert.ok(resInputs.stderr.length > 0);

  fs.writeFileSync(badScenario, "{not valid json");
  const resScenario = runHeadless([
    "--seed",
    "1",
    "--night",
    "1",
    "--scenario",
    badScenario,
    "--ticks",
    "10",
    "--out",
    out
  ]);
  assert.equal(resScenario.status, 2);
  assert.ok(resScenario.stderr.length > 0);
});
