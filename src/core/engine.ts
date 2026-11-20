import {
  clampToRadiusXZ,
  distSqXZ,
  distXZ,
  rotateMoveByYaw,
  round3,
  roundVec3
} from "./math.js";
import { SeededRng } from "./rng.js";
import {
  DEFAULT_TUNING,
  DT,
  ISLAND_RADIUS,
  LANTERN_RING_RADIUS,
  TICK_RATE
} from "./tuning.js";
import type {
  EndRecord,
  GameEvent,
  GameStateSnapshot,
  InputFrame,
  InputState,
  LanternState,
  MoteState,
  PlayerState,
  PlayState,
  ScenarioConfig,
  ShadeState,
  SnapshotRecord,
  TuningConfig,
  Vec3
} from "./types.js";

const JUMP_VELOCITY = 6.5;
const GRAVITY = -18.0;
const INITIAL_RANDOM_MOTES = 20;
const INITIAL_RANDOM_SHADES = 2;
const MAX_RANDOM_SHADES = 5;

export interface EngineOptions {
  seed: number;
  night?: number;
  tuning?: TuningConfig;
  scenario?: ScenarioConfig;
}

export class GameEngine {
  readonly tuning: TuningConfig;
  private readonly rng: SeededRng;
  private readonly randomMotes: boolean;
  private readonly randomShades: boolean;
  private readonly initialTimeLeftS: number;

  private tick = 0;
  private simTick = 0;
  private stepsExecuted = 0;
  private timeLeftS: number;
  private state: PlayState = "playing";
  private score = 0;

  private player: PlayerState;
  private lanterns: LanternState[];
  private motes: MoteState[] = [];
  private shades: ShadeState[] = [];

  private nextMoteCounter = 1;
  private nextShadeCounter = 1;

  private currentInput: InputState = {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false
  };
  private prevInput: InputState = { ...this.currentInput };

  constructor(options: EngineOptions) {
    this.tuning = options.tuning ?? DEFAULT_TUNING;
    this.rng = new SeededRng(options.seed);

    const sc = options.scenario ?? {};
    this.randomMotes = sc.random_motes ?? true;
    this.randomShades = sc.random_shades ?? true;
    this.initialTimeLeftS = sc.time_left_s ?? this.tuning.night1_duration_s;
    this.timeLeftS = this.initialTimeLeftS;

    this.player = {
      pos: sc.player?.pos ? [...sc.player.pos] : [0, 0, 0],
      velY: 0,
      flames: sc.player?.flames ?? this.tuning.flames,
      carried: sc.player?.carried ?? 0,
      invulnTimer: 0,
      pulseCooldownTimer: 0
    };

    // Build default 5 lanterns in a circle of radius 22m
    const count = this.tuning.lantern_count_night1;
    this.lanterns = [];
    for (let i = 0; i < count; i++) {
      const angle = (i * 2 * Math.PI) / count;
      const x = round3(Math.sin(angle) * LANTERN_RING_RADIUS);
      const z = round3(Math.cos(angle) * LANTERN_RING_RADIUS);
      this.lanterns.push({
        id: `L${i + 1}`,
        pos: [x, 0, z],
        lit: false,
        deposited: 0
      });
    }

    if (sc.lanterns) {
      for (const patch of sc.lanterns) {
        const target = this.lanterns.find((l) => l.id === patch.id);
        if (!target) continue;
        if (patch.pos) target.pos = [...patch.pos];
        if (patch.deposited !== undefined) target.deposited = patch.deposited;
        if (patch.lit !== undefined) {
          target.lit = patch.lit;
        } else if (target.deposited >= this.tuning.lantern_cost) {
          target.lit = true;
        }
      }
    }

    if (sc.motes !== undefined) {
      for (const item of sc.motes) {
        if (Array.isArray(item)) {
          this.motes.push({ id: this.allocMoteId(), pos: [...item] });
        } else {
          const id = item.id ?? this.allocMoteId();
          this.motes.push({ id, pos: [...item.pos] });
        }
      }
    } else if (this.randomMotes) {
      for (let i = 0; i < INITIAL_RANDOM_MOTES; i++) {
        this.motes.push({
          id: this.allocMoteId(),
          pos: this.sampleIslandPoint(4, ISLAND_RADIUS - 4)
        });
      }
    }

    if (sc.shades !== undefined) {
      for (const item of sc.shades) {
        if (Array.isArray(item)) {
          this.shades.push({
            id: this.allocShadeId(),
            pos: [...item],
            state: "chase",
            stunTimer: 0
          });
        } else {
          const id = item.id ?? this.allocShadeId();
          const behavior = item.state ?? "chase";
          this.shades.push({
            id,
            pos: [...item.pos],
            state: behavior,
            stunTimer: behavior === "stunned" ? this.tuning.pulse_stun_s : 0
          });
        }
      }
    } else if (this.randomShades) {
      for (let i = 0; i < INITIAL_RANDOM_SHADES; i++) {
        this.shades.push({
          id: this.allocShadeId(),
          pos: this.sampleSafeAwareShadePoint(),
          state: "chase",
          stunTimer: 0
        });
      }
    }
  }

