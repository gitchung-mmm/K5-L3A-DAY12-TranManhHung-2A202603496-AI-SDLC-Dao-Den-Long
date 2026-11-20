import * as THREE from "three";
import type { GameStateSnapshot } from "../core/types.js";

export const MEMORY_NAMES = ["Bến đợi", "Sân chơi", "Quán cũ", "Vườn nhà", "Đêm hội"];
const GOLD = 0xffce83;

/** Small, shared palette: these props never take part in simulation collisions. */
export function paper(color = GOLD, opacity = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45,
    roughness: 0.85, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
}

export function shape(parent: THREE.Object3D, geometry: THREE.BufferGeometry,
  material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function littleLantern(parent: THREE.Object3D, x: number, y: number, z: number,
  material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  shape(group, new THREE.SphereGeometry(0.3, 8, 6), material).scale.set(1, 1.3, 1);
  shape(group, new THREE.CylinderGeometry(0.04, 0.02, 0.32, 5), material, 0, -0.5);
  parent.add(group);
  return group;
}

export function silhouette(parent: THREE.Object3D, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  shape(group, new THREE.ConeGeometry(0.32, 1, 8), material, 0, 0.55);
  shape(group, new THREE.SphereGeometry(0.2, 8, 6), material, 0, 1.22);
  shape(group, new THREE.ConeGeometry(0.42, 0.2, 10), material, 0, 1.45);
  parent.add(group);
  return group;
}

interface Memory { group: THREE.Group; ornaments: THREE.Group; age: number; lit: boolean }

export class IslandMemories {
  private readonly memories = new Map<string, Memory>();
  private readonly warm = paper();
  private readonly wood = paper(0x654b38);
  private readonly ghost = paper(0xa6e8dc, 0.48);

  constructor(private readonly scene: THREE.Scene) {}

  private build(index: number): Memory {
    const group = new THREE.Group();
    const ornaments = new THREE.Group();
    group.add(ornaments);
    // Scenes sit outside the interaction circle, leaving paths clear.
    ornaments.position.z = 5.8;
    if (index % 5 === 0) {
      for (let i = 0; i < 5; i++) {
        const boat = new THREE.Group();
        boat.position.set((i - 2) * 1.15, 0.5, Math.sin(i) * 0.6);
        const hull = shape(boat, new THREE.OctahedronGeometry(0.5, 0), this.warm);
        hull.scale.set(1, 0.35, 1.8);
        shape(boat, new THREE.ConeGeometry(0.35, 0.6, 3), this.ghost, 0, 0.4);
        ornaments.add(boat);
      }
    } else if (index % 5 === 1) {
      for (let i = 0; i < 3; i++) {
        const child = silhouette(ornaments, this.ghost);
        child.position.set((i - 1) * 1.8, 0, 0);
        littleLantern(child, 0.55, 0.9, 0, this.warm);
      }
    } else if (index % 5 === 2) {
      shape(ornaments, new THREE.CylinderGeometry(1, 1, 0.15, 12), this.wood, 0, 0.85);
      shape(ornaments, new THREE.CylinderGeometry(0.15, 0.25, 0.8, 8), this.wood, 0, 0.4);
      shape(ornaments, new THREE.SphereGeometry(0.22, 10, 8), this.warm, 0, 1.1);
      shape(ornaments, new THREE.ConeGeometry(0.08, 0.35, 8), this.warm, 0.22, 1.13).rotation.z = -0.9;
      for (const x of [-1.6, 1.6]) {
        shape(ornaments, new THREE.BoxGeometry(0.7, 0.12, 0.7), this.wood, x, 0.5);
        shape(ornaments, new THREE.BoxGeometry(0.7, 0.8, 0.1), this.wood, x, 0.9, 0.35);
      }
      for (let i = 0; i < 5; i++) {
        shape(ornaments, new THREE.SphereGeometry(0.08, 6, 5), this.ghost, 0, 1.45 + i * 0.18);
      }
    } else if (index % 5 === 3) {
      for (let i = 0; i < 7; i++) {
        const x = (i - 3) * 0.8;
        shape(ornaments, new THREE.CylinderGeometry(0.04, 0.04, 1, 5), this.wood, x, 0.5, 0.5);
        const flower = shape(ornaments, new THREE.OctahedronGeometry(0.25, 0), this.warm, x, 0.5, -0.5);
        flower.scale.y = 0.4;
      }
      shape(ornaments, new THREE.BoxGeometry(5.5, 0.08, 0.08), this.wood, 0, 0.7, 0.5);
    } else {
      const ring = shape(ornaments, new THREE.RingGeometry(1.8, 1.88, 40), this.warm, 0, 0.08);
      ring.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        const ray = shape(ornaments, new THREE.ConeGeometry(0.16, 0.7, 3), this.warm,
          Math.sin(a) * 1.2, 0.09, Math.cos(a) * 1.2);
        ray.rotation.set(Math.PI / 2, 0, -a);
      }
      for (let i = 0; i < 7; i++) littleLantern(ornaments, (i - 3) * 0.8,
        2.5 + Math.abs(i - 3) * 0.15, 0, this.warm);
      for (const x of [-3, 3]) shape(ornaments, new THREE.CylinderGeometry(0.06, 0.08, 3.5, 6), this.wood, x, 1.75);
    }
    group.visible = false;
    this.scene.add(group);
    return { group, ornaments, age: 0, lit: false };
  }

  reset(): void {
    for (const memory of this.memories.values()) {
      memory.lit = false;
      memory.age = 0;
      memory.group.visible = false;
    }
  }

  update(snapshot: GameStateSnapshot, dt: number): string | null {
    let awakened: string | null = null;
    snapshot.lanterns.forEach((lantern, index) => {
      let memory = this.memories.get(lantern.id);
      if (!memory) { memory = this.build(index); this.memories.set(lantern.id, memory); }
      memory.group.position.set(lantern.pos[0], 0, lantern.pos[2]);
      memory.group.rotation.y = Math.atan2(lantern.pos[0], lantern.pos[2]);
      if (lantern.lit && !memory.lit) awakened = MEMORY_NAMES[index % 5];
      memory.lit = lantern.lit;
      memory.group.visible = lantern.lit;
      if (!lantern.lit) return;
      memory.age += dt;
      memory.group.scale.setScalar(Math.min(1, 0.01 + memory.age / 1.8));
      memory.ornaments.position.y = Math.sin(memory.age * 1.5) * 0.06;
      if (index % 5 === 1) memory.ornaments.rotation.y = Math.sin(memory.age * 0.5) * 0.2;
    });
    return awakened;
  }
}
