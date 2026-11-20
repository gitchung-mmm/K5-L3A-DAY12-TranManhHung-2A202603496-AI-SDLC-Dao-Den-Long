import { BenchmarkSimulation } from "./core/bench-sim.js";
import { GameEngine } from "./core/engine.js";
import {
  addLeaderboardEntry,
  isValidLeaderboardName,
  sortAndTrimLeaderboard,
  type LeaderboardEntry
} from "./core/leaderboard.js";
import { getNightMap } from "./core/maps.js";
import { distXZ } from "./core/math.js";
import { DEFAULT_TUNING, DT } from "./core/tuning.js";
import type { NightNumber, Vec2, Vec3 } from "./core/types.js";
import { ProceduralAudio } from "./game/audio.js";
import { CreativeWorld, type CreativeHudState } from "./game/creative.js";
import { IslandSceneView } from "./game/scene.js";

const SETTINGS_KEY = "dao-den-long-settings-v2";
const LEADERBOARD_LOCAL_KEY = "dao-den-long-leaderboard-v1";

type ActionName =
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "jump"
  | "dash"
  | "interact"
  | "pulse"
  | "pause";

type KeyBindings = Record<ActionName, string>;

const DEFAULT_KEYBINDINGS: KeyBindings = {
  moveUp: "KeyW",
  moveDown: "KeyS",
  moveLeft: "KeyA",
  moveRight: "KeyD",
  jump: "Space",
  dash: "ShiftLeft",
  interact: "KeyE",
  pulse: "KeyR",
  pause: "Escape"
};

const ACTION_LABELS: Record<ActionName, string> = {
  moveUp: "Đi tiến",
  moveDown: "Đi lùi",
  moveLeft: "Đi trái",
  moveRight: "Đi phải",
  jump: "Nhảy",
  dash: "Lướt",
  interact: "Nạp / Châm dầu",
  pulse: "Tỏa Sáng",
  pause: "Tạm dừng"
};

interface SavedSettings {
  volume: number;
  mouseSensitivity: number;
  colorblind: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  keybindings: KeyBindings;
}

function formatKeyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (code === "Escape") return "Esc";
  return code;
}

