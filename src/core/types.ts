export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

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
  lantern_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
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
  score: ScoreTuning;
}

export interface InputState {
  move: Vec2;
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
}

export interface InputFrame {
  tick: number;
  move?: Vec2;
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
}

export interface InputFile {
  frames: InputFrame[];
}

export interface ScenarioPlayer {
  pos?: Vec3;
  carried?: number;
  flames?: number;
}

export interface ScenarioMoteObject {
  id?: string;
  pos: Vec3;
}

export interface ScenarioShade {
  id?: string;
  pos: Vec3;
  state?: "chase" | "stunned";
}

export interface ScenarioLantern {
  id: string;
  pos?: Vec3;
  deposited?: number;
  lit?: boolean;
}

export interface ScenarioConfig {
  player?: ScenarioPlayer;
  random_motes?: boolean;
  random_shades?: boolean;
  motes?: Array<Vec3 | ScenarioMoteObject>;
  shades?: Array<Vec3 | ScenarioShade>;
  lanterns?: ScenarioLantern[];
  time_left_s?: number;
}

export interface PlayerState {
  pos: Vec3;
  velY: number;
  flames: number;
  carried: number;
  invulnTimer: number;
  pulseCooldownTimer: number;
}

export interface LanternState {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}

export interface MoteState {
  id: string;
  pos: Vec3;
}

export type ShadeBehaviorState = "chase" | "stunned";

export interface ShadeState {
  id: string;
  pos: Vec3;
  state: ShadeBehaviorState;
  stunTimer: number;
}

export type PlayState = "playing" | "won" | "lost";

export interface GameEvent {
  type: "event";
  tick: number;
  name:
    | "mote_picked"
    | "deposit"
    | "lantern_lit"
    | "pulse"
    | "player_hit"
    | "shade_spawned"
    | "game_over";
  data: Record<string, unknown>;
}

export interface SnapshotRecord {
  type: "snapshot";
  tick: number;
  sim_tick: number;
  state: PlayState;
  time_left_s: number;
  score: number;
  player: {
    pos: Vec3;
    flames: number;
    carried: number;
  };
  lanterns: Array<{
    id: string;
    pos: Vec3;
    lit: boolean;
    deposited: number;
  }>;
  shades: Array<{
    id: string;
    pos: Vec3;
    state: ShadeBehaviorState;
  }>;
  motes: Array<{
    id: string;
    pos: Vec3;
  }>;
  motes_active: number;
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
  state: PlayState;
  timeLeftS: number;
  score: number;
  player: {
    pos: Vec3;
    velY: number;
    flames: number;
    carried: number;
    invulnTimer: number;
    pulseCooldownTimer: number;
  };
  lanterns: LanternState[];
  shades: ShadeState[];
  motes: MoteState[];
  islandRadius: number;
}
