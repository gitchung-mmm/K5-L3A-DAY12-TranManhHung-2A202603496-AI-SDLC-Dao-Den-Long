import * as THREE from "three";
import { distXZ } from "../core/math.js";
import type { GameStateSnapshot, TuningConfig, Vec3 } from "../core/types.js";
import { LanternFestival, type FestivalState } from "./festival.js";
import { paper, shape } from "./memories.js";

interface FogWisp {
  id: string;
  group: THREE.Group;
  angle: number;
  speedRad: number;
  radius: number;
  banishedTimer: number;
}

export interface CreativeHudState extends FestivalState {
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
  private npcLantern!: THREE.Group;
  private readonly festival: LanternFestival;

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
    this.festival = new LanternFestival(scene, this.boatGroup);
  }

  private buildDockAndNpc(): { npcGroup: THREE.Group; boatGroup: THREE.Group } {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x4c331f, roughness: 0.92 });
    const woodLight = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.88 });

    // Wooden pier: separate planks + support posts + rope rail (extends from the south rim)
    const pierGroup = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.62), i % 2 === 0 ? woodMat : woodLight);
      plank.position.set(0, 0.14, -34.4 - i * 0.68);
      plank.receiveShadow = true;
      pierGroup.add(plank);
    }
    for (const sx of [-1.5, 1.5]) {
      for (const z of [-34.6, -37.4, -40.2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 8), woodDark);
        post.position.set(sx, 0.45, z);
        pierGroup.add(post);
      }
    }

    // Small wooden boat: pointed outline hull (bow toward -Z) + deck, benches, oar
    const boatGroup = new THREE.Group();
    const hullShape = new THREE.Shape();
    hullShape.moveTo(0, 2.1);
    hullShape.bezierCurveTo(0.7, 1.4, 0.95, 0.4, 0.9, -0.6);
    hullShape.lineTo(0.7, -1.9);
    hullShape.lineTo(-0.7, -1.9);
    hullShape.lineTo(-0.9, -0.6);
    hullShape.bezierCurveTo(-0.95, 0.4, -0.7, 1.4, 0, 2.1);
    const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 0.5, bevelEnabled: false, curveSegments: 12 });
    hullGeo.rotateX(-Math.PI / 2);
    hullGeo.translate(0, -0.25, 0);
    const hull = new THREE.Mesh(hullGeo, woodMat);
    hull.castShadow = true;
    boatGroup.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 2.6), woodLight);
    deck.position.set(0, 0.2, 0);
    boatGroup.add(deck);
    for (const z of [-0.8, 0.5]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.26), woodDark);
      bench.position.set(0, 0.42, z);
      boatGroup.add(bench);
    }
    const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), woodDark);
    oar.position.set(0.7, 0.6, 0.3);
    oar.rotation.set(0.3, 0, 1.1);
    boatGroup.add(oar);
    const oarBlade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.5), woodLight);
    oarBlade.position.set(1.55, 0.05, 0.55);
    oarBlade.rotation.set(0.3, 0, 1.1);
    boatGroup.add(oarBlade);
    boatGroup.position.set(2.2, -0.35, -42.2);
    boatGroup.rotation.y = 0.25;

    // NPC: Ông Lái Đò (elder boatman): robe, beard, bamboo hat, holding a lantern pole
    const npcGroup = new THREE.Group();
    npcGroup.add(pierGroup);

    const npcRoot = new THREE.Group();
    npcRoot.position.set(this.npcPos[0], 0, this.npcPos[2]);

    const robeMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8, side: THREE.DoubleSide });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1d2b6, roughness: 0.7 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.9 });
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x926239, roughness: 0.85 });
    const sashMat = new THREE.MeshStandardMaterial({ color: 0x7a2e2e, roughness: 0.7 });

    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.3, 16), robeMat);
    robe.position.y = 0.72;
    robe.castShadow = true;
    npcRoot.add(robe);
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 16), sashMat);
    sash.rotation.x = Math.PI / 2;
    sash.position.y = 0.78;
    npcRoot.add(sash);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 12), skinMat);
    head.position.y = 1.5;
    head.castShadow = true;
    npcRoot.add(head);
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 8), whiteMat);
    beard.rotation.x = Math.PI;
    beard.position.set(0, 1.2, 0.17);
    npcRoot.add(beard);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshBasicMaterial({ color: 0x2a1a1a }));
      eye.position.set(sx * 0.09, 1.53, 0.24);
      npcRoot.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.03), whiteMat);
      brow.position.set(sx * 0.09, 1.59, 0.25);
      brow.rotation.z = sx * -0.25;
      npcRoot.add(brow);
    }

    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.34, 24), hatMat);
    hat.position.y = 1.78;
    hat.castShadow = true;
    npcRoot.add(hat);
    const hatRim = new THREE.Mesh(new THREE.TorusGeometry(0.67, 0.014, 6, 28), woodDark);
    hatRim.rotation.x = Math.PI / 2;
    hatRim.position.y = 1.62;
    npcRoot.add(hatRim);

    // Arms: right hand holds the lantern pole, left hand rests
    const armGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.5, 8).translate(0, -0.25, 0);
    const rightArm = new THREE.Mesh(armGeo, robeMat);
    rightArm.position.set(0.36, 1.15, 0.06);
    rightArm.rotation.set(-0.5, 0, -0.35);
    npcRoot.add(rightArm);
    const leftArm = new THREE.Mesh(armGeo, robeMat);
    leftArm.position.set(-0.36, 1.15, 0.04);
    leftArm.rotation.set(-0.2, 0, 0.3);
    npcRoot.add(leftArm);
    for (const [hx, hy, hz] of [
      [0.5, 0.72, 0.34],
      [-0.5, 0.68, 0.14]
    ]) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skinMat);
      hand.position.set(hx, hy, hz);
      npcRoot.add(hand);
    }

    // Lantern pole with hanging lantern + warm light
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.5, 8), woodDark);
    pole.position.set(0.52, 1.25, 0.34);
    npcRoot.add(pole);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 6, 12, Math.PI), woodDark);
    hook.position.set(0.52, 2.5, 0.24);
    hook.rotation.y = Math.PI / 2;
    npcRoot.add(hook);
    const lanternPivot = new THREE.Group();
    lanternPivot.position.set(0.52, 2.46, 0.14);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.0
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), lampMat);
    lamp.scale.set(0.9, 1.2, 0.9);
    lamp.position.y = -0.3;
    lanternPivot.add(lamp);
    const lampCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.05, 8),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.3, roughness: 0.4 })
    );
    lampCap.position.y = -0.1;
    lanternPivot.add(lampCap);
    const lampLight = new THREE.PointLight(0xfbbf24, 2.2, 9);
    lampLight.position.set(0, -0.3, 0.05);
    lanternPivot.add(lampLight);
    npcRoot.add(lanternPivot);
    this.npcLantern = lanternPivot;

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

      // Porcelain mask and trailing silk replace an anonymous floating orb.
      core.scale.set(0.7, 1, 0.4);
      const mask = shape(group, new THREE.SphereGeometry(0.4, 12, 10), paper(0xeee0df), 0, 1.4, 0.4);
      mask.scale.set(0.8, 1.1, 0.25);
      for (const x of [-0.13, 0.13]) {
        shape(group, new THREE.SphereGeometry(0.07, 6, 5), paper(0x41164e), x, 1.48, 0.5).scale.y = 0.5;
      }
      const silk = paper(0xb879c6, 0.45);
      for (let i = 0; i < 6; i++) {
        const ribbon = shape(group, new THREE.ConeGeometry(0.22, 1.4, 5), silk,
          Math.sin(i * 1.2) * 0.5, 0.8, -i * 0.35);
        ribbon.rotation.x = -0.8;
      }
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;

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
    this.festival.reset();
    this.animTime = 0;
    this.slowTimer = 0;
    this.hitCooldown = 0;
    for (let i = 0; i < this.wisps.length; i++) {
      this.wisps[i].banishedTimer = 0;
      this.wisps[i].angle = i === 0 ? 0.4 : 3.5;
      this.wisps[i].group.visible = true;
    }
  }

  onPulse(playerPos: Vec3): void {
    this.festival.onPulse(playerPos, this.tuning.pulse_radius);
    for (const wisp of this.wisps) {
      if (wisp.banishedTimer > 0) continue;
      const wispPos: Vec3 = [wisp.group.position.x, 0, wisp.group.position.z];
      if (distXZ(playerPos, wispPos) <= this.tuning.pulse_radius) {
        wisp.banishedTimer = 4.0;
        wisp.group.visible = false;
      }
    }
  }

  update(snapshot: GameStateSnapshot, dt: number, camYawDeg = 0): CreativeHudState {
    this.animTime += dt;
    const isNight1 = snapshot.night === 1;
    this.npcGroup.visible = isNight1;
    this.boatGroup.visible = isNight1;
    this.boatGroup.position.y = -0.35 + Math.sin(this.animTime * 1.6) * 0.16;
    this.boatGroup.rotation.z = Math.sin(this.animTime * 1.2) * 0.04;
    this.npcLantern.rotation.z = Math.sin(this.animTime * 1.4) * 0.08;

    if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt);
    if (this.hitCooldown > 0) this.hitCooldown = Math.max(0, this.hitCooldown - dt);

    const litCount = snapshot.lanterns.filter((l) => l.lit).length;
    const allLit = litCount >= snapshot.lanterns.length;

    // Update Sương Giăng wisps patrolling the lantern ring (Night 1 decorative threat)
    for (const wisp of this.wisps) {
      if (!isNight1 || allLit || snapshot.state !== "playing") {
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
      wisp.group.rotation.y = Math.atan2(snapshot.player.pos[0] - wx, snapshot.player.pos[2] - wz);
      const nearby = distXZ(snapshot.player.pos, [wx, 0, wz]) < 6;
      wisp.group.scale.setScalar(nearby ? 1 + Math.sin(this.animTime * 8) * 0.08 : 1);

      if (
        this.hitCooldown <= 0 &&
        distXZ(snapshot.player.pos, [wx, 0, wz]) <= 1.35
      ) {
        this.slowTimer = 1.6;
        this.hitCooldown = 3.0;
      }
    }

    // NPC dialogue when player stands near Ông Lái Đò (Night 1)
    let npcDialogue: string | null = null;
    if (isNight1 && distXZ(snapshot.player.pos, this.npcPos) <= 4.5) {
      if (litCount === 0) {
        npcDialogue =
          "Ông Lái Đò: \"Đèn tắt lâu quá, đường về cũng quên mất lối. Gom đom đóm thắp đèn giúp ông nhé.\"";
      } else if (litCount < snapshot.lanterns.length) {
        npcDialogue = `Ông Lái Đò: \"Tốt lắm, đã sáng ${litCount}/${snapshot.lanterns.length} đèn rồi! Bấm Tỏa sáng (Shift/R) sẽ xua cả Bóng Mực và Sương Giăng.\"`;
      } else {
        npcDialogue =
          "Ông Lái Đò: \"Đủ người rồi. Cảm ơn con đã giữ đèn.\"";
      }
    }

    return {
      ...this.festival.update(snapshot, dt, camYawDeg),
      npcDialogue,
      slowed: this.slowTimer > 0,
      speedMultiplier: this.slowTimer > 0 ? 0.55 : 1.0
    };
  }
}
