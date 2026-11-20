import * as THREE from "three";
import { getNightMap } from "../core/maps.js";
import { distXZ } from "../core/math.js";
import { SeededRng } from "../core/rng.js";
import type { NightNumber, Vec3 } from "../core/types.js";

/**
 * Builds a single BufferGeometry containing a lush 5-blade arched grass tuft
 * (roots anchored at y = 0, tips gracefully curved outward up to y ~ 0.56 m).
 */
function buildGrassTuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];

  const bladeConfigs = [
    { angle: 0.0, height: 0.54, width: 0.068, lean: 0.22, offsetR: 0.04 },
    { angle: 1.28, height: 0.44, width: 0.06, lean: 0.25, offsetR: 0.06 },
    { angle: 2.52, height: 0.5, width: 0.065, lean: 0.2, offsetR: 0.05 },
    { angle: 3.78, height: 0.38, width: 0.056, lean: 0.26, offsetR: 0.07 },
    { angle: 5.05, height: 0.47, width: 0.062, lean: 0.23, offsetR: 0.05 }
  ];

  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
  ): void => {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  };

  for (const b of bladeConfigs) {
    const ca = Math.cos(b.angle);
    const sa = Math.sin(b.angle);
    // Tangent perpendicular to radial direction
    const tx = -sa;
    const tz = ca;

    const ox = ca * b.offsetR;
    const oz = sa * b.offsetR;
    const hw0 = b.width * 0.5;
    const hw1 = b.width * 0.34;

    const y1 = b.height * 0.48;
    const r1 = b.lean * 0.35;
    const y2 = b.height;
    const r2 = b.lean;

    const p0L: [number, number, number] = [ox - tx * hw0, 0, oz - tz * hw0];
    const p0R: [number, number, number] = [ox + tx * hw0, 0, oz + tz * hw0];
    const p1L: [number, number, number] = [ox + ca * r1 - tx * hw1, y1, oz + sa * r1 - tz * hw1];
    const p1R: [number, number, number] = [ox + ca * r1 + tx * hw1, y1, oz + sa * r1 + tz * hw1];
    const pTip: [number, number, number] = [ox + ca * r2, y2, oz + sa * r2];

    // Lower quad (2 triangles) + upper tip triangle
    pushTri(...p0L, ...p0R, ...p1R);
    pushTri(...p0L, ...p1R, ...p1L);
    pushTri(...p1L, ...p1R, ...pTip);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}

/**
 * Procedural nature decorations: 4 detailed tree species (Banyan/Broadleaf canopy trees,
 * layered scalloped pines, curved areca palms with betel clusters, bamboo groves),
 * dense wind-swaying instanced meadow grass, ferns, multi-petal glowing wildflowers,
 * stones, and shimmering puddles with lotus pads.
 *
 * Strictly visual-only (zero core collisions) and automatically hidden in benchmark/headless modes.
 */
export class IslandDecor {
  readonly group = new THREE.Group();
  private readonly ripples: THREE.Mesh[] = [];
  private readonly swayNodes: Array<{ obj: THREE.Object3D; phase: number; amp: number }> = [];
  private readonly windUniform = { value: 0 };
  private animTime = 0;

