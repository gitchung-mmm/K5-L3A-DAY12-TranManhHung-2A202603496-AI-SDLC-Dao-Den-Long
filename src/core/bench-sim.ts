import { getNightMap, resolveHorizontalMove } from "./maps.js";
import { distXZ } from "./math.js";
import { SeededRng } from "./rng.js";
import { DEFAULT_TUNING, DT } from "./tuning.js";
import type { GameStateSnapshot, LanternState, MoteState, ShadeState, TuningConfig, Vec3 } from "./types.js";

/**
 * Standardized Phase 4 Benchmark Simulation (Ticket-04 Part 1):
 * - Night 1 (Đảo Bến), L1..L3 lit with fuel 100 (no decay)
 * - Exactly 200 Shades in "wander" state distributed across the island (seed 42)
 * - Exactly 100 Motes distributed across the island
 * - Player stationary at (0,0,0); no spawns, no damage, no pickups, no game over
 * - Shades move every 60Hz tick following normal wander rules + 6m safe zone
 */
export class BenchmarkSimulation {
  private readonly tuning: TuningConfig = DEFAULT_TUNING;
  private readonly lanterns: Array<LanternState & { fuel: number }>;
  private readonly shades: ShadeState[] = [];
  private readonly motes: MoteState[] = [];
  private tick = 0;

  constructor(seed: number) {
    const rng = new SeededRng(seed);
    const map = getNightMap(1);

    this.lanterns = map.lanterns.map((l, idx) => {
      const lit = idx < 3; // L1..L3 lit with fuel 100
      return {
        id: l.id,
        pos: [...l.pos],
        lit,
        deposited: lit ? 10 : 0,
        fuelUnits: lit ? 6000 : 0,
        fuel: lit ? 100 : 0,
        everLit: lit,
        relitCount: 0
      };
    });

    // 200 shades evenly scattered across island outside L1..L3 6m safe zones
    for (let i = 0; i < 200; i++) {
      let pos: Vec3 = [0, 0, 0];
      for (let attempt = 0; attempt < 30; attempt++) {
        const r = Math.sqrt(rng.range(4 * 4, 38 * 38));
        const angle = rng.range(0, Math.PI * 2);
        const candidate: Vec3 = [Math.cos(angle) * r, 0, Math.sin(angle) * r];
        const inSafe = this.lanterns.some(
          (l) => l.lit && distXZ(candidate, l.pos) < this.tuning.safe_radius + 0.2
        );
        if (!inSafe) {
          pos = candidate;
          break;
        }
        pos = candidate;
      }
      this.shades.push({
        id: `S${i + 1}`,
        pos,
        state: "wander",
        stateTicksLeft: 0,
        pushTicksLeft: 0,
        pushDir: [1, 0],
        recoilDir: [1, 0],
        safePushTicks: 0,
        safePushLanternId: null,
        targetLanternId: null,
        drainTickCounter: 0,
        wanderAngle: rng.range(0, Math.PI * 2)
      });
    }

    // 100 motes distributed across island
    for (let i = 0; i < 100; i++) {
      const r = Math.sqrt(rng.range(2 * 2, 37 * 37));
      const angle = rng.range(0, Math.PI * 2);
      this.motes.push({
        id: `M${i + 1}`,
        pos: [Math.cos(angle) * r, 0, Math.sin(angle) * r],
        kind: "random",
        ttlTicks: null,
        pickupDelayTicks: 0
      });
    }
  }

  step(): void {
    this.tick += 1;
    const stepDist = this.tuning.shade_speed * 0.45 * DT;
    const safeR = this.tuning.safe_radius;

    for (const shade of this.shades) {
      shade.wanderAngle += 0.015;
      const res = resolveHorizontalMove(
        1,
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

      for (const l of this.lanterns) {
        if (!l.lit) continue;
        const dx = shade.pos[0] - l.pos[0];
        const dz = shade.pos[2] - l.pos[2];
        const d = Math.hypot(dx, dz);
        if (d < safeR) {
          const outR = safeR + 0.02;
          const ux = d > 1e-6 ? dx / d : 1;
          const uz = d > 1e-6 ? dz / d : 0;
          shade.pos[0] = l.pos[0] + ux * outR;
          shade.pos[2] = l.pos[2] + uz * outR;
          shade.wanderAngle += Math.PI * 0.5;
        }
      }
    }
  }

  getViewState(): GameStateSnapshot {
    return {
      tick: this.tick,
      simTick: this.tick,
      night: 1,
      state: "playing",
      timeLeftS: 240,
      score: 0,
      wind: { active: false, warning: false, dir_deg: 0 },
      player: {
        pos: [0, 0, 0],
        vel: [0, 0, 0],
        velY: 0,
        facing: [0, 1],
        grounded: true,
        flames: 3,
        carried: 0,
        capacity: 10,
        invulnTimer: 0,
        dashCooldownTimer: 0,
        pulseCooldownTimer: 0,
        charmTimer: 0,
        respawnTimer: 0
      },
      lanterns: this.lanterns,
      shades: this.shades,
      motes: this.motes,
      drifters: [],
      charms: [],
      islandRadius: 40
    };
  }
}
