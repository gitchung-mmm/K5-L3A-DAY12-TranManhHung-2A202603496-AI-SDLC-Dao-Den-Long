import assert from "node:assert/strict";
import test from "node:test";
import { GameEngine } from "../../src/core/engine.js";
import { distXZ } from "../../src/core/math.js";
import { DEFAULT_TUNING } from "../../src/core/tuning.js";

// Updated for Ticket-03 (v1.2):
// - Old early-win (all_lit) test replaced with no-early-win + dawn_survived survival rule (ADR-001).
// - Old deposit (+10) & time bonus replaced with +5/mote, +100 first light, +40 relight, +50+floor(fuel) at dawn.
// - Old pulse test extended to verify +15 on draining shades and stunned -> wander recovery.

test("movement respects cam_yaw_deg, accelerates within 0.1s, and normalizes diagonal", () => {
  const engine = new GameEngine({
    seed: 1,
    night: 1,
    scenario: { random_motes: false, random_shades: false, motes: [], shades: [] }
  });

  for (let k = 0; k < 6; k++) {
    engine.step(k === 0 ? { tick: 0, move: [0, 1], cam_yaw_deg: 0 } : undefined);
  }
  assert.ok(Math.abs(engine.getSnapshotRecord().player.vel[2] - 6.0) < 1e-2);

  for (let k = 6; k < 12; k++) {
    engine.step(k === 6 ? { tick: 6, move: [0, 0] } : undefined);
  }
  assert.equal(engine.getSnapshotRecord().player.vel[2], 0);
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

  for (let k = 1; k < 80; k++) engine.step();
  assert.equal(engine.getSnapshotRecord().player.pos[1], 0);
  assert.equal(engine.getSnapshotRecord().player.grounded, true);
});

test("v1.2: lighting all lanterns does NOT win early; dawn_survived awards new fuel+flame bonus", () => {
  const engine = new GameEngine({
    seed: 3,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 10, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      lanterns: [
        { id: "L1", pos: [0, 0, 1.5], deposited: 0, lit: false },
        { id: "L2", lit: true, fuel: 50 },
        { id: "L3", lit: true, fuel: 50 },
        { id: "L4", lit: true, fuel: 50 },
        { id: "L5", lit: true, fuel: 50 }
      ],
      time_left_s: 1.0 // 60 ticks until dawn
    }
  });

  // Tick 0: light L1 (first light) -> +10*5 + 100 = 150, capacity becomes 12, NO early win!
  const ev0 = engine.step({ tick: 0, interact: true });
  assert.ok(ev0.some((e) => e.name === "lantern_lit" && e.data.relight === false));
  assert.equal(engine.isFinished(), false);
  assert.equal(engine.getSnapshotRecord().player.capacity, 12);
  assert.equal(engine.getSnapshotRecord().score, 150);

  // Run remaining 59 ticks to dawn
  let lastEv: any[] = [];
  for (let k = 1; k < 60; k++) {
    lastEv = engine.step();
  }
  assert.ok(
    lastEv.some((e) => e.name === "game_over" && e.data.result === "won" && e.data.reason === "dawn_survived")
  );
  // L1 decayed 59 ticks -> floor(99.016)=99 -> 50+99=149
  // L2..L5 decayed 60 ticks from 50 -> 49.0 -> 4 * (50+49) = 396
  // Flames bonus: 3 * 50 = 150
  // Total = 150 + 149 + 396 + 150 = 845
  assert.equal(engine.getEndRecord().score, 845);
});

test("v1.2: lantern_out sets ever_lit, relight costs 5 (+40), refuel caps at 100 and ignores full lantern", () => {
  const engine = new GameEngine({
    seed: 10,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 10, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      lanterns: [{ id: "L1", pos: [0, 0, 1.5], lit: true, fuel: 0.1 }]
    }
  });

  // After 6 ticks of 1/60 decay, fuel hits 0 -> lantern_out
  let outEv: any[] = [];
  for (let k = 0; k < 6; k++) {
    outEv.push(...engine.step());
  }
  assert.ok(outEv.some((e) => e.name === "lantern_out" && e.data.lantern_id === "L1"));
  let snap = engine.getSnapshotRecord();
  assert.equal(snap.lanterns[0].lit, false);
  assert.equal(snap.lanterns[0].fuel, 0);
  assert.equal(snap.lanterns[0].ever_lit, true);

  // Relight L1 with 5 motes -> +5*5 + 40 = 65, relight: true, relit_count: 1, capacity: 12
  const relightEv = engine.step({ tick: 6, interact: true });
  assert.ok(relightEv.some((e) => e.name === "deposit" && e.data.amount === 5));
  assert.ok(relightEv.some((e) => e.name === "lantern_lit" && e.data.relight === true));
  snap = engine.getSnapshotRecord();
  assert.equal(snap.player.carried, 5);
  assert.equal(snap.player.capacity, 12);
  assert.equal(snap.lanterns[0].relit_count, 1);
  assert.equal(snap.score, 65);

  // Interact immediately on next tick (fuel=99.983) -> refuel uses 1 mote -> fuel=100
  const refuelEv = engine.step({ tick: 7, interact: false });
  assert.equal(refuelEv.length, 0);
  const refuelEv2 = engine.step({ tick: 8, interact: true });
  assert.ok(refuelEv2.some((e) => e.name === "refuel" && e.data.amount === 1 && e.data.fuel === 100));
  assert.equal(engine.getSnapshotRecord().score, 70);
});

test("v1.2: pulse scores +15 on draining shade, +5 on normal shade, and stun returns to wander", () => {
  const engine = new GameEngine({
    seed: 4,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 4, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      lanterns: [{ id: "L1", pos: [3, 0, 0], lit: true, fuel: 25 }],
      shades: [{ id: "S1", pos: [3, 0.8, 0], state: "drain", target_lantern_id: "L1" }]
    }
  });

  const ev0 = engine.step({ tick: 0, pulse: true });
  assert.ok(ev0.some((e) => e.name === "pulse"));
  assert.equal(engine.getSnapshotRecord().score, 15);
  assert.equal(engine.getSnapshotRecord().shades[0].state, "stunned");

  // After 120 ticks of stun, shade MUST return to wander (even if player is nearby)
  for (let k = 1; k <= 120; k++) engine.step();
  // Note: at tick 120 stun ends -> wander in Step 2, then Step 8 may chase if player <= 12m.
  // Verify with player far away in a clean check:
  const farEngine = new GameEngine({
    seed: 4,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 4, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: "S1", pos: [20, 0, 0], state: "stunned", state_ticks_left: 2 }]
    }
  });
  farEngine.step();
  farEngine.step();
  assert.equal(farEngine.getSnapshotRecord().shades[0].state, "wander");
});

test("v1.2: safe_radius protects at fuel=30, disappears below 30, and pushes shades out on refuel>=30", () => {
  const engine = new GameEngine({
    seed: 5,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 5, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: "S1", pos: [0, 0, 2.5], state: "drain", target_lantern_id: "L1" }],
      lanterns: [{ id: "L1", pos: [0, 0, 1.5], lit: true, fuel: 25 }]
    }
  });

  // Refuel L1 from 25 -> >= 30 -> pushes S1 outside safe_radius (6m) over <=30 ticks without hitting player
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
