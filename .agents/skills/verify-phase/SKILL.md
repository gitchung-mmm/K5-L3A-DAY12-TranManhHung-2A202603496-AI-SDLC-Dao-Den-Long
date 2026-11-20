---
name: verify-phase
description: Run full build, Contract v1.1 unit/scenario tests, 3-night headless determinism, 21,600-tick performance check, and record Phase proof before tagging.
---

# Verify Phase Skill (v1.1)

1. Run `npm run verify` from the repository root.
2. Confirm:
   - `game.contract.json` (`contract_version: "1.1"`) matches `src/core/tuning.ts`.
   - All Phase 1 regression tests pass under standardized numbers.
   - At least 1 headless scenario test passes for every Phase 2 feature (Nights 1/2/3, dash, jump pads, Night 3 ramps/wind/tower, drifters, wind charms, pause, fall/respawn).
   - Determinism check: identical `--seed`, `--night`, `--scenario`, `--inputs` yield byte-identical JSONL across runs.
   - Performance check: a full 21,600-tick headless run finishes in `<= 30s`.
3. Verify Web 3D rendering in browser at `1280x720` (`>= 30 FPS`, zero console errors, standard palette & HUD).
4. Record observed outputs honestly in `docs/proof/phase-<N>.md`. Never tag while `npm run verify` fails.
