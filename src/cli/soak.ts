import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GameEngine } from "../core/engine.js";
import { SeededRng } from "../core/rng.js";
import { DEFAULT_TUNING, TICK_RATE } from "../core/tuning.js";
import type { NightNumber, TuningConfig, Vec2 } from "../core/types.js";

interface SoakArgs {
  seed: number;
  nights: number;
  outPath: string;
}

function parseIntStrict(raw: string, flag: string): number {
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid integer for ${flag}: ${raw}`);
  }
  return Number.parseInt(raw, 10);
}

function parseArgs(argv: string[]): SoakArgs {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Missing value for flag ${token}`);
    }
    map.set(token, next);
    i += 1;
  }

  const seedRaw = map.get("--seed") ?? "7";
  const nightsRaw = map.get("--nights") ?? "10";
  const outPath = map.get("--out");
  if (!outPath) {
    throw new Error("Usage: node dist/cli/soak.js --seed <int> --nights <int> --out <soak.json>");
  }

  const seed = parseIntStrict(seedRaw, "--seed");
  const nights = parseIntStrict(nightsRaw, "--nights");
  if (nights <= 0) throw new Error("--nights must be >= 1");
  return { seed, nights, outPath };
}

function loadTuning(): TuningConfig {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "game.contract.json"),
    path.resolve(here, "../../game.contract.json")
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return (JSON.parse(fs.readFileSync(c, "utf8")) as { tuning: TuningConfig }).tuning;
    }
  }
  return DEFAULT_TUNING;
}

function getRssMb(): number {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
}

function main(): void {
  let args: SoakArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  }

  const tuning = loadTuning();
  const results: string[] = [];
  let crashes = 0;
  let memStartMb = 0;
  const t0 = performance.now();

  for (let i = 0; i < args.nights; i++) {
    const night = ((i % 3) + 1) as NightNumber;
    const nightSeed = args.seed + i;
    const inputRng = new SeededRng((nightSeed ^ 0x9e3779b9) >>> 0);

    try {
      let engine: GameEngine | null = new GameEngine({ seed: nightSeed, night, tuning });
      if (i === 0) {
        memStartMb = getRssMb();
      }

      const maxDurationS =
        night === 1
          ? tuning.night1_duration_s
          : night === 2
            ? tuning.night2_duration_s
            : tuning.night3_duration_s;
      const maxTicks = Math.round(maxDurationS * TICK_RATE);

      let move: Vec2 = [0, 0];
      let prevJump = false;
      let prevDash = false;
      let prevPulse = false;
      let prevInteract = false;

      for (let k = 0; k < maxTicks; k++) {
        if (engine.isFinished()) break;

        if (k % 30 === 0) {
          const angle = inputRng.range(0, Math.PI * 2);
          move = [Math.cos(angle), Math.sin(angle)];
        }

        // Edge-triggered probabilities: 5% jump, 3% dash, 2% pulse, 10% interact
        const jump: boolean = !prevJump && inputRng.next() < 0.05;
        const dash: boolean = !prevDash && inputRng.next() < 0.03;
        const pulse: boolean = !prevPulse && inputRng.next() < 0.02;
        const interact: boolean = !prevInteract && inputRng.next() < 0.1;

        engine.step({
          tick: k,
          move,
          cam_yaw_deg: 0,
          jump,
          dash,
          pulse,
          interact
        });

        prevJump = jump;
        prevDash = dash;
        prevPulse = pulse;
        prevInteract = interact;
      }

      const end = engine.getEndRecord();
      results.push(end.state === "won" ? "won" : "lost");
      engine = null;
    } catch (err) {
      crashes += 1;
      results.push("crash");
      process.stderr.write(`Soak crash on night index ${i}: ${(err as Error).message}\n`);
    }
  }

  if (typeof global.gc === "function") {
    global.gc();
  }
  const memEndMb = getRssMb();
  const durationS = Math.round(((performance.now() - t0) / 1000) * 100) / 100;

  const output = {
    nights: args.nights,
    crashes,
    results,
    mem_start_mb: memStartMb,
    mem_end_mb: memEndMb,
    duration_s: durationS
  };

  const outDir = path.dirname(path.resolve(args.outPath));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(args.outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  process.exit(crashes === 0 ? 0 : 1);
}

main();
