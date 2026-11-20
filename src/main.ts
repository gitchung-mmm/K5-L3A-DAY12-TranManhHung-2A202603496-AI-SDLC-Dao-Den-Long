import { GameEngine } from "./core/engine.js";
import { distXZ } from "./core/math.js";
import { DEFAULT_TUNING, DT } from "./core/tuning.js";
import type { Vec2 } from "./core/types.js";
import { ProceduralAudio } from "./game/audio.js";
import { IslandSceneView } from "./game/scene.js";

const appEl = document.getElementById("app")!;
const flamesEl = document.getElementById("hud-flames")!;
const carriedEl = document.getElementById("hud-carried")!;
const lanternsEl = document.getElementById("hud-lanterns")!;
const timeEl = document.getElementById("hud-time")!;
const scoreEl = document.getElementById("hud-score")!;
const pulseEl = document.getElementById("hud-pulse")!;
const promptEl = document.getElementById("hud-prompt")!;
const overlayEl = document.getElementById("overlay")!;
const overlayTitleEl = document.getElementById("overlay-title")!;
const overlayDescEl = document.getElementById("overlay-desc")!;
const btnSound = document.getElementById("btn-sound") as HTMLButtonElement;
const btnRestart = document.getElementById("btn-restart") as HTMLButtonElement;
const btnRestartTop = document.getElementById("btn-restart-top") as HTMLButtonElement;

const view = new IslandSceneView(appEl, DEFAULT_TUNING);
const audio = new ProceduralAudio();

let seed = 101;
let engine = new GameEngine({ seed, night: 1, tuning: DEFAULT_TUNING });
let camYawDeg = 0;
let started = false;

overlayTitleEl.textContent = "Đảo Đèn Lồng — Đêm 1: Đảo Bến";
overlayDescEl.textContent =
  "Giúp Mây thu thập đom đóm để thắp sáng 5 Đèn Lồng Lớn và né Bóng Mực. Nhấn Shift/R hoặc chuột phải để tỏa sáng xua chúng đi.";
btnRestart.textContent = "Bắt đầu Đêm 1";
overlayEl.classList.add("visible");

const keys = new Set<string>();
let dragging = false;
let lastMouseX = 0;
let pulseMouseQueued = false;

window.addEventListener("keydown", (e) => {
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
  camYawDeg -= dx * 0.35;
});
view.renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

function resetGame(): void {
  if (!started && engine.getTick() === 0) {
    started = true;
    overlayEl.classList.remove("visible");
    btnRestart.textContent = "Chơi lại Đêm 1";
    return;
  }
  seed += 1;
  engine = new GameEngine({ seed, night: 1, tuning: DEFAULT_TUNING });
  camYawDeg = 0;
  started = true;
  btnRestart.textContent = "Chơi lại Đêm 1";
  overlayEl.classList.remove("visible");
}

btnRestart.addEventListener("click", resetGame);
btnRestartTop.addEventListener("click", resetGame);
btnSound.addEventListener("click", () => {
  const on = audio.toggle();
  btnSound.textContent = on ? "Âm thanh: Bật" : "Âm thanh: Tắt";
});

function readMoveInput(): Vec2 {
  let x = 0;
  let z = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z -= 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x += 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x -= 1;
  return [x, z];
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function updateHud(): void {
  const snap = engine.getViewState();
  const litCount = snap.lanterns.filter((l) => l.lit).length;

  flamesEl.textContent = `${"🔥".repeat(snap.player.flames)}${snap.player.flames === 0 ? "0" : ""}`;
  carriedEl.textContent = `${snap.player.carried} / ${DEFAULT_TUNING.carry_capacity}`;
  lanternsEl.textContent = `${litCount} / ${snap.lanterns.length}`;
  timeEl.textContent = formatTime(snap.timeLeftS);
  scoreEl.textContent = `${snap.score}`;
  pulseEl.textContent =
    snap.player.pulseCooldownTimer > 0
      ? `${snap.player.pulseCooldownTimer.toFixed(1)}s`
      : snap.player.carried >= DEFAULT_TUNING.pulse_cost
        ? "Sẵn sàng"
        : "Thiếu sáng";

  const nearUnlit = snap.lanterns.some(
    (l) => !l.lit && distXZ(snap.player.pos, l.pos) <= DEFAULT_TUNING.interact_radius
  );
  if (nearUnlit && snap.player.carried > 0 && snap.state === "playing") {
    promptEl.classList.add("visible");
  } else {
    promptEl.classList.remove("visible");
  }

  if (snap.state !== "playing") {
    overlayEl.classList.add("visible");
    if (snap.state === "won") {
      overlayTitleEl.textContent = "Đảo Bến Đã Sáng Rực!";
      overlayDescEl.textContent = `Mây đã thắp sáng cả 5 Đèn Lồng Lớn. Điểm cuối cùng: ${snap.score}.`;
    } else {
      overlayTitleEl.textContent = "Sương Đen Đã Bao Phủ...";
      overlayDescEl.textContent =
        snap.player.flames <= 0
          ? `Mây đã mất hết ngọn lửa. Điểm đạt được: ${snap.score}.`
          : `Hết thời gian trước khi thắp đủ đèn. Điểm đạt được: ${snap.score}.`;
    }
  }
}

let lastTime = performance.now();
let accumulator = 0;

function animate(now: number): void {
  requestAnimationFrame(animate);
  const elapsed = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  if (keys.has("KeyQ")) camYawDeg += 110 * elapsed;
  if (keys.has("KeyC")) camYawDeg -= 110 * elapsed;

  accumulator += elapsed;
  while (accumulator >= DT) {
    if (started && !engine.isFinished()) {
      const events = engine.step({
        tick: engine.getTick(),
        move: readMoveInput(),
        cam_yaw_deg: camYawDeg,
        jump: keys.has("Space"),
        interact: keys.has("KeyE") || keys.has("KeyF"),
        pulse: keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("KeyR") || pulseMouseQueued
      });
      pulseMouseQueued = false;

      for (const ev of events) {
        if (ev.name === "mote_picked") audio.playPickup();
        else if (ev.name === "deposit") audio.playDeposit();
        else if (ev.name === "lantern_lit") audio.playLanternLit();
        else if (ev.name === "pulse") {
          audio.playPulse();
          view.spawnPulseWave(engine.getViewState().player.pos);
        } else if (ev.name === "player_hit") audio.playHit();
      }
    }
    accumulator -= DT;
  }

  const snap = engine.getViewState();
  view.sync(snap, camYawDeg, elapsed);
  updateHud();
}

updateHud();
requestAnimationFrame(animate);
