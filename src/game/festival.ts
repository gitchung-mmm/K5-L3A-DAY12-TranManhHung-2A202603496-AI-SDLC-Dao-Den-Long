import * as THREE from "three";
import type { GameStateSnapshot, Vec3 } from "../core/types.js";
import { distXZ } from "../core/math.js";
import { IslandMemories, littleLantern, paper, shape, silhouette } from "./memories.js";

export type FestivalCue = "memory" | "whale" | "farewell" | "reveal";
export interface FestivalState {
  storyText: string | null;
  endingActive: boolean;
  cameraFocus: Vec3 | null;
  cues: FestivalCue[];
}

/** Web-only story clock. Reads snapshots; never changes score, inventory or simulation. */
export class LanternFestival {
  private readonly memories: IslandMemories;
  private readonly tan = new THREE.Group();
  private readonly whale = new THREE.Group();
  private readonly shadow: THREE.Mesh;
  private readonly rogue = new THREE.Group();
  private readonly passengers = new THREE.Group();
  private readonly trail = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly target = new THREE.Vector3();
  private readonly glow = paper(0xffce83);
  private time = 0;
  private whaleAge = -1;
  private endingAge = -1;
  private celebrate = 0;
  private reveal = 0;
  private textAge = 0;
  private text = "Tàn: Đi cùng tớ nhé. Mỗi ngọn đèn giữ một ký ức của đảo.";
  private pendingCues: FestivalCue[] = [];
  private positioned = false;

