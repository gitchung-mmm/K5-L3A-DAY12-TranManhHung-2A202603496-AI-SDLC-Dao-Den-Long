import { GameEngine } from "./core/engine.js";
import { getNightMap } from "./core/maps.js";
import { distXZ } from "./core/math.js";
import { DEFAULT_TUNING, DT } from "./core/tuning.js";
import type { NightNumber, Vec2 } from "./core/types.js";
import { ProceduralAudio } from "./game/audio.js";
import { CreativeWorld, type CreativeHudState } from "./game/creative.js";
import { IslandSceneView } from "./game/scene.js";

const SETTINGS_KEY = "dao-den-long-settings-v1";

interface SavedSettings {
  volume: number;
  mouseSensitivity: number;
}

function loadSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedSettings>;
      return {
        volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(1, parsed.volume)) : 0.7,
        mouseSensitivity:
          typeof parsed.mouseSensitivity === "number"
            ? Math.max(0.1, Math.min(1.0, parsed.mouseSensitivity))
            : 0.35
      };
    }
  } catch {
    // ignore storage errors
  }
  return { volume: 0.7, mouseSensitivity: 0.35 };
}

function saveSettings(s: SavedSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore storage errors
  }
}

const appEl = document.getElementById("app")!;
const flamesEl = document.getElementById("hud-flames")!;
const fpsEl = document.getElementById("hud-fps")!;
const charmEl = document.getElementById("hud-charm")!;
const timeEl = document.getElementById("hud-time")!;
const nightNameEl = document.getElementById("hud-night-name")!;
const windEl = document.getElementById("hud-wind")!;
const lanternsEl = document.getElementById("hud-lanterns")!;
const scoreEl = document.getElementById("hud-score")!;
const promptEl = document.getElementById("hud-prompt")!;
const bannerEl = document.getElementById("hud-banner")!;
const moteSlotsEl = document.getElementById("hud-mote-slots")!;
const dashBadgeEl = document.getElementById("badge-dash")!;
const dashEl = document.getElementById("hud-dash")!;
const pulseBadgeEl = document.getElementById("badge-pulse")!;
const pulseEl = document.getElementById("hud-pulse")!;
const arrowEl = document.getElementById("lantern-arrow")!;

const modalMenu = document.getElementById("modal-menu")!;
const modalIntro = document.getElementById("modal-intro")!;
const modalPause = document.getElementById("modal-pause")!;
const modalSettings = document.getElementById("modal-settings")!;
const modalResult = document.getElementById("modal-result")!;

const introTitleEl = document.getElementById("intro-title")!;
const introQuoteEl = document.getElementById("intro-quote")!;
const resultTitleEl = document.getElementById("result-title")!;
const resultDescEl = document.getElementById("result-desc")!;
const btnResultPrimary = document.getElementById("btn-result-primary") as HTMLButtonElement;

const optVolume = document.getElementById("opt-volume") as HTMLInputElement;
const optVolumeVal = document.getElementById("opt-volume-val")!;
const optSens = document.getElementById("opt-sens") as HTMLInputElement;
const optSensVal = document.getElementById("opt-sens-val")!;

// Build 10 mote slots
const slotEls: HTMLDivElement[] = [];
for (let i = 0; i < DEFAULT_TUNING.carry_capacity; i++) {
  const slot = document.createElement("div");
  slot.className = "mote-slot";
  moteSlotsEl.appendChild(slot);
  slotEls.push(slot);
}

const settings = loadSettings();
const view = new IslandSceneView(appEl, DEFAULT_TUNING);
const creative = new CreativeWorld(view.scene, DEFAULT_TUNING);
const audio = new ProceduralAudio();
audio.setVolume(settings.volume);

optVolume.value = String(Math.round(settings.volume * 100));
optVolumeVal.textContent = `${optVolume.value}%`;
optSens.value = String(Math.round(settings.mouseSensitivity * 100));
optSensVal.textContent = settings.mouseSensitivity.toFixed(2);

