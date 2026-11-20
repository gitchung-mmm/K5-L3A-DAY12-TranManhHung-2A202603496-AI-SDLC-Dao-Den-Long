import assert from "node:assert/strict";
import test from "node:test";
import { GameEngine } from "../../src/core/engine.js";
import { distXZ } from "../../src/core/math.js";
import { DEFAULT_TUNING } from "../../src/core/tuning.js";

test("movement respects cam_yaw_deg and normalizes diagonal vector", () => {
  const engine = new GameEngine({
    seed: 1,
    scenario: { random_motes: false, random_shades: false, motes: [], shades: [] }
  });

  // 60 ticks moving [0, 1] at yaw 0 -> +Z by player_speed (7.0 m)
  for (let k = 0; k < 60; k++) {
    engine.step(k === 0 ? { tick: 0, move: [0, 1], cam_yaw_deg: 0 } : undefined);
  }
  const s1 = engine.getSnapshotRecord();
  assert.ok(Math.abs(s1.player.pos[0]) < 1e-3);
  assert.ok(Math.abs(s1.player.pos[2] - 7.0) < 1e-2);

  // Diagonal [1, 1] normalized -> distance after 60 ticks is still ~7.0 m
  const engineDiag = new GameEngine({
    seed: 1,
    scenario: { random_motes: false, random_shades: false, motes: [], shades: [] }
  });
  for (let k = 0; k < 60; k++) {
    engineDiag.step(k === 0 ? { tick: 0, move: [1, 1], cam_yaw_deg: 90 } : undefined);
  }
  const s2 = engineDiag.getSnapshotRecord();
  const movedDist = Math.hypot(s2.player.pos[0], s2.player.pos[2]);
  assert.ok(Math.abs(movedDist - 7.0) < 1e-2);
});

test("jump rises and lands at Y=0 and triggers only on rising edge", () => {
  const engine = new GameEngine({
    seed: 2,
    scenario: { random_motes: false, random_shades: false, motes: [], shades: [] }
  });

  engine.step({ tick: 0, jump: true });
  const afterJump = engine.getSnapshotRecord();
  assert.ok(afterJump.player.pos[1] > 0);

  // Hold jump=true for 80 ticks; player should land and NOT re-jump while held
  for (let k = 1; k < 80; k++) {
    engine.step();
  }
  const landed = engine.getSnapshotRecord();
  assert.equal(landed.player.pos[1], 0);
});

test("mote pickup, deposit, lantern lighting, and win bonus work correctly", () => {
  const engine = new GameEngine({
    seed: 3,
    scenario: {
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 1.0], [0, 0, 1.2], [0, 0, 1.4]],
      shades: [],
      lanterns: [
        { id: "L1", pos: [0, 0, 1.5], deposited: 0, lit: false },
        { id: "L2", lit: true },
        { id: "L3", lit: true },
        { id: "L4", lit: true },
        { id: "L5", lit: true }
      ],
      time_left_s: 100
    }
  });

  // Scenario pre-lit lanterns must NOT award score
  assert.equal(engine.getSnapshotRecord().score, 0);

  // Tick 0: pick up all 3 motes within pickup_radius (1.5m)
  const ev1 = engine.step({ tick: 0 });
  assert.equal(ev1.filter((e) => e.name === "mote_picked").length, 3);
  assert.equal(engine.getSnapshotRecord().player.carried, 3);

  // Tick 1: interact to deposit 3 into L1 -> lights L1 -> win
  const ev2 = engine.step({ tick: 1, interact: true });
  assert.ok(ev2.some((e) => e.name === "deposit"));
  assert.ok(ev2.some((e) => e.name === "lantern_lit"));
  assert.ok(ev2.some((e) => e.name === "game_over" && e.data.result === "won"));

  const end = engine.getEndRecord();
  assert.equal(end.state, "won");
  assert.equal(end.ticks, 2);
  // Score: 3*10 + 100 + round((100 - 2/60)*2) + 3*50 = 30 + 100 + 200 + 150 = 480
  assert.equal(end.score, 480);
});

test("pulse pushes and stuns shades inside pulse_radius and costs pulse_cost", () => {
  const engine = new GameEngine({
    seed: 4,
    scenario: {
      player: { pos: [0, 0, 0], carried: 2, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: "S1", pos: [3, 0, 0] }]
    }
  });

  const events = engine.step({ tick: 0, pulse: true });
  const pulseEv = events.find((e) => e.name === "pulse");
  assert.ok(pulseEv);
  assert.deepEqual(pulseEv.data.stunned_ids, ["S1"]);

  const snap = engine.getSnapshotRecord();
  assert.equal(snap.player.carried, 2 - DEFAULT_TUNING.pulse_cost);
  assert.equal(snap.shades[0].state, "stunned");
  assert.ok(snap.shades[0].pos[0] >= 3 + DEFAULT_TUNING.pulse_push_m - 0.01);
});

test("shades cannot enter safe_radius around lit lanterns", () => {
  const engine = new GameEngine({
    seed: 5,
    scenario: {
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: "S1", pos: [0, 0, 7] }],
      lanterns: [{ id: "L1", pos: [0, 0, 0], lit: true }]
    }
  });

  for (let k = 0; k < 120; k++) {
    engine.step();
  }
  const snap = engine.getSnapshotRecord();
  const d = distXZ(snap.shades[0].pos, [0, 0, 0]);
  assert.ok(d > DEFAULT_TUNING.safe_radius);
  assert.equal(snap.player.flames, 3);
});

test("player loses on no_flames and on dawn timeout", () => {
  const hitEngine = new GameEngine({
    seed: 6,
    scenario: {
      player: { pos: [0, 0, 0], carried: 4, flames: 1 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: "S1", pos: [0.5, 0, 0] }]
    }
  });
  const evHit = hitEngine.step();
  assert.ok(
    evHit.some(
      (e) =>
        e.name === "player_hit" &&
        e.data.flames === 0 &&
        e.data.dropped === Math.floor(4 * DEFAULT_TUNING.hit_drop_ratio)
    )
  );
  assert.ok(
    evHit.some((e) => e.name === "game_over" && e.data.result === "lost" && e.data.reason === "no_flames")
  );

  const dawnEngine = new GameEngine({
    seed: 7,
    scenario: {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      time_left_s: 0.01
    }
  });
  const evDawn = dawnEngine.step();
  assert.ok(
    evDawn.some((e) => e.name === "game_over" && e.data.result === "lost" && e.data.reason === "dawn")
  );
});
