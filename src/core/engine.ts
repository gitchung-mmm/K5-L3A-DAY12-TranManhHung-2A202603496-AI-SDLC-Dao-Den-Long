import { distSqXZ, distXZ, rotateMoveByYaw, round3, roundVec3 } from "./math.js";
import { getNightMap, getSurfaceY, resolveHorizontalMove, type NightMapDef } from "./maps.js";
import { SeededRng } from "./rng.js";
import { DEFAULT_TUNING, DT, TICK_RATE } from "./tuning.js";
import type {
  CharmState,
  DrifterState,
  EndRecord,
  GameEvent,
  GameStateSnapshot,
  InputFrame,
  InputState,
  LanternState,
  MoteState,
  NightNumber,
  PlayerState,
  PlayState,
  ScenarioConfig,
  ShadeBehaviorState,
  ShadeState,
  SnapshotRecord,
  TuningConfig,
  Vec2,
  Vec3,
  WindState
} from "./types.js";

const JUMP_VELOCITY = 7.0;
const GRAVITY = -20.0;
const INITIAL_RANDOM_MOTES = 20;
const MAX_MOTES = 30;
const MOTE_SPAWN_INTERVAL = 240;
const DROPPED_MOTE_TTL = 480;
const SHADE_SPAWN_FIRST_TICK = 300;
const SHADE_SPAWN_STATE_TICKS = 30;
const SHADE_DETECT_RADIUS = 12.0;
const SHADE_LOSE_RADIUS = 18.0;
const SHADE_DRAIN_RADIUS = 2.0;
const SHADE_DRAIN_AGGRO_RADIUS = 6.0;
const SHADE_RECOIL_TICKS = 60;
const SHADE_RECOIL_DIST = 2.0;
const PULSE_PUSH_TICKS = 15;
const SAFE_PUSH_MAX_TICKS = 30;
const RESPAWN_WAIT_TICKS = 60;
const DRIFTER_SPAWN_INTERVAL = 1200;
const DRIFTER_IDLE_SPEED = 2.0;
const DRIFTER_FAST_SPEED = 7.0;
const DRIFTER_DETECT_RADIUS = 15.0;
const DRIFTER_DETECT_MIN_CARRIED = 5;
const DRIFTER_STEAL_RADIUS = 1.2;
const DRIFTER_FLEE_TICKS = 240;
const DRIFTER_DROP_FLEE_TICKS = 120;
const CHARM_DURATION_TICKS = 600;
const CHARM_RESPAWN_TICKS = 2700;
const CHARM_PLAYER_SPEED = 7.2;
const WIND_PERIOD_TICKS = 1800;
const WIND_WARNING_TICKS = 120;
const WIND_ACTIVE_TICKS = 300;
const WIND_PUSH_SPEED = 2.0;