  private allocMoteId(): string {
    const id = `M${this.nextMoteCounter}`;
    this.nextMoteCounter += 1;
    return id;
  }

  private allocShadeId(): string {
    const id = `S${this.nextShadeCounter}`;
    this.nextShadeCounter += 1;
    return id;
  }

  private sampleIslandPoint(minR: number, maxR: number): Vec3 {
    const r = Math.sqrt(this.rng.range(minR * minR, maxR * maxR));
    const angle = this.rng.range(0, Math.PI * 2);
    return [round3(Math.cos(angle) * r), 0, round3(Math.sin(angle) * r)];
  }

  private sampleSafeAwareShadePoint(): Vec3 {
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = this.sampleIslandPoint(26, ISLAND_RADIUS - 3);
      const nearPlayer = distXZ(candidate, this.player.pos) < 12;
      const inSafe = this.lanterns.some(
        (l) => l.lit && distXZ(candidate, l.pos) <= this.tuning.safe_radius + 1
      );
      if (!nearPlayer && !inSafe) {
        return candidate;
      }
    }
    return this.sampleIslandPoint(28, ISLAND_RADIUS - 3);
  }

  isFinished(): boolean {
    return this.state !== "playing";
  }

  getTick(): number {
    return this.tick;
  }

  getSnapshotRecord(): SnapshotRecord {
    return {
      type: "snapshot",
      tick: this.tick,
      sim_tick: this.simTick,
      state: this.state,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      player: {
        pos: roundVec3(this.player.pos),
        flames: this.player.flames,
        carried: this.player.carried
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: roundVec3(l.pos),
        lit: l.lit,
        deposited: l.deposited
      })),
      shades: this.shades.map((s) => ({
        id: s.id,
        pos: roundVec3(s.pos),
        state: s.state
      })),
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: roundVec3(m.pos)
      })),
      motes_active: this.motes.length
    };
  }

  getEndRecord(): EndRecord {
    return {
      type: "end",
      ticks: this.stepsExecuted,
      state: this.state,
      score: this.score
    };
  }

  getViewState(): GameStateSnapshot {
    return {
      tick: this.tick,
      simTick: this.simTick,
      state: this.state,
      timeLeftS: this.timeLeftS,
      score: this.score,
      player: {
        pos: [...this.player.pos],
        velY: this.player.velY,
        flames: this.player.flames,
        carried: this.player.carried,
        invulnTimer: this.player.invulnTimer,
        pulseCooldownTimer: this.player.pulseCooldownTimer
      },
      lanterns: this.lanterns.map((l) => ({ ...l, pos: [...l.pos] })),
      shades: this.shades.map((s) => ({ ...s, pos: [...s.pos] })),
      motes: this.motes.map((m) => ({ ...m, pos: [...m.pos] })),
      islandRadius: ISLAND_RADIUS
    };
  }

  /**
   * Advances simulation by 1 tick (1/60s) using the provided input frame (if any).
   * Returns events emitted at tick = k + 1.
   */
  step(frame?: InputFrame): GameEvent[] {
    if (this.state !== "playing") {
      return [];
    }

    const events: GameEvent[] = [];
    const eventTick = this.stepsExecuted + 1;

    // 1. Apply input changes for this tick
    if (frame) {
      if (frame.move !== undefined) this.currentInput.move = [...frame.move];
      if (frame.cam_yaw_deg !== undefined) this.currentInput.cam_yaw_deg = frame.cam_yaw_deg;
      if (frame.jump !== undefined) this.currentInput.jump = frame.jump;
      if (frame.interact !== undefined) this.currentInput.interact = frame.interact;
      if (frame.pulse !== undefined) this.currentInput.pulse = frame.pulse;
      if (frame.dash !== undefined) this.currentInput.dash = frame.dash;
    }

    const jumpJustPressed = this.currentInput.jump && !this.prevInput.jump;
    const interactJustPressed = this.currentInput.interact && !this.prevInput.interact;
    const pulseJustPressed = this.currentInput.pulse && !this.prevInput.pulse;
    this.prevInput = {
      ...this.currentInput,
      move: [...this.currentInput.move]
    };

    // 2. Update timers
    if (this.player.invulnTimer > 0) {
      this.player.invulnTimer = Math.max(0, this.player.invulnTimer - DT);
    }
    if (this.player.pulseCooldownTimer > 0) {
      this.player.pulseCooldownTimer = Math.max(0, this.player.pulseCooldownTimer - DT);
    }
    for (const shade of this.shades) {
      if (shade.state === "stunned") {
        shade.stunTimer = Math.max(0, shade.stunTimer - DT);
        if (shade.stunTimer <= 0) {
          shade.state = "chase";
        }
      }
    }

    // 3. Move player (XZ plane + vertical jump)
    const [wx, wz] = rotateMoveByYaw(this.currentInput.move, this.currentInput.cam_yaw_deg);
    this.player.pos[0] += wx * this.tuning.player_speed * DT;
    this.player.pos[2] += wz * this.tuning.player_speed * DT;
    this.player.pos = clampToRadiusXZ(this.player.pos, ISLAND_RADIUS);

    if (jumpJustPressed && this.player.pos[1] <= 0) {
      this.player.velY = JUMP_VELOCITY;
    }
    if (this.player.pos[1] > 0 || this.player.velY > 0) {
      this.player.velY += GRAVITY * DT;
      this.player.pos[1] += this.player.velY * DT;
      if (this.player.pos[1] <= 0) {
        this.player.pos[1] = 0;
        this.player.velY = 0;
      }
    }

    // 4. Pickup motes within pickup_radius (XZ)
    const pickupSq = this.tuning.pickup_radius * this.tuning.pickup_radius;
    const remainingMotes: MoteState[] = [];
    for (const mote of this.motes) {
      if (
        this.player.carried < this.tuning.carry_capacity &&
        distSqXZ(this.player.pos, mote.pos) <= pickupSq
      ) {
        this.player.carried += 1;
        this.score += this.tuning.score.per_mote;
        events.push({
          type: "event",
          tick: eventTick,
          name: "mote_picked",
          data: { carried: this.player.carried }
        });
      } else {
        remainingMotes.push(mote);
      }
    }
    this.motes = remainingMotes;

    // 5. Interact with nearest unlit lantern within interact_radius
    if (interactJustPressed && this.player.carried > 0) {
      const interactSq = this.tuning.interact_radius * this.tuning.interact_radius;
      let bestLantern: LanternState | null = null;
      let bestDistSq = Infinity;

      for (const lantern of this.lanterns) {
        if (lantern.lit) continue;
        const dSq = distSqXZ(this.player.pos, lantern.pos);
        if (dSq <= interactSq && dSq < bestDistSq) {
          bestDistSq = dSq;
          bestLantern = lantern;
        }
      }

      if (bestLantern) {
        const needed = Math.max(0, this.tuning.lantern_cost - bestLantern.deposited);
        const amount = Math.min(this.player.carried, needed);
        if (amount > 0) {
          this.player.carried -= amount;
          bestLantern.deposited += amount;
          events.push({
            type: "event",
            tick: eventTick,
            name: "deposit",
            data: {
              lantern_id: bestLantern.id,
              amount,
              deposited: bestLantern.deposited
            }
          });

          if (bestLantern.deposited >= this.tuning.lantern_cost && !bestLantern.lit) {
            bestLantern.lit = true;
            this.score += this.tuning.score.per_lantern;
            events.push({
              type: "event",
              tick: eventTick,
              name: "lantern_lit",
              data: { lantern_id: bestLantern.id }
            });
          }
        }
      }
    }

    // 6. Pulse (shine to repel and stun shades)
    if (
      pulseJustPressed &&
      this.player.pulseCooldownTimer <= 0 &&
      this.player.carried >= this.tuning.pulse_cost
    ) {
      this.player.carried -= this.tuning.pulse_cost;
      this.player.pulseCooldownTimer = this.tuning.pulse_cooldown_s;

      const pulseSq = this.tuning.pulse_radius * this.tuning.pulse_radius;
      const stunnedIds: string[] = [];

      for (const shade of this.shades) {
        const dSq = distSqXZ(this.player.pos, shade.pos);
        if (dSq <= pulseSq) {
          const d = Math.sqrt(dSq);
          const dirX = d > 1e-6 ? (shade.pos[0] - this.player.pos[0]) / d : 0;
          const dirZ = d > 1e-6 ? (shade.pos[2] - this.player.pos[2]) / d : 1;

          shade.pos = clampToRadiusXZ(
            [
              shade.pos[0] + dirX * this.tuning.pulse_push_m,
              shade.pos[1],
              shade.pos[2] + dirZ * this.tuning.pulse_push_m
            ],
            ISLAND_RADIUS
          );
          this.enforceSafeZones(shade);

          shade.state = "stunned";
          shade.stunTimer = this.tuning.pulse_stun_s;
          this.score += this.tuning.score.per_stun;
          stunnedIds.push(shade.id);
        }
      }

      events.push({
        type: "event",
        tick: eventTick,
        name: "pulse",
        data: { stunned_ids: stunnedIds }
      });
    }

    // 7. Random spawning (disabled when random_motes / random_shades === false)
    if (this.randomMotes && this.motes.length < 15 && eventTick % 180 === 0) {
      this.motes.push({
        id: this.allocMoteId(),
        pos: this.sampleIslandPoint(4, ISLAND_RADIUS - 4)
      });
    }
    if (
      this.randomShades &&
      this.shades.length < MAX_RANDOM_SHADES &&
      eventTick % 900 === 0
    ) {
      const shadeId = this.allocShadeId();
      this.shades.push({
        id: shadeId,
        pos: this.sampleSafeAwareShadePoint(),
        state: "chase",
        stunTimer: 0
      });
      events.push({
        type: "event",
        tick: eventTick,
        name: "shade_spawned",
        data: { id: shadeId }
      });
    }

    // 8. Move shades & enforce lit-lantern safe zones
    for (const shade of this.shades) {
      if (shade.state === "chase") {
        const dx = this.player.pos[0] - shade.pos[0];
        const dz = this.player.pos[2] - shade.pos[2];
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-6) {
          const stepDist = Math.min(dist, this.tuning.shade_speed * DT);
          shade.pos[0] += (dx / dist) * stepDist;
          shade.pos[2] += (dz / dist) * stepDist;
          shade.pos = clampToRadiusXZ(shade.pos, ISLAND_RADIUS);
        }
      }
      this.enforceSafeZones(shade);
    }

    // 9. Shade collision with player
    if (this.player.invulnTimer <= 0) {
      const hitSq = this.tuning.shade_hit_radius * this.tuning.shade_hit_radius;
      for (const shade of this.shades) {
        if (shade.state !== "chase") continue;
        if (distSqXZ(this.player.pos, shade.pos) <= hitSq) {
          this.player.flames = Math.max(0, this.player.flames - 1);
          const dropped = Math.floor(this.player.carried * this.tuning.hit_drop_ratio);
          this.player.carried -= dropped;
          this.player.invulnTimer = this.tuning.invuln_s;

          events.push({
            type: "event",
            tick: eventTick,
            name: "player_hit",
            data: {
              by: "shade",
              flames: this.player.flames,
              dropped
            }
          });
          break;
        }
      }
    }

    // 10. Advance counters & time
    this.stepsExecuted += 1;
    this.tick = this.stepsExecuted;
    this.simTick = this.stepsExecuted;
    this.timeLeftS = Math.max(0, this.initialTimeLeftS - this.stepsExecuted / TICK_RATE);

    // 11. Check win/loss conditions
    if (this.lanterns.every((l) => l.lit)) {
      this.state = "won";
      this.score +=
        Math.round(this.timeLeftS * this.tuning.score.per_second_left) +
        this.player.flames * this.tuning.score.per_flame_left;
      events.push({
        type: "event",
        tick: eventTick,
        name: "game_over",
        data: { result: "won", reason: "all_lit" }
      });
    } else if (this.player.flames <= 0) {
      this.state = "lost";
      events.push({
        type: "event",
        tick: eventTick,
        name: "game_over",
        data: { result: "lost", reason: "no_flames" }
      });
    } else if (this.timeLeftS <= 0) {
      this.state = "lost";
      events.push({
        type: "event",
        tick: eventTick,
        name: "game_over",
        data: { result: "lost", reason: "dawn" }
      });
    }

    return events;
  }

  private enforceSafeZones(shade: ShadeState): void {
    const safeR = this.tuning.safe_radius;
    if (safeR <= 0) return;

    for (const lantern of this.lanterns) {
      if (!lantern.lit) continue;
      const dx = shade.pos[0] - lantern.pos[0];
      const dz = shade.pos[2] - lantern.pos[2];
      const dist = Math.hypot(dx, dz);
      if (dist <= safeR) {
        const outR = safeR + 0.01;
        if (dist > 1e-6) {
          shade.pos[0] = lantern.pos[0] + (dx / dist) * outR;
          shade.pos[2] = lantern.pos[2] + (dz / dist) * outR;
        } else {
          shade.pos[2] = lantern.pos[2] + outR;
        }
        shade.pos = clampToRadiusXZ(shade.pos, ISLAND_RADIUS);
      }
    }
  }
}