// =========================================================================
// BENCHMARK MODE (?bench=1&seed=42&duration=30&startMs=...)
// Standardized Ticket-04 scene: 200 shades, 100 motes, L1..L3 lit, no creative
// =========================================================================
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("bench") === "1") {
  document.body.classList.add("bench-mode");
  const seed = Number.parseInt(urlParams.get("seed") ?? "42", 10) || 42;
  const durationS = Math.max(1, Number.parseFloat(urlParams.get("duration") ?? "30") || 30);
  const startMs = Number.parseInt(urlParams.get("startMs") ?? String(Date.now()), 10);

  const appEl = document.getElementById("app")!;
  const view = new IslandSceneView(appEl, DEFAULT_TUNING);
  view.setBenchMode(true);
  view.loadNight(1);

  const sim = new BenchmarkSimulation(seed);
  const warmupS = 3.0;
  let elapsedS = 0;
  let loadMs = 0;
  let firstFrame = true;
  let prevNow = performance.now();
  let accumulator = 0;
  const dtsMs: number[] = [];
  let done = false;

  const benchLoop = (now: number): void => {
    if (done) return;
    const rawDtMs = now - prevNow;
    prevNow = now;
    const clampedS = Math.min(0.1, Math.max(0.0001, rawDtMs / 1000));

    accumulator += clampedS;
    while (accumulator >= DT) {
      sim.step();
      accumulator -= DT;
    }

    // Orbit camera around (0,0,0), radius 30m, Y=15m, starting at 0 deg (30,15,0), 15s/rev
    const angle = (elapsedS / 15) * Math.PI * 2;
    const camPos: Vec3 = [Math.cos(angle) * 30, 15, Math.sin(angle) * 30];
    view.sync(sim.getViewState(), 0, clampedS, [0, 0, 0], camPos);

    if (firstFrame) {
      firstFrame = false;
      loadMs = Math.max(1, Math.round(Date.now() - startMs));
      requestAnimationFrame(benchLoop);
      return;
    }

    elapsedS += rawDtMs / 1000;
    if (elapsedS > warmupS) {
      dtsMs.push(rawDtMs);
    }

    if (elapsedS >= warmupS + durationS) {
      done = true;
      const n = Math.max(1, dtsMs.length);
      const sumDt = dtsMs.reduce((a, b) => a + b, 0);
      const avgFps = Math.round(((1000 * n) / Math.max(1, sumDt)) * 10) / 10;

      const desc = [...dtsMs].sort((a, b) => b - a);
      const k = Math.max(1, Math.ceil(0.01 * n));
      const avgTopK = desc.slice(0, k).reduce((a, b) => a + b, 0) / k;
      const p1LowFps = Math.round((1000 / Math.max(0.01, avgTopK)) * 10) / 10;

      const asc = [...dtsMs].sort((a, b) => a - b);
      const p95 = Math.round(asc[Math.min(n - 1, Math.ceil(0.95 * n) - 1)] * 10) / 10;

      void fetch("/api/bench-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avg_fps: avgFps,
          p1_low_fps: p1LowFps,
          frame_ms_p95: p95,
          frames: n,
          load_ms: loadMs,
          renderer: view.getRendererInfo()
        })
      });
      return;
    }

    requestAnimationFrame(benchLoop);
  };

  requestAnimationFrame(benchLoop);
} else {
  // =========================================================================
  // NORMAL PLAYABLE GAME MODE
  // =========================================================================
  runGameApp();
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
            : 0.35,
        colorblind: Boolean(parsed.colorblind),
        reducedMotion: Boolean(parsed.reducedMotion),
        largeText: Boolean(parsed.largeText),
        keybindings: {
          ...DEFAULT_KEYBINDINGS,
          ...(parsed.keybindings ?? {})
        }
      };
    }
  } catch {
    // ignore
  }
  return {
    volume: 0.7,
    mouseSensitivity: 0.35,
    colorblind: false,
    reducedMotion: false,
    largeText: false,
    keybindings: { ...DEFAULT_KEYBINDINGS }
  };
}

function saveSettings(s: SavedSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

async function fetchLeaderboardEntries(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch("/api/leaderboard");
    if (res.ok) {
      const data = (await res.json()) as { entries?: LeaderboardEntry[] };
      if (Array.isArray(data.entries)) {
        const sorted = sortAndTrimLeaderboard(data.entries);
        try {
          localStorage.setItem(LEADERBOARD_LOCAL_KEY, JSON.stringify(sorted));
        } catch {
          // ignore
        }
        return sorted;
      }
    }
  } catch {
    // fallback to localStorage
  }
  try {
    const raw = localStorage.getItem(LEADERBOARD_LOCAL_KEY);
    if (raw) return sortAndTrimLeaderboard(JSON.parse(raw) as LeaderboardEntry[]);
  } catch {
    // ignore
  }
  return [];
}

async function persistLeaderboardEntry(
  name: string,
  score: number,
  nightsWon: number,
  seedVal: number
): Promise<LeaderboardEntry[]> {
  const local = await fetchLeaderboardEntries();
  const updatedLocal = addLeaderboardEntry(local, {
    name,
    score,
    nights_won: nightsWon,
    seed: seedVal
  });
  try {
    localStorage.setItem(LEADERBOARD_LOCAL_KEY, JSON.stringify(updatedLocal));
  } catch {
    // ignore
  }

  try {
    const res = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, score, nights_won: nightsWon, seed: seedVal })
    });
    if (res.ok) {
      const data = (await res.json()) as { entries?: LeaderboardEntry[] };
      if (Array.isArray(data.entries)) return data.entries;
    }
  } catch {
    // offline/vite preview fallback already saved to localStorage
  }
  return updatedLocal;
}

