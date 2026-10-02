# Handoff

Updated 2026-10-02. Read `README.md`, `STATUS_PROJETO.md`, `DELIVERY_CATALOG.md`, and `DEPLOYMENT.md` before continuing.

## Current state

- No Git metadata exists yet. Review the workspace and `.gitignore` before initializing the source repository.
- The project implements seeded islands, PixiJS combat, Chaser/Shooter AI with edge-stall recovery, and Axios/TanStack Query/MSW ranking/history.
- The full three-minute optimized profiling requirement is complete: 180.55 seconds, 59.7 average FPS, 16.70 ms p95, 20 max entities, zero page errors, and five lifecycle cycles. See `artifacts/performance-profile.*`; the shorter run is preserved with `-minimal-2026-10-02` suffix.
- Runtime water art and reference files are organized under `assets/`; ignored generated/legacy materials are under `backups/`.
- `artifacts/pirate-battle-cloud.zip` contains the static production build.

## Verification

- Isolated clean copy: `npm ci` (0 reported vulnerabilities), atlas build, typecheck, and Vite build passed.
- Final full Playwright run after baseline refresh: 25 passed, 15 expected skips, zero failures (7.4 minutes). HTML report: `artifacts/playwright-report/index.html`.
- Public HTTPS deployment is active at [https://nucleusdigital.online:5173/](https://nucleusdigital.online:5173/). External Chromium confirmed the MSW service worker controlled the page and ranking/scenario fixture requests returned 200.
- Public source repository is [demonsamuray/ShipBattle](https://github.com/demonsamuray/ShipBattle), branch `main`.
- The TLS systemd service runs unprivileged and uses systemd credentials for the existing certificate; certbot renewal restarts only this service. Apache on 80/443 and XAMPP on 8080/8443 were left untouched.
- Asset rights: Kenney Pirate Pack CC0 is linked to official sources; all other project imagery is covered by the owner's written confirmation recorded in `THIRD_PARTY_NOTICES.md`.

## Remaining delivery conditions

1. Review the final full Playwright HTML report at `artifacts/playwright-report/index.html`.
2. Complete manual visual/accessibility review (coast/wall rendering, keyboard focus, contrast, screen reader, touch behavior).

## Credential handling

The ServerSpace root password was provided in conversation; never copy it into project files, command lines, shell history, or Git. No firewall rules were changed.
