import { round3 } from "./math.js";
import type { NightNumber, Vec2, Vec3 } from "./types.js";

export interface JumpPadDef {
  pos: Vec3;
  radius: number;
  velY: number;
  velXZ: Vec2;
}

export interface CharmSpawnDef {
  id: string;
  pos: Vec3;
}

export interface LanternSpawnDef {
  id: string;
  pos: Vec3;
}

export interface NightMapDef {
  night: NightNumber;
  name: string;
  introQuote: string;
  islandRadius: number;
  spawnPos: Vec3;
  durationS: number;
  shadeSpeed: number;
  shadeIntervalTicks: number;
  maxShades: number;
  maxDrifters: number;
  windEnabledByDefault: boolean;
  lanterns: LanternSpawnDef[];
  moteSpawns: Vec3[];
  shadeSpawns: Vec3[];
  jumpPads: JumpPadDef[];
  charms: CharmSpawnDef[];
}

function polarXZ(r: number, deg: number, y = 0, cx = 0, cz = 0): Vec3 {
  const rad = (deg * Math.PI) / 180;
  return [round3(cx + r * Math.cos(rad)), y, round3(cz + r * Math.sin(rad))];
}

function normalize2D(dx: number, dz: number): Vec2 {
  const len = Math.hypot(dx, dz);
  return len > 1e-6 ? [dx / len, dz / len] : [0, 1];
}

function buildNight1(): NightMapDef {
  const moteSpawns: Vec3[] = [];
  for (let i = 0; i < 8; i++) moteSpawns.push(polarXZ(12, i * 45));
  for (let i = 0; i < 16; i++) moteSpawns.push(polarXZ(33, i * 22.5));

  const shadeSpawns: Vec3[] = [];
  for (let i = 0; i < 12; i++) shadeSpawns.push(polarXZ(37, 15 + i * 30));

  return {
    night: 1,
    name: "Đêm 1 — Đảo Bến",
    introQuote: "Ông Đăng: \"Sương đen đã phủ xuống Đảo Bến. Hãy gom đom đóm thắp lại 5 Đèn Lồng Lớn trước bình minh, Mây nhé!\"",
    islandRadius: 40,
    spawnPos: [0, 0, 0],
    durationS: 240,
    shadeSpeed: 4.0,
    shadeIntervalTicks: 480,
    maxShades: 6,
    maxDrifters: 0,
    windEnabledByDefault: false,
    lanterns: [
      { id: "L1", pos: [0, 0, 25] },
      { id: "L2", pos: [23.8, 0, 7.7] },
      { id: "L3", pos: [14.7, 0, -20.2] },
      { id: "L4", pos: [-14.7, 0, -20.2] },
      { id: "L5", pos: [-23.8, 0, 7.7] }
    ],
    moteSpawns,
    shadeSpawns,
    jumpPads: [],
    charms: []
  };
}

function buildNight2(): NightMapDef {
  const moteSpawns: Vec3[] = [];
  for (const cx of [0, 70]) {
    for (const deg of [0, 90, 180, 270]) moteSpawns.push(polarXZ(10, deg, 0, cx, 0));
    for (let i = 0; i < 8; i++) moteSpawns.push(polarXZ(22, i * 45, 0, cx, 0));
  }

  const shadeSpawns: Vec3[] = [];
  for (const cx of [0, 70]) {
    for (let i = 0; i < 8; i++) shadeSpawns.push(polarXZ(26, 22.5 + i * 45, 0, cx, 0));
  }

  const dirAtoB = normalize2D(70 - 20, 0 - 18);
  const dirBtoA = normalize2D(0 - 50, 0 - -18);

  return {
    night: 2,
    name: "Đêm 2 — Đảo Cau",
    introQuote: "Ông Đăng: \"Đảo Cau nối đôi bằng cầu tre hẹp. Coi chừng Gió Lạc chực cướp ánh sáng và tận dụng bục nhảy cùng Bùa Gió!\"",
    islandRadius: 28,
    spawnPos: [0, 0, 0],
    durationS: 270,
    shadeSpeed: 4.0,
    shadeIntervalTicks: 420,
    maxShades: 8,
    maxDrifters: 2,
    windEnabledByDefault: false,
    lanterns: [
      { id: "L1", pos: [0, 0, 20] },
      { id: "L2", pos: [17, 0, -10] },
      { id: "L3", pos: [-17, 0, -10] },
      { id: "L4", pos: [70, 0, 20] },
      { id: "L5", pos: [87, 0, -10] },
      { id: "L6", pos: [53, 0, -10] }
    ],
    moteSpawns,
    shadeSpawns,
    jumpPads: [
      { pos: [20, 0, 18], radius: 1.0, velY: 14, velXZ: [dirAtoB[0] * 24, dirAtoB[1] * 24] },
      { pos: [50, 0, -18], radius: 1.0, velY: 14, velXZ: [dirBtoA[0] * 24, dirBtoA[1] * 24] }
    ],
    charms: [{ id: "C1", pos: [35, 0, 0] }]
  };
}

