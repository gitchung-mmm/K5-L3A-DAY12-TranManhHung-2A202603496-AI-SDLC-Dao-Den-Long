import * as THREE from "three";
import { PALETTE } from "./palette.js";

/**
 * Procedural 3D model builders for Đảo Đèn Lồng.
 * Presentation layer ONLY: nothing here touches src/core, hit-boxes or game rules.
 * Dimensions intentionally match the gameplay radii (shade hit 1.0 m, pickup 1.0 m,
 * lantern interact 2.0 m, safe zone 6 m) so what the player sees matches the rules.
 */

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const geoCache = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = geoCache.get(key);
  if (hit) return hit as T;
  const g = make();
  geoCache.set(key, g);
  return g;
}

const matCache = new Map<string, THREE.Material>();
function mat<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = matCache.get(key);
  if (hit) return hit as T;
  const m = make();
  matCache.set(key, m);
  return m;
}

function std(color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
}

function add(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function smoothProfile(points: Array<[number, number]>, samples: number): THREE.Vector2[] {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
  return curve.getPoints(samples).map((p) => new THREE.Vector2(Math.max(0.001, p.x), p.y));
}

// ---------------------------------------------------------------------------
// MÂY — nhân vật chính (cao ~1.8 m, mặt hướng +Z)
// ---------------------------------------------------------------------------
export interface PlayerRig {
  group: THREE.Group;
  body: THREE.Group;
  scarfTail: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  lanternPivot: THREE.Group;
  lanternGlass: THREE.Mesh;
  lanternLight: THREE.PointLight;
  phase: number;
}

export interface PlayerPose {
  vx: number;
  vz: number;
  grounded: boolean;
}

export function buildPlayerRig(): PlayerRig {
  const skin = std(0xfde2c4, { roughness: 0.65 });
  const cloakMat = std(PALETTE.playerCloak, { roughness: 0.75, side: THREE.DoubleSide });
  const scarfMat = std(PALETTE.playerScarf, { roughness: 0.6 });
  const goldMat = std(PALETTE.goldAccent, { roughness: 0.4, metalness: 0.3 });
  const hatMat = std(PALETTE.sand, { roughness: 0.85 });
  const hatDark = std(0xa89368, { roughness: 0.9 });
  const hairMat = std(0x3a2a2a, { roughness: 0.9 });
  const bootMat = std(0x4a3426, { roughness: 0.85 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a1a1a });

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // Áo choàng: flared robe + gold hem trim
  const cloakGeo = geo("player.cloak", () =>
    new THREE.LatheGeometry(
      smoothProfile(
        [
          [0.54, 0.14],
          [0.47, 0.32],
          [0.38, 0.62],
          [0.3, 0.86],
          [0.23, 1.04],
          [0.2, 1.14]
        ],
        16
      ),
      24
    )
  );
  const cloak = add(body, cloakGeo, cloakMat);
  cloak.castShadow = true;
  const hem = add(body, geo("player.hem", () => new THREE.TorusGeometry(0.53, 0.028, 6, 28)), goldMat, 0, 0.16, 0);
  hem.rotation.x = Math.PI / 2;

  // Khăn quàng cổ (#C8102E) + đuôi khăn bay phía sau
  const scarf = add(body, geo("player.scarf", () => new THREE.TorusGeometry(0.23, 0.075, 8, 20)), scarfMat, 0, 1.14, 0);
  scarf.rotation.x = Math.PI / 2;
  const scarfTail = new THREE.Group();
  scarfTail.position.set(0.1, 1.12, -0.2);
  body.add(scarfTail);
  add(scarfTail, geo("player.tail1", () => new THREE.BoxGeometry(0.13, 0.55, 0.03).translate(0, -0.275, 0)), scarfMat);
  add(scarfTail, geo("player.tail2", () => new THREE.BoxGeometry(0.11, 0.38, 0.03).translate(0, -0.19, 0)), scarfMat, -0.1, 0, 0.02);

  // Đầu & khuôn mặt
  const head = new THREE.Group();
  head.position.set(0, 1.38, 0);
  body.add(head);
  const skull = add(head, geo("player.skull", () => new THREE.SphereGeometry(0.27, 16, 14)), skin);
  skull.castShadow = true;
  const hairCap = add(
    head,
    geo("player.hair", () => new THREE.SphereGeometry(0.285, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58)),
    hairMat,
    0,
    0.0,
    -0.03
  );
  hairCap.rotation.x = -0.3;
  for (const sx of [-1, 1]) {
    add(head, geo("player.lock", () => new THREE.SphereGeometry(0.09, 8, 8)), hairMat, sx * 0.245, -0.04, -0.06);
    add(head, geo("player.eye", () => new THREE.SphereGeometry(0.036, 8, 8)), eyeMat, sx * 0.09, 0.02, 0.255);
    const blush = add(
      head,
      geo("player.blush", () => new THREE.SphereGeometry(0.05, 8, 8)),
      mat("player.blushMat", () => std(0xf4a0a0, { roughness: 0.9 })),
      sx * 0.15,
      -0.06,
      0.215
    );
    blush.scale.set(1, 0.6, 0.35);
  }
  const smile = add(
    head,
    geo("player.smile", () => new THREE.TorusGeometry(0.035, 0.008, 6, 10, Math.PI)),
    mat("player.smileMat", () => new THREE.MeshBasicMaterial({ color: 0x8a4a4a })),
    0,
    -0.085,
    0.258
  );
  smile.rotation.z = Math.PI;

  // Nón lá (nón lá có dải đỏ + vòng đan)
  const hat = new THREE.Group();
  hat.position.set(0, 0.27, 0);
  head.add(hat);
  const hatCone = add(hat, geo("player.hat", () => new THREE.ConeGeometry(0.72, 0.38, 32)), hatMat);
  hatCone.castShadow = true;
  const hatRim = add(hat, geo("player.hatRim", () => new THREE.TorusGeometry(0.72, 0.014, 6, 36)), hatDark, 0, -0.19, 0);
  hatRim.rotation.x = Math.PI / 2;
  const hatBand = add(hat, geo("player.hatBand", () => new THREE.TorusGeometry(0.69, 0.022, 6, 36)), scarfMat, 0, -0.17, 0);
  hatBand.rotation.x = Math.PI / 2;
  for (const [r, y] of [
    [0.47, -0.04],
    [0.25, 0.1]
  ] as Array<[number, number]>) {
    const ring = add(hat, geo(`player.weave.${r}`, () => new THREE.TorusGeometry(r, 0.01, 4, 28)), hatDark, 0, y, 0);
    ring.rotation.x = Math.PI / 2;
  }
  add(hat, geo("player.finial", () => new THREE.SphereGeometry(0.035, 8, 8)), goldMat, 0, 0.2, 0);

  // Tay (ống tay áo + bàn tay)
  const armGeo = geo("player.arm", () => new THREE.CylinderGeometry(0.07, 0.095, 0.4, 10).translate(0, -0.2, 0));
  const handGeo = geo("player.hand", () => new THREE.SphereGeometry(0.065, 8, 8));
  const makeArm = (sx: number): THREE.Group => {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.28, 1.04, 0);
    add(arm, armGeo, cloakMat);
    add(arm, handGeo, skin, 0, -0.42, 0);
    body.add(arm);
    return arm;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // Chân (đôi ủng nhỏ ló dưới gấu áo)
  const bootGeo = geo("player.boot", () => new THREE.SphereGeometry(0.1, 10, 8));
  const makeLeg = (sx: number): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.13, 0.16, 0);
    const boot = add(leg, bootGeo, bootMat, 0, -0.08, 0.05);
    boot.scale.set(1, 0.75, 1.5);
    body.add(leg);
    return leg;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // Đèn lồng nhỏ treo trước vành nón (con lắc)
  const lanternPivot = new THREE.Group();
  lanternPivot.position.set(0, 1.45, 0.66);
  body.add(lanternPivot);
  add(lanternPivot, geo("player.string", () => new THREE.CylinderGeometry(0.006, 0.006, 0.2, 5).translate(0, -0.1, 0)), hatDark);
  const lanternGlass = add(
    lanternPivot,
    geo("player.lanternBody", () => new THREE.SphereGeometry(0.12, 12, 10)),
    new THREE.MeshStandardMaterial({
      color: PALETTE.lanternCore,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 2.0
    }),
    0,
    -0.34,
    0
  );
  lanternGlass.scale.set(0.9, 1.15, 0.9);
  add(lanternPivot, geo("player.lanternCap", () => new THREE.CylinderGeometry(0.05, 0.06, 0.03, 10)), goldMat, 0, -0.2, 0);
  add(lanternPivot, geo("player.lanternCap", () => new THREE.CylinderGeometry(0.05, 0.06, 0.03, 10)), goldMat, 0, -0.48, 0);
  add(lanternPivot, geo("player.lanternTassel", () => new THREE.CylinderGeometry(0.01, 0.006, 0.12, 5).translate(0, -0.06, 0)), scarfMat, 0, -0.5, 0);
  const lanternLight = new THREE.PointLight(PALETTE.lanternLit, 2.4, 11);
  lanternLight.position.set(0, -0.34, 0.05);
  lanternPivot.add(lanternLight);

  return { group, body, scarfTail, armL, armR, legL, legR, lanternPivot, lanternGlass, lanternLight, phase: 0 };
}