type ScreenMode = "menu" | "intro" | "playing" | "paused" | "result";
let screenMode: ScreenMode = "menu";
let settingsReturnTo: "menu" | "paused" = "menu";
let currentNight: NightNumber = 1;
let totalCampaignScore = 0;
let seed = 101;
let engine = new GameEngine({ seed, night: 1, tuning: DEFAULT_TUNING });
let camYawDeg = 0;
let lastCountdownSec = 11;
let prevWindWarn = false;
let resultShownForRun = false;

let creativeHud: CreativeHudState = {
  npcDialogue: null,
  slowed: false,
  speedMultiplier: 1,
  storyText: null,
  endingActive: false,
  cameraFocus: null,
  cues: []
};

const keys = new Set<string>();
let dragging = false;
let lastMouseX = 0;
let pulseMouseQueued = false;
let pauseKeyQueued = false;

// FPS tracker for Phase 2 DoD (>= 30 FPS at 1280x720)
let frameCount = 0;
let fpsSum = 0;
let lastFps = 60;
(window as unknown as { __gameMetrics?: unknown }).__gameMetrics = {
  get avgFps() {
    return frameCount > 0 ? fpsSum / frameCount : lastFps;
  },
  get frames() {
    return frameCount;
  },
  get night() {
    return currentNight;
  },
  get screenMode() {
    return screenMode;
  }
};

function showOnlyModal(active: HTMLElement | null): void {
  for (const m of [modalMenu, modalIntro, modalPause, modalSettings, modalResult]) {
    m.classList.toggle("visible", m === active);
  }
}

function openIntroForNight(night: NightNumber, resetCampaign = false): void {
  currentNight = night;
  if (resetCampaign) totalCampaignScore = 0;
  const mapDef = getNightMap(night);
  introTitleEl.textContent = mapDef.name;
  introQuoteEl.textContent = mapDef.introQuote;
  nightNameEl.textContent = mapDef.name;
  view.loadNight(night);
  screenMode = "intro";
  showOnlyModal(modalIntro);
}

function startNight(night: NightNumber): void {
  currentNight = night;
  seed += 1;
  engine = new GameEngine({ seed, night, tuning: DEFAULT_TUNING });
  view.loadNight(night);
  creative.reset();
  camYawDeg = 0;
  lastCountdownSec = 11;
  prevWindWarn = false;
  resultShownForRun = false;
  nightNameEl.textContent = getNightMap(night).name;
  screenMode = "playing";
  showOnlyModal(null);
  audio.startMusic();
}

function togglePauseViaEngine(): void {
  if (screenMode === "playing" || screenMode === "paused") {
    pauseKeyQueued = true;
  }
}

function openMenu(): void {
  screenMode = "menu";
  audio.stopMusic();
  showOnlyModal(modalMenu);
}

// UI Bindings
document.getElementById("btn-play-campaign")!.addEventListener("click", () => {
  openIntroForNight(1, true);
});
for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-select-night]")) {
  btn.addEventListener("click", () => {
    const n = Number(btn.dataset.selectNight) as NightNumber;
    openIntroForNight(n, n === 1);
  });
}
document.getElementById("btn-start-night")!.addEventListener("click", () => {
  startNight(currentNight);
});
document.getElementById("btn-intro-back")!.addEventListener("click", openMenu);
document.getElementById("btn-pause")!.addEventListener("click", togglePauseViaEngine);
document.getElementById("btn-resume")!.addEventListener("click", togglePauseViaEngine);
document.getElementById("btn-pause-retry")!.addEventListener("click", () => startNight(currentNight));
document.getElementById("btn-pause-menu")!.addEventListener("click", openMenu);

document.getElementById("btn-open-settings-menu")!.addEventListener("click", () => {
  settingsReturnTo = "menu";
  showOnlyModal(modalSettings);
});
document.getElementById("btn-pause-settings")!.addEventListener("click", () => {
  settingsReturnTo = "paused";
  showOnlyModal(modalSettings);
});
document.getElementById("btn-settings-close")!.addEventListener("click", () => {
  saveSettings(settings);
  showOnlyModal(settingsReturnTo === "menu" ? modalMenu : modalPause);
});

