import type { Vec2, Vec3 } from "./types.js";

export function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function roundVec3(v: Vec3): Vec3 {
  return [round3(v[0]), round3(v[1]), round3(v[2])];
}

export function distSqXZ(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return dx * dx + dz * dz;
}

export function distXZ(a: Vec3, b: Vec3): number {
  return Math.sqrt(distSqXZ(a, b));
}

export function clampToRadiusXZ(pos: Vec3, maxRadius: number): Vec3 {
  const len = Math.hypot(pos[0], pos[2]);
  if (len <= maxRadius || len === 0) {
    return pos;
  }
  const scale = maxRadius / len;
  return [pos[0] * scale, pos[1], pos[2] * scale];
}

export function normalizeMove(move: Vec2): Vec2 {
  const len = Math.hypot(move[0], move[1]);
  if (len <= 1 || len === 0) {
    return [move[0], move[1]];
  }
  return [move[0] / len, move[1] / len];
}

/**
 * Converts camera-relative move [x, z] to world XZ displacement direction.
 * x' = x*cos(theta) + z*sin(theta)
 * z' = -x*sin(theta) + z*cos(theta)
 */
export function rotateMoveByYaw(move: Vec2, camYawDeg: number): Vec2 {
  const [mx, mz] = normalizeMove(move);
  const theta = (camYawDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return [mx * cos + mz * sin, -mx * sin + mz * cos];
}
