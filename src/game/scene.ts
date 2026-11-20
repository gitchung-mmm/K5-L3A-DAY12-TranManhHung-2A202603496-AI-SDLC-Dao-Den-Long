import * as THREE from "three";
import { getNightMap } from "../core/maps.js";
import type { GameStateSnapshot, NightNumber, TuningConfig, Vec3 } from "../core/types.js";

// Standard Ticket-02 color palette
const PALETTE = {
  sky: 0x0e1430,
  fog: 0x1b2350,
  grass: 0x2f5d50,
  sand: 0xc9b48a,
  wood: 0x6b4a2f,
  cloudSea: 0x12384a,
  lanternLit: 0xffb347,
  lanternCore: 0xffe9b0,
  lanternOff: 0x5b5f6e,
  moteCore: 0xfff6c2,
  moteHalo: 0xffe58a,
  shadeBody: 0x120a1a,
  shadeEdge: 0x7a3cff,
  shadeStunned: 0x3a3450,
  playerCloak: 0xe8e2d0,
  playerScarf: 0xc8102e,
  goldAccent: 0xf2c14e,
  drifter: 0x8fa3b8
};

interface LanternVisual {
  group: THREE.Group;
  orbMesh: THREE.Mesh;
  orbMat: THREE.MeshStandardMaterial;
  tearGroup: THREE.Group;
  fuelBarGroup: THREE.Group;
  fuelBarFill: THREE.Mesh;
  fuelBarMat: THREE.MeshBasicMaterial;
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

  private readonly mapGroup = new THREE.Group();
  private readonly playerGroup: THREE.Group;
  private readonly playerLanternLight: THREE.PointLight;
  private readonly playerHatLantern: THREE.Mesh;

  private readonly lanternVisuals = new Map<string, LanternVisual>();
  private readonly moteMeshes = new Map<string, THREE.Group>();
  private readonly shadeGroups = new Map<string, THREE.Group>();
  private readonly drifterGroups = new Map<string, THREE.Group>();
  private readonly charmGroups = new Map<string, THREE.Group>();
  private readonly pulseWaves: PulseWave[] = [];
  private readonly cloudMeshes: THREE.Mesh[] = [];
  private readonly windLeaves: THREE.Mesh[] = [];

  private readonly moteCoreGeom = new THREE.SphereGeometry(0.24, 10, 10);
  private readonly moteHaloGeom = new THREE.SphereGeometry(0.42, 10, 10);
  private readonly moteCoreMat = new THREE.MeshStandardMaterial({
    color: PALETTE.moteCore,
    emissive: PALETTE.moteCore,
    emissiveIntensity: 2.0,
    roughness: 0.2
  });
  private readonly moteHaloMat = new THREE.MeshBasicMaterial({
    color: PALETTE.moteHalo,
    transparent: true,
    opacity: 0.35
  });

  // Shared geometries & materials for shades (fast even with 200 shades in bench mode)
  private readonly shadeBodyGeo = new THREE.SphereGeometry(0.65, 10, 10);
  private readonly shadeEyeGeo = new THREE.SphereGeometry(0.11, 6, 6);
  private readonly shadeMatNormal = new THREE.MeshStandardMaterial({
    color: PALETTE.shadeBody,
    emissive: PALETTE.shadeEdge,
    emissiveIntensity: 0.85,
    roughness: 0.55
  });
  private readonly shadeMatColorblind = new THREE.MeshStandardMaterial({
    color: PALETTE.shadeBody,
    emissive: 0x00b3ff,
    emissiveIntensity: 0.9,
    roughness: 0.55
  });
  private readonly shadeMatDrain = new THREE.MeshStandardMaterial({
    color: PALETTE.shadeBody,
    emissive: PALETTE.shadeEdge,
    emissiveIntensity: 1.4,
    roughness: 0.45
  });
  private readonly shadeMatDrainCB = new THREE.MeshStandardMaterial({
    color: PALETTE.shadeBody,
    emissive: 0x00b3ff,
    emissiveIntensity: 1.4,
    roughness: 0.45
  });
  private readonly shadeMatStunned = new THREE.MeshStandardMaterial({
    color: PALETTE.shadeStunned,
    emissive: PALETTE.shadeStunned,
    emissiveIntensity: 0.7,
    roughness: 0.6
  });
  private readonly shadeEyeMatNormal = new THREE.MeshBasicMaterial({ color: PALETTE.shadeEdge });
  private readonly shadeEyeMatCB = new THREE.MeshBasicMaterial({ color: 0x00b3ff });

