import assert from "node:assert/strict";
import test from "node:test";
import { GameEngine } from "../../src/core/engine.js";
import { distXZ } from "../../src/core/math.js";
import { DEFAULT_TUNING } from "../../src/core/tuning.js";

// Updated for Ticket-02 (v1.1): player_speed=6.0 with <=0.1s acceleration, carry_capacity=10,
// lantern_cost=10, score +10 on deposit (not pickup), pulse_cost=3, per_stun=5, fall_enabled=true.

test("movement respects cam_yaw_deg, accelerates within 0.1s, and normalizes diagonal", () => {
  const engine = new GameEngine({
    seed: 1,
    night: 1,
    scenario: { random_motes: false, random_shades: false, motes: [], shades: [] }
  });

  // After 6 ticks (0.1s), speed reaches full 6.0 m/s
  for (let k = 0; k < 6; k++) {
    engine.step(k === 0 ? { tick: 0, move: [0, 1], cam_yaw_deg: 0 } : undefined);
  }
  assert.ok(Math.abs(engine.getSnapshotRecord().player.vel[2] - 6.0) < 1e-2);

  // Stop within 6 ticks (0.1s)
  for (let k = 6; k < 12; k++) {
    engine.step(k === 6 ? { tick: 6, move: [0, 0] } : undefined);
  }
  assert.equal(engine.getSnapshotRecord().player.vel[2], 0);

  // Diagonal [1, 1] at yaw 90 normalized -> steady speed = 6.0 m/s
  const engineDiag = new GameEngine({
    seed: 1,
    night: 1,
    scenario: { random_motes: false, random_shades: false, motes: [], shades: [] }
  });
  for (let k = 0; k < 60; k++) {
    engineDiag.step(k === 0 ? { tick: 0, move: [1, 1], cam_yaw_deg: 90 } : undefined);
  }
  const vel = engineDiag.getSnapshotRecord().player.vel;
  assert.ok(Math.abs(Math.hypot(vel[0], vel[2]) - 6.0) < 1e-2);
});

test("jump rises with 7m/s, gravity -20m/s2, and triggers only on rising edge", () => {
  const engine = new GameEngine({
    seed: 2,
    night: 1,
    scenario: { random_motes: false, random_shades: false, motes: [], shades: [] }
  });

  engine.step({ tick: 0, jump: true });
  assert.ok(engine.getSnapshotRecord().player.pos[1] > 0);
  assert.equal(engine.getSnapshotRecord().player.grounded, false);

  for (let k = 1; k < 80; k++) {
    engine.step();
  }
  assert.equal(engine.getSnapshotRecord().player.pos[1], 0);
  assert.equal(engine.getSnapshotRecord().player.grounded, true);
});

test("mote pickup, deposit (+10/mote), lantern_lit (+100), and floor(time)*2 + 50*flames win bonus", () => {
  const engine = new GameEngine({
    seed: 3,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 7, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 0.5], [0, 0, 0.7], [0, 0, 0.9]],
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

  assert.equal(engine.getSnapshotRecord().score, 0);

  // Tick 0: pick up 3 motes -> carried becomes 10; pickup itself gives 0 score in v1.1
  const ev1 = engine.step({ tick: 0 });
  assert.equal(ev1.filter((e) => e.name === "mote_picked").length, 3);
  assert.equal(engine.getSnapshotRecord().player.carried, 10);
  assert.equal(engine.getSnapshotRecord().score, 0);

  // Tick 1: interact deposits 10 -> lights L1 -> win
  const ev2 = engine.step({ tick: 1, interact: true });
  assert.ok(ev2.some((e) => e.name === "deposit" && e.data.amount === 10));
  assert.ok(ev2.some((e) => e.name === "lantern_lit"));
  assert.ok(ev2.some((e) => e.name === "game_over" && e.data.result === "won"));

  const end = engine.getEndRecord();
  assert.equal(end.state, "won");
  // time_left_s = 100 - 2/60 = 99.966 -> floor = 99 -> 99*2 = 198
  // score = 10*10 + 100 + 198 + 3*50 = 548
  assert.equal(end.score, 548);
});

test("pulse costs 3 motes, checks 3D distance from y+0.8, pushes 4m over 15 ticks, stuns 120 ticks", () => {
  const engine = new GameEngine({
    seed: 4,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 4, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: "S1", pos: [3, 0.8, 0], state: "chase" }]
    }
  });

  const ev0 = engine.step({ tick: 0, pulse: true });
  const pulseEv = ev0.find((e) => e.name === "pulse");
  assert.ok(pulseEv);
  assert.deepEqual(pulseEv.data.stunned_ids, ["S1"]);
  assert.equal(engine.getSnapshotRecord().player.carried, 1);
  assert.equal(engine.getSnapshotRecord().score, DEFAULT_TUNING.score.per_stun);

  // Run remaining 14 push ticks -> shade pushed ~4m total from x=3 to x=7
  for (let k = 1; k < 15; k++) engine.step();
  const s15 = engine.getSnapshotRecord();
  assert.equal(s15.shades[0].state, "stunned");
  assert.ok(Math.abs(s15.shades[0].pos[0] - 7.0) < 0.1);
});

test("safe_radius (6m) blocks outside shades and pushes inside shades out within 30 ticks safely", () => {
  const engine = new GameEngine({
    seed: 5,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 10, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: "S1", pos: [2, 0, 0], state: "chase" }],
      lanterns: [
        { id: "L1", pos: [0, 0, 1.5], deposited: 0, lit: false },
        { id: "L2", lit: false }
      ]
    }
  });

  engine.step({ tick: 0, interact: true });
  for (let k = 1; k <= 35; k++) engine.step();
  const snap = engine.getSnapshotRecord();
  assert.equal(snap.player.flames, 3);
  assert.ok(distXZ(snap.shades[0].pos, [0, 0, 1.5]) >= DEFAULT_TUNING.safe_radius);
});

test("player hit drops floor(carried/2) motes into 1.5-2.5m ring and shade enters recoil", () => {
  const engine = new GameEngine({
    seed: 6,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 5, flames: 2 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: "S1", pos: [0.5, 0, 0], state: "chase" }]
    }
  });

  const ev = engine.step();
  assert.ok(ev.some((e) => e.name === "player_hit" && e.data.flames === 1 && e.data.dropped === 2));
  const snap = engine.getSnapshotRecord();
  assert.equal(snap.player.carried, 3);
  assert.equal(snap.shades[0].state, "recoil");
  assert.equal(snap.motes.filter((m) => m.kind === "dropped").length, 2);
});
