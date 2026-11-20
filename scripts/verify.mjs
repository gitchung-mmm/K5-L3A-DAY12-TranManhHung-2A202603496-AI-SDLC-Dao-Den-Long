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

console.log("[1/4] Running unit and scenario tests...");
runOrFail("npm", ["test"]);

console.log("[2/4] Running 3-night live headless determinism check...");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ddl-verify-"));
for (const night of ["1", "2", "3"]) {
  const outA = path.join(tmpDir, `n${night}-A.jsonl`);
  const outB = path.join(tmpDir, `n${night}-B.jsonl`);
  const base = ["dist/cli/headless.js", "--seed", "2026", "--night", night, "--ticks", "600", "--out"];
  runOrFail(process.execPath, [...base, outA]);
  runOrFail(process.execPath, [...base, outB]);

  const textA = fs.readFileSync(outA, "utf8");
  const textB = fs.readFileSync(outB, "utf8");
  if (textA !== textB) {
    console.error(`Determinism check failed on Night ${night}.`);
    process.exit(1);
  }
}
console.log("  -> Nights 1, 2, 3 byte-identical determinism verified.");

console.log("[3/4] Running 21,600-tick full-night headless performance benchmark (<= 30s)...");
const perfOut = path.join(tmpDir, "perf-21600.jsonl");
const start = performance.now();
runOrFail(process.execPath, [
  "dist/cli/headless.js",
  "--seed",
  "2026",
  "--night",
  "3",
  "--ticks",
  "21600",
  "--snapshot-every",
  "60",
  "--out",
  perfOut
]);
const elapsedS = (performance.now() - start) / 1000;
const lines = fs.readFileSync(perfOut, "utf8").trim().split("\n");
const endRec = JSON.parse(lines[lines.length - 1]);
if (elapsedS > 30) {
  console.error(`Performance check failed: ${elapsedS.toFixed(2)}s > 30s`);
  process.exit(1);
}
console.log(
  `[4/4] Performance verified: Night 3 full-run completed in ${elapsedS.toFixed(3)}s (${lines.length} JSONL lines, end=${JSON.stringify(endRec)}).`
);