  private currentNight: NightNumber = 1;
  private animTime = 0;
  private colorblind = false;
  private reducedMotion = false;
  private benchMode = false;

  setColorblind(enabled: boolean): void {
    this.colorblind = enabled;
  }

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
  }

  setBenchMode(enabled: boolean): void {
    this.benchMode = enabled;
    if (enabled) {
      this.renderer.setPixelRatio(1);
    }
  }

  getRendererInfo(): string {
    try {
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "WebGL2";
      return `Three.js 0.170 / ${gpu}`;
    } catch {
      return "Three.js 0.170 WebGL2";
    }
  }

  constructor(container: HTMLElement, private readonly tuning: TuningConfig) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.fog = new THREE.FogExp2(PALETTE.fog, 0.011);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      58,
      container.clientWidth / container.clientHeight,
      0.1,
      320
    );

    // Ticket-02 ambient intensity starts at 0.15 + 0.55 * (lit / total)
    this.ambientLight = new THREE.AmbientLight(0xdbeafe, 0.15);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x6e85b7, PALETTE.cloudSea, 0.55);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(PALETTE.lanternCore, 0.75);
    this.dirLight.position.set(22, 42, 20);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 140;
    const d = 65;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    this.scene.add(this.mapGroup);
    this.buildSkyAndSea();
    this.buildWindLeaves();
    this.loadNight(1);

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

  private buildSkyAndSea(): void {
    // Sea of clouds plane below the islands (#12384A)
    const seaGeo = new THREE.CircleGeometry(220, 48);
    const seaMat = new THREE.MeshStandardMaterial({
      color: PALETTE.cloudSea,
      roughness: 0.95,
      metalness: 0.05
    });
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -6.5;
    this.scene.add(sea);

    const cloudGeo = new THREE.SphereGeometry(6.5, 10, 8);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: PALETTE.cloudSea,
      emissive: 0x184860,
      emissiveIntensity: 0.25,
      roughness: 1,
      transparent: true,
      opacity: 0.72
    });
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const dist = 58 + (i % 3) * 14;
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.scale.set(2.2, 0.45, 1.5);
      cloud.position.set(20 + Math.cos(angle) * dist, -3.5 + (i % 2) * 0.9, Math.sin(angle) * dist);
      this.scene.add(cloud);
      this.cloudMeshes.push(cloud);
    }

    // Starfield
    const starCount = 200;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = (i * 2.39996) % (Math.PI * 2);
      const r = 65 + (i % 9) * 12;
      positions[i * 3] = 20 + Math.cos(theta) * r;
      positions[i * 3 + 1] = 30 + (i % 11) * 4;
      positions[i * 3 + 2] = Math.sin(theta) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: PALETTE.moteCore, size: 0.5 });
    this.scene.add(new THREE.Points(starGeo, starMat));
  }

  private buildWindLeaves(): void {
    const leafGeo = new THREE.PlaneGeometry(0.42, 0.22);
    const leafMat = new THREE.MeshBasicMaterial({
      color: PALETTE.goldAccent,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    for (let i = 0; i < 40; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.visible = false;
      this.scene.add(leaf);
      this.windLeaves.push(leaf);
    }
  }

  private clearDynamicVisuals(): void {
    for (const v of this.lanternVisuals.values()) this.scene.remove(v.group);
    this.lanternVisuals.clear();
    for (const m of this.moteMeshes.values()) this.scene.remove(m);
    this.moteMeshes.clear();
    for (const s of this.shadeGroups.values()) this.scene.remove(s);
    this.shadeGroups.clear();
    for (const d of this.drifterGroups.values()) this.scene.remove(d);
    this.drifterGroups.clear();
    for (const c of this.charmGroups.values()) this.scene.remove(c);
    this.charmGroups.clear();
  }

  loadNight(night: NightNumber): void {
    this.currentNight = night;
    this.clearDynamicVisuals();

    while (this.mapGroup.children.length > 0) {
      this.mapGroup.remove(this.mapGroup.children[0]);
    }

    const grassMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.9 });
    const sandMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.88 });
    const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 });
    const padMat = new THREE.MeshStandardMaterial({
      color: PALETTE.goldAccent,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 0.9,
      roughness: 0.35
    });

    const addIslandDisk = (cx: number, cz: number, radius: number, topY = 0, height = 2.4): void => {
      const grass = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 1.2, height, 48), grassMat);
      grass.position.set(cx, topY - height / 2, cz);
      grass.receiveShadow = true;
      this.mapGroup.add(grass);

      const sandRim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.45, 8, 56), sandMat);
      sandRim.rotation.x = Math.PI / 2;
      sandRim.position.set(cx, topY + 0.02, cz);
      this.mapGroup.add(sandRim);
    };

    if (night === 1) {
      addIslandDisk(0, 0, 40, 0);
      const shrine = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.0, 0.2, 24), sandMat);
      shrine.position.set(0, 0.08, 0);
      this.mapGroup.add(shrine);
    } else if (night === 2) {
      addIslandDisk(0, 0, 28, 0);
      addIslandDisk(70, 0, 28, 0);

      // Bamboo bridge x in [26, 44], z in [-2, 2], no railings
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 4), woodMat);
      bridge.position.set(35, -0.15, 0);
      bridge.receiveShadow = true;
      this.mapGroup.add(bridge);
    } else {
      // Night 3 — Đảo Chuông (3 tiers)
      addIslandDisk(0, 0, 45, 0);

      // Tier 1 (Y=3): semi-annulus R=12..24, z > 0
      const shape = new THREE.Shape();
      shape.absarc(0, 0, 24, 0, Math.PI, false);
      shape.absarc(0, 0, 12, Math.PI, 0, true);
      const tier1Geo = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 36 });
      // Rotate so shape Y -> world +Z and extrude depth -> Y [0..3]
      tier1Geo.rotateX(Math.PI / 2);
      const tier1 = new THREE.Mesh(tier1Geo, grassMat);
      tier1.position.y = 3;
      tier1.receiveShadow = true;
      this.mapGroup.add(tier1);

      // Tier 2 (Y=6): center disk R=8
      addIslandDisk(0, 0, 8, 6, 6);

      // 2 Straight wooden ramps at 30 deg & 150 deg (width 3m, R=30 Y=0 -> R=24 Y=3)
      for (const deg of [30, 150]) {
        const rad = (deg * Math.PI) / 180;
        const rampLen = Math.hypot(6, 3);
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.35, 3.0), woodMat);
        const midR = 27;
        ramp.position.set(Math.cos(rad) * midR, 1.4, Math.sin(rad) * midR);
        // Align +X along radial outward (cos, 0, sin), then tilt up toward center
        ramp.rotation.order = "YXZ";
        ramp.rotation.y = -rad;
        ramp.rotation.z = -Math.atan2(3, 6);
        ramp.receiveShadow = true;
        this.mapGroup.add(ramp);
      }

      // Bell Tower at center of Tier 2: cylinder R=2m, height 8m (Y=6..14)
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 8.0, 20), woodMat);
      tower.position.set(0, 10, 0);
      tower.castShadow = true;
      this.mapGroup.add(tower);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.4, 12), sandMat);
      roof.position.set(0, 15.1, 0);
      this.mapGroup.add(roof);

      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.75, 1.1, 12),
        new THREE.MeshStandardMaterial({
          color: PALETTE.goldAccent,
          emissive: PALETTE.lanternLit,
          emissiveIntensity: 0.4,
          metalness: 0.5,
          roughness: 0.3
        })
      );
      bell.position.set(0, 12.6, 0);
      this.mapGroup.add(bell);
    }

    // Jump pads for this night
    const mapDef = getNightMap(night);
    for (const pad of mapDef.jumpPads) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(pad.radius, pad.radius * 1.1, 0.25, 20), padMat);
      disc.position.set(pad.pos[0], pad.pos[1] + 0.12, pad.pos[2]);
      this.mapGroup.add(disc);
    }
  }

  private buildPlayerMesh(): {
    group: THREE.Group;
    hatLantern: THREE.Mesh;
    lanternLight: THREE.PointLight;
  } {
    const group = new THREE.Group();

    // Cloak (#E8E2D0)
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.1, 12),
      new THREE.MeshStandardMaterial({ color: PALETTE.playerCloak, roughness: 0.75 })
    );
    body.position.y = 0.65;
    body.castShadow = true;
    group.add(body);

    // Scarf (#C8102E)
    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.08, 8, 16),
      new THREE.MeshStandardMaterial({ color: PALETTE.playerScarf, roughness: 0.6 })
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.16;
    group.add(scarf);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xfde2c4, roughness: 0.65 })
    );
    head.position.y = 1.36;
    head.castShadow = true;
    group.add(head);

    // Conical hat (Nón lá)
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.65, 0.34, 16),
      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.8 })
    );
    hat.position.y = 1.64;
    hat.castShadow = true;
    group.add(hat);

    // Hanging small lantern
    const hatLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      new THREE.MeshStandardMaterial({
        color: PALETTE.lanternCore,
        emissive: PALETTE.lanternLit,
        emissiveIntensity: 2.0
      })
    );
    hatLantern.position.set(0, 1.4, 0.56);
    group.add(hatLantern);

    const lanternLight = new THREE.PointLight(PALETTE.lanternLit, 2.4, 11);
    lanternLight.position.set(0, 1.5, 0.6);
    group.add(lanternLight);

    return { group, hatLantern, lanternLight };
  }

  private createLanternVisual(id: string, pos: Vec3): LanternVisual {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.95, 0.4, 12),
      new THREE.MeshStandardMaterial({ color: PALETTE.lanternOff, roughness: 0.85 })
    );
    base.position.y = 0.2;
    base.castShadow = true;
    group.add(base);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 2.5, 10),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 })
    );
    post.position.y = 1.45;
    post.castShadow = true;
    group.add(post);

    const orbMat = new THREE.MeshStandardMaterial({
      color: PALETTE.lanternOff,
      emissive: PALETTE.lanternOff,
      emissiveIntensity: 0.35,
      roughness: 0.35
    });
    const orbMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 1), orbMat);
    orbMesh.position.y = 3.0;
    group.add(orbMesh);

    // Non-color distinction for unlit lantern: paper tear/crack marks (visible when unlit)
    const tearGroup = new THREE.Group();
    const tearMat = new THREE.MeshBasicMaterial({ color: 0x120a1a });
    const tear1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.58, 0.62), tearMat);
    tear1.position.set(0.18, 3.0, 0);
    tear1.rotation.z = 0.35;
    const tear2 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.12), tearMat);
    tear2.position.set(0, 2.92, 0.22);
    tear2.rotation.z = -0.25;
    tearGroup.add(tear1, tear2);
    group.add(tearGroup);

    // Fuel bar floating above lit lantern
    const fuelBarGroup = new THREE.Group();
    fuelBarGroup.position.y = 4.05;
    const fuelBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x0e1430, side: THREE.DoubleSide })
    );
    const fuelBarMat = new THREE.MeshBasicMaterial({
      color: PALETTE.lanternLit,
      side: THREE.DoubleSide
    });
    const fuelBarFill = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.14), fuelBarMat);
    fuelBarFill.position.z = 0.02;
    fuelBarGroup.add(fuelBg, fuelBarFill);
    fuelBarGroup.visible = false;
    group.add(fuelBarGroup);

    const light = new THREE.PointLight(PALETTE.lanternLit, 0, 18);
    light.position.y = 3.1;
    group.add(light);

    const safeRingMat = new THREE.MeshBasicMaterial({
      color: PALETTE.lanternLit,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0
    });
    const safeRing = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.2, this.tuning.safe_radius - 0.16), this.tuning.safe_radius, 44),
      safeRingMat
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.05;
    group.add(safeRing);

    this.scene.add(group);
    const visual: LanternVisual = {
      group,
      orbMesh,
      orbMat,
      tearGroup,
      fuelBarGroup,
      fuelBarFill,
      fuelBarMat,
      light,
      safeRing,
      safeRingMat
    };
    this.lanternVisuals.set(id, visual);
    return visual;
  }

  private createShadeGroup(id: string): THREE.Group {
    const group = new THREE.Group();

    const body = new THREE.Mesh(this.shadeBodyGeo, this.shadeMatNormal);
    body.scale.set(1, 1.35, 1);
    body.position.y = 0.95;
    body.castShadow = !this.benchMode;
    body.name = "body";
    group.add(body);

    const leftEye = new THREE.Mesh(this.shadeEyeGeo, this.shadeEyeMatNormal);
    leftEye.position.set(-0.2, 1.12, 0.52);
    leftEye.name = "eyeL";
    const rightEye = new THREE.Mesh(this.shadeEyeGeo, this.shadeEyeMatNormal);
    rightEye.position.set(0.2, 1.12, 0.52);
    rightEye.name = "eyeR";
    group.add(leftEye, rightEye);

    this.scene.add(group);
    this.shadeGroups.set(id, group);
    return group;
  }

  private createDrifterGroup(id: string): THREE.Group {
    const group = new THREE.Group();
    const ribbonMat = new THREE.MeshStandardMaterial({
      color: PALETTE.drifter,
      emissive: PALETTE.drifter,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 2.2), ribbonMat);
    ribbon.position.y = 1.4;
    group.add(ribbon);

    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), ribbonMat);
    crest.rotation.x = Math.PI / 2;
    crest.position.set(0, 1.4, 0.9);
    group.add(crest);

    this.scene.add(group);
    this.drifterGroups.set(id, group);
    return group;
  }

  private createCharmGroup(id: string): THREE.Group {
    const group = new THREE.Group();
    const talisman = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.85, 0.08),
      new THREE.MeshStandardMaterial({
        color: PALETTE.playerScarf,
        emissive: PALETTE.playerScarf,
        emissiveIntensity: 0.6
      })
    );
    talisman.position.y = 1.05;
    group.add(talisman);

    const border = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.94, 0.05),
      new THREE.MeshBasicMaterial({ color: PALETTE.goldAccent })
    );
    border.position.y = 1.05;
    group.add(border);

    this.scene.add(group);
    this.charmGroups.set(id, group);
    return group;
  }

  spawnPulseWave(pos: Vec3): void {
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.lanternCore,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.65, 36), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos[0], pos[1] + 0.12, pos[2]);
    this.scene.add(mesh);
    this.pulseWaves.push({
      mesh,
      mat,
      age: 0,
      maxAge: 0.45,
      maxRadius: this.tuning.pulse_radius
    });
  }

  /** Projects a 3D world point to NDC [-1, 1] for off-screen lantern indicator arrow. */
  projectToScreen(pos: Vec3): { x: number; y: number; inFront: boolean; onScreen: boolean } {
    const v = new THREE.Vector3(pos[0], pos[1] + 2.5, pos[2]).project(this.camera);
    const inFront = v.z < 1;
    const onScreen = inFront && Math.abs(v.x) <= 0.95 && Math.abs(v.y) <= 0.92;
    return { x: v.x, y: v.y, inFront, onScreen };
  }

  sync(
    snapshot: GameStateSnapshot,
    camYawDeg: number,
    dt: number,
    cameraFocus: Vec3 | null = null,
    overrideCameraPos: Vec3 | null = null
  ): void {
    if (snapshot.night !== this.currentNight) {
      this.loadNight(snapshot.night);
    }
    this.animTime += dt;

    // 1. Player
    this.playerGroup.visible = snapshot.player.respawnTimer <= 0;
    this.playerGroup.position.set(snapshot.player.pos[0], snapshot.player.pos[1], snapshot.player.pos[2]);
    this.playerGroup.rotation.y = Math.atan2(snapshot.player.facing[0], snapshot.player.facing[1]);
    this.playerHatLantern.position.x = this.reducedMotion ? 0 : Math.sin(this.animTime * 4) * 0.05;
    this.playerLanternLight.intensity =
      snapshot.player.invulnTimer > 0 && !this.reducedMotion
        ? Math.sin(this.animTime * 28) > 0
          ? 3.2
          : 0.4
        : 2.2 + snapshot.player.carried * 0.16;

    // 2. Ticket-02 ambient lighting formula: 0.15 + 0.55 * (lit / total)
    const litCount = snapshot.lanterns.filter((l) => l.lit).length;
    const ratio = snapshot.lanterns.length > 0 ? litCount / snapshot.lanterns.length : 0;
    this.ambientLight.intensity = 0.15 + 0.55 * ratio;
    this.dirLight.intensity = 0.55 + ratio * 0.65;
    this.fog.density = 0.012 - ratio * 0.005;

    // 3. Lanterns (v1.2: fuel bar, 1 Hz low-fuel blink, squished/torn unlit lantern)
    const lowFuelBlinkOn = this.reducedMotion ? true : Math.floor(this.animTime * 2) % 2 === 0;
    for (const lantern of snapshot.lanterns) {
      let visual = this.lanternVisuals.get(lantern.id);
      if (!visual) {
        visual = this.createLanternVisual(lantern.id, lantern.pos);
      }
      visual.group.position.set(lantern.pos[0], lantern.pos[1], lantern.pos[2]);
      visual.orbMesh.rotation.y += dt * (lantern.lit ? 1.4 : 0.25);

      if (lantern.lit) {
        const lowFuel = lantern.fuel < this.tuning.low_fuel_threshold;
        visual.orbMesh.scale.set(1, 1, 1);
        visual.tearGroup.visible = false;
        visual.fuelBarGroup.visible = true;
        visual.fuelBarGroup.lookAt(this.camera.position);

        const frac = Math.max(0.01, Math.min(1, lantern.fuel / this.tuning.fuel_max));
        visual.fuelBarFill.scale.x = frac;
        visual.fuelBarFill.position.x = -(1 - frac) * 0.75;
        visual.fuelBarMat.color.setHex(
          lowFuel ? (this.colorblind ? 0xffffff : 0xff5a5f) : PALETTE.lanternLit
        );
        visual.fuelBarFill.visible = !lowFuel || lowFuelBlinkOn;

        visual.orbMat.color.setHex(PALETTE.lanternCore);
        visual.orbMat.emissive.setHex(PALETTE.lanternLit);
        visual.orbMat.emissiveIntensity = lowFuel
          ? lowFuelBlinkOn
            ? 2.2
            : 0.45
          : 2.0 + Math.sin(this.animTime * 3) * 0.25;
        visual.light.intensity = lowFuel ? (lowFuelBlinkOn ? 5.5 : 1.5) : 7.0;
        visual.safeRingMat.opacity = lowFuel ? 0 : 0.34;
      } else {
        const req = lantern.everLit ? this.tuning.relight_cost : this.tuning.lantern_cost;
        const progress = Math.min(1, lantern.deposited / Math.max(1, req));
        // Unlit lantern is deflated 20% with torn paper marks
        visual.orbMesh.scale.set(1.06, 0.8, 1.06);
        visual.tearGroup.visible = true;
        visual.fuelBarGroup.visible = false;

        visual.orbMat.color.setHex(PALETTE.lanternOff);
        visual.orbMat.emissive.setHex(progress > 0 ? PALETTE.lanternLit : PALETTE.lanternOff);
        visual.orbMat.emissiveIntensity = 0.3 + progress * 0.9;
        visual.light.intensity = progress * 2.0;
        visual.safeRingMat.opacity = 0;
      }
    }

    // 4. Motes
    const activeMoteIds = new Set<string>();
    for (let i = 0; i < snapshot.motes.length; i++) {
      const mote = snapshot.motes[i];
      activeMoteIds.add(mote.id);
      let group = this.moteMeshes.get(mote.id);
      if (!group) {
        group = new THREE.Group();
        group.add(new THREE.Mesh(this.moteCoreGeom, this.moteCoreMat));
        group.add(new THREE.Mesh(this.moteHaloGeom, this.moteHaloMat));
        this.scene.add(group);
        this.moteMeshes.set(mote.id, group);
      }
      const bob = Math.sin(this.animTime * 3.5 + i * 0.9) * 0.16;
      group.position.set(mote.pos[0], mote.pos[1] + 0.8 + bob, mote.pos[2]);
    }
    for (const [id, mesh] of this.moteMeshes.entries()) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(mesh);
        this.moteMeshes.delete(id);
      }
    }

    // 5. Shades
    const activeShadeIds = new Set<string>();
    for (const shade of snapshot.shades) {
      activeShadeIds.add(shade.id);
      let group = this.shadeGroups.get(shade.id);
      if (!group) group = this.createShadeGroup(shade.id);

      group.position.set(shade.pos[0], shade.pos[1], shade.pos[2]);
      const dx = snapshot.player.pos[0] - shade.pos[0];
      const dz = snapshot.player.pos[2] - shade.pos[2];
      if (shade.state === "stunned") {
        group.rotation.y += dt * 10;
      } else if (dx * dx + dz * dz > 1e-4) {
        group.rotation.y = Math.atan2(dx, dz);
      }
      group.scale.setScalar(shade.state === "spawning" ? 0.65 : 1.0);
      const body = group.getObjectByName("body") as THREE.Mesh | undefined;
      if (body) {
        if (shade.state === "stunned") {
          body.material = this.shadeMatStunned;
        } else if (shade.state === "drain") {
          body.material = this.colorblind ? this.shadeMatDrainCB : this.shadeMatDrain;
        } else {
          body.material = this.colorblind ? this.shadeMatColorblind : this.shadeMatNormal;
        }
      }
      const eyeMat = this.colorblind ? this.shadeEyeMatCB : this.shadeEyeMatNormal;
      for (const eyeName of ["eyeL", "eyeR"]) {
        const eye = group.getObjectByName(eyeName) as THREE.Mesh | undefined;
        if (eye) eye.material = eyeMat;
      }
    }
    for (const [id, group] of this.shadeGroups.entries()) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(group);
        this.shadeGroups.delete(id);
      }
    }

    // 6. Drifters (Gió Lạc)
    const activeDrifterIds = new Set<string>();
    for (const drifter of snapshot.drifters) {
      activeDrifterIds.add(drifter.id);
      let group = this.drifterGroups.get(drifter.id);
      if (!group) group = this.createDrifterGroup(drifter.id);
      group.position.set(
        drifter.pos[0],
        drifter.pos[1] + Math.sin(this.animTime * 5) * 0.2,
        drifter.pos[2]
      );
      group.rotation.y = Math.atan2(
        snapshot.player.pos[0] - drifter.pos[0],
        snapshot.player.pos[2] - drifter.pos[2]
      );
    }
    for (const [id, group] of this.drifterGroups.entries()) {
      if (!activeDrifterIds.has(id)) {
        this.scene.remove(group);
        this.drifterGroups.delete(id);
      }
    }

    // 7. Charms (Bùa Gió)
    const activeCharmIds = new Set<string>();
    for (const charm of snapshot.charms) {
      activeCharmIds.add(charm.id);
      let group = this.charmGroups.get(charm.id);
      if (!group) group = this.createCharmGroup(charm.id);
      group.visible = charm.available;
      group.position.set(charm.pos[0], charm.pos[1] + Math.sin(this.animTime * 3) * 0.15, charm.pos[2]);
      group.rotation.y += dt * 1.8;
    }
    for (const [id, group] of this.charmGroups.entries()) {
      if (!activeCharmIds.has(id)) {
        this.scene.remove(group);
        this.charmGroups.delete(id);
      }
    }

    // 8. Wind leaves (warning 2s before gust + active gust)
    const showLeaves = snapshot.wind.warning || snapshot.wind.active;
    const wRad = (snapshot.wind.dir_deg * Math.PI) / 180;
    const wx = Math.cos(wRad);
    const wz = Math.sin(wRad);
    for (let i = 0; i < this.windLeaves.length; i++) {
      const leaf = this.windLeaves[i];
      leaf.visible = showLeaves;
      if (!showLeaves) continue;
      const speed = snapshot.wind.active ? 18 : 8;
      const phase = ((this.animTime * speed + i * 3.1) % 36) - 18;
      const side = ((i * 7) % 24) - 12;
      leaf.position.set(
        snapshot.player.pos[0] + wx * phase - wz * side,
        snapshot.player.pos[1] + 1.5 + (i % 5) * 0.8,
        snapshot.player.pos[2] + wz * phase + wx * side
      );
      leaf.rotation.set(this.animTime * 4 + i, this.animTime * 3, i);
    }

    // 9. Pulse waves
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

    // 10. Clouds drift
    for (let i = 0; i < this.cloudMeshes.length; i++) {
      this.cloudMeshes[i].position.y = -3.4 + Math.sin(this.animTime * 0.5 + i) * 0.4;
    }

    // 11. Camera
    if (overrideCameraPos) {
      this.camera.position.set(overrideCameraPos[0], overrideCameraPos[1], overrideCameraPos[2]);
      const look = cameraFocus ?? [0, 0, 0];
      this.camera.lookAt(look[0], look[1], look[2]);
    } else {
      const focus = cameraFocus ?? [
        snapshot.player.pos[0],
        snapshot.player.pos[1] + 1.3,
        snapshot.player.pos[2]
      ];
      const yawRad = (camYawDeg * Math.PI) / 180;
      const camDist = cameraFocus ? 15 : 12;
      const camHeight = cameraFocus ? 6.5 : 7.0;
      const targetCamX = focus[0] - Math.sin(yawRad) * camDist;
      const targetCamZ = focus[2] - Math.cos(yawRad) * camDist;
      const targetCamY = Math.max(1.5, focus[1] + camHeight - 1.3);

      const lerpAlpha = this.reducedMotion ? 1.0 : 0.16;
      this.camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), lerpAlpha);
      this.camera.lookAt(focus[0], focus[1], focus[2]);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
