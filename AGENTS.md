# AGENTS.md — Đảo Đèn Lồng (AI SDLC Harness — Phase 2 / Contract v1.1)

## Commands
- Install: `npm ci`
- Build (Web + Headless CLI): `npm run build`
- Typecheck: `npm run typecheck`
- Tests (unit + headless scenarios): `npm test`
- Full verification gate: `npm run verify`
- Headless CLI (`--night 1 | 2 | 3`):
  `node dist/cli/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl`

## Architecture Rules
1. `src/core/` MUST stay pure TypeScript with ZERO imports from `three`, DOM/browser APIs, or `node:fs`.
2. `src/core/` MUST be 100% deterministic: never call `Math.random()` or `Date.now()`; always use `SeededRng` (`src/core/rng.ts`).
3. `game.contract.json` (`contract_version: "1.1"`) is the single source of truth for standardized `tuning`. Keep `src/core/tuning.ts` strictly identical (enforced by unit tests).
4. Map geometry & terrain queries (`src/core/maps.ts`) are shared by core simulation and Web 3D renderer. Angle convention on XZ: `x = r * cos(deg)`, `z = r * sin(deg)`.
5. Creative Web-3D additions (`src/game/creative.ts`, `festival.ts`, `memories.ts`) MUST remain strictly outside `src/core/` and NEVER mutate snapshots or alter headless output.

## Test Contract v1.1 Guardrails
- Fixed step `dt = 1 / 60`. Follow the mandatory 12-step tick order strictly.
- Pause stops `sim_tick`, timers, spawns, and TTL while `tick` continues advancing (`state: "paused"`).
- Score `+10` applies on **mote deposit** (not pickup); win bonus uses `Math.floor(time_left_s) * 2 + 50 * flames`.
- Shade states MUST use exact names: `spawning`, `wander`, `chase`, `recoil`, `stunned`.
- Full-night headless run (21,600 ticks) MUST complete in `<= 30s`.
- Malformed `--inputs` / `--scenario` MUST exit with code `2` and print to `stderr`.
- Never fake tests or hand-edit outputs. Do not finish or tag a phase while `npm run verify` fails.