function round1(value: number): number {
  const r = Math.round(value * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

export interface EngineOptions {
  seed: number;
  night?: NightNumber;
  tuning?: TuningConfig;
  scenario?: ScenarioConfig;
}

export class GameEngine {
  readonly tuning: TuningConfig;
  readonly night: NightNumber;
  readonly map: NightMapDef;
  private readonly rng: SeededRng;
  private readonly randomMotes: boolean;
  private readonly randomShades: boolean;
  private readonly randomDrifters: boolean;
  private readonly windEnabled: boolean;
  private readonly initialTimeLeftS: number;

  // Integer 1/60 fuel constants to eliminate floating-point drift
  private readonly fuelMaxUnits: number;
  private readonly fuelDecayUnits: number;
  private readonly fuelDrainUnits: number;
  private readonly fuelPerMoteUnits: number;
  private readonly lowFuelUnits: number;

  private tick = 0;
  private simTick = 0;
  private timeLeftS: number;
  private state: PlayState = "playing";
  private score = 0;

  private player: PlayerState;
  private lanterns: LanternState[];
  private motes: MoteState[] = [];
  private shades: ShadeState[] = [];
  private drifters: DrifterState[] = [];
  private charms: CharmState[] = [];
  private wind: WindState = { active: false, warning: false, dir_deg: 0, cycleTick: 0 };

  private nextMoteCounter = 1;
  private nextShadeCounter = 1;
  private nextDrifterCounter = 1;

  private currentInput: InputState = {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false
  };
  private prevInput: InputState = { ...this.currentInput };

  constructor(options: EngineOptions) {
    this.tuning = options.tuning ?? DEFAULT_TUNING;
    this.night = options.night ?? 1;
    this.map = getNightMap(this.night);
    this.rng = new SeededRng(options.seed);

    this.fuelMaxUnits = Math.round(this.tuning.fuel_max * TICK_RATE);
    this.fuelDecayUnits = Math.round(this.tuning.fuel_decay_per_s);
    this.fuelDrainUnits = Math.round(this.tuning.drain_per_s);
    this.fuelPerMoteUnits = Math.round(this.tuning.fuel_per_mote * TICK_RATE);
    this.lowFuelUnits = Math.round(this.tuning.low_fuel_threshold * TICK_RATE);

    const sc = options.scenario ?? {};
    this.randomMotes = sc.random_motes ?? true;
    this.randomShades = sc.random_shades ?? true;
    this.randomDrifters = sc.random_drifters ?? this.map.maxDrifters > 0;
    this.windEnabled = sc.wind_enabled ?? this.map.windEnabledByDefault;

    const defaultDuration =
      this.night === 1
        ? this.tuning.night1_duration_s
        : this.night === 2
          ? this.tuning.night2_duration_s
          : this.tuning.night3_duration_s;
    this.initialTimeLeftS = sc.time_left_s ?? defaultDuration;
    this.timeLeftS = this.initialTimeLeftS;

    const startPos: Vec3 = sc.player?.pos ? [...sc.player.pos] : [...this.map.spawnPos];
    const startSurf = getSurfaceY(this.night, startPos[0], startPos[2]);
    const grounded = startSurf !== null && Math.abs(startPos[1] - startSurf) <= 0.15;

    this.player = {
      pos: startPos,
      vel: [0, 0, 0],
      facing: [0, 1],
      grounded,
      flames: sc.player?.flames ?? this.tuning.flames,
      carried: sc.player?.carried ?? 0,
      successfulLights: sc.player?.successful_lights ?? 0,
      invulnTicks: sc.player?.invuln_ticks ?? 0,
      dashTicks: 0,
      dashDir: [0, 1],
      dashCdTicks: sc.player?.dash_cd_ticks ?? 0,
      pulseCdTicks: sc.player?.pulse_cd_ticks ?? 0,
      charmTicks: sc.player?.charm_ticks ?? 0,
      respawnTicks: 0,
      padLaunched: false
    };

    // Lanterns from standard night map
    this.lanterns = this.map.lanterns.map((l) => ({
      id: l.id,
      pos: [...l.pos],
      lit: false,
      deposited: 0,
      fuelUnits: 0,
      everLit: false,
      relitCount: 0
    }));

    if (sc.lanterns) {
      for (const patch of sc.lanterns) {
        const target = this.lanterns.find((l) => l.id === patch.id);
        if (!target) continue;
        if (patch.pos) target.pos = [...patch.pos];
        if (patch.deposited !== undefined) target.deposited = patch.deposited;
        if (patch.ever_lit !== undefined) target.everLit = patch.ever_lit;

        if (patch.lit !== undefined) {
          target.lit = patch.lit;
        } else if (patch.fuel !== undefined && patch.fuel > 0) {
          target.lit = true;
        } else if (
          target.deposited >= (target.everLit ? this.tuning.relight_cost : this.tuning.lantern_cost)
        ) {
          target.lit = true;
        }

        if (target.lit) {
          const fuelVal = patch.fuel !== undefined ? patch.fuel : this.tuning.fuel_max;
          target.fuelUnits = Math.max(0, Math.min(this.fuelMaxUnits, Math.round(fuelVal * TICK_RATE)));
          if (patch.ever_lit === undefined) {
            target.everLit = true;
          }
        } else {
          target.fuelUnits = 0;
        }
      }
    }

    // Motes
    if (sc.motes !== undefined) {
      for (const item of sc.motes) {
        if (Array.isArray(item)) {
          this.motes.push({
            id: this.allocMoteId(),
            pos: [...item],
            kind: "random",
            ttlTicks: null,
            pickupDelayTicks: 0
          });
        } else {
          const id = item.id ?? this.allocMoteId();
          const kind = item.kind ?? "random";
          const ttlTicks =
            item.ttl_s !== undefined && item.ttl_s !== null
              ? Math.round(item.ttl_s * TICK_RATE)
              : kind === "dropped"
                ? DROPPED_MOTE_TTL
                : null;
          this.motes.push({
            id,
            pos: [...item.pos],
            kind,
            ttlTicks,
            pickupDelayTicks: 0
          });
        }
      }
    } else if (this.randomMotes) {
      const pool = this.map.moteSpawns.map((p): Vec3 => [...p]);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng.next() * (i + 1));
        const tmp = pool[i];
        pool[i] = pool[j];
        pool[j] = tmp;
      }
      const count = Math.min(INITIAL_RANDOM_MOTES, pool.length);
      for (let i = 0; i < count; i++) {
        this.motes.push({
          id: this.allocMoteId(),
          pos: pool[i],
          kind: "random",
          ttlTicks: null,
          pickupDelayTicks: 0
        });
      }
    }

    // Shades
    if (sc.shades !== undefined) {
      for (const item of sc.shades) {
        const pos: Vec3 = Array.isArray(item) ? [...item] : [...item.pos];
        const id = Array.isArray(item) ? this.allocShadeId() : item.id ?? this.allocShadeId();
        const distToPlayer = distXZ(pos, this.player.pos);
        const defaultState: ShadeBehaviorState =
          distToPlayer <= SHADE_DETECT_RADIUS ? "chase" : "wander";
        const behavior: ShadeBehaviorState = Array.isArray(item)
          ? defaultState
          : item.state ?? defaultState;
        const defaultTicks =
          behavior === "stunned"
            ? Math.round(this.tuning.pulse_stun_s * TICK_RATE)
            : behavior === "recoil"
              ? SHADE_RECOIL_TICKS
              : behavior === "spawning"
                ? SHADE_SPAWN_STATE_TICKS
                : 0;
        const stateTicksLeft = Array.isArray(item)
          ? defaultTicks
          : item.state_ticks_left ?? defaultTicks;

        let targetLanternId: string | null = Array.isArray(item)
          ? null
          : item.target_lantern_id ?? null;
        if (behavior === "drain" && !targetLanternId) {
          const nearLit = this.findClosestLantern(pos, (l) => l.lit && distXZ(pos, l.pos) <= SHADE_DRAIN_RADIUS);
          targetLanternId = nearLit?.id ?? null;
        }

        this.shades.push({
          id,
          pos,
          state: behavior,
          stateTicksLeft,
          pushTicksLeft: 0,
          pushDir: [1, 0],
          recoilDir: [1, 0],
          safePushTicks: 0,
          safePushLanternId: null,
          targetLanternId,
          drainTickCounter: 0,
          wanderAngle: this.rng.range(0, Math.PI * 2)
        });
      }
    }

    // Drifters
    if (sc.drifters !== undefined) {
      for (const item of sc.drifters) {
        const id = item.id ?? this.allocDrifterId();
        const st = item.state ?? "idle";
        this.drifters.push({
          id,
          pos: [...item.pos],
          state: st,
          stolen: item.stolen ?? 0,
          stateTicksLeft: item.state_ticks_left ?? (st === "flee" ? DRIFTER_FLEE_TICKS : 0),
          idleAngle: this.rng.range(0, Math.PI * 2)
        });
      }
    }

    // Charms
    if (sc.charms !== undefined) {
      for (let i = 0; i < sc.charms.length; i++) {
        const item = sc.charms[i];
        const fallback = this.map.charms[i];
        const id = item.id ?? fallback?.id ?? `C${i + 1}`;
        const pos: Vec3 = item.pos
          ? [...item.pos]
          : fallback
            ? [...fallback.pos]
            : [0, 0, 0];
        const available = item.available ?? true;
        const respawnTicks =
          item.respawn_ticks ??
          (item.respawn_s !== undefined ? Math.round(item.respawn_s * TICK_RATE) : 0);
        this.charms.push({ id, pos, available, respawnTicks });
      }
    } else {
      this.charms = this.map.charms.map((c) => ({
        id: c.id,
        pos: [...c.pos],
        available: true,
        respawnTicks: 0
      }));
    }
  }

  private allocMoteId(): string {
    return `M${this.nextMoteCounter++}`;
  }

  private allocShadeId(): string {
    return `S${this.nextShadeCounter++}`;
  }

  private allocDrifterId(): string {
    return `D${this.nextDrifterCounter++}`;
  }

  private hasSafeZone(lantern: LanternState): boolean {
    return lantern.lit && lantern.fuelUnits >= this.lowFuelUnits;
  }

  getPlayerCapacity(): number {
    return Math.min(
      this.tuning.capacity_max,
      this.tuning.carry_capacity + 2 * this.player.successfulLights
    );
  }

  private findClosestLantern(
    from: Vec3,
    predicate: (l: LanternState) => boolean
  ): LanternState | null {
    let best: LanternState | null = null;
    let bestDistSq = Infinity;
    for (const l of this.lanterns) {
      if (!predicate(l)) continue;
      const dSq = distSqXZ(from, l.pos);
      if (
        !best ||
        dSq < bestDistSq - 1e-9 ||
        (Math.abs(dSq - bestDistSq) <= 1e-9 && l.id.localeCompare(best.id) < 0)
      ) {
        best = l;
        bestDistSq = dSq;
      }
    }
    return best;
  }

  isFinished(): boolean {
    return this.state === "won" || this.state === "lost";
  }

  getTick(): number {
    return this.tick;
  }

  getSimTick(): number {
    return this.simTick;
  }

  getNightStartEvent(): GameEvent {
    return {
      type: "event",
      tick: 0,
      name: "night_start",
      data: { night: this.night }
    };
  }

  getSnapshotRecord(): SnapshotRecord {
    return {
      type: "snapshot",
      tick: this.tick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.state,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      wind: {
        active: this.wind.active,
        dir_deg: round3(this.wind.dir_deg)
      },
      player: {
        pos: roundVec3(this.player.pos),
        vel: roundVec3(this.player.vel),
        grounded: this.player.grounded,
        flames: this.player.flames,
        carried: this.player.carried,
        capacity: this.getPlayerCapacity(),
        invuln: this.player.invulnTicks > 0,
        dash_cd_s: round3(this.player.dashCdTicks / TICK_RATE),
        pulse_cd_s: round3(this.player.pulseCdTicks / TICK_RATE),
        charm_s: round3(this.player.charmTicks / TICK_RATE)
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: roundVec3(l.pos),
        lit: l.lit,
        deposited: l.deposited,
        fuel: l.lit ? round1(l.fuelUnits / TICK_RATE) : 0,
        ever_lit: l.everLit,
        relit_count: l.relitCount
      })),
      shades: this.shades.map((s) => ({
        id: s.id,
        pos: roundVec3(s.pos),
        state: s.state
      })),
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: roundVec3(m.pos),
        kind: m.kind,
        ttl_s: m.ttlTicks === null ? null : round3(m.ttlTicks / TICK_RATE)
      })),
      motes_active: this.motes.length,
      drifters: this.drifters.map((d) => ({
        id: d.id,
        pos: roundVec3(d.pos),
        state: d.state,
        stolen: d.stolen
      })),
      charms: this.charms.map((c) => ({
        id: c.id,
        available: c.available,
        respawn_s: round3(c.respawnTicks / TICK_RATE)
      }))
    };
  }

  getEndRecord(): EndRecord {
    return {
      type: "end",
      ticks: this.tick,
      state: this.state,
      score: this.score
    };
  }

  getViewState(): GameStateSnapshot {
    return {
      tick: this.tick,
      simTick: this.simTick,
      night: this.night,
      state: this.state,
      timeLeftS: this.timeLeftS,
      score: this.score,
      wind: {
        active: this.wind.active,
        warning: this.wind.warning,
        dir_deg: this.wind.dir_deg
      },
      player: {
        pos: [...this.player.pos],
        vel: [...this.player.vel],
        velY: this.player.vel[1],
        facing: [...this.player.facing],
        grounded: this.player.grounded,
        flames: this.player.flames,
        carried: this.player.carried,
        capacity: this.getPlayerCapacity(),
        invulnTimer: this.player.invulnTicks / TICK_RATE,
        dashCooldownTimer: this.player.dashCdTicks / TICK_RATE,
        pulseCooldownTimer: this.player.pulseCdTicks / TICK_RATE,
        charmTimer: this.player.charmTicks / TICK_RATE,
        respawnTimer: this.player.respawnTicks / TICK_RATE
      },
      lanterns: this.lanterns.map((l) => ({
        ...l,
        pos: [...l.pos],
        fuel: l.lit ? round1(l.fuelUnits / TICK_RATE) : 0
      })),
      shades: this.shades.map((s) => ({ ...s, pos: [...s.pos] })),
      motes: this.motes.map((m) => ({ ...m, pos: [...m.pos] })),
      drifters: this.drifters.map((d) => ({ ...d, pos: [...d.pos] })),
      charms: this.charms.map((c) => ({ ...c, pos: [...c.pos] })),
      islandRadius: this.map.islandRadius
    };
  }

  /**
   * Executes 1 tick following the mandatory 12-step order of Contract v1.2.
   */
  step(frame?: InputFrame): GameEvent[] {
    if (this.isFinished()) {
      return [];
    }

    const events: GameEvent[] = [];
    const nextTick = this.tick + 1;

    // Step 1: Read input & handle pause first
    if (frame) {
      if (frame.move !== undefined) this.currentInput.move = [...frame.move];
      if (frame.cam_yaw_deg !== undefined) this.currentInput.cam_yaw_deg = frame.cam_yaw_deg;
      if (frame.jump !== undefined) this.currentInput.jump = frame.jump;
      if (frame.interact !== undefined) this.currentInput.interact = frame.interact;
      if (frame.pulse !== undefined) this.currentInput.pulse = frame.pulse;
      if (frame.dash !== undefined) this.currentInput.dash = frame.dash;
      if (frame.pause !== undefined) this.currentInput.pause = frame.pause;
    }

    const pauseJustPressed = this.currentInput.pause && !this.prevInput.pause;
    const jumpJustPressed = this.currentInput.jump && !this.prevInput.jump;
    const interactJustPressed = this.currentInput.interact && !this.prevInput.interact;
    const pulseJustPressed = this.currentInput.pulse && !this.prevInput.pulse;
    const dashJustPressed = this.currentInput.dash && !this.prevInput.dash;

    this.prevInput = {
      ...this.currentInput,
      move: [...this.currentInput.move]
    };

    if (this.state === "playing" && pauseJustPressed) {
      this.state = "paused";
      this.tick = nextTick;
      events.push({ type: "event", tick: nextTick, name: "paused", data: {} });
      return events;
    }

    if (this.state === "paused") {
      if (!pauseJustPressed) {
        this.tick = nextTick;
        return events;
      }
      this.state = "playing";
      events.push({ type: "event", tick: nextTick, name: "resumed", data: {} });
    }

    // Step 2: Advance sim_tick, decrement timers, & subtract lantern fuel (decay + drain)
    this.tick = nextTick;
    this.simTick += 1;
    this.timeLeftS = Math.max(0, this.initialTimeLeftS - this.simTick / TICK_RATE);

    if (this.player.invulnTicks > 0) this.player.invulnTicks -= 1;
    if (this.player.dashCdTicks > 0) this.player.dashCdTicks -= 1;
    if (this.player.pulseCdTicks > 0) this.player.pulseCdTicks -= 1;
    if (this.player.charmTicks > 0) this.player.charmTicks -= 1;

    if (this.player.respawnTicks > 0) {
      this.player.respawnTicks -= 1;
      if (this.player.respawnTicks === 0) {
        this.player.pos = [...this.map.spawnPos];
        this.player.vel = [0, 0, 0];
        this.player.grounded = true;
        this.player.padLaunched = false;
        this.player.dashTicks = 0;
        this.player.invulnTicks = Math.round(this.tuning.invuln_s * TICK_RATE);
      }
    }

    // Motes TTL & pickup delay
    const survivingMotes: MoteState[] = [];
    for (const mote of this.motes) {
      if (mote.pickupDelayTicks > 0) mote.pickupDelayTicks -= 1;
      if (mote.ttlTicks !== null) {
        mote.ttlTicks -= 1;
        if (mote.ttlTicks <= 0) continue;
      }
      survivingMotes.push(mote);
    }
    this.motes = survivingMotes;

    // Charms respawn timer
    for (const charm of this.charms) {
      if (!charm.available && charm.respawnTicks > 0) {
        charm.respawnTicks -= 1;
        if (charm.respawnTicks <= 0) {
          charm.available = true;
        }
      }
    }

    // Shades state timers (v1.2: stunned always returns to wander)
    for (const shade of this.shades) {
      if (shade.stateTicksLeft > 0) {
        shade.stateTicksLeft -= 1;
        if (shade.stateTicksLeft <= 0) {
          if (shade.state === "stunned") {
            shade.state = "wander";
            shade.targetLanternId = null;
            shade.drainTickCounter = 0;
          } else if (shade.state === "spawning" || shade.state === "recoil") {
            const d = distXZ(shade.pos, this.player.pos);
            shade.state =
              this.player.respawnTicks === 0 && d <= SHADE_DETECT_RADIUS ? "chase" : "wander";
          }
        }
      }
    }

    // Drifters flee timer & removal
    for (const drifter of this.drifters) {
      if (drifter.state === "flee" && drifter.stateTicksLeft > 0) {
        drifter.stateTicksLeft -= 1;
        if (drifter.stateTicksLeft <= 0) {
          drifter.state = "removed";
        }
      }
    }
    this.drifters = this.drifters.filter((d) => d.state !== "removed");

    // Wind cycle (Night 3)
    this.updateWindState();

    // Lantern fuel subtraction (decay 1/60 + drain 5/60 per draining shade)
    const drainingShades = this.shades
      .filter((s) => s.state === "drain" && s.targetLanternId !== null)
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const lantern of this.lanterns) {
      if (!lantern.lit) continue;
      lantern.fuelUnits -= this.fuelDecayUnits;
      for (const shade of drainingShades) {
        if (shade.targetLanternId === lantern.id) {
          lantern.fuelUnits -= this.fuelDrainUnits;
          shade.drainTickCounter += 1;
          if (shade.drainTickCounter % TICK_RATE === 0) {
            events.push({
              type: "event",
              tick: nextTick,
              name: "fuel_drain",
              data: {
                lantern_id: lantern.id,
                shade_id: shade.id,
                fuel: round1(Math.max(0, lantern.fuelUnits) / TICK_RATE)
              }
            });
          }
        }
      }
    }

    // Immediately after Step 2: lanterns with fuel <= 0 extinguish (lantern_out)
    for (const lantern of this.lanterns) {
      if (lantern.lit && lantern.fuelUnits <= 0) {
        lantern.lit = false;
        lantern.fuelUnits = 0;
        lantern.deposited = 0;
        lantern.everLit = true;
        events.push({
          type: "event",
          tick: nextTick,
          name: "lantern_out",
          data: { lantern_id: lantern.id }
        });
        for (const shade of this.shades) {
          if (shade.state === "drain" && shade.targetLanternId === lantern.id) {
            shade.state = "wander";
            shade.targetLanternId = null;
            shade.drainTickCounter = 0;
          }
        }
      }
    }

    // Step 3: Move player (jump, dash, jump pad, wind) & check fall off island
    if (this.player.respawnTicks === 0) {
      this.stepPlayerMovement(jumpJustPressed, dashJustPressed, nextTick, events);
    }

    // Step 4: Pickup motes and charms
    if (this.player.respawnTicks === 0) {
      this.stepPickups(nextTick, events);
    }

    // Step 5: Interact with lanterns (deposit to unlit OR refuel lit with fuel < 100)
    if (this.player.respawnTicks === 0 && interactJustPressed && this.player.carried > 0) {
      this.stepInteractLantern(nextTick, events);
    }

    // Step 6: Update safe zones (only lit lanterns with fuel >= 30)
    this.stepSafeZones();

    // Step 7: Pulse (Tỏa Sáng)
    if (
      this.player.respawnTicks === 0 &&
      pulseJustPressed &&
      this.player.pulseCdTicks === 0 &&
      this.player.carried >= this.tuning.pulse_cost
    ) {
      this.stepPulse(nextTick, events);
    }

    // Step 8: Move shades and drifters
    this.stepMoveShades();
    this.stepMoveDrifters();

    // Step 9: Collisions — Drifters steal first, then Shades hit (id ascending)
    if (this.player.respawnTicks === 0) {
      this.stepCollisions(nextTick, events);
    }

    // Step 10: Scheduled spawns (new entities active from next tick)
    this.stepScheduledSpawns(nextTick, events);

    // Step 11: Win / loss check (v1.2: survival to dawn; no early win!)
    if (this.player.flames <= 0) {
      this.state = "lost";
      events.push({
        type: "event",
        tick: nextTick,
        name: "game_over",
        data: { result: "lost", reason: "no_flames" }
      });
    } else if (this.timeLeftS <= 0) {
      const litLanterns = this.lanterns.filter((l) => l.lit);
      const required = Math.ceil(this.tuning.win_ratio * this.lanterns.length);
      if (litLanterns.length >= required) {
        this.state = "won";
        for (const l of litLanterns) {
          this.score += 50 + Math.floor(l.fuelUnits / TICK_RATE);
        }
        this.score += this.player.flames * this.tuning.score.per_flame_left;
        events.push({
          type: "event",
          tick: nextTick,
          name: "game_over",
          data: { result: "won", reason: "dawn_survived" }
        });
      } else {
        this.state = "lost";
        events.push({
          type: "event",
          tick: nextTick,
          name: "game_over",
          data: { result: "lost", reason: "dawn" }
        });
      }
    }

    return events;
  }

  private updateWindState(): void {
    if (!this.windEnabled) {
      this.wind.active = false;
      this.wind.warning = false;
      return;
    }

    const firstWarnTick = WIND_PERIOD_TICKS - WIND_WARNING_TICKS;
    if (this.simTick < firstWarnTick) {
      this.wind.active = false;
      this.wind.warning = false;
      return;
    }

    const phase = (this.simTick - firstWarnTick) % WIND_PERIOD_TICKS;
    if (phase === 0) {
      this.wind.dir_deg = round3(this.rng.range(0, 360));
    }
    this.wind.warning = phase < WIND_WARNING_TICKS;
    this.wind.active = phase >= WIND_WARNING_TICKS && phase < WIND_WARNING_TICKS + WIND_ACTIVE_TICKS;
    this.wind.cycleTick = phase;
  }

  private stepPlayerMovement(
    jumpJustPressed: boolean,
    dashJustPressed: boolean,
    eventTick: number,
    events: GameEvent[]
  ): void {
    const moveWorld = rotateMoveByYaw(this.currentInput.move, this.currentInput.cam_yaw_deg);
    const moveMag = Math.hypot(moveWorld[0], moveWorld[1]);
    if (moveMag > 1e-6) {
      this.player.facing = [moveWorld[0] / moveMag, moveWorld[1] / moveMag];
    }

    const canDash =
      dashJustPressed &&
      this.player.dashTicks === 0 &&
      (this.player.dashCdTicks === 0 || this.player.charmTicks > 0);
    if (canDash) {
      this.player.dashTicks = Math.round(this.tuning.dash_duration_s * TICK_RATE);
      this.player.dashDir =
        moveMag > 1e-6 ? [moveWorld[0] / moveMag, moveWorld[1] / moveMag] : [...this.player.facing];
      if (this.player.charmTicks <= 0) {
        this.player.dashCdTicks = Math.round(this.tuning.dash_cooldown_s * TICK_RATE);
      }
      this.player.padLaunched = false;
      this.player.vel[1] = 0;
      events.push({ type: "event", tick: eventTick, name: "dash", data: {} });
    }

    const dashingThisTick = this.player.dashTicks > 0;
    if (dashingThisTick) {
      this.player.vel[0] = this.player.dashDir[0] * this.tuning.dash_speed;
      this.player.vel[2] = this.player.dashDir[1] * this.tuning.dash_speed;
      this.player.vel[1] = 0;
      this.player.dashTicks -= 1;
    } else if (!this.player.padLaunched) {
      const maxSpeed =
        this.player.charmTicks > 0 ? CHARM_PLAYER_SPEED : this.tuning.player_speed;
      const targetVx = moveWorld[0] * maxSpeed;
      const targetVz = moveWorld[1] * maxSpeed;
      const maxDelta = (maxSpeed / 0.08) * DT;
      const dvx = targetVx - this.player.vel[0];
      const dvz = targetVz - this.player.vel[2];
      const dLen = Math.hypot(dvx, dvz);
      if (dLen <= maxDelta || dLen === 0) {
        this.player.vel[0] = targetVx;
        this.player.vel[2] = targetVz;
      } else {
        this.player.vel[0] += (dvx / dLen) * maxDelta;
        this.player.vel[2] += (dvz / dLen) * maxDelta;
      }
    }

    if (!dashingThisTick) {
      if (jumpJustPressed && this.player.grounded) {
        this.player.vel[1] = JUMP_VELOCITY;
        this.player.grounded = false;
      }
      if (!this.player.grounded) {
        this.player.vel[1] += GRAVITY * DT;
      }
    }

    let windDx = 0;
    let windDz = 0;
    if (this.wind.active) {
      const wRad = (this.wind.dir_deg * Math.PI) / 180;
      windDx = Math.cos(wRad) * WIND_PUSH_SPEED * DT;
      windDz = Math.sin(wRad) * WIND_PUSH_SPEED * DT;
    }

    const oldPos: Vec3 = [...this.player.pos];
    const targetX = oldPos[0] + this.player.vel[0] * DT + windDx;
    const targetZ = oldPos[2] + this.player.vel[2] * DT + windDz;

    const resolved = resolveHorizontalMove(
      this.night,
      oldPos,
      targetX,
      targetZ,
      this.tuning.fall_enabled
    );
    this.player.pos[0] = resolved.x;
    this.player.pos[2] = resolved.z;

    const surf = getSurfaceY(this.night, this.player.pos[0], this.player.pos[2]);

    if (dashingThisTick) {
      if (surf !== null && this.player.grounded && surf >= oldPos[1] - 0.35 && surf <= oldPos[1] + 0.65) {
        this.player.pos[1] = surf;
      } else if (surf !== null && this.player.pos[1] < surf) {
        this.player.pos[1] = surf;
        this.player.grounded = true;
      } else if (surf === null || this.player.pos[1] > surf + 0.05) {
        this.player.grounded = false;
      }
    } else {
      const newY = oldPos[1] + this.player.vel[1] * DT;
      if (surf !== null) {
        if (this.player.vel[1] <= 0 && oldPos[1] >= surf - 0.2 && newY <= surf) {
          this.player.pos[1] = surf;
          this.player.vel[1] = 0;
          this.player.grounded = true;
          this.player.padLaunched = false;
        } else if (this.player.grounded && surf <= oldPos[1] + 0.65 && surf >= oldPos[1] - 0.45) {
          this.player.pos[1] = surf;
          this.player.vel[1] = 0;
          this.player.grounded = true;
        } else {
          this.player.pos[1] = newY;
          this.player.grounded = false;
        }
      } else {
        this.player.pos[1] = newY;
        this.player.grounded = false;
      }
    }

    if (this.player.grounded && !this.player.padLaunched && !dashingThisTick) {
      for (const pad of this.map.jumpPads) {
        if (
          distXZ(this.player.pos, pad.pos) <= pad.radius &&
          Math.abs(this.player.pos[1] - pad.pos[1]) <= 0.5
        ) {
          this.player.vel[0] = pad.velXZ[0];
          this.player.vel[1] = pad.velY;
          this.player.vel[2] = pad.velXZ[1];
          this.player.grounded = false;
          this.player.padLaunched = true;
          break;
        }
      }
    }

    if (this.tuning.fall_enabled && this.player.pos[1] < -10) {
      this.player.flames = Math.max(0, this.player.flames - 1);
      const lost = this.player.carried;
      this.player.carried = 0;
      events.push({
        type: "event",
        tick: eventTick,
        name: "player_hit",
        data: {
          by: "fall",
          flames: this.player.flames,
          dropped: 0,
          lost
        }
      });
      if (this.player.flames > 0) {
        this.player.respawnTicks = RESPAWN_WAIT_TICKS;
        this.player.vel = [0, 0, 0];
        this.player.dashTicks = 0;
        this.player.padLaunched = false;
      }
    }
  }

  private stepPickups(eventTick: number, events: GameEvent[]): void {
    const pickupSq = this.tuning.pickup_radius * this.tuning.pickup_radius;
    const capacity = this.getPlayerCapacity();
    const remaining: MoteState[] = [];

    for (const mote of this.motes) {
      if (
        mote.pickupDelayTicks === 0 &&
        this.player.carried < capacity &&
        distSqXZ(this.player.pos, mote.pos) <= pickupSq &&
        Math.abs(this.player.pos[1] - mote.pos[1]) <= 1.5
      ) {
        this.player.carried += 1;
        events.push({
          type: "event",
          tick: eventTick,
          name: "mote_picked",
          data: { carried: this.player.carried }
        });
      } else {
        remaining.push(mote);
      }
    }
    this.motes = remaining;

    for (const charm of this.charms) {
      if (
        charm.available &&
        distSqXZ(this.player.pos, charm.pos) <= pickupSq &&
        Math.abs(this.player.pos[1] - charm.pos[1]) <= 1.5
      ) {
        charm.available = false;
        charm.respawnTicks = CHARM_RESPAWN_TICKS;
        this.player.charmTicks = CHARM_DURATION_TICKS;
        this.player.dashCdTicks = 0;
        events.push({
          type: "event",
          tick: eventTick,
          name: "charm_picked",
          data: { charm_id: charm.id, charm_ticks: CHARM_DURATION_TICKS }
        });
      }
    }
  }

  private markShadesForSafePush(lantern: LanternState): void {
    for (const shade of this.shades) {
      if (shade.state === "drain" && shade.targetLanternId === lantern.id) {
        shade.state = "wander";
        shade.targetLanternId = null;
        shade.drainTickCounter = 0;
      }
      if (distXZ(shade.pos, lantern.pos) < this.tuning.safe_radius) {
        shade.safePushTicks = SAFE_PUSH_MAX_TICKS;
        shade.safePushLanternId = lantern.id;
      }
    }
  }

  private stepInteractLantern(eventTick: number, events: GameEvent[]): void {
    const interactSq = this.tuning.interact_radius * this.tuning.interact_radius;
    const best = this.findClosestLantern(this.player.pos, (l) => {
      if (Math.abs(this.player.pos[1] - l.pos[1]) > 2.0) return false;
      if (distSqXZ(this.player.pos, l.pos) > interactSq) return false;
      if (!l.lit) return true;
      return l.fuelUnits < this.fuelMaxUnits;
    });

    if (!best) return;

    if (!best.lit) {
      const cost = best.everLit ? this.tuning.relight_cost : this.tuning.lantern_cost;
      const needed = Math.max(0, cost - best.deposited);
      const amount = Math.min(this.player.carried, needed);
      if (amount <= 0) return;

      this.player.carried -= amount;
      best.deposited += amount;
      this.score += amount * this.tuning.score.per_mote;

      events.push({
        type: "event",
        tick: eventTick,
        name: "deposit",
        data: {
          lantern_id: best.id,
          amount,
          deposited: best.deposited
        }
      });

      if (best.deposited >= cost) {
        const isRelight = best.everLit;
        best.lit = true;
        best.fuelUnits = this.fuelMaxUnits;
        best.everLit = true;
        if (isRelight) {
          best.relitCount += 1;
          this.score += 40;
        } else {
          this.score += this.tuning.score.per_lantern;
        }
        this.player.successfulLights += 1;

        events.push({
          type: "event",
          tick: eventTick,
          name: "lantern_lit",
          data: { lantern_id: best.id, relight: isRelight }
        });

        this.markShadesForSafePush(best);
      }
    } else {
      // Refuel a lit lantern with fuel < 100
      const wasLowFuel = best.fuelUnits < this.lowFuelUnits;
      const missingUnits = this.fuelMaxUnits - best.fuelUnits;
      const neededMotes = Math.ceil(missingUnits / this.fuelPerMoteUnits);
      const used = Math.min(this.player.carried, neededMotes);
      if (used <= 0) return;

      this.player.carried -= used;
      best.fuelUnits = Math.min(this.fuelMaxUnits, best.fuelUnits + used * this.fuelPerMoteUnits);
      this.score += used * this.tuning.score.per_mote;

      events.push({
        type: "event",
        tick: eventTick,
        name: "refuel",
        data: {
          lantern_id: best.id,
          amount: used,
          fuel: round1(best.fuelUnits / TICK_RATE)
        }
      });

      if (wasLowFuel && best.fuelUnits >= this.lowFuelUnits) {
        this.markShadesForSafePush(best);
      }
    }
  }

  private stepSafeZones(): void {
    const safeR = this.tuning.safe_radius;
    if (safeR <= 0) return;

    for (const shade of this.shades) {
      if (shade.safePushTicks > 0 && shade.safePushLanternId) {
        const lantern = this.lanterns.find(
          (l) => l.id === shade.safePushLanternId && this.hasSafeZone(l)
        );
        if (!lantern) {
          shade.safePushTicks = 0;
          shade.safePushLanternId = null;
        } else {
          const dx = shade.pos[0] - lantern.pos[0];
          const dz = shade.pos[2] - lantern.pos[2];
          const d = Math.hypot(dx, dz);
          const targetR = safeR + 0.05;
          if (d >= safeR) {
            shade.safePushTicks = 0;
            shade.safePushLanternId = null;
          } else {
            const ux = d > 1e-6 ? dx / d : 1;
            const uz = d > 1e-6 ? dz / d : 0;
            const stepOut = (targetR - d) / shade.safePushTicks;
            shade.pos[0] += ux * stepOut;
            shade.pos[2] += uz * stepOut;
            shade.safePushTicks -= 1;
            if (shade.safePushTicks <= 0) {
              shade.pos[0] = lantern.pos[0] + ux * targetR;
              shade.pos[2] = lantern.pos[2] + uz * targetR;
              shade.safePushLanternId = null;
            }
          }
          continue;
        }
      }

      this.clampShadeOutsideSafeZones(shade);
    }
  }

  private stepPulse(eventTick: number, events: GameEvent[]): void {
    this.player.carried -= this.tuning.pulse_cost;
    this.player.pulseCdTicks = Math.round(this.tuning.pulse_cooldown_s * TICK_RATE);

    const centerX = this.player.pos[0];
    const centerY = this.player.pos[1] + 0.8;
    const centerZ = this.player.pos[2];
    const rSq = this.tuning.pulse_radius * this.tuning.pulse_radius;
    const stunTicks = Math.round(this.tuning.pulse_stun_s * TICK_RATE);

    const stunnedIds: string[] = [];
    for (const shade of this.shades) {
      const dx = shade.pos[0] - centerX;
      const dy = shade.pos[1] - centerY;
      const dz = shade.pos[2] - centerZ;
      if (dx * dx + dy * dy + dz * dz <= rSq) {
        const wasDraining = shade.state === "drain";
        const horiz = Math.hypot(dx, dz);
        shade.pushDir = horiz > 1e-6 ? [dx / horiz, dz / horiz] : [1, 0];
        shade.pushTicksLeft = PULSE_PUSH_TICKS;
        shade.state = "stunned";
        shade.stateTicksLeft = stunTicks;
        shade.targetLanternId = null;
        shade.drainTickCounter = 0;
        // v1.2: +15 total if draining right before pulse, else +5
        this.score += wasDraining ? 15 : this.tuning.score.per_stun;
        stunnedIds.push(shade.id);
      }
    }

    for (const drifter of this.drifters) {
      const dx = drifter.pos[0] - centerX;
      const dy = drifter.pos[1] - centerY;
      const dz = drifter.pos[2] - centerZ;
      if (dx * dx + dy * dy + dz * dz <= rSq) {
        if (drifter.state === "chase") {
          drifter.state = "flee";
          drifter.stateTicksLeft = DRIFTER_FLEE_TICKS;
        } else if (drifter.state === "flee" && drifter.stolen > 0) {
          const amount = drifter.stolen;
          drifter.stolen = 0;
          drifter.stateTicksLeft = DRIFTER_DROP_FLEE_TICKS;
          const surf = getSurfaceY(this.night, drifter.pos[0], drifter.pos[2]) ?? 0;
          for (let i = 0; i < amount; i++) {
            const angle = (i * 2 * Math.PI) / Math.max(1, amount);
            const dropX = drifter.pos[0] + Math.cos(angle) * 0.4;
            const dropZ = drifter.pos[2] + Math.sin(angle) * 0.4;
            const dropY = getSurfaceY(this.night, dropX, dropZ) ?? surf;
            this.motes.push({
              id: this.allocMoteId(),
              pos: [dropX, dropY, dropZ],
              kind: "dropped",
              ttlTicks: DROPPED_MOTE_TTL,
              pickupDelayTicks: 1
            });
          }
          events.push({
            type: "event",
            tick: eventTick,
            name: "drifter_drop",
            data: { drifter_id: drifter.id, amount }
          });
        }
      }
    }

    events.push({
      type: "event",
      tick: eventTick,
      name: "pulse",
      data: { stunned_ids: stunnedIds }
    });
  }

  private stepMoveShades(): void {
    const speed = this.night === 3 ? 4.5 : this.tuning.shade_speed;
    const pushStep = this.tuning.pulse_push_m / PULSE_PUSH_TICKS;
    const recoilStep = SHADE_RECOIL_DIST / SHADE_RECOIL_TICKS;

    for (const shade of this.shades) {
      if (shade.safePushTicks > 0) continue;
      if (shade.state === "spawning") continue;

      if (shade.state === "stunned") {
        if (shade.pushTicksLeft > 0) {
          const res = resolveHorizontalMove(
            this.night,
            shade.pos,
            shade.pos[0] + shade.pushDir[0] * pushStep,
            shade.pos[2] + shade.pushDir[1] * pushStep,
            false
          );
          shade.pos[0] = res.x;
          shade.pos[2] = res.z;
          shade.pushTicksLeft = res.blocked ? 0 : shade.pushTicksLeft - 1;
          this.clampShadeOutsideSafeZones(shade);
        }
        continue;
      }

      if (shade.state === "recoil") {
        const res = resolveHorizontalMove(
          this.night,
          shade.pos,
          shade.pos[0] + shade.recoilDir[0] * recoilStep,
          shade.pos[2] + shade.recoilDir[1] * recoilStep,
          false
        );
        shade.pos[0] = res.x;
        shade.pos[2] = res.z;
        this.clampShadeOutsideSafeZones(shade);
        continue;
      }

      if (shade.state === "drain") {
        const target = this.lanterns.find((l) => l.id === shade.targetLanternId);
        if (
          this.player.respawnTicks === 0 &&
          distXZ(shade.pos, this.player.pos) <= SHADE_DRAIN_AGGRO_RADIUS
        ) {
          shade.state = "chase";
          shade.targetLanternId = null;
          shade.drainTickCounter = 0;
        } else if (
          !target ||
          !target.lit ||
          target.fuelUnits >= this.lowFuelUnits ||
          distXZ(shade.pos, target.pos) > SHADE_DRAIN_RADIUS
        ) {
          shade.state = "wander";
          shade.targetLanternId = null;
          shade.drainTickCounter = 0;
        } else {
          // Stay still while draining
          continue;
        }
      }

      // Transitions between wander & chase
      const distPlayer = distXZ(shade.pos, this.player.pos);
      if (this.player.respawnTicks > 0) {
        shade.state = "wander";
      } else if (shade.state === "wander" && distPlayer <= SHADE_DETECT_RADIUS) {
        shade.state = "chase";
      } else if (shade.state === "chase" && distPlayer > SHADE_LOSE_RADIUS) {
        shade.state = "wander";
      }

      if (shade.state === "chase") {
        const dx = this.player.pos[0] - shade.pos[0];
        const dz = this.player.pos[2] - shade.pos[2];
        const d = Math.hypot(dx, dz);
        if (d > 1e-6) {
          const stepDist = Math.min(d, speed * DT);
          const res = resolveHorizontalMove(
            this.night,
            shade.pos,
            shade.pos[0] + (dx / d) * stepDist,
            shade.pos[2] + (dz / d) * stepDist,
            false
          );
          shade.pos[0] = res.x;
          shade.pos[2] = res.z;
          const surf = getSurfaceY(this.night, shade.pos[0], shade.pos[2]);
          if (surf !== null && surf <= shade.pos[1] + 0.65) {
            shade.pos[1] = surf;
          }
        }
      } else {
        // wander: target closest weak lit lantern (fuel < 30), else closest unlit lantern
        const weakLantern = this.findClosestLantern(
          shade.pos,
          (l) => l.lit && l.fuelUnits < this.lowFuelUnits
        );
        if (weakLantern) {
          const dWeak = distXZ(shade.pos, weakLantern.pos);
          if (dWeak <= SHADE_DRAIN_RADIUS) {
            shade.state = "drain";
            shade.targetLanternId = weakLantern.id;
            shade.drainTickCounter = 0;
            continue;
          }
          const dx = weakLantern.pos[0] - shade.pos[0];
          const dz = weakLantern.pos[2] - shade.pos[2];
          const stepDist = Math.min(dWeak, speed * 0.75 * DT);
          const res = resolveHorizontalMove(
            this.night,
            shade.pos,
            shade.pos[0] + (dx / dWeak) * stepDist,
            shade.pos[2] + (dz / dWeak) * stepDist,
            false
          );
          shade.pos[0] = res.x;
          shade.pos[2] = res.z;
          const surf = getSurfaceY(this.night, shade.pos[0], shade.pos[2]);
          if (surf !== null && surf <= shade.pos[1] + 0.65) {
            shade.pos[1] = surf;
          }
          if (distXZ(shade.pos, weakLantern.pos) <= SHADE_DRAIN_RADIUS) {
            shade.state = "drain";
            shade.targetLanternId = weakLantern.id;
            shade.drainTickCounter = 0;
          }
        } else {
          const unlit = this.findClosestLantern(shade.pos, (l) => !l.lit);
          if (unlit && distXZ(shade.pos, unlit.pos) > 2.5) {
            const dx = unlit.pos[0] - shade.pos[0];
            const dz = unlit.pos[2] - shade.pos[2];
            const d = Math.hypot(dx, dz);
            const stepDist = Math.min(d, speed * 0.5 * DT);
            const res = resolveHorizontalMove(
              this.night,
              shade.pos,
              shade.pos[0] + (dx / d) * stepDist,
              shade.pos[2] + (dz / d) * stepDist,
              false
            );
            shade.pos[0] = res.x;
            shade.pos[2] = res.z;
          } else {
            shade.wanderAngle += 0.015;
            const stepDist = speed * 0.45 * DT;
            const res = resolveHorizontalMove(
              this.night,
              shade.pos,
              shade.pos[0] + Math.cos(shade.wanderAngle) * stepDist,
              shade.pos[2] + Math.sin(shade.wanderAngle) * stepDist,
              false
            );
            if (res.blocked) {
              shade.wanderAngle += Math.PI * 0.75;
            } else {
              shade.pos[0] = res.x;
              shade.pos[2] = res.z;
            }
          }
        }
      }

      this.clampShadeOutsideSafeZones(shade);
    }
  }

  private clampShadeOutsideSafeZones(shade: ShadeState): void {
    const safeR = this.tuning.safe_radius;
    for (const lantern of this.lanterns) {
      if (!this.hasSafeZone(lantern)) continue;
      const dx = shade.pos[0] - lantern.pos[0];
      const dz = shade.pos[2] - lantern.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < safeR) {
        const outR = safeR + 0.02;
        const ux = d > 1e-6 ? dx / d : 1;
        const uz = d > 1e-6 ? dz / d : 0;
        shade.pos[0] = lantern.pos[0] + ux * outR;
        shade.pos[2] = lantern.pos[2] + uz * outR;
      }
    }
  }

  private stepMoveDrifters(): void {
    for (const drifter of this.drifters) {
      if (drifter.state === "removed") continue;

      if (drifter.state === "idle" || drifter.state === "chase") {
        const dist = distXZ(drifter.pos, this.player.pos);
        const shouldChase =
          this.player.respawnTicks === 0 &&
          this.player.carried >= DRIFTER_DETECT_MIN_CARRIED &&
          dist <= DRIFTER_DETECT_RADIUS;
        drifter.state = shouldChase ? "chase" : "idle";
      }

      if (drifter.state === "idle") {
        drifter.idleAngle += 0.02;
        drifter.pos[0] += Math.cos(drifter.idleAngle) * DRIFTER_IDLE_SPEED * DT;
        drifter.pos[2] += Math.sin(drifter.idleAngle) * DRIFTER_IDLE_SPEED * DT;
      } else if (drifter.state === "chase") {
        const dx = this.player.pos[0] - drifter.pos[0];
        const dz = this.player.pos[2] - drifter.pos[2];
        const d = Math.hypot(dx, dz);
        if (d > 1e-6) {
          const stepDist = Math.min(d, DRIFTER_FAST_SPEED * DT);
          drifter.pos[0] += (dx / d) * stepDist;
          drifter.pos[2] += (dz / d) * stepDist;
        }
      } else if (drifter.state === "flee") {
        const dx = drifter.pos[0] - this.player.pos[0];
        const dz = drifter.pos[2] - this.player.pos[2];
        const d = Math.hypot(dx, dz);
        const ux = d > 1e-6 ? dx / d : 1;
        const uz = d > 1e-6 ? dz / d : 0;
        drifter.pos[0] += ux * DRIFTER_FAST_SPEED * DT;
        drifter.pos[2] += uz * DRIFTER_FAST_SPEED * DT;
      }
    }
  }

  private stepCollisions(eventTick: number, events: GameEvent[]): void {
    const sortedDrifters = [...this.drifters].sort((a, b) => a.id.localeCompare(b.id));
    for (const drifter of sortedDrifters) {
      if (drifter.state !== "chase") continue;
      if (this.player.carried <= 0) continue;
      if (distXZ(this.player.pos, drifter.pos) <= DRIFTER_STEAL_RADIUS) {
        const amount = Math.min(3, this.player.carried);
        this.player.carried -= amount;
        drifter.stolen = amount;
        drifter.state = "flee";
        drifter.stateTicksLeft = DRIFTER_FLEE_TICKS;
        events.push({
          type: "event",
          tick: eventTick,
          name: "drifter_steal",
          data: {
            drifter_id: drifter.id,
            amount,
            carried: this.player.carried
          }
        });
      }
    }

    if (this.player.invulnTicks > 0) return;

    const hitSq = this.tuning.shade_hit_radius * this.tuning.shade_hit_radius;
    const sortedShades = [...this.shades].sort((a, b) => a.id.localeCompare(b.id));
    for (const shade of sortedShades) {
      if (shade.state !== "chase" && shade.state !== "wander") continue;
      if (shade.safePushTicks > 0) continue;
      if (
        distSqXZ(this.player.pos, shade.pos) <= hitSq &&
        Math.abs(this.player.pos[1] - shade.pos[1]) <= 1.5
      ) {
        this.player.flames = Math.max(0, this.player.flames - 1);
        const dropped = Math.floor(this.player.carried * this.tuning.hit_drop_ratio);
        this.player.carried -= dropped;
        this.player.invulnTicks = Math.round(this.tuning.invuln_s * TICK_RATE);

        for (let i = 0; i < dropped; i++) {
          const angle = this.rng.range(0, Math.PI * 2);
          const dist = this.rng.range(1.5, 2.5);
          const candidateX = this.player.pos[0] + Math.cos(angle) * dist;
          const candidateZ = this.player.pos[2] + Math.sin(angle) * dist;
          const surf = getSurfaceY(this.night, candidateX, candidateZ);
          const dropPos: Vec3 =
            surf !== null
              ? [candidateX, surf, candidateZ]
              : [this.player.pos[0], this.player.pos[1], this.player.pos[2]];
          this.motes.push({
            id: this.allocMoteId(),
            pos: dropPos,
            kind: "dropped",
            ttlTicks: DROPPED_MOTE_TTL,
            pickupDelayTicks: 1
          });
        }

        const dx = shade.pos[0] - this.player.pos[0];
        const dz = shade.pos[2] - this.player.pos[2];
        const d = Math.hypot(dx, dz);
        shade.recoilDir = d > 1e-6 ? [dx / d, dz / d] : [1, 0];
        shade.state = "recoil";
        shade.stateTicksLeft = SHADE_RECOIL_TICKS;

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

  private stepScheduledSpawns(eventTick: number, events: GameEvent[]): void {
    if (
      this.randomMotes &&
      this.simTick % MOTE_SPAWN_INTERVAL === 0 &&
      this.motes.length < MAX_MOTES
    ) {
      const emptyPoints = this.map.moteSpawns.filter(
        (pt) => !this.motes.some((m) => distXZ(m.pos, pt) < 0.5)
      );
      if (emptyPoints.length > 0) {
        const chosen = emptyPoints[Math.floor(this.rng.next() * emptyPoints.length)];
        this.motes.push({
          id: this.allocMoteId(),
          pos: [...chosen],
          kind: "random",
          ttlTicks: null,
          pickupDelayTicks: 1
        });
      }
    }

    if (this.randomShades && this.shades.length < this.map.maxShades) {
      let toSpawn = 0;
      if (this.simTick === SHADE_SPAWN_FIRST_TICK) {
        toSpawn = Math.min(2, this.map.maxShades - this.shades.length);
      } else if (
        this.simTick > SHADE_SPAWN_FIRST_TICK &&
        (this.simTick - SHADE_SPAWN_FIRST_TICK) % this.map.shadeIntervalTicks === 0
      ) {
        toSpawn = 1;
      }

      for (let i = 0; i < toSpawn; i++) {
        const validPoints = this.map.shadeSpawns.filter((pt) => {
          const farFromPlayer = distXZ(pt, this.player.pos) >= 15;
          const outsideSafe = !this.lanterns.some(
            (l) => this.hasSafeZone(l) && distXZ(pt, l.pos) < this.tuning.safe_radius
          );
          const unoccupied = !this.shades.some((s) => distXZ(s.pos, pt) < 1.0);
          return farFromPlayer && outsideSafe && unoccupied;
        });
        if (validPoints.length === 0) break;
        const chosen = validPoints[Math.floor(this.rng.next() * validPoints.length)];
        const id = this.allocShadeId();
        this.shades.push({
          id,
          pos: [...chosen],
          state: "spawning",
          stateTicksLeft: SHADE_SPAWN_STATE_TICKS,
          pushTicksLeft: 0,
          pushDir: [1, 0],
          recoilDir: [1, 0],
          safePushTicks: 0,
          safePushLanternId: null,
          targetLanternId: null,
          drainTickCounter: 0,
          wanderAngle: this.rng.range(0, Math.PI * 2)
        });
        events.push({
          type: "event",
          tick: eventTick,
          name: "shade_spawned",
          data: { id }
        });
      }
    }

    if (
      this.randomDrifters &&
      this.map.maxDrifters > 0 &&
      this.simTick % DRIFTER_SPAWN_INTERVAL === 0 &&
      this.drifters.length < this.map.maxDrifters &&
      this.map.shadeSpawns.length > 0
    ) {
      const chosen =
        this.map.shadeSpawns[Math.floor(this.rng.next() * this.map.shadeSpawns.length)];
      this.drifters.push({
        id: this.allocDrifterId(),
        pos: [chosen[0], chosen[1] + 1.2, chosen[2]],
        state: "idle",
        stolen: 0,
        stateTicksLeft: 0,
        idleAngle: this.rng.range(0, Math.PI * 2)
      });
    }
  }
}