export function animatePlayerRig(rig: PlayerRig, t: number, dt: number, pose: PlayerPose, reduced: boolean): void {
  const speed = Math.hypot(pose.vx, pose.vz);
  const moving = speed > 0.4;
  const dashing = speed > 10;
  if (pose.grounded && moving) rig.phase += dt * (6 + speed * 1.1);
  const amp = pose.grounded ? Math.min(0.85, speed * 0.13) : 0.25;
  const s = Math.sin(rig.phase);

  rig.legL.rotation.x = pose.grounded ? s * amp : 0.35;
  rig.legR.rotation.x = pose.grounded ? -s * amp : -0.25;
  rig.armL.rotation.x = pose.grounded ? -s * amp * 0.9 : -0.9;
  rig.armR.rotation.x = pose.grounded ? s * amp * 0.9 : -0.9;
  rig.armL.rotation.z = pose.grounded ? 0.12 : 0.65;
  rig.armR.rotation.z = pose.grounded ? -0.12 : -0.65;

  rig.body.position.y = pose.grounded && moving ? Math.abs(s) * 0.05 : 0;
  rig.body.scale.y = 1 + (reduced || moving ? 0 : Math.sin(t * 2) * 0.012);
  rig.body.rotation.x = dashing ? 0.38 : moving ? 0.1 : 0;

  rig.scarfTail.rotation.x = 0.12 + Math.min(1.1, speed * 0.075) + (reduced ? 0 : Math.sin(t * 9) * 0.07);
  rig.scarfTail.rotation.z = reduced ? 0 : Math.sin(t * 5) * 0.1;
  rig.scarfTail.scale.y = dashing ? 1.5 : 1;

  rig.lanternPivot.rotation.x = Math.min(0.55, speed * 0.06) + (reduced ? 0 : Math.sin(t * 5.5) * (moving ? 0.07 : 0.025));
  rig.lanternPivot.rotation.z = reduced ? 0 : Math.cos(t * 4.1) * (moving ? 0.05 : 0.02);
}

