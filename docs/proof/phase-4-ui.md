# Phase 4 — Menu and music refresh, 2026-11-20

Scope: presentation-only refresh requested by the user. This is not a full Phase 4 release certification.

## Changes

- New title screen: indigo/teal night palette, warm lantern SVG illustration, animated lantern and fireflies, three island selection cards, prominent campaign action.
- Shared dialog and HUD styling, responsive menu, keyboard focus states, reduced-motion and large-text support.
- Original procedural 32-step background melody with pentatonic lead, arpeggio, sustained chords and soft bell accents. No external audio assets or network dependencies.
- Music button works in menu and gameplay; starting a night unlocks audio through a user gesture. Turning music off preserves SFX. Existing volume control now changes the master gain, including currently sounding notes. Music fades when stopped and pauses while the tab is hidden.

## Observed verification

- `npm run verify`: exit 0; all 24 unit/scenario tests pass; all three nights produce byte-identical headless outputs for repeated identical inputs.
- Gate performance: 18,000 ticks, Night 3, 0.269 s. Additional 21,600-tick headless run: exit 0 in 0.327 s, below 30 s.
- Final typography-only change rebuilt successfully with `npm run build`.
- Browser: inspected menu at 1280×720 and 390×844, entered Night 1, checked HUD, toggled music on/off and confirmed off preference survives starting a night, opened settings, changed volume to 35%, checked large-text and reduced-motion controls, then restored original settings.
- Gameplay HUD reported approximately 114–115 FPS during the 1280×720 smoke check. This is a spot reading, not the standardized 30-second benchmark.
- Browser console error query: zero errors. Audio interaction and scheduling checked; no captured/listened audio quality assessment.
- Screenshot: [menu-refresh.jpg](menu-refresh.jpg).

Core, tuning, contract, tests, and existing key mappings were not changed. Repository currently declares contract_version 1.3; this UI task leaves that pre-existing version untouched despite older version references in the supplied instructions/skill.

Existing non-fatal warnings remain: Vite JavaScript bundle over 500 kB and Node DEP0190 in the Windows verification runner.