  // Shared geometries for minimal draw & memory overhead
  private readonly grassTuftGeo = buildGrassTuftGeometry();
  private readonly rootGeo = new THREE.CylinderGeometry(0.11, 0.22, 0.7, 6);
  private readonly pineTrunkGeo = new THREE.CylinderGeometry(0.14, 0.28, 2.5, 8);
  private readonly banyanTrunkLowerGeo = new THREE.CylinderGeometry(0.24, 0.4, 1.85, 8);
  private readonly banyanTrunkUpperGeo = new THREE.CylinderGeometry(0.16, 0.25, 1.5, 8);
  private readonly banyanBranchGeo = new THREE.CylinderGeometry(0.08, 0.15, 1.65, 7);
  private readonly vineGeo = new THREE.CylinderGeometry(0.016, 0.01, 1.6, 4);
  private readonly foliagePuffGeo = new THREE.IcosahedronGeometry(0.95, 1);
  private readonly pineBoughGeo = new THREE.ConeGeometry(0.95, 1.25, 7);
  private readonly pineSpireGeo = new THREE.ConeGeometry(0.75, 1.35, 7);
  private readonly palmSegGeo = new THREE.CylinderGeometry(0.15, 0.18, 1.15, 8);
  private readonly palmRingGeo = new THREE.TorusGeometry(0.175, 0.02, 5, 10);
  private readonly palmCrownShaftGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.65, 8);
  private readonly palmFrondInnerGeo = new THREE.BoxGeometry(0.14, 0.04, 1.35);
  private readonly palmFrondBladeGeo = new THREE.ConeGeometry(0.46, 2.05, 5);
  private readonly betelFruitGeo = new THREE.SphereGeometry(0.1, 6, 5);
  private readonly bambooCulmGeo = new THREE.CylinderGeometry(0.055, 0.072, 1.0, 6);
  private readonly bambooNodeGeo = new THREE.TorusGeometry(0.068, 0.012, 4, 8);
  private readonly bambooLeafGeo = new THREE.ConeGeometry(0.16, 0.72, 4);
  private readonly fernFrondGeo = new THREE.ConeGeometry(0.18, 0.88, 4);
  private readonly bushGeo = new THREE.IcosahedronGeometry(0.54, 1);
  private readonly rockGeo = new THREE.DodecahedronGeometry(0.45, 0);
  private readonly stemGeo = new THREE.CylinderGeometry(0.024, 0.034, 0.46, 5);
  private readonly petalGeo = new THREE.SphereGeometry(0.088, 6, 5);
  private readonly pistilGeo = new THREE.SphereGeometry(0.062, 6, 5);
  private readonly puddleGeo = new THREE.CircleGeometry(1, 24);
  private readonly rippleGeo = new THREE.RingGeometry(0.72, 0.8, 24);
  private readonly lilyPadGeo = new THREE.CircleGeometry(0.32, 12, 0, Math.PI * 1.82);

  // Materials aligned with the standard island palette (#2F5D50, #6B4A2F, #C9B48A, #F2C14E)
  private readonly woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
  private readonly woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x4d3420, roughness: 0.94 });
  private readonly bambooMat = new THREE.MeshStandardMaterial({ color: 0x3b7258, roughness: 0.75 });
  private readonly bambooNodeMat = new THREE.MeshStandardMaterial({ color: 0x244c3a, roughness: 0.85 });
  private readonly leafDeepMat = new THREE.MeshStandardMaterial({ color: 0x1b3f36, roughness: 0.88 });
  private readonly leafDarkMat = new THREE.MeshStandardMaterial({ color: 0x245044, roughness: 0.86 });
  private readonly leafMidMat = new THREE.MeshStandardMaterial({ color: 0x2f5d50, roughness: 0.84 });
  private readonly leafBrightMat = new THREE.MeshStandardMaterial({ color: 0x3f7b65, roughness: 0.8 });
  private readonly leafTipMat = new THREE.MeshStandardMaterial({ color: 0x528f73, roughness: 0.78 });
  private readonly rockMat = new THREE.MeshStandardMaterial({ color: 0x5b5f6e, roughness: 0.9 });
  private readonly flowerGoldMat = new THREE.MeshStandardMaterial({
    color: 0xffe58a,
    emissive: 0xffb347,
    emissiveIntensity: 0.7,
    roughness: 0.35
  });
  private readonly flowerCreamMat = new THREE.MeshStandardMaterial({
    color: 0xfff6c2,
    emissive: 0xffe9b0,
    emissiveIntensity: 0.58,
    roughness: 0.35
  });
  private readonly pistilMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
  private readonly waterMat = new THREE.MeshStandardMaterial({
    color: 0x1e607a,
    emissive: 0x12384a,
    emissiveIntensity: 0.45,
    roughness: 0.14,
    metalness: 0.55,
    transparent: true,
    opacity: 0.86
  });
  private readonly rippleMat = new THREE.MeshBasicMaterial({
    color: 0x9bd6e8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35
  });

  private readonly grassBaseMat: THREE.MeshStandardMaterial;
  private readonly grassBrightMat: THREE.MeshStandardMaterial;

  constructor() {
    this.grassBaseMat = this.makeWindGrassMaterial(0x2c6352, 0x183c32);
    this.grassBrightMat = this.makeWindGrassMaterial(0x4b9176, 0x245946);
  }

  private makeWindGrassMaterial(color: number, emissive: number): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: 0.22,
      roughness: 0.86,
      side: THREE.DoubleSide
    });
    const windUniform = this.windUniform;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = windUniform;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uWindTime;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float wPhase = instanceMatrix[3][0] * 0.28 + instanceMatrix[3][2] * 0.28;
          #else
            float wPhase = 0.0;
          #endif
          float wBend = position.y * position.y;
          transformed.x += sin(uWindTime * 2.1 + wPhase) * 0.24 * wBend;
          transformed.z += cos(uWindTime * 1.65 + wPhase * 1.3) * 0.16 * wBend;`
        );
    };
    return mat;
  }

  buildForNight(night: NightNumber): void {
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    this.ripples.length = 0;
    this.swayNodes.length = 0;

    const mapDef = getNightMap(night);
    const rng = new SeededRng(night * 7919 + 1337);

    // Keep trees/puddles clear of lanterns, jump pads, charms, and spawn
    const avoidTrees: Array<{ pos: Vec3; clearance: number }> = [
      { pos: mapDef.spawnPos, clearance: 5.2 },
      ...mapDef.lanterns.map((l) => ({ pos: l.pos, clearance: 4.1 })),
      ...mapDef.jumpPads.map((p) => ({ pos: p.pos, clearance: 3.8 })),
      ...mapDef.charms.map((c) => ({ pos: c.pos, clearance: 3.2 }))
    ];

    // Tighter clearance for grass so meadow lushly borders paths & pedestals without clipping them
    const avoidGrass: Array<{ pos: Vec3; clearance: number }> = [
      { pos: mapDef.spawnPos, clearance: 2.8 },
      ...mapDef.lanterns.map((l) => ({ pos: l.pos, clearance: 1.75 })),
      ...mapDef.jumpPads.map((p) => ({ pos: p.pos, clearance: 1.85 })),
      ...mapDef.charms.map((c) => ({ pos: c.pos, clearance: 1.1 }))
    ];

    const puddlesPlaced: Array<{ x: number; z: number; rx: number; rz: number }> = [];
    const treePositions: Array<{ x: number; z: number }> = [];

    const isCorridorBlocked = (x: number, z: number, margin: number): boolean => {
      // Keep Night 1 south pier / Ông Lái Đò approach clear
      if (night === 1 && Math.abs(x) < 4.5 + margin && z < -30 + margin) return true;
      // Keep Night 2 bridge entrance clear
      if (night === 2 && x >= 22 - margin && x <= 48 + margin && Math.abs(z) <= 4.2 + margin) return true;
      // Keep Night 3 ramps & central elevated tiers clear for ground decor
      if (night === 3) {
        const r = Math.hypot(x, z);
        if (r < 25.5 + margin) return true;
        for (const deg of [30, 150]) {
          const rad = (deg * Math.PI) / 180;
          const s = x * Math.cos(rad) + z * Math.sin(rad);
          const w = Math.abs(-x * Math.sin(rad) + z * Math.cos(rad));
          if (s >= 22 - margin && s <= 33 + margin && w <= 3.6 + margin) return true;
        }
      }
      return false;
    };

    const isClearForTree = (x: number, z: number, extraR = 0): boolean => {
      if (isCorridorBlocked(x, z, extraR)) return false;
      const pt: Vec3 = [x, 0, z];
      for (const a of avoidTrees) {
        if (distXZ(pt, a.pos) < a.clearance + extraR) return false;
      }
      return true;
    };

    const isClearForGrass = (x: number, z: number): boolean => {
      if (isCorridorBlocked(x, z, 0)) return false;
      const pt: Vec3 = [x, 0, z];
      for (const a of avoidGrass) {
        if (distXZ(pt, a.pos) < a.clearance) return false;
      }
      for (const p of puddlesPlaced) {
        const dx = (x - p.x) / (p.rx + 0.35);
        const dz = (z - p.z) / (p.rz + 0.35);
        if (dx * dx + dz * dz < 1.0) return false;
      }
      return true;
    };

    // 1. Lush Banyan / Broadleaf Lantern Tree (curved trunk, spreading boughs, multi-puff canopy, hanging vines)
    const addBanyanTree = (x: number, z: number, scale: number, phase: number): void => {
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      tree.rotation.y = rng.range(0, Math.PI * 2);
      tree.scale.setScalar(scale);

      // Flared buttress roots gripping the soil
      for (let r = 0; r < 4; r++) {
        const ra = (r / 4) * Math.PI * 2 + rng.range(-0.25, 0.25);
        const root = new THREE.Mesh(this.rootGeo, this.woodDarkMat);
        root.position.set(Math.cos(ra) * 0.26, 0.26, Math.sin(ra) * 0.26);
        root.rotation.order = "YXZ";
        root.rotation.y = -ra;
        root.rotation.z = -0.62;
        tree.add(root);
      }

      // Gently curving 2-segment gnarled trunk
      const lowerTrunk = new THREE.Mesh(this.banyanTrunkLowerGeo, this.woodMat);
      lowerTrunk.position.set(0, 0.9, 0);
      lowerTrunk.rotation.z = 0.08;
      tree.add(lowerTrunk);

      const upperTrunk = new THREE.Mesh(this.banyanTrunkUpperGeo, this.woodMat);
      upperTrunk.position.set(-0.1, 2.35, 0.04);
      upperTrunk.rotation.z = -0.07;
      tree.add(upperTrunk);

      // Spreading boughs
      const branchAngles = [0.2, 2.25, 4.35];
      for (let b = 0; b < branchAngles.length; b++) {
        const ba = branchAngles[b];
        const branch = new THREE.Mesh(this.banyanBranchGeo, this.woodDarkMat);
        branch.position.set(Math.cos(ba) * 0.58 - 0.05, 3.05, Math.sin(ba) * 0.58);
        branch.rotation.order = "YXZ";
        branch.rotation.y = -ba;
        branch.rotation.z = -0.78;
        tree.add(branch);
      }

      // Organic cloud-like layered foliage canopy
      const canopy = new THREE.Group();
      canopy.position.set(-0.05, 3.65, 0);

      const puffs: Array<[number, number, number, number, number, number, THREE.Material]> = [
        [0, 0.65, 0, 1.45, 0.95, 1.45, this.leafMidMat],
        [0, 1.18, 0, 1.05, 0.72, 1.05, this.leafBrightMat],
        [1.15, 0.15, 0.35, 1.15, 0.78, 1.05, this.leafDarkMat],
        [-1.12, 0.2, 0.45, 1.1, 0.76, 1.08, this.leafMidMat],
        [0.15, 0.18, -1.15, 1.18, 0.8, 1.05, this.leafDarkMat],
        [-0.35, 0.35, 1.05, 1.05, 0.75, 1.02, this.leafBrightMat],
        [0.82, 0.72, -0.68, 0.92, 0.68, 0.92, this.leafBrightMat],
        [-0.82, 0.75, -0.58, 0.88, 0.66, 0.88, this.leafTipMat],
        [0.72, 0.62, 0.78, 0.85, 0.64, 0.85, this.leafTipMat],
        [-0.1, -0.1, -0.1, 1.35, 0.6, 1.35, this.leafDeepMat]
      ];
      for (const [px, py, pz, sx, sy, sz, mat] of puffs) {
        const puff = new THREE.Mesh(this.foliagePuffGeo, mat);
        puff.position.set(px, py, pz);
        puff.scale.set(sx, sy, sz);
        puff.rotation.set(px * 0.4, pz * 0.5, py * 0.3);
        canopy.add(puff);
      }

      // Delicate hanging aerial roots / vines + 2 subtle glowing firefly blossoms
      for (let v = 0; v < 4; v++) {
        const va = (v / 4) * Math.PI * 2 + 0.5;
        const vr = 1.05 + (v % 2) * 0.3;
        const vine = new THREE.Mesh(this.vineGeo, this.woodDarkMat);
        vine.position.set(Math.cos(va) * vr, -0.85, Math.sin(va) * vr);
        canopy.add(vine);
        if (v < 2) {
          const bud = new THREE.Mesh(this.pistilGeo, this.flowerGoldMat);
          bud.position.set(Math.cos(va) * vr, -1.55, Math.sin(va) * vr);
          canopy.add(bud);
        }
      }

      tree.add(canopy);
      this.swayNodes.push({ obj: canopy, phase, amp: 0.028 });
      this.group.add(tree);
    };

    // 2. Layered Organic Coastal Pine (multi-lobed scalloped pine boughs instead of bare cones)
    const addPineTree = (x: number, z: number, scale: number, phase: number): void => {
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      tree.rotation.y = rng.range(0, Math.PI * 2);
      tree.scale.setScalar(scale);

      for (let r = 0; r < 3; r++) {
        const ra = (r / 3) * Math.PI * 2;
        const root = new THREE.Mesh(this.rootGeo, this.woodDarkMat);
        root.scale.set(0.8, 0.75, 0.8);
        root.position.set(Math.cos(ra) * 0.18, 0.2, Math.sin(ra) * 0.18);
        root.rotation.order = "YXZ";
        root.rotation.y = -ra;
        root.rotation.z = -0.58;
        tree.add(root);
      }

      const trunk = new THREE.Mesh(this.pineTrunkGeo, this.woodMat);
      trunk.position.y = 1.25;
      trunk.rotation.z = rng.range(-0.04, 0.04);
      tree.add(trunk);

      const canopy = new THREE.Group();
      const tiers: Array<{ y: number; r: number; scale: number; lobes: number; mat: THREE.Material }> = [
        { y: 2.05, r: 0.72, scale: 1.08, lobes: 5, mat: this.leafDeepMat },
        { y: 3.05, r: 0.56, scale: 0.9, lobes: 5, mat: this.leafDarkMat },
        { y: 3.95, r: 0.38, scale: 0.74, lobes: 4, mat: this.leafMidMat },
        { y: 4.7, r: 0.2, scale: 0.56, lobes: 3, mat: this.leafBrightMat }
      ];

      for (let ti = 0; ti < tiers.length; ti++) {
        const tier = tiers[ti];
        const center = new THREE.Mesh(this.pineSpireGeo, tier.mat);
        center.position.y = tier.y + 0.18;
        center.scale.set(tier.scale * 1.15, tier.scale, tier.scale * 1.15);
        canopy.add(center);

        for (let l = 0; l < tier.lobes; l++) {
          const la = (l / tier.lobes) * Math.PI * 2 + ti * 0.65;
          const bough = new THREE.Mesh(this.pineBoughGeo, tier.mat);
          bough.position.set(Math.cos(la) * tier.r, tier.y, Math.sin(la) * tier.r);
          bough.scale.set(tier.scale * 0.92, tier.scale * 0.72, tier.scale * 0.92);
          bough.rotation.order = "YXZ";
          bough.rotation.y = -la;
          bough.rotation.z = -0.26;
          canopy.add(bough);
        }
      }

      const topSpire = new THREE.Mesh(this.pineSpireGeo, this.leafTipMat);
      topSpire.position.y = 5.38;
      topSpire.scale.set(0.55, 0.78, 0.55);
      canopy.add(topSpire);

      tree.add(canopy);
      this.swayNodes.push({ obj: canopy, phase, amp: 0.032 });
      this.group.add(tree);
    };

    // 3. Graceful Curved Areca / Island Palm (curving ringed trunk, green crownshaft, betel cluster, arching fronds)
    const addArecaPalm = (x: number, z: number, scale: number, phase: number): void => {
      const palm = new THREE.Group();
      palm.position.set(x, 0, z);
      palm.rotation.y = rng.range(0, Math.PI * 2);
      palm.scale.setScalar(scale);

      const leanStep = rng.range(0.06, 0.11);
      let cx = 0;
      let cy = 0;
      for (let s = 0; s < 4; s++) {
        const segTilt = leanStep * (s + 0.5);
        const segScale = 1 - s * 0.09;
        const seg = new THREE.Mesh(this.palmSegGeo, this.woodMat);
        seg.scale.set(segScale, 1, segScale);
        seg.position.set(cx + Math.sin(segTilt) * 0.54, cy + Math.cos(segTilt) * 0.54, 0);
        seg.rotation.z = -segTilt;
        palm.add(seg);

        const ring = new THREE.Mesh(this.palmRingGeo, this.woodDarkMat);
        ring.rotation.x = Math.PI / 2;
        ring.rotation.y = -segTilt;
        ring.scale.set(segScale, segScale, 1);
        ring.position.set(cx + Math.sin(segTilt) * 0.85, cy + Math.cos(segTilt) * 0.85, 0);
        palm.add(ring);

        cx += Math.sin(segTilt) * 1.06;
        cy += Math.cos(segTilt) * 1.06;
      }

      // Smooth green crownshaft (bẹ cau)
      const shaft = new THREE.Mesh(this.palmCrownShaftGeo, this.bambooMat);
      shaft.position.set(cx + 0.05, cy + 0.28, 0);
      shaft.rotation.z = -leanStep * 3.8;
      palm.add(shaft);

      const crown = new THREE.Group();
      crown.position.set(cx + 0.12, cy + 0.55, 0);

      // Betel/Areca nut clusters (buồng cau)
      for (let b = 0; b < 5; b++) {
        const ba = (b / 5) * Math.PI * 2 + 0.3;
        const fruit = new THREE.Mesh(this.betelFruitGeo, this.flowerGoldMat);
        fruit.position.set(Math.cos(ba) * 0.22, -0.32 - (b % 2) * 0.12, Math.sin(ba) * 0.22);
        crown.add(fruit);
      }

      // 8 arched two-stage palm fronds (ascending base + gracefully drooping tip)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + (i % 2) * 0.15;
        const frondGroup = new THREE.Group();
        frondGroup.rotation.y = a;

        const mat = i % 2 === 0 ? this.leafBrightMat : this.leafTipMat;
        const inner = new THREE.Mesh(this.palmFrondInnerGeo, this.bambooMat);
        inner.position.set(0, 0.22, 0.62);
        inner.rotation.x = -0.34;
        frondGroup.add(inner);

        const blade = new THREE.Mesh(this.palmFrondBladeGeo, mat);
        blade.position.set(0, -0.02, 1.88);
        blade.rotation.x = 1.98;
        blade.scale.set(1.05, 1.05, 0.28);
        frondGroup.add(blade);

        crown.add(frondGroup);
      }

      palm.add(crown);
      this.swayNodes.push({ obj: crown, phase, amp: 0.05 });
      this.group.add(palm);
    };

    // 4. Bamboo Grove (4-5 slender segmented culms with airy leaf sprays)
    const addBambooGrove = (x: number, z: number, scale: number, phase: number): void => {
      const grove = new THREE.Group();
      grove.position.set(x, 0, z);
      grove.rotation.y = rng.range(0, Math.PI * 2);
      grove.scale.setScalar(scale);

      const culmCount = 4 + (rng.next() > 0.5 ? 1 : 0);
      for (let c = 0; c < culmCount; c++) {
        const ca = (c / culmCount) * Math.PI * 2 + rng.range(-0.25, 0.25);
        const cr = c === 0 ? 0.06 : rng.range(0.24, 0.48);
        const height = rng.range(3.0, 4.6);

        const stalk = new THREE.Group();
        stalk.position.set(Math.cos(ca) * cr, 0, Math.sin(ca) * cr);
        stalk.rotation.z = (c % 2 === 0 ? 1 : -1) * rng.range(0.05, 0.12);
        stalk.rotation.x = rng.range(-0.08, 0.08);

        const pole = new THREE.Mesh(this.bambooCulmGeo, this.bambooMat);
        pole.scale.set(1, height, 1);
        pole.position.y = height * 0.5;
        stalk.add(pole);

        const nodes = Math.floor(height * 1.4);
        for (let n = 1; n < nodes; n++) {
          const ny = (n / nodes) * height;
          const node = new THREE.Mesh(this.bambooNodeGeo, this.bambooNodeMat);
          node.rotation.x = Math.PI / 2;
          node.position.y = ny;
          stalk.add(node);

          // Airy bamboo leaf clusters near top nodes
          if (ny > height * 0.58) {
            for (let l = 0; l < 3; l++) {
              const la = (l / 3) * Math.PI * 2 + n * 1.3;
              const leaf = new THREE.Mesh(this.bambooLeafGeo, l % 2 === 0 ? this.leafBrightMat : this.leafTipMat);
              leaf.position.set(Math.cos(la) * 0.28, ny + 0.08, Math.sin(la) * 0.28);
              leaf.rotation.order = "YXZ";
              leaf.rotation.y = -la;
              leaf.rotation.z = -1.05;
              leaf.scale.set(0.85, 0.9, 0.25);
              stalk.add(leaf);
            }
          }
        }

        grove.add(stalk);
        this.swayNodes.push({ obj: stalk, phase: phase + c * 0.7, amp: 0.045 });
      }

      this.group.add(grove);
    };

    // Lush flowering bush + radiating ferns
    const addFlowerFernCluster = (x: number, z: number, phase: number): void => {
      const cluster = new THREE.Group();
      cluster.position.set(x, 0, z);

      const bush = new THREE.Mesh(this.bushGeo, this.leafDarkMat);
      bush.scale.set(1.15, 0.52, 1.15);
      bush.position.y = 0.2;
      cluster.add(bush);

      // Radiating fern fronds
      for (let f = 0; f < 6; f++) {
        const fa = (f / 6) * Math.PI * 2 + 0.25;
        const fern = new THREE.Mesh(this.fernFrondGeo, f % 2 === 0 ? this.leafMidMat : this.leafBrightMat);
        fern.position.set(Math.cos(fa) * 0.42, 0.22, Math.sin(fa) * 0.42);
        fern.rotation.order = "YXZ";
        fern.rotation.y = -fa;
        fern.rotation.z = -0.95;
        fern.scale.set(1, 1, 0.24);
        cluster.add(fern);
      }

      // 4 glowing 5-petal moonlight blossoms
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rng.range(0, 0.6);
        const r = rng.range(0.32, 0.78);
        const fx = Math.cos(a) * r;
        const fz = Math.sin(a) * r;

        const flowerGroup = new THREE.Group();
        flowerGroup.position.set(fx, 0, fz);

        const stem = new THREE.Mesh(this.stemGeo, this.leafMidMat);
        stem.position.y = 0.23;
        flowerGroup.add(stem);

        const head = new THREE.Group();
        head.position.y = 0.48;
        const petalMat = i % 2 === 0 ? this.flowerGoldMat : this.flowerCreamMat;
        for (let p = 0; p < 5; p++) {
          const pa = (p / 5) * Math.PI * 2;
          const petal = new THREE.Mesh(this.petalGeo, petalMat);
          petal.scale.set(1.1, 0.45, 0.75);
          petal.position.set(Math.cos(pa) * 0.088, 0, Math.sin(pa) * 0.088);
          petal.rotation.y = -pa;
          head.add(petal);
        }
        const pistil = new THREE.Mesh(this.pistilGeo, this.pistilMat);
        pistil.position.y = 0.02;
        head.add(pistil);

        flowerGroup.add(head);
        cluster.add(flowerGroup);
      }

      this.swayNodes.push({ obj: cluster, phase, amp: 0.032 });
      this.group.add(cluster);
    };

    const addPuddle = (x: number, z: number, radiusX: number, radiusZ: number): void => {
      const puddleGroup = new THREE.Group();
      puddleGroup.position.set(x, 0.03, z);

      const water = new THREE.Mesh(this.puddleGeo, this.waterMat);
      water.rotation.x = -Math.PI / 2;
      water.scale.set(radiusX, radiusZ, 1);
      puddleGroup.add(water);

      const ripple = new THREE.Mesh(this.rippleGeo, this.rippleMat);
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.y = 0.015;
      ripple.scale.set(radiusX * 0.5, radiusZ * 0.5, 1);
      ripple.userData = { baseX: radiusX, baseZ: radiusZ, phase: rng.range(0, Math.PI * 2) };
      puddleGroup.add(ripple);
      this.ripples.push(ripple);

      // Floating lily pads + glowing water lotus
      for (let l = 0; l < 2; l++) {
        const la = l * Math.PI + 0.6;
        const pad = new THREE.Mesh(this.lilyPadGeo, this.leafBrightMat);
        pad.rotation.x = -Math.PI / 2;
        pad.rotation.z = la;
        pad.position.set(Math.cos(la) * radiusX * 0.42, 0.02, Math.sin(la) * radiusZ * 0.42);
        puddleGroup.add(pad);

        if (l === 0) {
          const lotus = new THREE.Mesh(this.petalGeo, this.flowerCreamMat);
          lotus.scale.set(1.45, 1.15, 1.45);
          lotus.position.set(pad.position.x, 0.07, pad.position.z);
          puddleGroup.add(lotus);
        }
      }

      // Smooth pebbles & bank ferns along puddle edge
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rng.range(-0.22, 0.22);
        const stone = new THREE.Mesh(this.rockGeo, this.rockMat);
        stone.scale.set(rng.range(0.45, 0.9), rng.range(0.28, 0.48), rng.range(0.45, 0.85));
        stone.position.set(Math.cos(a) * radiusX * 0.98, 0.08, Math.sin(a) * radiusZ * 0.98);
        puddleGroup.add(stone);

        if (i % 2 === 0) {
          const fern = new THREE.Mesh(this.fernFrondGeo, this.leafBrightMat);
          fern.position.set(Math.cos(a + 0.25) * radiusX * 1.06, 0.16, Math.sin(a + 0.25) * radiusZ * 1.06);
          fern.rotation.order = "YXZ";
          fern.rotation.y = -(a + 0.25);
          fern.rotation.z = -0.85;
          fern.scale.set(0.9, 0.95, 0.24);
          puddleGroup.add(fern);
        }
      }

      this.group.add(puddleGroup);
      puddlesPlaced.push({ x, z, rx: radiusX, rz: radiusZ });
    };

    const zones: Array<{
      cx: number;
      cz: number;
      minR: number;
      maxR: number;
      trees: number;
      flowers: number;
      puddles: number;
      grass: number;
    }> =
      night === 1
        ? [{ cx: 0, cz: 0, minR: 7.5, maxR: 37.5, trees: 36, flowers: 40, puddles: 4, grass: 1150 }]
        : night === 2
          ? [
              { cx: 0, cz: 0, minR: 6, maxR: 25.8, trees: 22, flowers: 24, puddles: 2, grass: 500 },
              { cx: 70, cz: 0, minR: 6, maxR: 25.8, trees: 22, flowers: 24, puddles: 2, grass: 500 }
            ]
          : [{ cx: 0, cz: 0, minR: 26.8, maxR: 42.8, trees: 38, flowers: 38, puddles: 3, grass: 1050 }];

    const grassMatricesBase: THREE.Matrix4[] = [];
    const grassMatricesBright: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    const pushGrassTuft = (x: number, y: number, z: number, scaleMin: number, scaleMax: number): void => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(
        rng.range(-0.08, 0.08),
        rng.range(0, Math.PI * 2),
        rng.range(-0.08, 0.08)
      );
      const s = rng.range(scaleMin, scaleMax);
      dummy.scale.set(s * rng.range(0.9, 1.25), s * rng.range(0.85, 1.35), s * rng.range(0.9, 1.25));
      dummy.updateMatrix();
      if (rng.next() < 0.58) {
        grassMatricesBase.push(dummy.matrix.clone());
      } else {
        grassMatricesBright.push(dummy.matrix.clone());
      }
    };

    for (const zone of zones) {
      // 1. Puddles
      let placedPuddles = 0;
      for (let attempt = 0; attempt < 80 && placedPuddles < zone.puddles; attempt++) {
        const r = Math.sqrt(rng.range(zone.minR * zone.minR, (zone.maxR - 4.5) * (zone.maxR - 4.5)));
        const a = rng.range(0, Math.PI * 2);
        const x = zone.cx + Math.cos(a) * r;
        const z = zone.cz + Math.sin(a) * r;
        if (!isClearForTree(x, z, 2.5)) continue;
        addPuddle(x, z, rng.range(2.2, 3.4), rng.range(1.6, 2.5));
        avoidTrees.push({ pos: [x, 0, z], clearance: 4.0 });
        placedPuddles += 1;
      }

      // 2. Diverse Trees (higher density, organic species mix per island theme)
      let placedTrees = 0;
      for (let attempt = 0; attempt < 260 && placedTrees < zone.trees; attempt++) {
        const r = Math.sqrt(rng.range(zone.minR * zone.minR, zone.maxR * zone.maxR));
        const a = rng.range(0, Math.PI * 2);
        const x = zone.cx + Math.cos(a) * r;
        const z = zone.cz + Math.sin(a) * r;
        if (!isClearForTree(x, z, 1.2)) continue;

        const scale = rng.range(0.85, 1.28);
        const phase = rng.range(0, Math.PI * 2);
        const roll = rng.next();
        const nearRim = r > zone.maxR * 0.78;

        if (night === 2) {
          // Đảo Cau: mostly curved Areca Palms + Bamboo Groves + Banyan accents
          if (roll < 0.56) addArecaPalm(x, z, scale, phase);
          else if (roll < 0.8) addBambooGrove(x, z, scale * 0.95, phase);
          else addBanyanTree(x, z, scale * 0.92, phase);
        } else if (night === 1) {
          // Đảo Bến: rich mix of Banyan canopy trees, layered pines, bamboo groves, coastal palms
          if (nearRim && roll < 0.32) addArecaPalm(x, z, scale, phase);
          else if (roll < 0.36) addBanyanTree(x, z, scale, phase);
          else if (roll < 0.74) addPineTree(x, z, scale, phase);
          else addBambooGrove(x, z, scale * 0.95, phase);
        } else {
          // Đảo Chuông: stately pines, banyan groves & bamboo along outer ring
          if (roll < 0.45) addPineTree(x, z, scale, phase);
          else if (roll < 0.75) addBanyanTree(x, z, scale, phase);
          else if (roll < 0.9) addBambooGrove(x, z, scale * 0.95, phase);
          else addArecaPalm(x, z, scale, phase);
        }

        avoidTrees.push({ pos: [x, 0, z], clearance: 2.35 });
        treePositions.push({ x, z });
        placedTrees += 1;
      }

      // 3. Flower & fern clusters
      let placedFlowers = 0;
      for (let attempt = 0; attempt < 220 && placedFlowers < zone.flowers; attempt++) {
        const r = Math.sqrt(rng.range(zone.minR * zone.minR, zone.maxR * zone.maxR));
        const a = rng.range(0, Math.PI * 2);
        const x = zone.cx + Math.cos(a) * r;
        const z = zone.cz + Math.sin(a) * r;
        if (!isClearForTree(x, z, 0.1)) continue;
        addFlowerFernCluster(x, z, rng.range(0, Math.PI * 2));
        placedFlowers += 1;
      }

      // 4. Dense Instanced Meadow Grass across the island lawn
      const grassMinR = night === 3 ? 25.2 : 3.2;
      const grassMaxR = zone.maxR + 0.6;
      let placedGrass = 0;
      for (let attempt = 0; attempt < zone.grass * 3 && placedGrass < zone.grass; attempt++) {
        const r = Math.sqrt(rng.range(grassMinR * grassMinR, grassMaxR * grassMaxR));
        const a = rng.range(0, Math.PI * 2);
        const x = zone.cx + Math.cos(a) * r;
        const z = zone.cz + Math.sin(a) * r;
        if (!isClearForGrass(x, z)) continue;
        pushGrassTuft(x, 0, z, 0.78, 1.38);
        placedGrass += 1;
      }
    }

    // Extra lush grass rings tucked naturally around tree trunks
    for (const tp of treePositions) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + rng.range(-0.4, 0.4);
        const r = rng.range(0.55, 1.35);
        const gx = tp.x + Math.cos(a) * r;
        const gz = tp.z + Math.sin(a) * r;
        if (!isClearForGrass(gx, gz)) continue;
        pushGrassTuft(gx, 0, gz, 0.9, 1.45);
      }
    }

    // Night 3 bonus: delicate meadow grass tufts along Tier 1 semi-annulus (Y = 3, R = 13..23, z > 1)
    if (night === 3) {
      for (let i = 0; i < 110; i++) {
        const r = rng.range(13.2, 22.8);
        const a = rng.range(0.12, Math.PI - 0.12);
        const gx = Math.cos(a) * r;
        const gz = Math.sin(a) * r;
        let nearAvoid = false;
        for (const av of avoidGrass) {
          if (distXZ([gx, 3, gz], av.pos) < av.clearance) {
            nearAvoid = true;
            break;
          }
        }
        if (nearAvoid) continue;
        pushGrassTuft(gx, 3.0, gz, 0.68, 1.12);
      }
    }

    // Commit both instanced grass layers (2 draw calls total for ~800+ lush swaying grass tufts!)
    if (grassMatricesBase.length > 0) {
      const instBase = new THREE.InstancedMesh(this.grassTuftGeo, this.grassBaseMat, grassMatricesBase.length);
      for (let i = 0; i < grassMatricesBase.length; i++) instBase.setMatrixAt(i, grassMatricesBase[i]);
      instBase.instanceMatrix.needsUpdate = true;
      this.group.add(instBase);
    }
    if (grassMatricesBright.length > 0) {
      const instBright = new THREE.InstancedMesh(this.grassTuftGeo, this.grassBrightMat, grassMatricesBright.length);
      for (let i = 0; i < grassMatricesBright.length; i++) instBright.setMatrixAt(i, grassMatricesBright[i]);
      instBright.instanceMatrix.needsUpdate = true;
      this.group.add(instBright);
    }
  }

  update(dt: number, reducedMotion: boolean): void {
    if (reducedMotion) return;
    this.animTime += dt;
    this.windUniform.value = this.animTime;

    for (const ripple of this.ripples) {
      const { baseX, baseZ, phase } = ripple.userData as {
        baseX: number;
        baseZ: number;
        phase: number;
      };
      const t = (this.animTime * 0.45 + phase) % 1;
      const scale = 0.25 + t * 0.72;
      ripple.scale.set(baseX * scale, baseZ * scale, 1);
    }
    for (const node of this.swayNodes) {
      node.obj.rotation.z = Math.sin(this.animTime * 1.6 + node.phase) * node.amp;
      node.obj.rotation.x = Math.cos(this.animTime * 1.2 + node.phase) * (node.amp * 0.6);
    }
  }
}