optVolume.addEventListener("input", () => {
  const v = Number(optVolume.value) / 100;
  settings.volume = v;
  optVolumeVal.textContent = `${optVolume.value}%`;
  audio.setVolume(v);
  saveSettings(settings);
});
optSens.addEventListener("input", () => {
  const s = Number(optSens.value) / 100;
  settings.mouseSensitivity = s;
  optSensVal.textContent = s.toFixed(2);
  saveSettings(settings);
});

document.getElementById("btn-result-menu")!.addEventListener("click", openMenu);
btnResultPrimary.addEventListener("click", () => {
  const snap = engine.getViewState();
  if (snap.state === "won") {
    if (currentNight < 3) {
      openIntroForNight((currentNight + 1) as NightNumber, false);
    } else {
      openIntroForNight(1, true);
    }
  } else {
    startNight(currentNight);
  }
});

// Keyboard & mouse listeners
window.addEventListener("keydown", (e) => {
  if (!keys.has(e.code) && (e.code === "Escape" || e.code === "KeyP")) {
    togglePauseViaEngine();
  }
  keys.add(e.code);
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});

view.renderer.domElement.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    dragging = true;
    lastMouseX = e.clientX;
  } else if (e.button === 2) {
    pulseMouseQueued = true;
  }
});
window.addEventListener("mouseup", () => {
  dragging = false;
});
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMouseX;
  lastMouseX = e.clientX;
  camYawDeg -= dx * settings.mouseSensitivity;
});
view.renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

