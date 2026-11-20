# Creative iteration — 2026-11-20

Scope: first playable implementation of “Đêm hội của những điều bị lãng quên”. This evidence covers the creative iteration, not an assertion that every broader Phase 2 deliverable is complete.

## Implementation

CreativeWorld coordinates LanternFestival and IslandMemories entirely in src/game/. Added Tàn, five lantern-linked memory vignettes, mask-and-ribbon wisps, a harmless fleeing Đèn Lạc, third-lantern whale flyby, and an eleven-second boat farewell before the victory overlay. main.ts integrates story HUD/audio and ending camera; scene.ts adds visual mote variants. Core and tuning contract are unchanged.

## Verification observed

- npm run verify: exit 0 on 2026-11-20.
- TypeScript checks and production Web/CLI builds passed.
- 11/11 tests passed, including two new creative lifecycle tests: snapshot immutability, one-shot milestone cues, timed ending completion, replay reset, and pulse proximity for Đèn Lạc.
- Existing invalid-input/scenario CLI tests passed (exit code 2).
- Live determinism check: two seed-2026 runs produced byte-identical output; 64 JSONL lines; final record {"type":"end","ticks":600,"state":"playing","score":0}.
- Browser smoke check at http://127.0.0.1:4173: title/start overlay, starting the game, Tàn dialogue, Tàn mesh, Đèn Lạc, masked Sương Giăng, mote colors and HUD visibly rendered. Browser error log query returned an empty list.
- Complete visual playthrough to the whale and ending was not performed. These transitions are covered by lifecycle tests, not full visual QA. Screenshot persistence was unavailable after the browser tab session ended.

## Environment notes

Initial sandboxed Vite build failed with EPERM on realpath. Running the same npm run verify command with approved execution outside the sandbox passed. No project configuration workaround was added.

Non-failing warnings: Vite bundle exceeds 500 kB (515.40 kB minified, 133.78 kB gzip); existing verification runner emits Node DEP0190 for shell-based npm invocation on Windows.

## Remaining visual polish

This iteration uses procedural low-poly geometry. Hat-perching, animated tea steam, wisp petal bursts, Đèn Lạc footprints and island-wide lantern strings remain future polish. Current memory scenes appear persistently after activation rather than dissolving. The whale is staged relative to the camera to keep it visible; its movement can follow abrupt camera turns.
