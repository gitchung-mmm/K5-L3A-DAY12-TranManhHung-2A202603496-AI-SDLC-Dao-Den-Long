import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addLeaderboardEntry,
  sortAndTrimLeaderboard,
  type LeaderboardEntry,
  type LeaderboardFile
} from "../core/leaderboard.js";

const LEADERBOARD_PATH = path.join(os.homedir(), ".dao-den-long", "leaderboard.json");

function readLeaderboard(): LeaderboardFile {
  try {
    if (!fs.existsSync(LEADERBOARD_PATH)) {
      return { entries: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(LEADERBOARD_PATH, "utf8")) as Partial<LeaderboardFile>;
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return { entries: sortAndTrimLeaderboard(entries) };
  } catch {
    return { entries: [] };
  }
}

function writeLeaderboard(entries: LeaderboardEntry[]): LeaderboardFile {
  const sorted = sortAndTrimLeaderboard(entries);
  const data: LeaderboardFile = { entries: sorted };
  fs.mkdirSync(path.dirname(LEADERBOARD_PATH), { recursive: true });
  fs.writeFileSync(LEADERBOARD_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return data;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function findDistDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "dist"),
    path.resolve(here, "..")
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) {
      return dir;
    }
  }
  throw new Error("dist/index.html not found. Run 'npm run build' first.");
}

function main(): void {
  const argv = process.argv.slice(2);
  const exportIdx = argv.indexOf("--export-leaderboard");
  if (exportIdx >= 0) {
    const outPath = argv[exportIdx + 1];
    if (!outPath) {
      process.stderr.write("Missing output path for --export-leaderboard\n");
      process.exit(1);
    }
    const data = readLeaderboard();
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    process.exit(0);
  }

  let port = 4173;
  const portIdx = argv.indexOf("--port");
  if (portIdx >= 0 && argv[portIdx + 1]) {
    const p = Number.parseInt(argv[portIdx + 1], 10);
    if (Number.isInteger(p) && p > 0) port = p;
  }

  const distDir = findDistDir();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

    if (url.pathname === "/api/leaderboard" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(readLeaderboard()));
      return;
    }

    if (url.pathname === "/api/leaderboard" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += String(chunk);
      });
      req.on("end", () => {
        try {
          const payload = JSON.parse(body) as Omit<LeaderboardEntry, "achieved_at">;
          const current = readLeaderboard();
          const updated = addLeaderboardEntry(current.entries, payload);
          const saved = writeLeaderboard(updated);
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(saved));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: (err as Error).message }));
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
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Đảo Đèn Lồng v1.0.0 running at http://127.0.0.1:${port}/`);
    console.log(`Leaderboard storage: ${LEADERBOARD_PATH}`);
  });
}

main();
