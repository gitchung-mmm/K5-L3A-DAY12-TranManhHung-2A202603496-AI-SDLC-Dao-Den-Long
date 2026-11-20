# AGENTS.md — Đảo Đèn Lồng (AI SDLC Harness — Phase 4 / Contract v1.3)

## Commands
- Install: `npm ci`
- Build (Web + Headless/Bench/Soak/Run CLI): `npm run build`
- Run playable game: `node dist/cli/run.js` (supports `--export-leaderboard <out.json>`)
- Typecheck: `npm run typecheck`
- Tests (unit + headless scenarios): `npm test`
- Full verification gate: `npm run verify`
- Headless CLI (`--night 1 | 2 | 3`):
  `node dist/cli/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl`
- Benchmark (`1280x720`, 200 shades, 100 motes, 3s warmup + 30s measure):
  `node dist/cli/bench.js --seed 42 --duration 30 --out bench.json`
- Soak test (10 consecutive nights headless):
  `node dist/cli/soak.js --seed 7 --nights 10 --out soak.json`

## Architecture Rules
1. `src/core/` MUST stay pure TypeScript with ZERO imports from `three`, DOM/browser APIs, or `node:fs`.
2. `src/core/` MUST be 100% deterministic: never call `Math.random()` or `Date.now()`; always use `SeededRng`.
3. `game.contract.json` (`contract_version: "1.2"`) is the single source of truth for `tuning`. Keep `src/core/tuning.ts` strictly identical.
4. Store lantern fuel internally as integer `1/60` units (`0..6000`) to avoid floating-point drift; round to 1 decimal place ONLY when serializing snapshots/events.
5. Creative Web-3D additions (`src/game/creative.ts`, `festival.ts`, `memories.ts`) MUST remain strictly outside `src/core/` and NEVER mutate snapshots or alter headless output.

## Test Contract v1.2 Guardrails
- Follow the 12-step tick order: Step 2 subtracts fuel (decay `1/60` + drain `5/60` per draining shade), and immediately after Step 2 any lantern with `fuel <= 0` turns off (`lantern_out`, `ever_lit = true`).
- Safe zone (`6m`) ONLY applies when `lantern.lit && fuel >= 30` (exact `30` still protects; `< 30` loses protection).
- Win condition is survival to dawn (`time_left_s <= 0`) with `flames > 0` and `lit >= ceil(0.6 * total)` (`reason: "dawn_survived"`). No early win (`all_lit` removed).
- Shade states: `spawning`, `wander`, `chase`, `drain`, `recoil`, `stunned`. Stunned always returns to `wander`.
- Scoring v1.2: `+5`/mote deposited/refueled, `+100` first light, `+40` relight, `+5` pulse stun (`+15` total if draining), dawn win bonus `+50 + floor(fuel)` per lit lantern + `50 * flames`.
- Never skip broken old tests silently: update or remove with explicit justification in tests and ADR.