// ---------------------------------------------------------------------------
// BÓNG MỰC — kẻ địch chính (thân #120A1A, viền & mắt #7A3CFF / #00B3FF mù màu)
// ---------------------------------------------------------------------------
export type ShadeVisualState = "spawning" | "wander" | "chase" | "drain" | "recoil" | "stunned";

export interface ShadeRig {
  group: THREE.Group;
  body: THREE.Mesh;
  rim: THREE.Mesh;
  eyeL: THREE.Mesh;
  eyeR: THREE.Mesh;
}

const SHADE_SCALE = 0.85;
const SHADE_BASE_Y = 0.26;
const SHADE_EYE_Y = 1.12;

/** Ink blob: tall dome, two small horns and a scalloped, dripping hem. One shared geometry. */
function makeInkGeometry(): THREE.BufferGeometry {
  const profile = smoothProfile(
    [
      [0.62, 0.0],
      [0.7, 0.28],
      [0.64, 0.65],
      [0.52, 1.0],
      [0.36, 1.3],
      [0.17, 1.5],
      [0.0, 1.58]
    ],
    22
  );
  const g = new THREE.LatheGeometry(profile, 28);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    let ny = y;
    if (y < 0.5) {
      const k = 1 - y / 0.5;
      const scallop = Math.sin(a * 6) * 0.5 + 0.5;
      ny = y - scallop * 0.28 * k * k;
    }
    if (y > 1.3) {
      const k = (y - 1.3) / 0.28;
      const horn = Math.pow(Math.max(0, Math.cos(2 * a)), 8);
      ny = y + horn * 0.32 * Math.min(1, k);
    }
    pos.setY(i, ny);
  }
  g.computeVertexNormals();
  return g;
}

export class ShadeFactory {
  private readonly bodyGeo = makeInkGeometry();
  private readonly eyeGeo = new THREE.SphereGeometry(0.1, 8, 8);
  private readonly bodyMat = new THREE.MeshStandardMaterial({
    color: PALETTE.shadeBody,
    emissive: PALETTE.shadeBody,
    emissiveIntensity: 0.6,
    roughness: 0.55,
    side: THREE.DoubleSide
  });
  private readonly drainMat = new THREE.MeshStandardMaterial({
    color: PALETTE.shadeBody,
    emissive: PALETTE.shadeEdge,
    emissiveIntensity: 0.35,
    roughness: 0.5,
    side: THREE.DoubleSide
  });
  private readonly drainMatCB = new THREE.MeshStandardMaterial({
    color: PALETTE.shadeBody,
    emissive: PALETTE.shadeEdgeColorblind,
    emissiveIntensity: 0.35,
    roughness: 0.5,
    side: THREE.DoubleSide
  });
  private readonly stunnedMat = new THREE.MeshStandardMaterial({
    color: PALETTE.shadeStunned,
    emissive: PALETTE.shadeStunned,
    emissiveIntensity: 0.7,
    roughness: 0.6,
    side: THREE.DoubleSide
  });
  private readonly rimNormal = new THREE.MeshBasicMaterial({ color: PALETTE.shadeEdge, side: THREE.BackSide });
  private readonly rimCB = new THREE.MeshBasicMaterial({ color: PALETTE.shadeEdgeColorblind, side: THREE.BackSide });
  private readonly rimStunned = new THREE.MeshBasicMaterial({ color: PALETTE.shadeStunned, side: THREE.BackSide });
  private readonly eyeNormal = new THREE.MeshBasicMaterial({ color: PALETTE.shadeEdge });
  private readonly eyeCB = new THREE.MeshBasicMaterial({ color: PALETTE.shadeEdgeColorblind });

