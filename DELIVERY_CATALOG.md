# Delivery checklist and remaining work

Updated 2026-10-02. The public HTTPS demo is deployed; remaining delivery conditions are listed below.

## Completed in this workspace

- [x] React/TypeScript/PixiJS single-player combat, keyboard/touch controls, enemy AI, collisions, phases, pause, result, local settings and result persistence.
- [x] Ranking and history through Axios, TanStack Query, and MSW. Paginated/filterable queries, deterministic tie ordering, idempotent match IDs, pending local queue, fixtures, and reset are implemented.
- [x] Seeded variable latency plus slow, out-of-order, empty, connection failure, HTTP 400, ranking/history 503, submit 503, and commit-then-timeout scenarios.
- [x] Captain name and one of all 30 ship sprites can be selected in the main menu; both are persisted and the captain name is submitted to ranking/history.
- [x] Playwright desktop/mobile Chromium project configuration and E2E flows for profile persistence, options, ranking/history empty and error states, delayed out-of-order page handling, island collision damage/cooldown and boundary wrapping, phase transitions, death, restart, abandon, keyboard movement/fire/pause, focus trapping/restoration, semantic HUD roles, touch controls, result persistence, keyboard-driven enemy-seeking pilot, Chaser/Shooter behavior, and edge-stall recovery.
- [x] Wall sprite contact-sheet classification and safe decorative asset audit.
- [x] Typecheck/build scripts and Playwright HTML report/trace configuration.
- [x] Existing atlas build and local Vite server continue to support `http://127.0.0.1:5173/`.

## Remaining before final delivery

### P0 — required evidence and ownership

- [x] Final clean-copy Playwright desktop/mobile run after refreshing the arena baseline: 25 passed, 15 intentionally skipped, 0 failed (7.4 minutes). HTML report: `artifacts/playwright-report/index.html`.
- [x] Asset failure/retry, timeout-then-retry idempotency/history count, pending-send persistence across refresh, submit-503 recovery, history pagination for one player, history empty/error states, stale out-of-order page handling, and island contact cooldown are covered.
- [x] Add deterministic assertions for Chaser pursuit, Shooter firing/hold, and five-second stuck-near-boundary recovery; full run passed all three on desktop and mobile.
- [x] Phase transition from a real player projectile, enemy fleet cleanup, death end/history record, clean restart, and abandon-without-record flows have E2E assertions.
- [x] Focus trap/restoration and semantic HUD names/values have automated assertions; full manual accessibility validation remains open.
- [x] Document Kenney Pirate Pack CC0 terms and the project owner's confirmation that all other included image assets are owned or licensed by the owner/company for publication and redistribution; see `THIRD_PARTY_NOTICES.md`.
- [ ] Manually inspect the live atlas/island phases at [the HTTPS demo](https://nucleusdigital.online:5173/), including coast alpha, collision navigation, overlays, and mobile HUD. Automated screenshots are captured; coast tile seams remain a visual review item.
- [x] Playwright production preview serves the built app on 5174; the complete suite exercised MSW, atlas, and game assets.

### P1 — performance, a11y, and product polish

- [x] Profile a full 3-minute optimized match on documented reference hardware/browser/resolution: 180.55-second timer-completed match, 59.7 average FPS, 16.70 ms p95 frame interval, 20 maximum entities, and five start/play/exit cycles. Post-GC heap rose from 9.77 MiB after cycle 1 to 10.16 MiB after cycle 5; see `artifacts/performance-profile.md` and `.json`. This is a small observed increase, not enough by itself to establish a continuing leak.
- [x] Add a seeded profiling script and evidence artifacts: the full three-minute profile is in `artifacts/performance-profile.md` / `.json`, and the earlier 25-second diagnostic is preserved as `artifacts/performance-profile-minimal-2026-10-02.md` / `.json`.
- [ ] Complete the manual accessibility review for keyboard navigation, focus visibility, contrast, screen-reader output, and touch behavior; focus trap/restoration and semantic HUD are covered by E2E.
- [x] Keep audio out of release scope; the 27 WAV files remain unused and are excluded from the build.
- [ ] Confirm ship sprite visual scale and collision fairness; current ship choices share one collision model.
- [x] Generate at most two separated wall formations per island, with deterministic horizontal/vertical/fort variations and isolated solo towers; validate exact presets and document sprite mappings.

### P2 — release preparation

- [x] Read-only inspect the ServerSpace VM: Apache owns 80/443, XAMPP owns 8080/8443, and 5173 was unused. Public TLS service is active at `https://nucleusdigital.online:5173/`; external port and MSW were verified.
- [x] Validate an isolated clean copy with `npm ci`, `npm run atlas:build`, `npm run typecheck`, and `npm run build`.
- [x] Re-run focused arena visual snapshot after refresh; it passed. Preserve the final full HTML report under `artifacts/playwright-report/`.
- [x] Install the isolated HTTPS service on 5173 after verifying path/service ownership; local and external health, refresh, and MSW fixture behavior passed without changes to Apache/XAMPP.
- [x] Publish the project source on the public GitHub repository: [demonsamuray/ShipBattle](https://github.com/demonsamuray/ShipBattle), branch `main`.

## Known limits of this audit

The E2E pilot uses real WASD/Space/Q keyboard events and reads a test-only snapshot emitted by the real simulation. NPC behavior and recovery have separate deterministic assertions. The test-only manual clock calls the same `stepSimulation` used by the Pixi ticker and is available only with `?testMode=1`; it is not enabled during normal gameplay. Manual visual/accessibility review remains open. Rights for the artwork are documented in `THIRD_PARTY_NOTICES.md` based on official CC0 terms and the project owner's confirmation.
