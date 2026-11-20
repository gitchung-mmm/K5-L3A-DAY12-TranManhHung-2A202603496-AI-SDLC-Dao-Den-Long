import * as THREE from "three";
import { distXZ } from "../core/math.js";
import type { GameStateSnapshot, TuningConfig, Vec3 } from "../core/types.js";

interface FogWisp {
  id: string;
  group: THREE.Group;
  angle: number;
  speedRad: number;
  radius: number;
  banishedTimer: number;
}

export interface CreativeHudState {
  npcDialogue: string | null;
  slowed: boolean;
  speedMultiplier: number;
}

/**
 * Creative Web-3D-only additions (NPC "Ông Lái Đò" + Enemy "Sương Giăng").
 * Runs strictly in the presentation layer so headless Test Contract outputs remain untouched.
 */
export class CreativeWorld {
  private readonly npcPos: Vec3 = [0, 0, -36.5];
  private readonly boatGroup: THREE.Group;
  private readonly npcGroup: THREE.Group;
  private readonly wisps: FogWisp[] = [];

  private slowTimer = 0;
  private hitCooldown = 0;
  private animTime = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly tuning: TuningConfig
  ) {
    const { npcGroup, boatGroup } = this.buildDockAndNpc();
    this.npcGroup = npcGroup;
    this.boatGroup = boatGroup;
    this.scene.add(this.npcGroup);
    this.scene.add(this.boatGroup);

    this.spawnFogWisps();
  }

  private buildDockAndNpc(): { npcGroup: THREE.Group; boatGroup: THREE.Group } {
    // Wooden pier extending from the south rim (Z = -39.5 to -34.5)
    const pierGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
    const plankGeo = new THREE.BoxGeometry(3.2, 0.22, 6.0);
    const pier = new THREE.Mesh(plankGeo, woodMat);
    pier.position.set(0, 0.12, -37.2);
    pier.receiveShadow = true;
    pierGroup.add(pier);

    // Small wooden boat floating at the edge of the cloud sea
    const boatGroup = new THREE.Group();
    const hullGeo = new THREE.BoxGeometry(1.8, 0.55, 4.0);
    const hull = new THREE.Mesh(hullGeo, woodMat);
    boatGroup.add(hull);
    boatGroup.position.set(2.2, -0.35, -42.2);
    boatGroup.rotation.y = 0.25;

    // NPC: Ông Lái Đò (elder boatman) standing on the pier
    const npcGroup = new THREE.Group();
    npcGroup.add(pierGroup);

    const npcRoot = new THREE.Group();
    npcRoot.position.set(this.npcPos[0], 0, this.npcPos[2]);

    const cloakGeo = new THREE.ConeGeometry(0.5, 1.25, 12);
    const cloakMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
    const cloak = new THREE.Mesh(cloakGeo, cloakMat);
    cloak.position.y = 0.72;
    cloak.castShadow = true;
    npcRoot.add(cloak);

    const headGeo = new THREE.SphereGeometry(0.28, 12, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf1d2b6, roughness: 0.7 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.48;
    npcRoot.add(head);

    const hatGeo = new THREE.ConeGeometry(0.62, 0.3, 16);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x926239, roughness: 0.85 });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 1.72;
    npcRoot.add(hat);

    // Warm oil lamp beside the boatman
    const lampGeo = new THREE.SphereGeometry(0.18, 10, 10);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.0
    });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(0.65, 1.0, 0.35);
    npcRoot.add(lamp);

    const lampLight = new THREE.PointLight(0xfbbf24, 2.2, 9);
    lampLight.position.set(0.65, 1.2, 0.35);
    npcRoot.add(lampLight);

    npcGroup.add(npcRoot);
    return { npcGroup, boatGroup };
  }

  private spawnFogWisps(): void {
    const configs = [
      { id: "W1", angle: 0.4, speedRad: 0.32, radius: 22 },
      { id: "W2", angle: 3.5, speedRad: -0.28, radius: 22 }
    ];

    for (const cfg of configs) {
      const group = new THREE.Group();

      const coreGeo = new THREE.IcosahedronGeometry(0.62, 1);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x311042,
        emissive: 0x9d174d,
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 0.88,
        roughness: 0.4
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.y = 1.25;
      group.add(core);

      const ringGeo = new THREE.TorusGeometry(0.95, 0.08, 8, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xf472b6,
        transparent: true,
        opacity: 0.75
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 1.25;
      ring.rotation.x = Math.PI / 2.4;
      group.add(ring);

      this.scene.add(group);
      this.wisps.push({
        id: cfg.id,
        group,
        angle: cfg.angle,
        speedRad: cfg.speedRad,
        radius: cfg.radius,
        banishedTimer: 0
      });
    }
  }

  reset(): void {
    this.slowTimer = 0;
    this.hitCooldown = 0;
    for (let i = 0; i < this.wisps.length; i++) {
      this.wisps[i].banishedTimer = 0;
      this.wisps[i].angle = i === 0 ? 0.4 : 3.5;
      this.wisps[i].group.visible = true;
    }
  }

  onPulse(playerPos: Vec3): void {
    for (const wisp of this.wisps) {
      if (wisp.banishedTimer > 0) continue;
      const wispPos: Vec3 = [wisp.group.position.x, 0, wisp.group.position.z];
      if (distXZ(playerPos, wispPos) <= this.tuning.pulse_radius) {
        wisp.banishedTimer = 4.0;
        wisp.group.visible = false;
      }
    }
  }

  update(snapshot: GameStateSnapshot, dt: number): CreativeHudState {
    this.animTime += dt;
    this.boatGroup.position.y = -0.35 + Math.sin(this.animTime * 1.6) * 0.16;
    this.boatGroup.rotation.z = Math.sin(this.animTime * 1.2) * 0.04;

    if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt);
    if (this.hitCooldown > 0) this.hitCooldown = Math.max(0, this.hitCooldown - dt);

    const litCount = snapshot.lanterns.filter((l) => l.lit).length;
    const allLit = litCount >= snapshot.lanterns.length;

    // Update Sương Giăng wisps patrolling the lantern ring
    for (const wisp of this.wisps) {
      if (allLit || snapshot.state !== "playing") {
        wisp.group.visible = false;
        continue;
      }
      if (wisp.banishedTimer > 0) {
        wisp.banishedTimer = Math.max(0, wisp.banishedTimer - dt);
        if (wisp.banishedTimer <= 0) {
          wisp.group.visible = true;
        }
        continue;
      }

      wisp.angle += wisp.speedRad * dt;
      const wx = Math.sin(wisp.angle) * wisp.radius;
      const wz = Math.cos(wisp.angle) * wisp.radius;
      wisp.group.position.set(wx, Math.sin(this.animTime * 3) * 0.22, wz);
      wisp.group.rotation.y += dt * 2.2;

      if (
        this.hitCooldown <= 0 &&
        distXZ(snapshot.player.pos, [wx, 0, wz]) <= 1.35
      ) {
        this.slowTimer = 1.6;
        this.hitCooldown = 3.0;
      }
    }

    // NPC dialogue when player stands near Ông Lái Đò
    let npcDialogue: string | null = null;
    if (distXZ(snapshot.player.pos, this.npcPos) <= 4.5) {
      if (litCount === 0) {
        npcDialogue =
          "Ông Lái Đò: \"Mây ơi, hãy gom đom đóm thắp 5 Đèn Lồng Lớn. Cẩn thận cả Bóng Mực lẫn Sương Giăng tuần tra quanh đèn!\"";
      } else if (litCount < snapshot.lanterns.length) {
        npcDialogue = `Ông Lái Đò: \"Tốt lắm, đã sáng ${litCount}/${snapshot.lanterns.length} đèn rồi! Bấm Tỏa sáng (Shift/R) sẽ xua cả Bóng Mực và Sương Giăng.\"`;
      } else {
        npcDialogue =
          "Ông Lái Đò: \"Đảo Bến đã bình yên trở lại rồi, Mây giỏi lắm!\"";
      }
    }

    return {
      npcDialogue,
      slowed: this.slowTimer > 0,
      speedMultiplier: this.slowTimer > 0 ? 0.55 : 1.0
    };
  }
}