  build(castShadow: boolean): ShadeRig {
    const group = new THREE.Group();
    group.rotation.order = "YXZ";

    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.scale.setScalar(SHADE_SCALE);
    body.position.y = SHADE_BASE_Y;
    body.castShadow = castShadow;
    group.add(body);

    const rim = new THREE.Mesh(this.bodyGeo, this.rimNormal);
    rim.scale.set(SHADE_SCALE * 1.09, SHADE_SCALE * 1.04, SHADE_SCALE * 1.09);
    rim.position.y = SHADE_BASE_Y;
    group.add(rim);

    const eyeL = new THREE.Mesh(this.eyeGeo, this.eyeNormal);
    eyeL.position.set(-0.17, SHADE_EYE_Y, 0.4);
    eyeL.scale.set(1, 1.5, 0.6);
    const eyeR = new THREE.Mesh(this.eyeGeo, this.eyeNormal);
    eyeR.position.set(0.17, SHADE_EYE_Y, 0.4);
    eyeR.scale.set(1, 1.5, 0.6);
    group.add(eyeL, eyeR);

    return { group, body, rim, eyeL, eyeR };
  }

  applyState(
    rig: ShadeRig,
    state: ShadeVisualState,
    colorblind: boolean,
    t: number,
    reduced: boolean,
    idx: number
  ): void {
    const stunned = state === "stunned";
    rig.body.material = stunned ? this.stunnedMat : state === "drain" ? (colorblind ? this.drainMatCB : this.drainMat) : this.bodyMat;
    rig.rim.material = stunned ? this.rimStunned : colorblind ? this.rimCB : this.rimNormal;
    const eyeMat = colorblind ? this.eyeCB : this.eyeNormal;
    rig.eyeL.material = eyeMat;
    rig.eyeR.material = eyeMat;

    const eyeScaleY = stunned ? 0.18 : state === "drain" ? 1.0 : state === "chase" ? 1.8 : 1.5;
    rig.eyeL.scale.set(1, eyeScaleY, 0.6);
    rig.eyeR.scale.set(1, eyeScaleY, 0.6);

    const g = rig.group;
    if (state === "spawning") g.scale.setScalar(0.65);
    else if (state === "drain" && !reduced) g.scale.set(1, 1 + Math.sin(t * 6 + idx) * 0.07, 1);
    else g.scale.setScalar(1);

    const bob = reduced ? 0 : Math.sin(t * 2.5 + idx * 1.7) * 0.05;
    rig.body.position.y = SHADE_BASE_Y + bob;
    rig.rim.position.y = SHADE_BASE_Y + bob;
    rig.eyeL.position.y = SHADE_EYE_Y + bob;
    rig.eyeR.position.y = SHADE_EYE_Y + bob;

    g.rotation.x = state === "chase" ? 0.16 : state === "recoil" ? -0.28 : 0;
    g.rotation.z = reduced ? 0 : state === "chase" ? Math.sin(t * 9 + idx) * 0.08 : Math.sin(t * 2 + idx) * 0.04;
  }
}

// ---------------------------------------------------------------------------
// ĐOM ĐÓM — lõi #FFF6C2, quầng #FFE58A, cánh mỏng vỗ nhanh
// ---------------------------------------------------------------------------
export function buildMoteRig(): THREE.Group {
  const g = new THREE.Group();
  const coreMat = mat("mote.core", () =>
    new THREE.MeshStandardMaterial({
      color: PALETTE.moteCore,
      emissive: PALETTE.moteCore,
      emissiveIntensity: 2.0,
      roughness: 0.2
    })
  );
  const body = add(g, geo("mote.body", () => new THREE.SphereGeometry(0.12, 10, 8)), coreMat);
  body.scale.set(1, 1, 1.5);
  const halo = add(
    g,
    geo("mote.halo", () => new THREE.SphereGeometry(0.42, 10, 10)),
    mat("mote.haloMat", () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.moteHalo,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
  );
  const wings = add(
    g,
    geo("mote.wings", () => {
      const wg = new THREE.BufferGeometry();
      const v = [
        0, 0.06, 0, -0.26, 0.2, 0.03, -0.2, 0.02, -0.12,
        0, 0.06, 0, -0.2, 0.02, -0.12, -0.1, 0.0, 0.12,
        0, 0.06, 0, 0.26, 0.2, 0.03, 0.2, 0.02, -0.12,
        0, 0.06, 0, 0.2, 0.02, -0.12, 0.1, 0.0, 0.12
      ];
      wg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(v), 3));
      return wg;
    }),
    mat("mote.wingMat", () =>
      new THREE.MeshBasicMaterial({
        color: 0xfffbe0,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    )
  );
  g.userData.halo = halo;
  g.userData.wings = wings;
  return g;
}

export function animateMoteRig(g: THREE.Group, t: number, idx: number, reduced: boolean): void {
  const halo = g.userData.halo as THREE.Mesh | undefined;
  const wings = g.userData.wings as THREE.Mesh | undefined;
  if (halo) halo.scale.setScalar(reduced ? 1 : 1 + Math.sin(t * 3 + idx) * 0.12);
  if (wings) wings.scale.x = reduced ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(t * 22 + idx));
}

