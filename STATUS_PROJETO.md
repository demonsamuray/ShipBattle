# Project status — Pirate Battle

Updated 2026-10-02. This status is checked against `README.md`, which remains the challenge and delivery source of truth.

## Implemented

The project has a React/TypeScript/PixiJS single-player combat loop, keyboard and touch controls, seeded islands, collision/navigation, Chaser and Shooter enemies, phase transitions, pause/results, local settings and result persistence. Ranking/history uses Axios, TanStack Query and MSW with pagination, deterministic tie ordering, idempotent submission, pending recovery, and latency/error scenarios. E2E covers core gameplay, persistence, network failures, mobile controls, visual baselines, NPC behavior, and NPC edge-stall recovery.

The required optimized three-minute profile completed: 180.55-second match, 59.7 average FPS, 16.70 ms p95 frame interval, 20 maximum entities, zero page errors, and five lifecycle cycles. Post-GC heap increased from 9.77 MiB after cycle 1 to 10.16 MiB after cycle 5. See `artifacts/performance-profile.md` and `.json`; the shorter diagnostic remains separately preserved.

## Verification

- `npm ci` in an isolated clean copy: passed, 0 reported vulnerabilities.
- `npm run atlas:build`, `npm run typecheck`, and `npm run build` in that copy: passed.
- Full Playwright desktop/mobile run after refreshing the seeded arena baseline: 25 passed, 15 intentionally skipped, 0 failed (7.4 minutes). Focused arena visual case passed. Final HTML report: `artifacts/playwright-report/index.html`.
- `npm run lint`: passed after the final documentation/snapshot and HTTPS server helper updates.
- VM read-only inspection confirmed Apache on 80/443 and XAMPP on 8080/8443. The isolated HTTPS service is active on 5173; Apache/XAMPP remain untouched. External Chromium confirmed MSW's service worker and ranking API fixtures work. Demo: [https://nucleusdigital.online:5173/](https://nucleusdigital.online:5173/).

## Remaining release conditions

1. Complete a manual visual and accessibility review (coast seams, wall placement, contrast, keyboard focus, screen reader output, and touch behavior).
2. Confirm redistribution rights for challenge-supplied title/background and logo files. Kenney Pirate Pack CC0 evidence is documented in `THIRD_PARTY_NOTICES.md`.
3. Create the GitHub repository after GitHub is connected and repository name/visibility are confirmed.

## Documentation map

- `README.md`: project setup, game controls, requirements, commands, and release overview.
- `ARCHITECTURE.md`: runtime boundaries, simulation, persistence, atlas, and lifecycle.
- `DELIVERY_CATALOG.md`: requirements checklist and remaining evidence.
- `DEPLOYMENT.md`: isolated server deployment and rollback instructions.
- `ASSET_CATALOG.md`, `THIRD_PARTY_NOTICES.md`: asset inventory and rights evidence.
- `WALL_SPRITE_CATALOG.md`, `AUTOTILE_AUDIT.md`: tile and map rules.
- `PROFILING_HANDOFF.md`: profile method and evidence.
- `NEXT_AGENT_HANDOFF.md`: operational state and next actions.
