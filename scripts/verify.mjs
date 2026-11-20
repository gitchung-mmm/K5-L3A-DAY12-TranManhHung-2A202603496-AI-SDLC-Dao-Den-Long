import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function runOrFail(cmd, args) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: cmd === "npm" && process.platform === "win32"
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

console.log("[1/3] Running unit and scenario tests...");
runOrFail("npm", ["test"]);

console.log("[2/3] Running live headless determinism check...");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ddl-verify-"));
const outA = path.join(tmpDir, "runA.jsonl");
const outB = path.join(tmpDir, "runB.jsonl");
const headlessArgs = [
  "dist/cli/headless.js",
  "--seed",
  "2026",
  "--night",
  "1",
  "--ticks",
  "600",
  "--out"
];

runOrFail(process.execPath, [...headlessArgs, outA]);
runOrFail(process.execPath, [...headlessArgs, outB]);

const textA = fs.readFileSync(outA, "utf8");
const textB = fs.readFileSync(outB, "utf8");
if (textA !== textB) {
  console.error("Determinism check failed: two identical headless runs produced different output.");
  process.exit(1);
}

const lines = textA.trim().split("\n");
const endLine = JSON.parse(lines[lines.length - 1]);
console.log(
  `[3/3] Determinism verified (${lines.length} JSONL lines, end=${JSON.stringify(endLine)}).`
);