// ---------------------------------------------------------------------------
// ĐÈN LỒNG LỚN — bệ đá, cột gỗ, lồng đèn giấy có gân tre, mái nhỏ, tua rua
// ---------------------------------------------------------------------------
export interface LanternStructure {
  staticGroup: THREE.Group;
  body: THREE.Group;
  orbMat: THREE.MeshStandardMaterial;
  tearGroup: THREE.Group;
}

export function buildLanternStructure(): LanternStructure {
  const stone = mat("lantern.stone", () => std(PALETTE.lanternOff, { roughness: 0.88 }));
  const wood = mat("lantern.wood", () => std(PALETTE.wood, { roughness: 0.85 }));
  const woodDark = mat("lantern.woodDark", () => std(0x4c331f, { roughness: 0.9 }));
  const gold = mat("lantern.gold", () => std(PALETTE.goldAccent, { roughness: 0.4, metalness: 0.35 }));
  const red = mat("lantern.red", () => std(PALETTE.playerScarf, { roughness: 0.6 }));

  const staticGroup = new THREE.Group();
  // Bệ đá 2 tầng
  const b1 = add(staticGroup, geo("lantern.base1", () => new THREE.CylinderGeometry(0.95, 1.05, 0.28, 8)), stone, 0, 0.14, 0);
  b1.castShadow = true;
  add(staticGroup, geo("lantern.base2", () => new THREE.CylinderGeometry(0.72, 0.84, 0.24, 8)), stone, 0, 0.4, 0);
  // Cột gỗ + 3 vòng khắc
  const post = add(staticGroup, geo("lantern.post", () => new THREE.CylinderGeometry(0.16, 0.21, 1.95, 10)), wood, 0, 1.47, 0);
  post.castShadow = true;
  for (const y of [0.9, 1.5, 2.1]) {
    const ring = add(staticGroup, geo("lantern.postRing", () => new THREE.TorusGeometry(0.19, 0.03, 6, 14)), woodDark, 0, y, 0);
    ring.rotation.x = Math.PI / 2;
  }
  // Đế đỡ lồng + 4 cột tre + mái + chóp
  add(staticGroup, geo("lantern.cradle", () => new THREE.CylinderGeometry(0.64, 0.5, 0.12, 8)), woodDark, 0, 2.5, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    add(
      staticGroup,
      geo("lantern.bamboo", () => new THREE.CylinderGeometry(0.022, 0.022, 1.05, 6)),
      wood,
      Math.cos(a) * 0.6,
      3.02,
      Math.sin(a) * 0.6
    );
  }
  const roof = add(staticGroup, geo("lantern.roof", () => new THREE.ConeGeometry(0.82, 0.34, 8)), woodDark, 0, 3.68, 0);
  roof.rotation.y = Math.PI / 8;
  const eaves = add(staticGroup, geo("lantern.eaves", () => new THREE.TorusGeometry(0.78, 0.022, 6, 24)), gold, 0, 3.53, 0);
  eaves.rotation.x = Math.PI / 2;
  add(staticGroup, geo("lantern.finial", () => new THREE.SphereGeometry(0.07, 8, 8)), gold, 0, 3.9, 0);

  // Thân đèn giấy (xoay + xẹp 20% khi tắt)
  const body = new THREE.Group();
  body.position.y = 3.0;
  const orbMat = new THREE.MeshStandardMaterial({
    color: PALETTE.lanternOff,
    emissive: PALETTE.lanternOff,
    emissiveIntensity: 0.35,
    roughness: 0.5,
    side: THREE.DoubleSide
  });
  const barrel = geo("lantern.barrel", () =>
    new THREE.LatheGeometry(
      smoothProfile(
        [
          [0.26, -0.5],
          [0.4, -0.38],
          [0.5, -0.18],
          [0.53, 0.0],
          [0.5, 0.18],
          [0.4, 0.38],
          [0.26, 0.5]
        ],
        18
      ),
      20
    )
  );
  add(body, barrel, orbMat);
  for (const [y, r] of [
    [0, 0.54],
    [0.27, 0.47],
    [-0.27, 0.47]
  ] as Array<[number, number]>) {
    const rib = add(body, geo(`lantern.rib.${r}`, () => new THREE.TorusGeometry(r, 0.014, 5, 24)), wood, 0, y, 0);
    rib.rotation.x = Math.PI / 2;
  }
  add(body, geo("lantern.capTop", () => new THREE.CylinderGeometry(0.27, 0.3, 0.06, 12)), gold, 0, 0.52, 0);
  add(body, geo("lantern.capBottom", () => new THREE.CylinderGeometry(0.3, 0.27, 0.06, 12)), gold, 0, -0.52, 0);
  add(body, geo("lantern.knob", () => new THREE.SphereGeometry(0.05, 8, 8)), gold, 0, 0.58, 0);
  add(body, geo("lantern.bead", () => new THREE.SphereGeometry(0.05, 8, 8)), red, 0, -0.62, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    add(
      body,
      geo("lantern.tassel", () => new THREE.CylinderGeometry(0.009, 0.004, 0.34, 5).translate(0, -0.17, 0)),
      red,
      Math.cos(a) * 0.05,
      -0.64,
      Math.sin(a) * 0.05
    );
  }

  // Vết rách giấy (dấu hiệu nhận biết đèn tắt không cần màu)
  const tearGroup = new THREE.Group();
  const tearMat = mat("lantern.tear", () => new THREE.MeshBasicMaterial({ color: 0x120a1a }));
  const tearGeo = geo("lantern.tearGeo", () => new THREE.BoxGeometry(0.12, 0.42, 0.07));
  [
    [0.6, 0.1, 0.3],
    [2.6, -0.12, -0.25],
    [4.4, 0.16, 0.2]
  ].forEach(([a, y, tilt]) => {
    const tear = add(tearGroup, tearGeo, tearMat, Math.sin(a) * 0.5, y, Math.cos(a) * 0.5);
    tear.rotation.y = a;
    tear.rotation.z = tilt;
  });
  body.add(tearGroup);

  return { staticGroup, body, orbMat, tearGroup };
}

