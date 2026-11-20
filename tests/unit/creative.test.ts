import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GameEngine } from "../../src/core/engine.js";
import { DEFAULT_TUNING } from "../../src/core/tuning.js";
import { CreativeWorld } from "../../src/game/creative.js";

test("creative milestones are one-shot, replayable, and never mutate core snapshots", () => {
  const world = new CreativeWorld(new THREE.Scene(), DEFAULT_TUNING);
  const snap = new GameEngine({ seed: 42 }).getViewState();
  const before = JSON.stringify(snap);
  world.update(snap, 1 / 60);
  assert.equal(JSON.stringify(snap), before);
  for (const lantern of snap.lanterns.slice(0, 3)) lantern.lit = true;
  assert.ok(world.update(snap, 1 / 60).cues.includes("whale"));
  assert.equal(world.update(snap, 1 / 60).cues.length, 0);
  snap.state = "won";
  for (const lantern of snap.lanterns) lantern.lit = true;
  const won = JSON.stringify(snap);
  const ending = world.update(snap, 1 / 60);
  assert.equal(ending.endingActive, true);
  assert.ok(ending.cameraFocus);
  assert.ok(ending.cues.includes("farewell"));
  for (let i = 0; i < 720; i++) world.update(snap, 1 / 60);
  assert.equal(world.update(snap, 1 / 60).endingActive, false);
  assert.equal(JSON.stringify(snap), won);
  world.reset();
  snap.state = "playing";
  snap.lanterns[3].lit = snap.lanterns[4].lit = false;
  const replay = world.update(snap, 1 / 60);
  assert.ok(replay.cues.includes("whale"));
  assert.equal(replay.endingActive, false);
  assert.equal(replay.cameraFocus, null);
  assert.equal(replay.speedMultiplier, 1);
});

test("Đèn Lạc only reacts to a nearby pulse and reset clears its dialogue", () => {
  const world = new CreativeWorld(new THREE.Scene(), DEFAULT_TUNING);
  const snap = new GameEngine({ seed: 1 }).getViewState();
  world.onPulse([-30, 0, -30]);
  assert.ok(!world.update(snap, 1 / 60).cues.includes("reveal"));
  world.onPulse([7, 0, 5]);
  assert.ok(world.update(snap, 1 / 60).cues.includes("reveal"));
  world.reset();
  assert.ok(!world.update(snap, 1 / 60).storyText?.includes("Đèn Lạc"));
});
