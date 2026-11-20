import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface BenchArgs {
  seed: number;
  duration: number;
  outPath: string;
}

function parseArgs(argv: string[]): BenchArgs {
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

  const seed = Number.parseInt(map.get("--seed") ?? "42", 10);
  const duration = Number.parseFloat(map.get("--duration") ?? "30");
  const outPath = map.get("--out");
  if (!outPath || !Number.isInteger(seed) || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("Usage: node dist/cli/bench.js --seed <int> --duration <sec> --out <bench.json>");
  }
  return { seed, duration, outPath };
}

function findBrowserExecutable(): string | null {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const candidates: string[] = [];
  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles ?? "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const localApp = process.env.LOCALAPPDATA ?? "";
    candidates.push(
      path.join(pf, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(pf86, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(localApp, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(pf, "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(pf86, "Microsoft\\Edge\\Application\\msedge.exe")
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
    );
  } else {
    for (const cmd of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) {
      const res = spawnSync("which", [cmd], { encoding: "utf8" });
      if (res.status === 0 && res.stdout.trim()) {
        candidates.push(res.stdout.trim());
      }
    }
  }

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function findDistDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(process.cwd(), "dist"), path.resolve(here, "..")];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  throw new Error("dist/index.html not found. Run 'npm run build' first.");
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

function main(): void {
  let args: BenchArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  }

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    process.stderr.write(
      "No Chromium/Chrome/Edge browser found for 1280x720 WebGL benchmark. Set CHROME_PATH env variable.\n"
    );
    process.exit(1);
  }

  const distDir = findDistDir();
  const startMs = Date.now();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "ddl-bench-profile-"));
  let browserProc: ReturnType<typeof spawn> | null = null;
  let finished = false;

  const cleanup = (): void => {
    if (browserProc && !browserProc.killed) {
      try {
        browserProc.kill();
      } catch {
        // ignore
      }
    }
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/api/bench-result" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += String(chunk);
      });
      req.on("end", () => {
        try {
          const payload = JSON.parse(body) as Record<string, unknown>;
          const report = {
            contract_version: "1.3",
            avg_fps: payload.avg_fps,
            p1_low_fps: payload.p1_low_fps,
            frame_ms_p95: payload.frame_ms_p95,
            frames: payload.frames,
            load_ms: payload.load_ms,
            peak_mem_mb: null,
            vsync_off: true,
            renderer: payload.renderer ?? "Three.js 0.170 WebGL2 (Chrome/Chromium)",
            os: `${os.platform()} ${os.release()} (${os.arch()})`
          };
          fs.mkdirSync(path.dirname(path.resolve(args.outPath)), { recursive: true });
          fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          finished = true;
          server.close(() => {
            cleanup();
            process.exit(0);
          });
        } catch (err) {
          res.writeHead(400);
          res.end();
          process.stderr.write(`Invalid bench payload: ${(err as Error).message}\n`);
          cleanup();
          process.exit(1);
        }
      });
      return;
    }

    let relPath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    relPath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = path.join(distDir, relPath);

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
      fs.createReadStream(fullPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(0, "127.0.0.1", () => {
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      process.stderr.write("Failed to bind local bench server\n");
      process.exit(1);
    }
    const benchUrl = `http://127.0.0.1:${addr.port}/?bench=1&seed=${args.seed}&duration=${args.duration}&startMs=${startMs}`;

    browserProc = spawn(
      browserPath,
      [
        `--app=${benchUrl}`,
        "--window-size=1280,720",
        "--disable-frame-rate-limit",
        "--disable-gpu-vsync",
        "--no-first-run",
        "--no-default-browser-check",
        `--user-data-dir=${profileDir}`
      ],
      { stdio: "ignore" }
    );

    const timeoutMs = (args.duration + 25) * 1000;
    const timer = setTimeout(() => {
      if (!finished) {
        process.stderr.write("Benchmark timed out waiting for browser metrics.\n");
        server.close();
        cleanup();
        process.exit(1);
      }
    }, timeoutMs);
    timer.unref();
  });
}

main();