// ---------------------------------------------------------------------------
// GIÓ LẠC — dải lụa xám xanh #8FA3B8 uốn lượn, đầu linh phong có mắt & cánh gió
// ---------------------------------------------------------------------------
export interface DrifterRig {
  group: THREE.Group;
  head: THREE.Group;
  swirl: THREE.Mesh;
  innerSwirl: THREE.Mesh;
  segs: THREE.Mesh[];
}

const DRIFTER_SEGMENTS = 9;

export function buildDrifterRig(): DrifterRig {
  const silk = mat("drifter.silk", () =>
    new THREE.MeshStandardMaterial({
      color: PALETTE.drifter,
      emissive: PALETTE.drifter,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
      roughness: 0.35
    })
  );
  const crestMat = mat("drifter.crest", () =>
    new THREE.MeshBasicMaterial({
      color: 0xd9f2ff,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide
    })
  );
  const eyeMat = mat("drifter.eye", () => new THREE.MeshBasicMaterial({ color: 0xe6f8ff }));

  const group = new THREE.Group();
  const head = new THREE.Group();
  head.position.set(0, 1.4, 0.6);
  group.add(head);

  const core = add(head, geo("drifter.core", () => new THREE.OctahedronGeometry(0.28, 1)), silk);
  core.scale.set(0.9, 0.8, 1.35);
  add(head, geo("drifter.tip", () => new THREE.ConeGeometry(0.18, 0.56, 6).rotateX(Math.PI / 2).translate(0, 0, 0.44)), silk);

  // Glowing wind-spirit eyes & swept wind-crest wings
  for (const sx of [-1, 1]) {
    const eye = add(head, geo("drifter.eyeGeo", () => new THREE.SphereGeometry(0.055, 6, 6)), eyeMat, sx * 0.14, 0.05, 0.24);
    eye.scale.set(1.25, 0.65, 0.6);
    eye.rotation.z = sx * 0.28;
    const fin = add(
      head,
      geo("drifter.fin", () => new THREE.ConeGeometry(0.14, 0.68, 4).rotateX(-Math.PI / 2)),
      crestMat,
      sx * 0.28,
      0.06,
      -0.12
    );
    fin.rotation.y = sx * -0.45;
    fin.rotation.z = sx * -0.35;
  }

  const swirl = add(head, geo("drifter.swirl", () => new THREE.TorusGeometry(0.42, 0.032, 6, 24)), silk);
  const innerSwirl = add(head, geo("drifter.innerSwirl", () => new THREE.TorusGeometry(0.27, 0.02, 6, 18)), crestMat);

  const segGeo = geo("drifter.seg", () => new THREE.PlaneGeometry(0.64, 0.36).rotateX(-Math.PI / 2));
  const segs: THREE.Mesh[] = [];
  for (let i = 0; i < DRIFTER_SEGMENTS; i++) {
    const seg = add(group, segGeo, silk, 0, 1.4, 0.25 - i * 0.3);
    segs.push(seg);
  }
  return { group, head, swirl, innerSwirl, segs };
}

