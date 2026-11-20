import * as THREE from "three";
import { getNightMap } from "../core/maps.js";
import { distXZ } from "../core/math.js";
import { SeededRng } from "../core/rng.js";
import type { NightNumber, Vec3 } from "../core/types.js";

/**
 * Procedural nature decorations (trees, flowers, grass tufts, stones, shimmering puddles)
 * for Nights 1-3. Strictly visual-only (zero core collisions) and automatically hidden in
 * benchmark/headless modes.
 */
export class IslandDecor {
  readonly group = new THREE.Group();
  private readonly ripples: THREE.Mesh[] = [];
  private animTime = 0;

  // Shared geometries & materials for minimal draw overhead
  private readonly trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 2.2, 7);
  private readonly palmTrunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 4.2, 7);
  private readonly crownBottomGeo = new THREE.ConeGeometry(1.55, 2.2, 7);
  private readonly crownTopGeo = new THREE.ConeGeometry(1.1, 1.8, 7);
  private readonly palmFrondGeo = new THREE.ConeGeometry(0.55, 2.4, 5);
  private readonly bushGeo = new THREE.DodecahedronGeometry(0.55, 0);
  private readonly rockGeo = new THREE.DodecahedronGeometry(0.45, 0);
  private readonly stemGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.42, 5);
  private readonly petalGeo = new THREE.OctahedronGeometry(0.16, 0);
  private readonly puddleGeo = new THREE.CircleGeometry(1, 24);
  private readonly rippleGeo = new THREE.RingGeometry(0.72, 0.8, 24);

  private readonly woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
  private readonly leafDarkMat = new THREE.MeshStandardMaterial({ color: 0x224a3f, roughness: 0.88 });
  private readonly leafMidMat = new THREE.MeshStandardMaterial({ color: 0x2f5d50, roughness: 0.85 });
  private readonly leafBrightMat = new THREE.MeshStandardMaterial({ color: 0x3b7260, roughness: 0.82 });
  private readonly rockMat = new THREE.MeshStandardMaterial({ color: 0x5b5f6e, roughness: 0.9 });
  private readonly flowerGoldMat = new THREE.MeshStandardMaterial({
    color: 0xffe58a,
    emissive: 0xffb347,
    emissiveIntensity: 0.55,
    roughness: 0.4
  });
  private readonly flowerCreamMat = new THREE.MeshStandardMaterial({
    color: 0xfff6c2,
    emissive: 0xffe9b0,
    emissiveIntensity: 0.45,
    roughness: 0.4
  });
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

  buildForNight(night: NightNumber): void {
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    this.ripples.length = 0;

    const mapDef = getNightMap(night);
    const rng = new SeededRng(night * 7919 + 1337);

    // Keep clear of lanterns, jump pads, charms, and spawn
    const avoidPoints: Array<{ pos: Vec3; clearance: number }> = [
      { pos: mapDef.spawnPos, clearance: 5.5 },
      ...mapDef.lanterns.map((l) => ({ pos: l.pos, clearance: 4.5 })),
      ...mapDef.jumpPads.map((p) => ({ pos: p.pos, clearance: 4.0 })),
      ...mapDef.charms.map((c) => ({ pos: c.pos, clearance: 3.5 }))
    ];

    const isClear = (x: number, z: number, extraR = 0): boolean => {
      const pt: Vec3 = [x, 0, z];
      if (night === 2 && x >= 23 && x <= 47 && Math.abs(z) <= 5) return false; // bridge entrance
      if (night === 3) {
        const r = Math.hypot(x, z);
        if (r < 26.5) return false; // keep Tier 1/2 & ramps clear
        // Avoid ramp corridors at 30° and 150°
        for (const deg of [30, 150]) {
          const rad = (deg * Math.PI) / 180;
          const s = x * Math.cos(rad) + z * Math.sin(rad);
          const w = Math.abs(-x * Math.sin(rad) + z * Math.cos(rad));
          if (s >= 22 && s <= 33 && w <= 4.0) return false;
        }
      }
      for (const a of avoidPoints) {
        if (distXZ(pt, a.pos) < a.clearance + extraR) return false;
      }
      return true;
    };

    const addPineTree = (x: number, z: number, scale: number): void => {
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      tree.scale.setScalar(scale);

      const trunk = new THREE.Mesh(this.trunkGeo, this.woodMat);
      trunk.position.y = 1.1;
      tree.add(trunk);

      const c1 = new THREE.Mesh(this.crownBottomGeo, this.leafDarkMat);
      c1.position.y = 2.6;
      tree.add(c1);

      const c2 = new THREE.Mesh(this.crownTopGeo, this.leafMidMat);
      c2.position.y = 3.9;
      tree.add(c2);

      this.group.add(tree);
    };

    const addArecaPalm = (x: number, z: number, scale: number): void => {
      const palm = new THREE.Group();
      palm.position.set(x, 0, z);
      palm.scale.setScalar(scale);

      const trunk = new THREE.Mesh(this.palmTrunkGeo, this.woodMat);
      trunk.position.y = 2.1;
      palm.add(trunk);

      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const frond = new THREE.Mesh(this.palmFrondGeo, this.leafBrightMat);
        frond.position.set(Math.cos(a) * 0.85, 4.15, Math.sin(a) * 0.85);
        frond.rotation.order = "YXZ";
        frond.rotation.y = -a;
        frond.rotation.z = -1.1;
        palm.add(frond);
      }

      this.group.add(palm);
    };

    const addFlowerCluster = (x: number, z: number): void => {
      const cluster = new THREE.Group();
      cluster.position.set(x, 0, z);

      const bush = new THREE.Mesh(this.bushGeo, this.leafBrightMat);
      bush.scale.set(1.1, 0.55, 1.1);
      bush.position.y = 0.22;
      cluster.add(bush);

      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rng.range(0, 0.6);
        const r = rng.range(0.35, 0.78);
        const fx = Math.cos(a) * r;
        const fz = Math.sin(a) * r;

        const stem = new THREE.Mesh(this.stemGeo, this.leafMidMat);
        stem.position.set(fx, 0.22, fz);
        cluster.add(stem);

        const blossom = new THREE.Mesh(
          this.petalGeo,
          i % 2 === 0 ? this.flowerGoldMat : this.flowerCreamMat
        );
        blossom.position.set(fx, 0.48, fz);
        cluster.add(blossom);
      }

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

      // Smooth pebbles along puddle edge
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const stone = new THREE.Mesh(this.rockGeo, this.rockMat);
        stone.scale.set(rng.range(0.5, 0.9), rng.range(0.3, 0.5), rng.range(0.5, 0.85));
        stone.position.set(Math.cos(a) * radiusX * 0.98, 0.08, Math.sin(a) * radiusZ * 0.98);
        puddleGroup.add(stone);
      }

      this.group.add(puddleGroup);
    };

    const centers: Array<{ cx: number; cz: number; minR: number; maxR: number; trees: number; flowers: number; puddles: number }> =
      night === 1
        ? [{ cx: 0, cz: 0, minR: 9, maxR: 35, trees: 18, flowers: 26, puddles: 3 }]
        : night === 2
          ? [
              { cx: 0, cz: 0, minR: 7, maxR: 24, trees: 10, flowers: 14, puddles: 2 },
              { cx: 70, cz: 0, minR: 7, maxR: 24, trees: 10, flowers: 14, puddles: 2 }
            ]
          : [{ cx: 0, cz: 0, minR: 28, maxR: 41, trees: 20, flowers: 24, puddles: 3 }];

    for (const zone of centers) {
      // 1. Puddles
      let placedPuddles = 0;
      for (let attempt = 0; attempt < 60 && placedPuddles < zone.puddles; attempt++) {
        const r = Math.sqrt(rng.range(zone.minR * zone.minR, (zone.maxR - 4) * (zone.maxR - 4)));
        const a = rng.range(0, Math.PI * 2);
        const x = zone.cx + Math.cos(a) * r;
        const z = zone.cz + Math.sin(a) * r;
        if (!isClear(x, z, 2.5)) continue;
        addPuddle(x, z, rng.range(2.2, 3.4), rng.range(1.6, 2.5));
        avoidPoints.push({ pos: [x, 0, z], clearance: 4.0 });
        placedPuddles += 1;
      }

      // 2. Trees (Areca palms on Đảo Cau Night 2, Pine trees on Night 1 & 3)
      let placedTrees = 0;
      for (let attempt = 0; attempt < 120 && placedTrees < zone.trees; attempt++) {
        const r = Math.sqrt(rng.range(zone.minR * zone.minR, zone.maxR * zone.maxR));
        const a = rng.range(0, Math.PI * 2);
        const x = zone.cx + Math.cos(a) * r;
        const z = zone.cz + Math.sin(a) * r;
        if (!isClear(x, z, 1.5)) continue;
        const scale = rng.range(0.85, 1.25);
        if (night === 2) {
          addArecaPalm(x, z, scale);
        } else {
          addPineTree(x, z, scale);
        }
        avoidPoints.push({ pos: [x, 0, z], clearance: 2.6 });
        placedTrees += 1;
      }

      // 3. Flower & grass clusters
      let placedFlowers = 0;
      for (let attempt = 0; attempt < 140 && placedFlowers < zone.flowers; attempt++) {
        const r = Math.sqrt(rng.range(zone.minR * zone.minR, zone.maxR * zone.maxR));
        const a = rng.range(0, Math.PI * 2);
        const x = zone.cx + Math.cos(a) * r;
        const z = zone.cz + Math.sin(a) * r;
        if (!isClear(x, z, 0.2)) continue;
        addFlowerCluster(x, z);
        placedFlowers += 1;
      }
    }
  }

  update(dt: number, reducedMotion: boolean): void {
    if (reducedMotion) return;
    this.animTime += dt;
    for (const ripple of this.ripples) {
      const { baseX, baseZ, phase } = ripple.userData as {
        baseX: number;
        baseZ: number;
        phase: number;
      };
      const t = ((this.animTime * 0.45 + phase) % 1);
      const scale = 0.25 + t * 0.72;
      ripple.scale.set(baseX * scale, baseZ * scale, 1);
    }
  }
}
