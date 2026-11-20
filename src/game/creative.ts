import * as THREE from "three";
import { distXZ } from "../core/math.js";
import type { GameStateSnapshot, TuningConfig, Vec3 } from "../core/types.js";
import { LanternFestival, type FestivalState } from "./festival.js";
import { paper, shape } from "./memories.js";

interface FogWisp {
  id: string;
  group: THREE.Group;
  bodyPivot: THREE.Group;
  maskPivot: THREE.Group;
  ribbons: THREE.Mesh[][];
  orbMotes: THREE.Mesh[];
  outerRing: THREE.Mesh;
  innerRing: THREE.Mesh;
  eyeGlowMat: THREE.MeshBasicMaterial;
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

  private buildWispRobeGeo(): THREE.BufferGeometry {
    const pts = [
      new THREE.Vector2(0.58, 0.0),
      new THREE.Vector2(0.52, 0.3),
      new THREE.Vector2(0.4, 0.72),
      new THREE.Vector2(0.32, 1.08),
      new THREE.Vector2(0.42, 1.38),
      new THREE.Vector2(0.26, 1.62),
      new THREE.Vector2(0.01, 1.72)
    ];
    const g = new THREE.LatheGeometry(pts, 28);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      if (y < 0.45) {
        const k = 1 - y / 0.45;
        const wave = Math.sin(a * 5) * 0.5 + 0.5;
        pos.setY(i, y - wave * 0.28 * k * k);
        pos.setX(i, x * (1 + wave * 0.14 * k));
        pos.setZ(i, z * (1 + wave * 0.14 * k));
      }
    }
    g.computeVertexNormals();
    return g;
  }

  private spawnFogWisps(): void {
    const configs = [
      { id: "W1", angle: 0.4, speedRad: 0.32, radius: 22 },
      { id: "W2", angle: 3.5, speedRad: -0.28, radius: 22 }
    ];

    const robeGeo = this.buildWispRobeGeo();
    const segGeo = new THREE.PlaneGeometry(0.28, 0.52);
    segGeo.rotateX(-Math.PI / 2);

    for (const cfg of configs) {
      const group = new THREE.Group();
      const bodyPivot = new THREE.Group();
      bodyPivot.position.y = 0.25;
      group.add(bodyPivot);

      // Flowing translucent spectral veil robe
      const robeMat = new THREE.MeshStandardMaterial({
        color: 0x311042,
        emissive: 0x9d174d,
        emissiveIntensity: 0.75,
        transparent: true,
        opacity: 0.86,
        roughness: 0.42,
        side: THREE.DoubleSide
      });
      const robe = new THREE.Mesh(robeGeo, robeMat);
      robe.scale.set(0.95, 1.05, 0.78);
      bodyPivot.add(robe);

      // Luminous ethereal outer aura mantle
      const auraMat = new THREE.MeshBasicMaterial({
        color: 0xf472b6,
        transparent: true,
        opacity: 0.18,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const aura = new THREE.Mesh(robeGeo, auraMat);
      aura.scale.set(1.08, 1.09, 0.92);
      bodyPivot.add(aura);

      // Inner glowing spirit core orb
      const heartMat = new THREE.MeshBasicMaterial({
        color: 0xf9a8d4,
        transparent: true,
        opacity: 0.85
      });
      shape(bodyPivot, new THREE.OctahedronGeometry(0.22, 1), heartMat, 0, 0.95, 0.14);

      // Ornate collar / shawl around neck
      const collarMat = new THREE.MeshStandardMaterial({
        color: 0x581c87,
        emissive: 0x86198f,
        emissiveIntensity: 0.5,
        roughness: 0.5
      });
      const collar = shape(bodyPivot, new THREE.TorusGeometry(0.32, 0.065, 8, 22), collarMat, 0, 1.28, 0.04);
      collar.rotation.x = Math.PI / 2 + 0.18;

      // Sculpted porcelain spirit mask + crown
      const maskPivot = new THREE.Group();
      maskPivot.position.set(0, 1.56, 0.26);
      bodyPivot.add(maskPivot);

      const porcelainMat = new THREE.MeshStandardMaterial({
        color: 0xf6ebe9,
        emissive: 0xeee0df,
        emissiveIntensity: 0.35,
        roughness: 0.32
      });
      const hoodMat = new THREE.MeshStandardMaterial({
        color: 0x1e0b2e,
        emissive: 0x4c1d95,
        emissiveIntensity: 0.35,
        roughness: 0.65
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xf2c14e,
        emissive: 0xd99b26,
        emissiveIntensity: 0.45,
        metalness: 0.45,
        roughness: 0.35
      });
      const crimsonMat = new THREE.MeshBasicMaterial({ color: 0xc8102e });
      const socketMat = new THREE.MeshBasicMaterial({ color: 0x2b0a3d });
      const eyeGlowMat = new THREE.MeshBasicMaterial({ color: 0xf472b6 });

      // Dark hood backing behind mask
      const hood = shape(maskPivot, new THREE.SphereGeometry(0.36, 14, 12), hoodMat, 0, 0.02, -0.14);
      hood.scale.set(0.95, 1.15, 0.85);

      // Contoured porcelain face
      const mask = shape(maskPivot, new THREE.SphereGeometry(0.34, 16, 14), porcelainMat, 0, 0, 0.04);
      mask.scale.set(0.84, 1.14, 0.38);

      // Painted crimson forehead lotus mark & delicate smile
      const mark = shape(maskPivot, new THREE.OctahedronGeometry(0.048, 0), crimsonMat, 0, 0.18, 0.165);
      mark.scale.set(0.75, 1.4, 0.35);
      const lips = shape(maskPivot, new THREE.TorusGeometry(0.042, 0.01, 5, 10, Math.PI), crimsonMat, 0, -0.14, 0.16);
      lips.rotation.z = Math.PI;

      // Almond-shaped dark eye slits with luminous spirit pupils + cheek dots
      for (const sx of [-1, 1]) {
        const socket = shape(maskPivot, new THREE.SphereGeometry(0.068, 8, 6), socketMat, sx * 0.115, 0.045, 0.145);
        socket.scale.set(1.25, 0.55, 0.45);
        socket.rotation.z = sx * 0.22;

        const pupil = shape(maskPivot, new THREE.SphereGeometry(0.032, 6, 6), eyeGlowMat, sx * 0.115, 0.045, 0.175);
        pupil.scale.set(1.1, 0.75, 0.5);

        const cheek = shape(maskPivot, new THREE.SphereGeometry(0.036, 6, 5), paper(0xf472b6, 0.55), sx * 0.17, -0.055, 0.135);
        cheek.scale.set(1.1, 0.65, 0.3);
      }

      // Golden crescent diadem & hairpin ornaments on top of the mask
      const crescent = shape(maskPivot, new THREE.TorusGeometry(0.18, 0.024, 8, 20, Math.PI * 1.18), goldMat, 0, 0.42, 0.02);
      crescent.rotation.z = Math.PI * 0.91;
      shape(maskPivot, new THREE.OctahedronGeometry(0.065, 0), eyeGlowMat, 0, 0.42, 0.03);
      const pin = shape(maskPivot, new THREE.CylinderGeometry(0.012, 0.012, 0.84, 6), goldMat, 0, 0.24, -0.08);
      pin.rotation.z = Math.PI / 2;
      for (const sx of [-1, 1]) {
        shape(maskPivot, new THREE.SphereGeometry(0.042, 8, 6), eyeGlowMat, sx * 0.42, 0.24, -0.08);
        shape(maskPivot, new THREE.CylinderGeometry(0.008, 0.004, 0.24, 5), goldMat, sx * 0.42, 0.1, -0.08);
      }

      // 6 articulated flowing silk ribbons (4 animated segments each)
      const silkMat = new THREE.MeshStandardMaterial({
        color: 0xc084fc,
        emissive: 0x9d174d,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const ribbons: THREE.Mesh[][] = [];
      for (let r = 0; r < 6; r++) {
        const segs: THREE.Mesh[] = [];
        for (let s = 0; s < 4; s++) {
          const seg = new THREE.Mesh(segGeo, silkMat);
          seg.scale.set(1 - s * 0.18, 1, 1);
          bodyPivot.add(seg);
          segs.push(seg);
        }
        ribbons.push(segs);
      }

      // 4 orbiting mist petals/motes
      const orbMotes: THREE.Mesh[] = [];
      const moteGeo = new THREE.OctahedronGeometry(0.08, 0);
      for (let m = 0; m < 4; m++) {
        const mote = new THREE.Mesh(moteGeo, eyeGlowMat);
        bodyPivot.add(mote);
        orbMotes.push(mote);
      }

      // Double counter-rotating ground mist rings
      const outerRing = new THREE.Mesh(
        new THREE.RingGeometry(0.86, 1.02, 32),
        new THREE.MeshBasicMaterial({
          color: 0xf472b6,
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      outerRing.rotation.x = -Math.PI / 2;
      outerRing.position.y = 0.09;
      group.add(outerRing);

      const innerRing = new THREE.Mesh(
        new THREE.RingGeometry(0.52, 0.62, 6),
        new THREE.MeshBasicMaterial({
          color: 0xc084fc,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      innerRing.rotation.x = -Math.PI / 2;
      innerRing.position.y = 0.11;
      group.add(innerRing);

      // Soft eerie pink-magenta aura light
      const auraLight = new THREE.PointLight(0xf472b6, 1.6, 8);
      auraLight.position.set(0, 1.35, 0.2);
      group.add(auraLight);

      this.scene.add(group);
      this.wisps.push({
        id: cfg.id,
        group,
        bodyPivot,
        maskPivot,
        ribbons,
        orbMotes,
        outerRing,
        innerRing,
        eyeGlowMat,
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
    for (let wi = 0; wi < this.wisps.length; wi++) {
      const wisp = this.wisps[wi];
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
      wisp.group.visible = true;

      wisp.angle += wisp.speedRad * dt;
      const wx = Math.sin(wisp.angle) * wisp.radius;
      const wz = Math.cos(wisp.angle) * wisp.radius;
      const t = this.animTime + wi * 2.1;
      wisp.group.position.set(wx, 0, wz);
      wisp.group.rotation.y = Math.atan2(snapshot.player.pos[0] - wx, snapshot.player.pos[2] - wz);

      const distToPlayer = distXZ(snapshot.player.pos, [wx, 0, wz]);
      const nearby = distToPlayer < 6.5;

      // Floating spectral body & gentle head tilt
      wisp.bodyPivot.position.y = 0.28 + Math.sin(t * 2.6) * 0.16;
      wisp.bodyPivot.rotation.z = Math.sin(t * 1.8) * 0.08;
      wisp.bodyPivot.rotation.x = nearby ? 0.14 : 0.05;
      wisp.maskPivot.rotation.z = Math.sin(t * 2.2) * (nearby ? 0.16 : 0.07);
      wisp.maskPivot.rotation.x = Math.cos(t * 1.9) * 0.06;
      wisp.group.scale.setScalar(nearby ? 1.04 + Math.sin(t * 7) * 0.05 : 1);
      wisp.eyeGlowMat.color.setHex(nearby ? 0xff4da6 : 0xf472b6);

      // Undulating 6 silk ribbons streaming behind the spirit
      for (let r = 0; r < wisp.ribbons.length; r++) {
        const spread = (r - 2.5) * 0.24;
        const baseY = 1.24 - Math.abs(r - 2.5) * 0.1;
        const segs = wisp.ribbons[r];
        for (let s = 0; s < segs.length; s++) {
          const seg = segs[s];
          const phase = t * (nearby ? 7.5 : 4.5) - s * 0.85 + r * 0.9;
          const swayX = Math.sin(phase) * (0.08 + s * 0.09);
          const swayY = Math.cos(phase * 0.8) * (0.05 + s * 0.05);
          seg.position.set(
            spread * (1 + s * 0.35) + swayX,
            baseY - s * 0.18 + swayY,
            -0.22 - s * 0.44
          );
          seg.rotation.z = Math.cos(phase) * 0.32;
          seg.rotation.x = -0.35 - s * 0.08 + Math.sin(phase) * 0.14;
        }
      }

      // Orbiting luminous spirit motes
      for (let m = 0; m < wisp.orbMotes.length; m++) {
        const ma = t * (nearby ? 3.2 : 1.7) + (m / wisp.orbMotes.length) * Math.PI * 2;
        wisp.orbMotes[m].position.set(
          Math.cos(ma) * 0.78,
          0.92 + Math.sin(t * 3 + m * 1.5) * 0.24,
          Math.sin(ma) * 0.78
        );
        wisp.orbMotes[m].rotation.y = ma * 2;
      }

      // Counter-rotating ground mist rune rings
      wisp.outerRing.rotation.z = t * 0.7;
      wisp.innerRing.rotation.z = -t * 1.1;
      const ringPulse = nearby ? 1.12 + Math.sin(t * 6) * 0.08 : 1 + Math.sin(t * 2.5) * 0.04;
      wisp.outerRing.scale.setScalar(ringPulse);

      if (this.hitCooldown <= 0 && distToPlayer <= 1.35) {
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