export function animateDrifterRig(rig: DrifterRig, t: number, reduced: boolean): void {
  const wave = reduced ? 0.4 : 1;
  rig.swirl.rotation.z = reduced ? 0 : t * 6;
  rig.innerSwirl.rotation.z = reduced ? 0 : -t * 8.5;
  rig.head.position.y = 1.4 + (reduced ? 0 : Math.sin(t * 5) * 0.06);
  for (let i = 0; i < rig.segs.length; i++) {
    const seg = rig.segs[i];
    const amp = (0.06 + i * 0.048) * wave;
    seg.position.x = Math.sin(t * 7 - i * 0.8) * amp;
    seg.position.y = 1.4 + Math.cos(t * 6 - i * 0.7) * amp * 0.6;
    seg.rotation.z = Math.cos(t * 7 - i * 0.8) * 0.35 * wave;
    seg.scale.x = 1 - i * 0.085;
  }
}

// ---------------------------------------------------------------------------
// BÙA GIÓ — lá bùa đỏ #C8102E viền vàng #F2C14E, có xoáy gió, dây treo, tua rua
// ---------------------------------------------------------------------------
export interface CharmRig {
  group: THREE.Group;
  tassels: THREE.Mesh[];
  glow: THREE.Mesh;
}

export function buildCharmRig(): CharmRig {
  const paper = mat("charm.paper", () =>
    new THREE.MeshStandardMaterial({
      color: PALETTE.playerScarf,
      emissive: PALETTE.playerScarf,
      emissiveIntensity: 0.6,
      roughness: 0.6
    })
  );
  const goldBasic = mat("charm.gold", () => new THREE.MeshBasicMaterial({ color: PALETTE.goldAccent }));
  const group = new THREE.Group();
  add(group, geo("charm.talisman", () => new THREE.BoxGeometry(0.46, 0.86, 0.06)), paper, 0, 1.05, 0);
  add(group, geo("charm.border", () => new THREE.BoxGeometry(0.56, 0.96, 0.04)), goldBasic, 0, 1.05, 0);
  for (const side of [1, -1]) {
    const arc1 = add(group, geo("charm.arc1", () => new THREE.TorusGeometry(0.11, 0.016, 6, 16, Math.PI * 1.5)), goldBasic, 0, 1.08, side * 0.04);
    arc1.rotation.y = side === 1 ? 0 : Math.PI;
    const arc2 = add(group, geo("charm.arc2", () => new THREE.TorusGeometry(0.055, 0.014, 6, 12, Math.PI * 1.5)), goldBasic, 0.03, 1.08, side * 0.04);
    arc2.rotation.y = side === 1 ? 0 : Math.PI;
    arc2.rotation.z = Math.PI;
  }
  const loop = add(group, geo("charm.loop", () => new THREE.TorusGeometry(0.07, 0.01, 6, 12)), goldBasic, 0, 1.55, 0);
  loop.rotation.y = Math.PI / 2;
  const tassels: THREE.Mesh[] = [];
  for (const x of [-0.12, 0, 0.12]) {
    const tassel = add(
      group,
      geo("charm.tassel", () => new THREE.CylinderGeometry(0.012, 0.006, 0.3, 5).translate(0, -0.15, 0)),
      x === 0 ? goldBasic : paper,
      x,
      0.58,
      0
    );
    tassels.push(tassel);
  }
  const glow = add(
    group,
    geo("charm.glow", () => new THREE.RingGeometry(0.5, 0.62, 28).rotateX(-Math.PI / 2)),
    mat("charm.glowMat", () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.goldAccent,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    ),
    0,
    0.08,
    0
  );
  return { group, tassels, glow };
}

export function animateCharmRig(rig: CharmRig, t: number, reduced: boolean): void {
  rig.tassels.forEach((tassel, i) => {
    tassel.rotation.z = reduced ? 0 : Math.sin(t * 4 + i * 0.9) * 0.22;
  });
  rig.glow.scale.setScalar(reduced ? 1 : 1 + Math.sin(t * 3) * 0.1);
}

// ---------------------------------------------------------------------------
// BỤC NHẢY — đĩa vàng, vòng sáng, mũi tên chỉ hướng phóng
// ---------------------------------------------------------------------------
export interface JumpPadRig {
  group: THREE.Group;
  pulse: THREE.Mesh;
}