  constructor(scene: THREE.Scene, private readonly boat: THREE.Group) {
    this.memories = new IslandMemories(scene);
    const ivory = paper(0xf5d9a0);
    shape(this.tan, new THREE.OctahedronGeometry(0.38, 1), ivory).scale.set(1, 1.1, 0.65);
    for (const [x, height] of [[-0.23, 0.48], [0.23, 0.65]]) {
      shape(this.tan, new THREE.ConeGeometry(0.12, height, 3), ivory, x, 0.4).rotation.z = -x;
    }
    shape(this.tan, new THREE.SphereGeometry(0.16, 8, 6), this.glow, 0, -0.07, 0.23);
    for (const x of [-0.13, 0.13]) shape(this.tan, new THREE.SphereGeometry(0.045, 6, 5), paper(0x332032), x, 0.14, 0.26);
    scene.add(this.tan);

    const cloud = paper(0xa0cbd7, 0.75);
    shape(this.whale, new THREE.SphereGeometry(1, 20, 12), cloud).scale.set(5, 1.7, 2.1);
    shape(this.whale, new THREE.SphereGeometry(1, 12, 8), paper(0xf2e9d5, 0.7), 0, -0.6).scale.set(4.1, 0.9, 1.8);
    for (const z of [-1.7, 1.7]) {
      const fin = shape(this.whale, new THREE.SphereGeometry(1, 10, 6), cloud, -0.7, -0.5, z);
      fin.scale.set(1.6, 0.18, 1.3);
      fin.rotation.x = z * 0.18;
      shape(this.whale, new THREE.SphereGeometry(0.13, 8, 6), this.glow, 3.5, 0.4, z * 0.7);
    }
    this.tail.position.x = -4.7;
    for (const z of [-0.8, 0.8]) shape(this.tail, new THREE.SphereGeometry(1, 10, 6), cloud, -0.3, 0, z).scale.set(1.5, 0.2, 1.1);
    this.whale.add(this.tail);
    for (let i = 0; i < 9; i++) littleLantern(this.whale, (i % 3 - 1) * 1.8,
      2 + Math.sin(i) * 0.4, (Math.floor(i / 3) - 1) * 1.2, this.glow);
    this.whale.visible = false;
    scene.add(this.whale);
    this.shadow = shape(scene, new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: 0x17182a, transparent: true, opacity: 0.22, depthWrite: false }), 0, 0.06);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(6, 2.5, 1);
    this.shadow.visible = false;

    littleLantern(this.rogue, 0, 0.9, 0, paper(0x83dcd9));
    for (const x of [-0.18, 0.18]) {
      shape(this.rogue, new THREE.CylinderGeometry(0.035, 0.025, 0.5, 5), ivory, x, 0.3);
      shape(this.rogue, new THREE.SphereGeometry(0.055, 6, 5), ivory, x, 1, 0.3);
    }
    this.rogue.position.set(7, 0, 5);
    scene.add(this.rogue);
    for (let i = 0; i < 5; i++) {
      const passenger = silhouette(this.passengers, paper(0xc1e9dc, 0.4));
      passenger.position.set((i % 2 - 0.5) * 0.7, 0.25, (i - 2) * 0.55);
      passenger.scale.setScalar(0.75);
    }
    this.passengers.visible = false;
    boat.add(this.passengers);
    littleLantern(boat, 0, 1.3, 1.6, this.glow);
    for (let i = 0; i < 35; i++) shape(this.trail, new THREE.SphereGeometry(0.065, 5, 4), this.glow,
      Math.sin(i * 2.4) * 0.8, 0.3 + (i % 4) * 0.2, i * 0.4);
    this.trail.visible = false;
    scene.add(this.trail);
  }

  reset(): void {
    this.memories.reset();
    this.time = 0;
    this.whaleAge = -1;
    this.endingAge = -1;
    this.celebrate = this.reveal = this.textAge = 0;
    this.text = "Tàn: Đi cùng tớ nhé. Mỗi ngọn đèn giữ một ký ức của đảo.";
    this.pendingCues = [];
    this.positioned = false;
    this.whale.visible = this.shadow.visible = this.passengers.visible = this.trail.visible = false;
    this.boat.position.set(2.2, -0.35, -42.2);
    this.rogue.position.set(7, 0, 5);
    this.rogue.scale.setScalar(1);
  }

  onPulse(pos: Vec3, radius: number): void {
    const p = this.rogue.position;
    if (distXZ(pos, [p.x, 0, p.z]) > radius) return;
    this.reveal = 4;
    this.announce("Đèn Lạc: Ơ… tớ chỉ mượn chiếc đèn một chút thôi!", "reveal");
  }

  private announce(text: string, cue: FestivalCue): void {
    this.text = text;
    this.textAge = 0;
    this.pendingCues.push(cue);
  }

  update(snapshot: GameStateSnapshot, dt: number, camYawDeg: number): FestivalState {
    this.time += dt;
    this.textAge += dt;
    this.celebrate = Math.max(0, this.celebrate - dt);
    this.reveal = Math.max(0, this.reveal - dt);
    const memory = this.memories.update(snapshot, dt);
    if (memory) {
      this.celebrate = 3;
      this.announce(`Ký ức thức dậy — ${memory}. Đảo đang nhớ lại…`, "memory");
    }
    const player = snapshot.player.pos;
    const afraid = snapshot.state === "playing" && snapshot.shades.some(s =>
      s.state !== "stunned" && distXZ(player, s.pos) < 5);
    const orbit = this.celebrate > 0 ? this.time * 4 : this.time * 0.5;
    this.target.set(player[0] + Math.cos(orbit) * 1.2,
      player[1] + 2 + Math.sin(this.time * 3) * 0.15, player[2] + Math.sin(orbit) * 1.2);
    if (!this.positioned) { this.tan.position.copy(this.target); this.positioned = true; }
    this.tan.position.lerp(this.target, 1 - Math.exp(-dt * 5));
    this.tan.scale.setScalar(afraid ? 0.55 : 1);
    this.tan.rotation.set(0, this.celebrate > 0 ? this.time * 6 : camYawDeg * Math.PI / 180,
      Math.sin(this.time * 3) * 0.12);

    const p = this.rogue.position;
    const dx = p.x - player[0], dz = p.z - player[2];
    const distance = Math.hypot(dx, dz);
    if (snapshot.state === "playing" && distance < 5 && this.reveal === 0) {
      p.x += (distance > 0.01 ? dx / distance : 1) * dt * 3;
      p.z += (distance > 0.01 ? dz / distance : 0) * dt * 3;
      if (Math.hypot(p.x, p.z) > 32) { p.x *= 0.98; p.z *= 0.98; }
      p.y = Math.abs(Math.sin(this.time * 12)) * 0.4;
      this.rogue.rotation.z = Math.sin(this.time * 12) * 0.22;
    } else { p.y = 0; this.rogue.rotation.z = 0; }
    this.rogue.scale.setScalar(this.reveal > 0 ? 0.55 : 1);

    const lit = snapshot.lanterns.filter(l => l.lit).length;
    if (lit >= 3 && this.whaleAge < 0 && snapshot.state === "playing") {
      this.whaleAge = 0;
      this.announce("Tàn: Nhìn kìa… Cá Voi Mây đang mang đêm hội trở về!", "whale");
    }
    if (this.whaleAge >= 0) {
      this.whaleAge += dt;
      this.whale.visible = this.shadow.visible = this.whaleAge < 12 && snapshot.state === "playing";
      // Stage the flyby ahead of the live camera so it is visible without taking control.
      const yaw = camYawDeg * Math.PI / 180;
      const crossing = (this.whaleAge / 12 - 0.5) * 44;
      this.whale.position.set(player[0] + Math.sin(yaw) * 22 + Math.cos(yaw) * crossing,
        6.5 + Math.sin(this.whaleAge * 0.5) * 0.5,
        player[2] + Math.cos(yaw) * 22 - Math.sin(yaw) * crossing);
      this.whale.rotation.y = yaw;
      this.tail.rotation.x = Math.sin(this.time * 2) * 0.25;
      this.shadow.position.set(this.whale.position.x, 0.06, this.whale.position.z);
      this.shadow.rotation.z = yaw;
    }

    if (snapshot.state === "won" && this.endingAge < 0) {
      this.endingAge = 0;
      this.announce('Ông Lái Đò: “Đủ người rồi. Cảm ơn con đã giữ đèn.”', "farewell");
    }
    let cameraFocus: Vec3 | null = null;
    const endingActive = this.endingAge >= 0 && this.endingAge < 11;
    if (this.endingAge >= 0) {
      this.endingAge += dt;
      this.passengers.visible = true;
      const depart = Math.max(0, Math.min(8, this.endingAge - 3));
      this.boat.position.z = -42.2 - depart * 1.6;
      this.boat.position.x = 2.2 + depart * 0.25;
      this.trail.visible = depart > 0;
      this.trail.position.copy(this.boat.position);
      this.passengers.scale.setScalar(Math.min(1, this.endingAge / 2));
      if (endingActive) cameraFocus = [this.boat.position.x, 0.5, this.boat.position.z];
    }
    const cues = this.pendingCues.splice(0);
    return { storyText: this.textAge < (endingActive ? 12 : 7) ? this.text : null,
      endingActive, cameraFocus, cues };
  }
}
