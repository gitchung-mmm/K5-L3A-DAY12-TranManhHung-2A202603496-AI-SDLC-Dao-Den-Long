---
name: verify-phase
description: Run full build, unit tests, headless Test Contract scenarios, and determinism verification before finishing a phase or tagging.
---

# Verify Phase Skill

1. Run `npm run verify` from the repository root.
2. Confirm all unit tests pass, headless scenario outputs match Test Contract v1.0, and two runs with identical `--seed`, `--scenario`, and `--inputs` produce byte-identical JSONL files.
3. Record observed outputs and pass/fail status honestly in `docs/proof/phase-<N>.md`.
4. Never tag `phase-<N>` while `npm run verify` fails.