function runGameApp(): void {
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
  const capacityEl = document.getElementById("hud-capacity")!;
  const bannerEl = document.getElementById("hud-banner")!;
  const captionsEl = document.getElementById("hud-captions")!;
  const controlsHelpEl = document.getElementById("hud-controls-help")!;
  const moteSlotsEl = document.getElementById("hud-mote-slots")!;
  const dashBadgeEl = document.getElementById("badge-dash")!;
  const dashTitleEl = document.getElementById("ab-dash-title")!;
  const dashEl = document.getElementById("hud-dash")!;
  const pulseBadgeEl = document.getElementById("badge-pulse")!;
  const pulseTitleEl = document.getElementById("ab-pulse-title")!;
  const pulseEl = document.getElementById("hud-pulse")!;
  const lanternArrowEl = document.getElementById("lantern-arrow")!;
  const shadeArrowEl = document.getElementById("shade-arrow")!;

  const modalMenu = document.getElementById("modal-menu")!;
  const modalIntro = document.getElementById("modal-intro")!;
  const modalPause = document.getElementById("modal-pause")!;
  const modalSettings = document.getElementById("modal-settings")!;
  const modalLeaderboard = document.getElementById("modal-leaderboard")!;
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
  const optColorblind = document.getElementById("opt-colorblind") as HTMLInputElement;
  const optReducedMotion = document.getElementById("opt-reduced-motion") as HTMLInputElement;
  const optLargeText = document.getElementById("opt-large-text") as HTMLInputElement;
  const keybindGrid = document.getElementById("keybind-grid")!;
  const keybindMsg = document.getElementById("keybind-msg")!;

  const lbTbody = document.getElementById("lb-tbody")!;
  const lbSaveSection = document.getElementById("lb-save-section")!;
  const lbNameInput = document.getElementById("lb-name-input") as HTMLInputElement;
  const lbSaveMsg = document.getElementById("lb-save-msg")!;
  const btnLbSave = document.getElementById("btn-lb-save") as HTMLButtonElement;

  const slotEls: HTMLDivElement[] = [];
  for (let i = 0; i < DEFAULT_TUNING.capacity_max; i++) {
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
  const musicButton = document.getElementById("btn-music") as HTMLButtonElement;
  const musicLabel = document.getElementById("music-label")!;
  let musicActivated = false;
  function updateMusicLabel(): void {
    const on = musicActivated && audio.isMusicEnabled();
    musicButton.setAttribute("aria-pressed", String(on));
    musicLabel.textContent = on ? "Tắt nhạc" : "Bật nhạc";
    musicButton.title = on ? "Đang phát: Đêm hội ký ức · Chỉnh âm lượng trong Cài đặt" : "Nghe nhạc nền Đêm hội ký ức";
  }
  function activateMusic(): void {
    musicActivated = true;
    audio.startMusic();
    updateMusicLabel();
  }
  musicButton.addEventListener("click", () => {
    if (!musicActivated) activateMusic();
    else { audio.setMusicEnabled(!audio.isMusicEnabled()); updateMusicLabel(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) audio.stopMusic();
    else if (musicActivated) audio.startMusic();
  });
  document.body.classList.add("menu-open");

  function applyAccessibility(): void {
    document.body.classList.toggle("colorblind", settings.colorblind);
    document.body.classList.toggle("reduced-motion", settings.reducedMotion);
    document.body.classList.toggle("large-text", settings.largeText);
    view.setColorblind(settings.colorblind);
    view.setReducedMotion(settings.reducedMotion);

    const kb = settings.keybindings;
    controlsHelpEl.textContent =
      `${formatKeyLabel(kb.moveUp)}${formatKeyLabel(kb.moveLeft)}${formatKeyLabel(kb.moveDown)}${formatKeyLabel(kb.moveRight)}: Chạy · ` +
      `${formatKeyLabel(kb.jump)}: Nhảy · ${formatKeyLabel(kb.dash)}: Lướt · ` +
      `${formatKeyLabel(kb.interact)}: Nạp/Châm dầu · ${formatKeyLabel(kb.pulse)}: Tỏa sáng · ${formatKeyLabel(kb.pause)}: Tạm dừng`;
    dashTitleEl.textContent = `Lướt (${formatKeyLabel(kb.dash)})`;
    pulseTitleEl.textContent = `Tỏa Sáng (${formatKeyLabel(kb.pulse)})`;
  }

  let listeningAction: ActionName | null = null;
  function renderKeybinds(): void {
    keybindGrid.innerHTML = "";
    for (const action of Object.keys(ACTION_LABELS) as ActionName[]) {
      const row = document.createElement("div");
      row.className = "keybind-item";
      const label = document.createElement("span");
      label.textContent = ACTION_LABELS[action];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `keybind-btn${listeningAction === action ? " listening" : ""}`;
      btn.textContent = listeningAction === action ? "Nhấn phím..." : formatKeyLabel(settings.keybindings[action]);
      btn.addEventListener("click", () => {
        listeningAction = action;
        keybindMsg.textContent = `Đang chờ gán phím cho "${ACTION_LABELS[action]}"...`;
        renderKeybinds();
      });
      row.append(label, btn);
      keybindGrid.appendChild(row);
    }
  }

  applyAccessibility();
  renderKeybinds();

  optVolume.value = String(Math.round(settings.volume * 100));
  optVolumeVal.textContent = `${optVolume.value}%`;
  optSens.value = String(Math.round(settings.mouseSensitivity * 100));
  optSensVal.textContent = settings.mouseSensitivity.toFixed(2);
  optColorblind.checked = settings.colorblind;
  optReducedMotion.checked = settings.reducedMotion;
  optLargeText.checked = settings.largeText;

  type ScreenMode = "menu" | "intro" | "playing" | "paused" | "result";
  let screenMode: ScreenMode = "menu";
  let settingsReturnTo: "menu" | "paused" = "menu";
  let currentNight: NightNumber = 1;
  let totalCampaignScore = 0;
  let nightsWonCampaign = 0;
  let seed = 101;
  let engine = new GameEngine({ seed, night: 1, tuning: DEFAULT_TUNING });
  let camYawDeg = 0;
  let lastCountdownSec = 11;
  let prevWindWarn = false;
  let resultShownForRun = false;
  let shadeSpawnAlertTimer = 0;
  let trackedShadeId: string | null = null;

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

  let frameCount = 0;
  let fpsSum = 0;
  let lastFps = 60;

  function showOnlyModal(active: HTMLElement | null): void {
    document.body.classList.toggle("menu-open", active !== null);
    document.body.classList.toggle("game-playing", active === null);
    for (const m of [modalMenu, modalIntro, modalPause, modalSettings, modalLeaderboard, modalResult]) {
      m.classList.toggle("visible", m === active);
    }
  }

  async function openLeaderboardModal(): Promise<void> {
    const entries = await fetchLeaderboardEntries();
    lbTbody.innerHTML = "";
    if (entries.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" style="text-align:center;color:#c9b48a">Chưa có kỷ lục nào. Hãy chơi để lưu điểm!</td>`;
      lbTbody.appendChild(tr);
    } else {
      entries.forEach((entry, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>#${i + 1}</td><td>${entry.name}</td><td class="stat-gold">${entry.score}</td><td>${entry.nights_won}/3</td>`;
        lbTbody.appendChild(tr);
      });
    }
    showOnlyModal(modalLeaderboard);
  }

  function openIntroForNight(night: NightNumber, resetCampaign = false): void {
    activateMusic();
    currentNight = night;
    if (resetCampaign) {
      totalCampaignScore = 0;
      nightsWonCampaign = 0;
    }
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
    shadeSpawnAlertTimer = 0;
    trackedShadeId = null;
    nightNameEl.textContent = getNightMap(night).name;
    screenMode = "playing";
    showOnlyModal(null);
    activateMusic();
  }

  function togglePauseViaEngine(): void {
    if (screenMode === "playing" || screenMode === "paused") {
      pauseKeyQueued = true;
    }
  }

  function openMenu(): void {
    screenMode = "menu";
    if (musicActivated) audio.startMusic();
    showOnlyModal(modalMenu);
  }

  // UI Event bindings
  document.getElementById("btn-play-campaign")!.addEventListener("click", () => {
    openIntroForNight(1, true);
  });
  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-select-night]")) {
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.selectNight) as NightNumber;
      openIntroForNight(n, n === 1);
    });
  }
  document.getElementById("btn-open-leaderboard")!.addEventListener("click", () => {
    void openLeaderboardModal();
  });
  document.getElementById("btn-lb-close")!.addEventListener("click", () => {
    showOnlyModal(modalMenu);
  });
  document.getElementById("btn-start-night")!.addEventListener("click", () => startNight(currentNight));
  document.getElementById("btn-intro-back")!.addEventListener("click", openMenu);
  document.getElementById("btn-pause")!.addEventListener("click", togglePauseViaEngine);
  document.getElementById("btn-resume")!.addEventListener("click", togglePauseViaEngine);
  document.getElementById("btn-pause-retry")!.addEventListener("click", () => startNight(currentNight));
  document.getElementById("btn-pause-menu")!.addEventListener("click", openMenu);

  document.getElementById("btn-open-settings-menu")!.addEventListener("click", () => {
    settingsReturnTo = "menu";
    listeningAction = null;
    keybindMsg.textContent = "";
    renderKeybinds();
    showOnlyModal(modalSettings);
  });
  document.getElementById("btn-pause-settings")!.addEventListener("click", () => {
    settingsReturnTo = "paused";
    listeningAction = null;
    keybindMsg.textContent = "";
    renderKeybinds();
    showOnlyModal(modalSettings);
  });
  document.getElementById("btn-reset-keys")!.addEventListener("click", () => {
    settings.keybindings = { ...DEFAULT_KEYBINDINGS };
    listeningAction = null;
    keybindMsg.textContent = "Đã khôi phục toàn bộ phím mặc định.";
    applyAccessibility();
    renderKeybinds();
    saveSettings(settings);
  });
  document.getElementById("btn-settings-close")!.addEventListener("click", () => {
    listeningAction = null;
    saveSettings(settings);
    showOnlyModal(settingsReturnTo === "menu" ? modalMenu : modalPause);
  });

  optVolume.addEventListener("input", () => {
    const v = Number(optVolume.value) / 100;
    settings.volume = v;
    optVolumeVal.textContent = `${optVolume.value}%`;
    audio.setVolume(v);
    if (musicActivated && v > 0) audio.startMusic();
    saveSettings(settings);
  });
  optSens.addEventListener("input", () => {
    const s = Number(optSens.value) / 100;
    settings.mouseSensitivity = s;
    optSensVal.textContent = s.toFixed(2);
    saveSettings(settings);
  });
  optColorblind.addEventListener("change", () => {
    settings.colorblind = optColorblind.checked;
    applyAccessibility();
    saveSettings(settings);
  });
  optReducedMotion.addEventListener("change", () => {
    settings.reducedMotion = optReducedMotion.checked;
    applyAccessibility();
    saveSettings(settings);
  });
  optLargeText.addEventListener("change", () => {
    settings.largeText = optLargeText.checked;
    applyAccessibility();
    saveSettings(settings);
  });

  btnLbSave.addEventListener("click", async () => {
    const name = lbNameInput.value.trim();
    if (!isValidLeaderboardName(name)) {
      lbSaveMsg.textContent = "Tên phải từ 3–12 ký tự (chữ, số hoặc _).";
      return;
    }
    btnLbSave.disabled = true;
    try {
      await persistLeaderboardEntry(name, totalCampaignScore, nightsWonCampaign, seed);
      lbSaveMsg.textContent = `Đã lưu điểm ${totalCampaignScore} cho "${name}" vào Bảng xếp hạng!`;
    } catch (err) {
      lbSaveMsg.textContent = (err as Error).message;
      btnLbSave.disabled = false;
    }
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

  window.addEventListener("keydown", (e) => {
    if (listeningAction) {
      e.preventDefault();
      const newCode = e.code;
      const conflict = (Object.keys(settings.keybindings) as ActionName[]).find(
        (act) => act !== listeningAction && settings.keybindings[act] === newCode
      );
      if (conflict) {
        keybindMsg.textContent = `Trùng phím! "${formatKeyLabel(newCode)}" đã được gán cho "${ACTION_LABELS[conflict]}".`;
        listeningAction = null;
        renderKeybinds();
        return;
      }
      settings.keybindings[listeningAction] = newCode;
      keybindMsg.textContent = `Đã gán "${formatKeyLabel(newCode)}" cho "${ACTION_LABELS[listeningAction]}".`;
      listeningAction = null;
      applyAccessibility();
      renderKeybinds();
      saveSettings(settings);
      return;
    }

    if (
      !keys.has(e.code) &&
      (e.code === settings.keybindings.pause || e.code === "KeyP") &&
      document.activeElement !== lbNameInput
    ) {
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
    const kb = settings.keybindings;
    let x = 0;
    let z = 0;
    if (keys.has(kb.moveUp) || keys.has("ArrowUp")) z += 1;
    if (keys.has(kb.moveDown) || keys.has("ArrowDown")) z -= 1;
    if (keys.has(kb.moveLeft) || keys.has("ArrowLeft")) x += 1;
    if (keys.has(kb.moveRight) || keys.has("ArrowRight")) x -= 1;
    const mult = creativeHud.speedMultiplier;
    return [x * mult, z * mult];
  }

  function formatTime(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function positionEdgeArrow(el: HTMLElement, worldPos: Vec3 | null): void {
    if (!worldPos || screenMode !== "playing") {
      el.style.display = "none";
      return;
    }
    const proj = view.projectToScreen(worldPos);
    if (proj.onScreen) {
      el.style.display = "none";
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
    const py = Math.max(120, Math.min(h - 130, h / 2 - ny * (h / 2 - 120)));
    const angleDeg = (Math.atan2(nx, ny) * 180) / Math.PI;

    el.style.display = "flex";
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
  }

  function updateHud(): void {
    const snap = engine.getViewState();
    const litCount = snap.lanterns.filter((l) => l.lit).length;
    const reqLit = Math.ceil(DEFAULT_TUNING.win_ratio * snap.lanterns.length);

    flamesEl.textContent = snap.player.flames > 0 ? "🔥".repeat(snap.player.flames) : "0";
    lanternsEl.textContent = `${litCount}/${snap.lanterns.length} (≥${reqLit})`;
    scoreEl.textContent = `${snap.score}`;

    timeEl.textContent = formatTime(snap.timeLeftS);
    timeEl.classList.toggle("danger", snap.timeLeftS <= 30 && snap.state === "playing");

    if (snap.player.charmTimer > 0) {
      charmEl.textContent = `Bùa Gió: ${snap.player.charmTimer.toFixed(1)}s`;
      charmEl.classList.add("visible");
    } else {
      charmEl.classList.remove("visible");
    }

    if (snap.wind.warning) {
      windEl.textContent = "Gió lớn sắp thổi!";
      windEl.classList.add("visible");
    } else if (snap.wind.active) {
      windEl.textContent = `Gió mạnh (${Math.round(snap.wind.dir_deg)}°)`;
      windEl.classList.add("visible");
    } else {
      windEl.classList.remove("visible");
    }

    capacityEl.textContent = `Đom đóm: ${snap.player.carried} / ${snap.player.capacity}`;
    for (let i = 0; i < slotEls.length; i++) {
      slotEls[i].style.display = i < snap.player.capacity ? "block" : "none";
      slotEls[i].classList.toggle("filled", i < snap.player.carried);
    }

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

    // Visual accessibility captions (shade spawn, wind warning, last 10s, low-fuel lanterns)
    const captions: string[] = [];
    if (shadeSpawnAlertTimer > 0) captions.push("Bóng Mực mới xuất hiện!");
    if (snap.wind.warning) captions.push("Gió lớn sắp thổi!");
    if (snap.state === "playing" && snap.timeLeftS <= 10 && snap.timeLeftS > 0) {
      captions.push(`Còn ${Math.ceil(snap.timeLeftS)} giây tới bình minh!`);
    }
    const lowFuelIds = snap.lanterns
      .filter((l) => l.lit && l.fuel < DEFAULT_TUNING.low_fuel_threshold)
      .map((l) => l.id);
    if (lowFuelIds.length > 0) {
      captions.push(`Đèn sắp hết dầu (<30%): ${lowFuelIds.join(", ")}`);
    }
    if (captions.length > 0 && screenMode === "playing") {
      captionsEl.textContent = captions.join(" · ");
      captionsEl.classList.add("visible");
    } else {
      captionsEl.classList.remove("visible");
    }

    // Nearby interactable lantern prompt
    let nearLantern = null;
    for (const l of snap.lanterns) {
      if (
        distXZ(snap.player.pos, l.pos) <= DEFAULT_TUNING.interact_radius &&
        (!l.lit || l.fuel < DEFAULT_TUNING.fuel_max)
      ) {
        nearLantern = l;
        break;
      }
    }
    if (nearLantern && snap.state === "playing") {
      const kLabel = formatKeyLabel(settings.keybindings.interact);
      if (!nearLantern.lit) {
        const req = nearLantern.everLit ? DEFAULT_TUNING.relight_cost : DEFAULT_TUNING.lantern_cost;
        promptEl.textContent = nearLantern.everLit
          ? `${kLabel} — Thắp lại (${nearLantern.deposited}/${req})`
          : `${kLabel} — Nạp ánh sáng (${nearLantern.deposited}/${req})`;
      } else {
        promptEl.textContent = `${kLabel} — Châm dầu (${Math.round(nearLantern.fuel)}%)`;
      }
      promptEl.classList.add("visible");
    } else {
      promptEl.classList.remove("visible");
    }

    if (creativeHud.slowed && snap.state === "playing") {
      bannerEl.textContent = settings.colorblind
        ? "⚠ Bị Sương Giăng chạm phải — tốc độ di chuyển tạm chậm!"
        : "Bị Sương Giăng chạm phải — tốc độ di chuyển tạm chậm!";
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

    // Off-screen nearest unlit lantern arrow
    let nearestLanternPos: Vec3 | null = null;
    let minLDist = Infinity;
    for (const l of snap.lanterns) {
      if (l.lit) continue;
      const d = distXZ(snap.player.pos, l.pos);
      if (d < minLDist) {
        minLDist = d;
        nearestLanternPos = l.pos;
      }
    }
    positionEdgeArrow(lanternArrowEl, nearestLanternPos);

    // Off-screen shade spawn arrow (shown for 4s after shade spawns)
    let shadePos: Vec3 | null = null;
    if (shadeSpawnAlertTimer > 0 && trackedShadeId) {
      const s = snap.shades.find((sh) => sh.id === trackedShadeId);
      if (s) shadePos = s.pos;
    }
    positionEdgeArrow(shadeArrowEl, shadePos);

    // Result / Dawn modal
    if (snap.state !== "playing" && snap.state !== "paused" && !resultShownForRun) {
      if (snap.state === "won" && currentNight === 1 && creativeHud.endingActive) {
        return;
      }
      resultShownForRun = true;
      screenMode = "result";

      let allowLeaderboardSave = false;
      if (snap.state === "won") {
        totalCampaignScore += snap.score;
        nightsWonCampaign = Math.min(3, nightsWonCampaign + 1);
        audio.playWin();
        if (currentNight === 3) {
          allowLeaderboardSave = true;
          resultTitleEl.textContent = "Bình Minh Trên Ba Hòn Đảo!";
          resultDescEl.textContent = `Chúc mừng! Mây đã giữ sáng cả 3 Đêm tới bình minh! Tổng điểm: ${totalCampaignScore}.`;
          btnResultPrimary.textContent = "Chơi lại từ Đêm 1";
        } else {
          resultTitleEl.textContent = `Vượt qua ${getNightMap(currentNight).name}!`;
          resultDescEl.textContent = `Điểm Đêm ${currentNight}: ${snap.score} · Tổng điểm tích lũy: ${totalCampaignScore}.`;
          btnResultPrimary.textContent = `Sang Đêm ${currentNight + 1}`;
        }
      } else {
        allowLeaderboardSave = true;
        audio.playLose();
        resultTitleEl.textContent = "Sương Đen Đã Bao Phủ...";
        resultDescEl.textContent =
          snap.player.flames <= 0
            ? `Mây đã mất hết Ngọn Lửa. Tổng điểm các Đêm đã thắng: ${totalCampaignScore}.`
            : `Bình minh tới khi số đèn sáng chưa đủ ngưỡng. Tổng điểm các Đêm đã thắng: ${totalCampaignScore}.`;
        btnResultPrimary.textContent = `Chơi lại Đêm ${currentNight}`;
      }

      lbSaveSection.style.display = allowLeaderboardSave ? "block" : "none";
      lbSaveMsg.textContent = "";
      lbNameInput.value = "";
      btnLbSave.disabled = false;
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
        fpsEl.textContent = `FPS: ${Math.round(fpsSum / frameCount)}`;
      }
    }

    const elapsed = Math.min(0.1, rawElapsed);
    if (shadeSpawnAlertTimer > 0) {
      shadeSpawnAlertTimer = Math.max(0, shadeSpawnAlertTimer - elapsed);
    }

    if (screenMode === "playing") {
      if (keys.has("KeyQ")) camYawDeg += 110 * elapsed;
      if (keys.has("KeyC")) camYawDeg -= 110 * elapsed;
    }

    accumulator += elapsed;
    while (accumulator >= DT) {
      if ((screenMode === "playing" || screenMode === "paused") && !engine.isFinished()) {
        const kb = settings.keybindings;
        const pausePressed = pauseKeyQueued;
        pauseKeyQueued = false;
        const jumpHeld = keys.has(kb.jump);
        const jumpEdge = jumpHeld && !prevJumpHeld;
        prevJumpHeld = jumpHeld;

        const events = engine.step({
          tick: engine.getTick(),
          move: screenMode === "playing" ? readMoveInput() : [0, 0],
          cam_yaw_deg: camYawDeg,
          jump: screenMode === "playing" ? jumpHeld : false,
          interact: screenMode === "playing" ? keys.has(kb.interact) || keys.has("KeyF") : false,
          pulse: screenMode === "playing" ? keys.has(kb.pulse) || pulseMouseQueued : false,
          dash: screenMode === "playing" ? keys.has(kb.dash) || keys.has("ShiftRight") : false,
          pause: pausePressed
        });
        pulseMouseQueued = false;

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
          } else if (ev.name === "deposit" || ev.name === "refuel") {
            audio.playDeposit();
          } else if (ev.name === "lantern_lit") {
            audio.playLanternLit();
          } else if (ev.name === "dash") {
            audio.playDash();
          } else if (ev.name === "shade_spawned") {
            audio.playShadeSpawn();
            shadeSpawnAlertTimer = 4.0;
            trackedShadeId = String(ev.data.id ?? "");
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
}
