import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GameEngine } from "../core/engine.js";
import type { InputFile, InputFrame, ScenarioConfig, TuningConfig } from "../core/types.js";
import {
  ContractValidationError,
  validateInputFile,
  validateScenarioConfig
} from "../core/validation.js";

interface CliArgs {
  seed: number;
  night: number;
  scenarioPath?: string;
  inputsPath?: string;
  ticks: number;
  outPath: string;
  snapshotEvery: number;
}

function parseIntStrict(raw: string, flag: string): number {
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid integer for ${flag}: ${raw}`);
  }
  return Number.parseInt(raw, 10);
}

function parseArgs(argv: string[]): CliArgs {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Missing value for flag ${token}`);
    }
    map.set(token, next);
    i += 1;
  }

  const seedRaw = map.get("--seed");
  const nightRaw = map.get("--night");
  const ticksRaw = map.get("--ticks");
  const outPath = map.get("--out");

  if (!seedRaw || !nightRaw || !ticksRaw || !outPath) {
    throw new Error(
      "Usage: --seed <int> --night 1 [--scenario <file>] [--inputs <file>] --ticks <int> --out <file.jsonl> [--snapshot-every <int>]"
    );
  }

  const seed = parseIntStrict(seedRaw, "--seed");
  const night = parseIntStrict(nightRaw, "--night");
  if (night !== 1) {
    throw new Error(`Unsupported --night ${night}; Phase 1 supports --night 1`);
  }

  const ticks = parseIntStrict(ticksRaw, "--ticks");
  if (ticks < 0) {
    throw new Error("--ticks must be >= 0");
  }

  const snapshotEvery = map.has("--snapshot-every")
    ? parseIntStrict(map.get("--snapshot-every")!, "--snapshot-every")
    : 10;
  if (snapshotEvery <= 0) {
    throw new Error("--snapshot-every must be >= 1");
  }

  return {
    seed,
    night,
    scenarioPath: map.get("--scenario"),
    inputsPath: map.get("--inputs"),
    ticks,
    outPath,
    snapshotEvery
  };
}

function loadJsonFile(filePath: string, label: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new ContractValidationError(`Cannot read ${label} file '${filePath}': ${(err as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ContractValidationError(`Invalid JSON in ${label} file '${filePath}': ${(err as Error).message}`);
  }
}

function loadContractTuning(): TuningConfig {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "game.contract.json"),
    path.resolve(here, "../../game.contract.json")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as { tuning: TuningConfig };
      return parsed.tuning;
    }
  }
  throw new Error("game.contract.json not found");
}

function main(): void {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  }

  let scenario: ScenarioConfig | undefined;
  let inputFile: InputFile = { frames: [] };

  try {
    if (args.scenarioPath) {
      scenario = validateScenarioConfig(loadJsonFile(args.scenarioPath, "scenario"));
    }
    if (args.inputsPath) {
      inputFile = validateInputFile(loadJsonFile(args.inputsPath, "inputs"));
    }
  } catch (err) {
    if (err instanceof ContractValidationError) {
      process.stderr.write(`Contract validation error: ${err.message}\n`);
      process.exit(2);
    }
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  }

  try {
    const tuning = loadContractTuning();
    const engine = new GameEngine({
      seed: args.seed,
      night: args.night,
      tuning,
      scenario
    });

    const frameByTick = new Map<number, InputFrame>();
    for (const frame of inputFile.frames) {
      frameByTick.set(frame.tick, frame);
    }

    const lines: string[] = [];
    // Snapshot tick 0: after scenario setup, before applying tick 0 input
    lines.push(JSON.stringify(engine.getSnapshotRecord()));

    for (let k = 0; k < args.ticks; k++) {
      if (engine.isFinished()) {
        break;
      }
      const events = engine.step(frameByTick.get(k));
      for (const ev of events) {
        lines.push(JSON.stringify(ev));
      }
      const nextTick = engine.getTick();
      if (nextTick % args.snapshotEvery === 0) {
        lines.push(JSON.stringify(engine.getSnapshotRecord()));
      }
      if (engine.isFinished()) {
        break;
      }
    }

    lines.push(JSON.stringify(engine.getEndRecord()));

    const outDir = path.dirname(path.resolve(args.outPath));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(args.outPath, `${lines.join("\n")}\n`, "utf8");
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Headless execution error: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main();
