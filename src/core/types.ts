export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type NightNumber = 1 | 2 | 3;

export interface ScoreTuning {
  per_mote: number;
  per_lantern: number;
  per_stun: number;
  per_second_left: number;
  per_flame_left: number;
}

export interface TuningConfig {
  player_speed: number;
  carry_capacity: number;
  capacity_max: number;
  lantern_cost: number;
  relight_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  night2_duration_s: number;
  night3_duration_s: number;
  flames: number;
  invuln_s: number;
  hit_drop_ratio: number;
  pulse_stun_s: number;
  pulse_push_m: number;
  pulse_cooldown_s: number;
  safe_radius: number;
  shade_speed: number;
  shade_hit_radius: number;
  fall_enabled: boolean;
  dash_speed: number;
  dash_duration_s: number;
  dash_cooldown_s: number;
  fuel_max: number;
  fuel_decay_per_s: number;
  fuel_per_mote: number;
  win_ratio: number;
  drain_per_s: number;
  low_fuel_threshold: number;
  score: ScoreTuning;
}

export interface InputState {
  move: Vec2;
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
  pause: boolean;
}

export interface InputFrame {
  tick: number;
  move?: Vec2;
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
  pause?: boolean;
}

export interface InputFile {
  frames: InputFrame[];
}

export interface ScenarioPlayer {
  pos?: Vec3;
  carried?: number;
  flames?: number;
  invuln_ticks?: number;
  dash_cd_ticks?: number;
  pulse_cd_ticks?: number;
  charm_ticks?: number;
  successful_lights?: number;
}

export type MoteKind = "random" | "dropped";

export interface ScenarioMoteObject {
  id?: string;
  pos: Vec3;
  kind?: MoteKind;
  ttl_s?: number | null;
}

export type ShadeBehaviorState = "spawning" | "wander" | "chase" | "drain" | "recoil" | "stunned";

export interface ScenarioShade {
  id?: string;
  pos: Vec3;
  state?: ShadeBehaviorState;
  state_ticks_left?: number;
  target_lantern_id?: string;
}

export type DrifterBehaviorState = "idle" | "chase" | "flee" | "removed";

export interface ScenarioDrifter {
  id?: string;
  pos: Vec3;
  state?: DrifterBehaviorState;
  stolen?: number;
  state_ticks_left?: number;
}

export interface ScenarioCharm {
  id?: string;
  pos?: Vec3;
  available?: boolean;
  respawn_ticks?: number;
  respawn_s?: number;
}

export interface ScenarioLantern {
  id: string;
  pos?: Vec3;
  deposited?: number;
  lit?: boolean;
  fuel?: number;
  ever_lit?: boolean;
}

export interface ScenarioConfig {
  player?: ScenarioPlayer;
  random_motes?: boolean;
  random_shades?: boolean;
  random_drifters?: boolean;
  wind_enabled?: boolean;
  motes?: Array<Vec3 | ScenarioMoteObject>;
  shades?: Array<Vec3 | ScenarioShade>;
  drifters?: ScenarioDrifter[];
  charms?: ScenarioCharm[];
  lanterns?: ScenarioLantern[];
  time_left_s?: number;
}

export interface PlayerState {
  pos: Vec3;
  vel: Vec3;
  facing: Vec2;
  grounded: boolean;
  flames: number;
  carried: number;
  successfulLights: number;
  invulnTicks: number;
  dashTicks: number;
  dashDir: Vec2;
  dashCdTicks: number;
  pulseCdTicks: number;
  charmTicks: number;
  respawnTicks: number;
  padLaunched: boolean;
}

export interface LanternState {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
  fuelUnits: number; // integer 1/60 units (0..6000)
  everLit: boolean;
  relitCount: number;
}

export interface MoteState {
  id: string;
  pos: Vec3;
  kind: MoteKind;
  ttlTicks: number | null;
  pickupDelayTicks: number;
}

export interface ShadeState {
  id: string;
  pos: Vec3;
  state: ShadeBehaviorState;
  stateTicksLeft: number;
  pushTicksLeft: number;
  pushDir: Vec2;
  recoilDir: Vec2;
  safePushTicks: number;
  safePushLanternId: string | null;
  targetLanternId: string | null;
  drainTickCounter: number;
  wanderAngle: number;
}

export interface DrifterState {
  id: string;
  pos: Vec3;
  state: DrifterBehaviorState;
  stolen: number;
  stateTicksLeft: number;
  idleAngle: number;
}

export interface CharmState {
  id: string;
  pos: Vec3;
  available: boolean;
  respawnTicks: number;
}

export interface WindState {
  active: boolean;
  warning: boolean;
  dir_deg: number;
  cycleTick: number;
}

export type PlayState = "playing" | "paused" | "won" | "lost";

export interface GameEvent {
  type: "event";
  tick: number;
  name:
    | "night_start"
    | "mote_picked"
    | "deposit"
    | "lantern_lit"
    | "refuel"
    | "lantern_out"
    | "fuel_drain"
    | "pulse"
    | "dash"
    | "charm_picked"
    | "drifter_steal"
    | "drifter_drop"
    | "player_hit"
    | "shade_spawned"
    | "paused"
    | "resumed"
    | "game_over";
  data: Record<string, unknown>;
}

export interface SnapshotRecord {
  type: "snapshot";
  tick: number;
  sim_tick: number;
  night: NightNumber;
  state: PlayState;
  time_left_s: number;
  score: number;
  wind: {
    active: boolean;
    dir_deg: number;
  };
  player: {
    pos: Vec3;
    vel: Vec3;
    grounded: boolean;
    flames: number;
    carried: number;
    capacity: number;
    invuln: boolean;
    dash_cd_s: number;
    pulse_cd_s: number;
    charm_s: number;
  };
  lanterns: Array<{
    id: string;
    pos: Vec3;
    lit: boolean;
    deposited: number;
    fuel: number;
    ever_lit: boolean;
    relit_count: number;
  }>;
  shades: Array<{
    id: string;
    pos: Vec3;
    state: ShadeBehaviorState;
  }>;
  motes: Array<{
    id: string;
    pos: Vec3;
    kind: MoteKind;
    ttl_s: number | null;
  }>;
  motes_active: number;
  drifters: Array<{
    id: string;
    pos: Vec3;
    state: DrifterBehaviorState;
    stolen: number;
  }>;
  charms: Array<{
    id: string;
    available: boolean;
    respawn_s: number;
  }>;
}

export interface EndRecord {
  type: "end";
  ticks: number;
  state: PlayState;
  score: number;
}

export type JsonlRecord = SnapshotRecord | GameEvent | EndRecord;

export interface GameStateSnapshot {
  tick: number;
  simTick: number;
  night: NightNumber;
  state: PlayState;
  timeLeftS: number;
  score: number;
  wind: {
    active: boolean;
    warning: boolean;
    dir_deg: number;
  };
  player: {
    pos: Vec3;
    vel: Vec3;
    velY: number;
    facing: Vec2;
    grounded: boolean;
    flames: number;
    carried: number;
    capacity: number;
    invulnTimer: number;
    dashCooldownTimer: number;
    pulseCooldownTimer: number;
    charmTimer: number;
    respawnTimer: number;
  };
  lanterns: Array<LanternState & { fuel: number }>;
  shades: ShadeState[];
  motes: MoteState[];
  drifters: DrifterState[];
  charms: CharmState[];
  islandRadius: number;
}