export function buildJumpPadRig(radius: number, velXZ: [number, number]): JumpPadRig {
  const padMat = mat("pad.disc", () =>
    new THREE.MeshStandardMaterial({
      color: PALETTE.goldAccent,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 0.9,
      roughness: 0.35
    })
  );
  const glowMat = mat("pad.glow", () =>
    new THREE.MeshStandardMaterial({
      color: PALETTE.lanternCore,
      emissive: PALETTE.lanternCore,
      emissiveIntensity: 1.2,
      roughness: 0.3
    })
  );
  const group = new THREE.Group();
  add(group, new THREE.CylinderGeometry(radius, radius * 1.1, 0.25, 24), padMat);
  const rimRing = add(group, new THREE.TorusGeometry(radius * 1.02, 0.06, 6, 28), glowMat, 0, 0.12, 0);
  rimRing.rotation.x = Math.PI / 2;

  const arrows = new THREE.Group();
  arrows.rotation.y = Math.atan2(velXZ[0], velXZ[1]);
  const coneGeo = geo("pad.chevron", () => new THREE.ConeGeometry(0.16, 0.32, 3).rotateX(Math.PI / 2));
  for (const z of [-0.38, 0, 0.38]) {
    add(arrows, coneGeo, glowMat, 0, 0.18, z);
  }
  group.add(arrows);

  const pulse = add(
    group,
    new THREE.RingGeometry(radius * 0.95, radius * 1.1, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: PALETTE.goldAccent,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }),
    0,
    0.2,
    0
  );
  return { group, pulse };
}

// ---------------------------------------------------------------------------
// THÁP CHUÔNG (Đêm 3) — chân tháp ≤ 2.0 m (khớp vùng va chạm lõi), gác chuông mở
// ---------------------------------------------------------------------------
export function buildBellTower(): THREE.Group {
  const wood = mat("tower.wood", () => std(PALETTE.wood, { roughness: 0.85 }));
  const woodDark = mat("tower.woodDark", () => std(0x4c331f, { roughness: 0.9 }));
  const sand = mat("tower.sand", () => std(PALETTE.sand, { roughness: 0.88 }));
  const goldMat = mat("tower.gold", () =>
    new THREE.MeshStandardMaterial({
      color: PALETTE.goldAccent,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 0.45,
      metalness: 0.5,
      roughness: 0.3
    })
  );
  const windowMat = mat("tower.window", () => new THREE.MeshBasicMaterial({ color: PALETTE.lanternLit }));

  const g = new THREE.Group();
  // Chân đế + thân tháp
  add(g, new THREE.CylinderGeometry(1.95, 2.0, 0.5, 20), sand, 0, 6.25, 0);
  const shaft = add(g, new THREE.CylinderGeometry(1.7, 1.9, 5.0, 20), wood, 0, 8.75, 0);
  shaft.castShadow = true;
  for (const y of [7.4, 9.1, 10.7]) {
    const band = add(g, new THREE.TorusGeometry(1.82, 0.08, 6, 28), sand, 0, y, 0);
    band.rotation.x = Math.PI / 2;
  }
  // 4 ô cửa sổ phát sáng ấm
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const win = add(g, new THREE.BoxGeometry(0.5, 1.1, 0.12), windowMat, Math.sin(a) * 1.78, 9.1, Math.cos(a) * 1.78);
    win.rotation.y = a;
  }
  // Gác chuông mở: sàn, 4 cột, xà ngang, quả chuông + dùi
  add(g, new THREE.CylinderGeometry(1.95, 1.95, 0.22, 20), woodDark, 0, 11.35, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    add(g, new THREE.CylinderGeometry(0.16, 0.18, 2.5, 8), wood, Math.cos(a) * 1.6, 12.6, Math.sin(a) * 1.6);
  }
  add(g, new THREE.BoxGeometry(3.6, 0.2, 0.22), woodDark, 0, 13.75, 0);
  const bellGeo = new THREE.LatheGeometry(
    smoothProfile(
      [
        [0.18, 0.55],
        [0.28, 0.45],
        [0.4, 0.2],
        [0.62, -0.25],
        [0.7, -0.5]
      ],
      14
    ),
    22
  );
  const bell = add(g, bellGeo, goldMat, 0, 12.55, 0);
  bell.material = goldMat;
  (bell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  add(g, new THREE.SphereGeometry(0.12, 8, 8), woodDark, 0, 12.0, 0);
  add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), woodDark, 0, 13.45, 0);
  // Mái nón
  const roof = add(g, new THREE.ConeGeometry(3.2, 2.4, 12), sand, 0, 15.1, 0);
  roof.castShadow = true;
  const eaves = add(g, new THREE.TorusGeometry(3.1, 0.07, 6, 32), goldMat, 0, 13.95, 0);
  eaves.rotation.x = Math.PI / 2;
  add(g, new THREE.SphereGeometry(0.16, 8, 8), goldMat, 0, 16.4, 0);
  return g;
}
