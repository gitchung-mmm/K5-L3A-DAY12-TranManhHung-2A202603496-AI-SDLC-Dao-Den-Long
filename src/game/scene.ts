import * as THREE from "three";
import { ISLAND_RADIUS } from "../core/tuning.js";
import type { GameStateSnapshot, TuningConfig, Vec3 } from "../core/types.js";

interface LanternVisual {
  group: THREE.Group;
  orbMesh: THREE.Mesh;
  orbMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  safeRing: THREE.Mesh;
  safeRingMat: THREE.MeshBasicMaterial;
}

interface PulseWave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  maxRadius: number;
}

export class IslandSceneView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly ambientLight: THREE.AmbientLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly dirLight: THREE.DirectionalLight;
  private readonly fog: THREE.FogExp2;

  private readonly playerGroup: THREE.Group;
  private readonly playerLanternLight: THREE.PointLight;
  private readonly playerHatLantern: THREE.Mesh;

  private readonly lanternVisuals = new Map<string, LanternVisual>();
  private readonly moteMeshes = new Map<string, THREE.Mesh>();
  private readonly shadeGroups = new Map<string, THREE.Group>();
  private readonly pulseWaves: PulseWave[] = [];
  private readonly cloudMeshes: THREE.Mesh[] = [];

  private readonly moteGeom = new THREE.SphereGeometry(0.32, 12, 12);
  private readonly moteMat = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0xff9f1c,
    emissiveIntensity: 2.2,
    roughness: 0.2
  });

  private animTime = 0;
  private readonly moteVariants = [this.moteMat,
    new THREE.MeshStandardMaterial({ color: 0xb8efad, emissive: 0x70c97a, emissiveIntensity: 2 }),
    new THREE.MeshStandardMaterial({ color: 0xe2efff, emissive: 0xb4d3ff, emissiveIntensity: 2 })];

  constructor(container: HTMLElement, private readonly tuning: TuningConfig) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0716);
    this.fog = new THREE.FogExp2(0x120a21, 0.017);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      58,
      container.clientWidth / container.clientHeight,
      0.1,
      250
    );

    this.ambientLight = new THREE.AmbientLight(0x52407a, 0.95);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x7c5ca3, 0x221b30, 0.95);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfde68a, 0.6);
    this.dirLight.position.set(18, 35, 16);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 90;
    const d = 45;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    this.buildIslandEnvironment();

    const { group, hatLantern, lanternLight } = this.buildPlayerMesh();
    this.playerGroup = group;
    this.playerHatLantern = hatLantern;
    this.playerLanternLight = lanternLight;
    this.scene.add(this.playerGroup);

    window.addEventListener("resize", this.handleResize);
  }

  private handleResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    this.camera.aspect = parent.clientWidth / parent.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(parent.clientWidth, parent.clientHeight);
  };

  private buildIslandEnvironment(): void {
    // Round island ground (Y = 0)
    const groundGeo = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 1.5, 2, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x263849,
      roughness: 0.9,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -1;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Subtle decorative stone rim markers around the island edge
    const rimGeo = new THREE.TorusGeometry(ISLAND_RADIUS, 0.25, 8, 64);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x3b2f52,
      roughness: 0.85
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.05;
    this.scene.add(rim);

    // Center dock shrine base
    const centerGeo = new THREE.CylinderGeometry(2.4, 2.8, 0.2, 24);
    const centerMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
    const centerPad = new THREE.Mesh(centerGeo, centerMat);
    centerPad.position.y = 0.05;
    centerPad.receiveShadow = true;
    this.scene.add(centerPad);

    // Stylized sea of clouds surrounding the island
    const cloudGeo = new THREE.SphereGeometry(5.5, 12, 10);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0x261d3a,
      roughness: 1,
      transparent: true,
      opacity: 0.72
    });
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const dist = ISLAND_RADIUS + 8 + (i % 3) * 4.5;
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.scale.set(1.8, 0.45, 1.3);
      cloud.position.set(Math.cos(angle) * dist, -2.5 + (i % 2) * 0.7, Math.sin(angle) * dist);
      this.scene.add(cloud);
      this.cloudMeshes.push(cloud);
    }

    // Starlight specks above
    const starCount = 180;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = (i * 2.39996) % (Math.PI * 2);
      const r = 45 + (i % 7) * 9;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = 24 + (i % 11) * 3.5;
      positions[i * 3 + 2] = Math.sin(theta) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xfef3c7, size: 0.45 });
    this.scene.add(new THREE.Points(starGeo, starMat));
  }

  private buildPlayerMesh(): {
    group: THREE.Group;
    hatLantern: THREE.Mesh;
    lanternLight: THREE.PointLight;
  } {
    const group = new THREE.Group();

    // Cloak body
    const bodyGeo = new THREE.ConeGeometry(0.45, 1.1, 12);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf4a261, roughness: 0.7 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.65;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.28, 12, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfde2c4, roughness: 0.65 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.32;
    head.castShadow = true;
    group.add(head);

    // Non la (conical hat)
    const hatGeo = new THREE.ConeGeometry(0.65, 0.34, 16);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 0.8 });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 1.6;
    hat.castShadow = true;
    group.add(hat);

    // Small lantern hanging from the hat brim (+Z forward)
    const hatLanternGeo = new THREE.SphereGeometry(0.14, 10, 10);
    const hatLanternMat = new THREE.MeshStandardMaterial({
      color: 0xffe082,
      emissive: 0xffa726,
      emissiveIntensity: 2.0
    });
    const hatLantern = new THREE.Mesh(hatLanternGeo, hatLanternMat);
    hatLantern.position.set(0, 1.36, 0.56);
    group.add(hatLantern);

    const lanternLight = new THREE.PointLight(0xffb347, 2.4, 10);
    lanternLight.position.set(0, 1.5, 0.6);
    group.add(lanternLight);

    return { group, hatLantern, lanternLight };
  }

  private createLanternVisual(id: string, pos: [number, number, number]): LanternVisual {
    const group = new THREE.Group();
    group.position.set(pos[0], 0, pos[2]);

    // Stone pedestal & wooden post
    const baseGeo = new THREE.CylinderGeometry(0.75, 0.95, 0.4, 12);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 2.5, 10);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.85 });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 1.45;
    post.castShadow = true;
    group.add(post);

    // Lantern orb
    const orbGeo = new THREE.OctahedronGeometry(0.55, 1);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x4b3f66,
      emissive: 0x2e1f47,
      emissiveIntensity: 0.4,
      roughness: 0.35
    });
    const orbMesh = new THREE.Mesh(orbGeo, orbMat);
    orbMesh.position.y = 3.0;
    group.add(orbMesh);

    const light = new THREE.PointLight(0xffa726, 0, 16);
    light.position.y = 3.1;
    group.add(light);

    // Safe zone ring on the ground
    const ringGeo = new THREE.RingGeometry(
      Math.max(0.2, this.tuning.safe_radius - 0.14),
      this.tuning.safe_radius,
      40
    );
    const safeRingMat = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0
    });
    const safeRing = new THREE.Mesh(ringGeo, safeRingMat);
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.04;
    group.add(safeRing);

    this.scene.add(group);
    const visual: LanternVisual = { group, orbMesh, orbMat, light, safeRing, safeRingMat };
    this.lanternVisuals.set(id, visual);
    return visual;
  }

  private createShadeGroup(id: string): THREE.Group {
    const group = new THREE.Group();

    const bodyGeo = new THREE.SphereGeometry(0.65, 14, 14);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x160926,
      emissive: 0x3b0764,
      emissiveIntensity: 0.9,
      roughness: 0.55
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(1, 1.35, 1);
    body.position.y = 0.95;
    body.castShadow = true;
    body.name = "body";
    group.add(body);

    const eyeGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8b4fe });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.2, 1.12, 0.52);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.2, 1.12, 0.52);
    group.add(leftEye, rightEye);

    this.scene.add(group);
    this.shadeGroups.set(id, group);
    return group;
  }

  spawnPulseWave(pos: [number, number, number]): void {
    const geo = new THREE.RingGeometry(0.3, 0.65, 36);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffcf56,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos[0], 0.12, pos[2]);
    this.scene.add(mesh);
    this.pulseWaves.push({
      mesh,
      mat,
      age: 0,
      maxAge: 0.45,
      maxRadius: this.tuning.pulse_radius
    });
  }

  sync(snapshot: GameStateSnapshot, camYawDeg: number, dt: number, cameraFocus: Vec3 | null = null): void {
    this.animTime += dt;

    // 1. Update player position & facing
    this.playerGroup.position.set(snapshot.player.pos[0], snapshot.player.pos[1], snapshot.player.pos[2]);
    this.playerGroup.rotation.y = (camYawDeg * Math.PI) / 180;
    this.playerHatLantern.position.x = Math.sin(this.animTime * 4) * 0.05;
    this.playerLanternLight.intensity = snapshot.player.invulnTimer > 0
      ? (Math.sin(this.animTime * 28) > 0 ? 3.2 : 0.4)
      : 2.2 + snapshot.player.carried * 0.25;

    // 2. Island gets brighter & warmer as lanterns are lit
    const litCount = snapshot.lanterns.filter((l) => l.lit).length;
    const ratio = snapshot.lanterns.length > 0 ? litCount / snapshot.lanterns.length : 0;
    this.ambientLight.intensity = 0.95 + ratio * 0.9;
    this.dirLight.intensity = 0.55 + ratio * 0.75;
    this.fog.density = 0.015 - ratio * 0.008;
    this.fog.color.setHex(0x120a21).lerp(new THREE.Color(0x2a1d28), ratio);

    // 3. Sync lanterns
    for (const lantern of snapshot.lanterns) {
      let visual = this.lanternVisuals.get(lantern.id);
      if (!visual) {
        visual = this.createLanternVisual(lantern.id, lantern.pos);
      }
      visual.group.position.set(lantern.pos[0], 0, lantern.pos[2]);
      visual.orbMesh.rotation.y += dt * (lantern.lit ? 1.4 : 0.35);

      if (lantern.lit) {
        visual.orbMat.color.setHex(0xffd166);
        visual.orbMat.emissive.setHex(0xff9f1c);
        visual.orbMat.emissiveIntensity = 2.0 + Math.sin(this.animTime * 3) * 0.25;
        visual.light.intensity = 6.5;
        visual.safeRingMat.opacity = 0.38;
      } else {
        const progress = Math.min(1, lantern.deposited / Math.max(1, this.tuning.lantern_cost));
        visual.orbMat.color.setHex(0x4b3f66);
        visual.orbMat.emissive.setHex(progress > 0 ? 0xf59e0b : 0x2e1f47);
        visual.orbMat.emissiveIntensity = 0.4 + progress * 0.9;
        visual.light.intensity = progress * 1.5;
        visual.safeRingMat.opacity = 0;
      }
    }

    // 4. Sync motes
    const activeMoteIds = new Set<string>();
    for (let i = 0; i < snapshot.motes.length; i++) {
      const mote = snapshot.motes[i];
      activeMoteIds.add(mote.id);
      let mesh = this.moteMeshes.get(mote.id);
      if (!mesh) {
        const variant = Array.from(mote.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
        mesh = new THREE.Mesh(this.moteGeom, this.moteVariants[variant]);
        mesh.scale.set(variant === 1 ? 0.65 : 0.85, variant === 1 ? 1.3 : 0.85, 0.65);
        this.scene.add(mesh);
        this.moteMeshes.set(mote.id, mesh);
      }
      const bob = Math.sin(this.animTime * 3.5 + i * 0.9) * 0.18;
      mesh.position.set(mote.pos[0], 0.85 + bob, mote.pos[2]);
    }
    for (const [id, mesh] of this.moteMeshes.entries()) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(mesh);
        this.moteMeshes.delete(id);
      }
    }

    // 5. Sync shades
    const activeShadeIds = new Set<string>();
    for (const shade of snapshot.shades) {
      activeShadeIds.add(shade.id);
      let group = this.shadeGroups.get(shade.id);
      if (!group) {
        group = this.createShadeGroup(shade.id);
      }
      group.position.set(shade.pos[0], shade.pos[1], shade.pos[2]);
      const dx = snapshot.player.pos[0] - shade.pos[0];
      const dz = snapshot.player.pos[2] - shade.pos[2];
      if (shade.state === "stunned") {
        group.rotation.y += dt * 10;
      } else if (dx * dx + dz * dz > 1e-4) {
        group.rotation.y = Math.atan2(dx, dz);
      }
      const body = group.getObjectByName("body") as THREE.Mesh | undefined;
      if (body && body.material instanceof THREE.MeshStandardMaterial) {
        body.material.emissive.setHex(shade.state === "stunned" ? 0xfbbf24 : 0x3b0764);
        body.material.emissiveIntensity = shade.state === "stunned" ? 0.8 : 0.95;
      }
    }
    for (const [id, group] of this.shadeGroups.entries()) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(group);
        this.shadeGroups.delete(id);
      }
    }

    // 6. Animate pulse waves
    for (let i = this.pulseWaves.length - 1; i >= 0; i--) {
      const wave = this.pulseWaves[i];
      wave.age += dt;
      const t = Math.min(1, wave.age / wave.maxAge);
      const scale = 1 + t * (wave.maxRadius * 1.5);
      wave.mesh.scale.set(scale, scale, 1);
      wave.mat.opacity = (1 - t) * 0.85;
      if (wave.age >= wave.maxAge) {
        this.scene.remove(wave.mesh);
        wave.mesh.geometry.dispose();
        wave.mat.dispose();
        this.pulseWaves.splice(i, 1);
      }
    }

    // 7. Gentle cloud drift
    for (let i = 0; i < this.cloudMeshes.length; i++) {
      this.cloudMeshes[i].position.y = -2.4 + Math.sin(this.animTime * 0.6 + i) * 0.35;
    }

    // 8. Third-person camera behind player based on camYawDeg
    const yawRad = (camYawDeg * Math.PI) / 180;
    const camDist = 11.5;
    const camHeight = 6.8;
    const focus = cameraFocus ?? snapshot.player.pos;
    const targetCamX = cameraFocus ? focus[0] + 9 : focus[0] - Math.sin(yawRad) * camDist;
    const targetCamZ = cameraFocus ? focus[2] + 12 : focus[2] - Math.cos(yawRad) * camDist;
    const targetCamY = focus[1] + camHeight;

    this.camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.16);
    this.camera.lookAt(
      focus[0],
      focus[1] + 1.3,
      focus[2]
    );

    this.renderer.render(this.scene, this.camera);
  }
}
