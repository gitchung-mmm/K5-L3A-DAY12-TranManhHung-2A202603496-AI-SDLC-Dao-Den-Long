# AGENTS.md — Đảo Đèn Lồng (AI SDLC Harness)

## Commands
- Install: `npm ci`
- Build (Web + Headless CLI): `npm run build`
- Typecheck: `npm run typecheck`
- Tests: `npm test`
- Full verification gate: `npm run verify`
- Headless CLI: `node dist/cli/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl`

## Architecture Rules
1. `src/core/` MUST stay pure TypeScript with ZERO imports from `three`, DOM/browser APIs, or `node:fs`.
2. `src/core/` MUST be 100% deterministic: never call `Math.random()` or `Date.now()`; always use the seeded PRNG (`mulberry32`) from `src/core/rng.ts`.
3. `game.contract.json` is the single source of truth for `tuning`. Any change to `src/core/tuning.ts` must keep `game.contract.json` identical (enforced by unit tests).
4. Creative visual/audio additions belong strictly in `src/game/` so headless Test Contract outputs never change.

## Test Contract Guardrails
- Fixed step `dt = 1 / 60`. Distances for `tuning` are measured on the XZ plane (`<= r`).
- Malformed `--inputs` or `--scenario` files (bad JSON, invalid types, non-increasing `tick`) MUST exit with code `2` and print to `stderr`.
- Never fake tests or hand-edit outputs. Do not declare a phase done until `npm run verify` exits `0`.