function buildNight3(): NightMapDef {
  const moteSpawns: Vec3[] = [];
  for (let i = 0; i < 18; i++) moteSpawns.push(polarXZ(34, i * 20, 0));
  for (let i = 0; i < 8; i++) moteSpawns.push(polarXZ(18, 20 + i * 20, 3));
  for (const deg of [45, 135, 225, 315]) moteSpawns.push(polarXZ(5, deg, 6));

  const shadeSpawns: Vec3[] = [];
  for (let i = 0; i < 16; i++) shadeSpawns.push(polarXZ(43, i * 22.5, 0));

  return {
    night: 3,
    name: "Đêm 3 — Đảo Chuông",
    introQuote: "Ông Đăng: \"Đêm cuối trên Đảo Chuông ba tầng! Leo dốc, bật bục nhảy lên tháp chuông và giữ vững bước chân trước gió lớn!\"",
    islandRadius: 45,
    spawnPos: [0, 0, -24],
    durationS: 300,
    shadeSpeed: 4.5,
    shadeIntervalTicks: 360,
    maxShades: 10,
    maxDrifters: 2,
    windEnabledByDefault: true,
    lanterns: [
      { id: "L1", pos: [0, 6, 6] },
      { id: "L2", pos: [18, 3, 10] },
      { id: "L3", pos: [-18, 3, 10] },
      { id: "L4", pos: [35, 0, -10] },
      { id: "L5", pos: [-35, 0, -10] },
      { id: "L6", pos: [20, 0, -35] },
      { id: "L7", pos: [-20, 0, -35] }
    ],
    moteSpawns,
    shadeSpawns,
    jumpPads: [{ pos: [0, 3, 13], radius: 1.0, velY: 12, velXZ: [0, -8] }],
    charms: [
      { id: "C1", pos: [30, 0, 25] },
      { id: "C2", pos: [-30, 0, 25] }
    ]
  };
}

const MAPS: Record<NightNumber, NightMapDef> = {
  1: buildNight1(),
  2: buildNight2(),
  3: buildNight3()
};

export function getNightMap(night: NightNumber): NightMapDef {
  return MAPS[night];
}

function getNight3RampHeight(x: number, z: number): number | null {
  for (const deg of [30, 150]) {
    const rad = (deg * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uz = Math.sin(rad);
    const tx = -uz;
    const tz = ux;
    const s = x * ux + z * uz;
    const w = Math.abs(x * tx + z * tz);
    if (s >= 24 && s <= 30 && w <= 1.5) {
      return 3 * ((30 - s) / 6);
    }
  }
  return null;
}

export function isInsideBellTower(night: NightNumber, x: number, z: number, y: number): boolean {
  if (night !== 3) return false;
  // Bell tower cylinder at center of Tier 2 (radius 2m, Y from 6 to 14; solid below Tier 2)
  return x * x + z * z < 4.0 && y < 14.0;
}

/**
 * Returns the ground/platform Y height at (x, z) for the given night,
 * or null if (x, z) is over the cloud sea (void).
 */
export function getSurfaceY(night: NightNumber, x: number, z: number): number | null {
  if (night === 1) {
    return x * x + z * z <= 40 * 40 ? 0 : null;
  }

  if (night === 2) {
    const inA = x * x + z * z <= 28 * 28;
    const inB = (x - 70) * (x - 70) + z * z <= 28 * 28;
    const onBridge = x >= 26 && x <= 44 && z >= -2 && z <= 2;
    return inA || inB || onBridge ? 0 : null;
  }

  // Night 3 — Đảo Chuông
  const r2 = x * x + z * z;
  if (r2 > 45 * 45) return null;
  if (r2 <= 8 * 8) return 6;
  if (r2 >= 12 * 12 && r2 <= 24 * 24 && z > 0) return 3;
  const rampY = getNight3RampHeight(x, z);
  if (rampY !== null) return rampY;
  return 0;
}

export interface MoveResult {
  x: number;
  z: number;
  blocked: boolean;
}

const STEP_UP_MAX = 0.65;

/**
 * Resolves horizontal movement against vertical cliffs, Night 3 bell tower,
 * and (when allowVoid=false) island edges.
 */
export function resolveHorizontalMove(
  night: NightNumber,
  oldPos: Vec3,
  targetX: number,
  targetZ: number,
  allowVoid: boolean
): MoveResult {
  let tx = targetX;
  let tz = targetZ;
  let blocked = false;

  // Bell tower collision on Night 3
  if (isInsideBellTower(night, tx, tz, oldPos[1])) {
    const len = Math.hypot(tx, tz);
    if (len > 1e-6) {
      tx = (tx / len) * 2.02;
      tz = (tz / len) * 2.02;
    } else {
      tx = 2.02;
      tz = 0;
    }
    blocked = true;
  }

  const canStand = (x: number, z: number): boolean => {
    if (isInsideBellTower(night, x, z, oldPos[1])) return false;
    const surf = getSurfaceY(night, x, z);
    if (surf === null) return allowVoid;
    return surf <= oldPos[1] + STEP_UP_MAX;
  };

  if (canStand(tx, tz)) {
    return { x: tx, z: tz, blocked };
  }

  // Try sliding along X or Z independently
  blocked = true;
  if (canStand(tx, oldPos[2])) {
    return { x: tx, z: oldPos[2], blocked: true };
  }
  if (canStand(oldPos[0], tz)) {
    return { x: oldPos[0], z: tz, blocked: true };
  }
  return { x: oldPos[0], z: oldPos[2], blocked: true };
}