function readMoveInput(): Vec2 {
  let x = 0;
  let z = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z -= 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x += 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x -= 1;
  const mult = creativeHud.speedMultiplier;
  return [x * mult, z * mult];
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function updateOffscreenArrow(snap: ReturnType<GameEngine["getViewState"]>): void {
  if (screenMode !== "playing") {
    arrowEl.style.display = "none";
    return;
  }
  let nearest: { pos: [number, number, number]; dist: number } | null = null;
  for (const l of snap.lanterns) {
    if (l.lit) continue;
    const d = distXZ(snap.player.pos, l.pos);
    if (!nearest || d < nearest.dist) {
      nearest = { pos: l.pos, dist: d };
    }
  }
  if (!nearest) {
    arrowEl.style.display = "none";
    return;
  }
  const proj = view.projectToScreen(nearest.pos);
  if (proj.onScreen) {
    arrowEl.style.display = "none";
    return;
  }
  let nx = proj.inFront ? proj.x : -proj.x;
  let ny = proj.inFront ? proj.y : -proj.y;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const px = Math.max(48, Math.min(w - 48, w / 2 + nx * (w / 2 - 48)));
  const py = Math.max(108, Math.min(h - 115, h / 2 - ny * (h / 2 - 108)));
  const angleDeg = (Math.atan2(nx, ny) * 180) / Math.PI;

  arrowEl.style.display = "flex";
  arrowEl.style.left = `${px}px`;
  arrowEl.style.top = `${py}px`;
  arrowEl.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
}

function updateHud(): void {
  const snap = engine.getViewState();
  const litCount = snap.lanterns.filter((l) => l.lit).length;

  flamesEl.textContent = snap.player.flames > 0 ? "🔥".repeat(snap.player.flames) : "0";
  lanternsEl.textContent = `${litCount} / ${snap.lanterns.length}`;
  scoreEl.textContent = `${snap.score}`;

  timeEl.textContent = formatTime(snap.timeLeftS);
  timeEl.classList.toggle("danger", snap.timeLeftS <= 30 && snap.state === "playing");

  // Charm indicator
  if (snap.player.charmTimer > 0) {
    charmEl.textContent = `Bùa Gió: ${snap.player.charmTimer.toFixed(1)}s`;
    charmEl.classList.add("visible");
  } else {
    charmEl.classList.remove("visible");
  }

  // Wind indicator (Night 3)
  if (snap.wind.warning) {
    windEl.textContent = "Gió lớn sắp tới (2s)!";
    windEl.classList.add("visible");
  } else if (snap.wind.active) {
    windEl.textContent = `Gió mạnh đang thổi (${Math.round(snap.wind.dir_deg)}°)!`;
    windEl.classList.add("visible");
  } else {
    windEl.classList.remove("visible");
  }

  // 10-slot mote bar
  for (let i = 0; i < slotEls.length; i++) {
    slotEls[i].classList.toggle("filled", i < snap.player.carried);
  }

  // Dash & Pulse cooldown badges
  if (snap.player.charmTimer > 0) {
    dashEl.textContent = "Không hồi chiêu!";
    dashBadgeEl.classList.remove("cooldown");
  } else if (snap.player.dashCooldownTimer > 0) {
    dashEl.textContent = `${snap.player.dashCooldownTimer.toFixed(1)}s`;
    dashBadgeEl.classList.add("cooldown");
  } else {
    dashEl.textContent = "Sẵn sàng";
    dashBadgeEl.classList.remove("cooldown");
  }

  if (snap.player.pulseCooldownTimer > 0) {
    pulseEl.textContent = `${snap.player.pulseCooldownTimer.toFixed(1)}s`;
    pulseBadgeEl.classList.add("cooldown");
  } else if (snap.player.carried >= DEFAULT_TUNING.pulse_cost) {
    pulseEl.textContent = "Sẵn sàng";
    pulseBadgeEl.classList.remove("cooldown");
  } else {
    pulseEl.textContent = `Cần ${DEFAULT_TUNING.pulse_cost}`;
    pulseBadgeEl.classList.add("cooldown");
  }

  // Nearby unlit lantern prompt: "E — Nạp ánh sáng (x/10)"
  let nearLantern = null;
  for (const l of snap.lanterns) {
    if (!l.lit && distXZ(snap.player.pos, l.pos) <= DEFAULT_TUNING.interact_radius) {
      nearLantern = l;
      break;
    }
  }
  if (nearLantern && snap.state === "playing") {
    promptEl.textContent = `E — Nạp ánh sáng (${nearLantern.deposited}/${DEFAULT_TUNING.lantern_cost})`;
    promptEl.classList.add("visible");
  } else {
    promptEl.classList.remove("visible");
  }

  // Story / NPC / Slow banner
  if (creativeHud.slowed && snap.state === "playing") {
    bannerEl.textContent = "Bị Sương Giăng chạm phải — tốc độ di chuyển tạm chậm!";
    bannerEl.className = "npc-banner visible warning";
  } else if (creativeHud.npcDialogue && screenMode === "playing") {
    bannerEl.textContent = creativeHud.npcDialogue;
    bannerEl.className = "npc-banner visible";
  } else if (creativeHud.storyText && (screenMode === "playing" || creativeHud.endingActive)) {
    bannerEl.textContent = creativeHud.storyText;
    bannerEl.className = "npc-banner visible";
  } else {
    bannerEl.className = "npc-banner";
  }

  updateOffscreenArrow(snap);

  // Result / Dawn overlay
  if (snap.state !== "playing" && snap.state !== "paused" && !resultShownForRun) {
    if (snap.state === "won" && currentNight === 1 && creativeHud.endingActive) {
      return; // allow Night 1 boat farewell animation to play briefly
    }
    resultShownForRun = true;
    screenMode = "result";
    audio.stopMusic();

    if (snap.state === "won") {
      totalCampaignScore += snap.score;
      audio.playWin();
      if (currentNight === 3) {
        resultTitleEl.textContent = "Bình Minh Trên Ba Hòn Đảo!";
        resultDescEl.textContent = `Mây đã thắp sáng trọn vẹn 3 Đêm! Điểm Đêm 3: ${snap.score} · Tổng điểm toàn hành trình: ${totalCampaignScore}.`;
        btnResultPrimary.textContent = "Chơi lại từ Đêm 1";
      } else {
        resultTitleEl.textContent = `Hoàn thành ${getNightMap(currentNight).name}!`;
        resultDescEl.textContent = `Điểm Đêm ${currentNight}: ${snap.score} · Tổng điểm tích lũy: ${totalCampaignScore}.`;
        btnResultPrimary.textContent = `Sang Đêm ${currentNight + 1}`;
      }
    } else {
      audio.playLose();
      resultTitleEl.textContent = "Sương Đen Đã Bao Phủ...";
      resultDescEl.textContent =
        snap.player.flames <= 0
          ? `Mây đã mất hết Ngọn Lửa. Điểm Đêm ${currentNight}: ${snap.score}.`
          : `Bình minh tới trước khi thắp đủ đèn. Điểm Đêm ${currentNight}: ${snap.score}.`;
      btnResultPrimary.textContent = `Chơi lại Đêm ${currentNight}`;
    }
    showOnlyModal(modalResult);
  }
}

let lastTime = performance.now();
let accumulator = 0;
let prevJumpHeld = false;

function animate(now: number): void {
  requestAnimationFrame(animate);
  const rawElapsed = (now - lastTime) / 1000;
  lastTime = now;

  if (rawElapsed > 0 && rawElapsed < 0.5) {
    lastFps = 1 / rawElapsed;
    frameCount += 1;
    fpsSum += lastFps;
    if (frameCount % 15 === 0) {
      const avg = Math.round(fpsSum / frameCount);
      fpsEl.textContent = `FPS: ${avg}`;
    }
  }

  const elapsed = Math.min(0.1, rawElapsed);

  if (screenMode === "playing") {
    if (keys.has("KeyQ")) camYawDeg += 110 * elapsed;
    if (keys.has("KeyC")) camYawDeg -= 110 * elapsed;
  }

  accumulator += elapsed;
  while (accumulator >= DT) {
    if ((screenMode === "playing" || screenMode === "paused") && !engine.isFinished()) {
      const pausePressed = pauseKeyQueued;
      pauseKeyQueued = false;
      const jumpHeld = keys.has("Space");
      const jumpEdge = jumpHeld && !prevJumpHeld;
      prevJumpHeld = jumpHeld;

      const events = engine.step({
        tick: engine.getTick(),
        move: screenMode === "playing" ? readMoveInput() : [0, 0],
        cam_yaw_deg: camYawDeg,
        jump: screenMode === "playing" ? jumpHeld : false,
        interact: screenMode === "playing" ? keys.has("KeyE") || keys.has("KeyF") : false,
        pulse: screenMode === "playing" ? keys.has("KeyR") || pulseMouseQueued : false,
        dash: screenMode === "playing" ? keys.has("ShiftLeft") || keys.has("ShiftRight") : false,
        pause: pausePressed
      });
      pulseMouseQueued = false;

      // Clear pause button state on next tick by sending false when no queue
      if (jumpEdge && screenMode === "playing" && engine.getViewState().player.velY > 5) {
        audio.playJump();
      }

      for (const ev of events) {
        if (ev.name === "paused") {
          screenMode = "paused";
          showOnlyModal(modalPause);
        } else if (ev.name === "resumed") {
          screenMode = "playing";
          showOnlyModal(null);
        } else if (ev.name === "mote_picked" || ev.name === "charm_picked") {
          audio.playPickup();
        } else if (ev.name === "deposit") {
          audio.playDeposit();
        } else if (ev.name === "lantern_lit") {
          audio.playLanternLit();
        } else if (ev.name === "dash") {
          audio.playDash();
        } else if (ev.name === "shade_spawned") {
          audio.playShadeSpawn();
        } else if (ev.name === "pulse") {
          audio.playPulse();
          const pPos = engine.getViewState().player.pos;
          view.spawnPulseWave(pPos);
          creative.onPulse(pPos);
        } else if (ev.name === "player_hit") {
          audio.playHit();
        }
      }

      const cur = engine.getViewState();
      if (cur.state === "playing") {
        const secCeil = Math.ceil(cur.timeLeftS);
        if (secCeil <= 10 && secCeil > 0 && secCeil < lastCountdownSec) {
          lastCountdownSec = secCeil;
          audio.playCountdownTick();
        }
        if (cur.wind.warning && !prevWindWarn) {
          audio.playWindWarn();
        }
        prevWindWarn = cur.wind.warning;
      }
    }
    accumulator -= DT;
  }

  const snap = engine.getViewState();
  if (screenMode === "playing" || screenMode === "result") {
    creativeHud = creative.update(snap, elapsed, camYawDeg);
    for (const cue of creativeHud.cues) {
      audio.playStory(cue);
    }
  }
  view.sync(snap, camYawDeg, elapsed, creativeHud.cameraFocus);
  updateHud();
}

updateHud();
requestAnimationFrame(animate);
