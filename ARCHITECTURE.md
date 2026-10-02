# Architecture

## Runtime ownership

- `src/App.tsx` owns screen navigation, settings snapshots, semantic HUD, menus, touch input, captain identity, pending match records, and ranking/history queries.
- `src/GameCanvas.tsx` owns PixiJS initialization, asset loading, ticker, display layers, keyboard/focus listeners, resize observation, and compact game snapshots.
- `src/game/config.ts` owns arena size, gameplay balance, and the three phase maps. Each phase map is built from templates in `src/game/mapTemplates.ts`; its boolean grids are shared by the renderer and collision code.
- `src/game/simulation.ts` owns movement, spawn timing, enemy behavior, weapons, projectiles, damage, score, phase transitions, and match end.
- `src/game/collisions.ts` owns vessel overlap, projectile bounds, grid-cell shoreline collision, and navigation waypoints around islands.
- `src/game/islands.ts` resolves and renders the active island grids as atlas-backed grass/desert ground sprites, inner-corner overlays, deterministic vegetation/rock props, connected wall segments, and F3 diagnostics.
- `src/api/records.ts` provides Axios calls for ranking, match history, record submission, scenario selection, and reset.
- `src/mocks/handlers.ts` provides the REST-shaped MSW handlers, fixtures, paging, scenarios, idempotent writes, and local confirmed-record persistence.

React receives a compact state snapshot every 200 ms instead of rerendering each Pixi frame. Continuous simulation state remains in Pixi/game logic.

## Simulation and movement

The world uses a 1280 x 720 logical arena. The Pixi canvas scales to fit its host while retaining the 16:9 simulation coordinates. Ticker time is clamped by `GAME_CONFIG.simulation.maxDeltaSeconds`; movement, spawns, cooldowns, effects, and active match duration use that delta. Pause stops simulation advancement.

The player can turn, move forward/reverse, and fire frontal or three-shot broadsides. Chasers and shooters continuously steer toward player-relative targets. They turn at a limited angular rate and use forward or reverse thrust after aligning the hull. A navigation waypoint planner routes around shorelines. If a route remains obstructed, the ship clears its target, reverses, and turns to escape. If an NPC makes no positional progress for five seconds while within its hull radius plus 56 pixels of a screen edge, it moves to a collision-safe point near the opposite edge, clears stale route/circumnavigation state, and replans toward the player. Periodic target offsets, occasional overshoot, and slightly inaccurate shooter aim provide controlled human-like mistakes.

Each 10 player kills advances the match to the next phase, capped at phase 3. Every phase uses two compact blocks or angular L-shaped islands, each wider than tall and fully inside the arena. On transition, surviving enemies explode, projectiles are cleared, spawn and weapon cooldowns reset, and the player is moved to the nearest point with full hull clearance from every new island. Score, health, and remaining time persist. The HUD announces each transition.

Island templates are logical boolean grids: the same land cells drive 8-neighbor autotiling and ship/projectile collision. The resolver canonicalizes diagonal bits only when both adjacent cardinal neighbors are land, then selects authored ground and concave-corner sprites. PixiJS renders one atlas sprite per land cell; it does not draw or mask an island silhouette. Grass variants use edge-color matching and center-tile seam harmonization. A grid edit affects only the surrounding 3×3 autotile neighborhood, and the pure grid resolver can return those refreshed cells. Ship collision uses circle-versus-land-cell rectangles; projectiles stop on those same occupied cells. Decorative stones are sprite-only and deterministic per island/cell.

`public/island-atlas.json` explicitly maps `tile_1.png` through `tile_96.png` to 64×64 frames in `public/island-atlas.png`. `npm run atlas:build` creates both files losslessly from `assets/png/default/tiles/tile_N.png`; it does not infer positions from the source tilesheet, which has no ID-to-coordinate metadata. Pixel analysis for edge matching crops each Pixi texture's actual atlas frame.

Press **F3** during a voyage to toggle a temporary per-cell overlay showing grid coordinates, the canonical 8-bit mask, and the selected atlas tile ID. Grass ground sprites use corners `6/9/54/57`, top edge `7/8`, left/right edges `22/38` and `25`, lower edge `55/56`, interiors `39/40/23/24`, and inner-corner overlays `53/52/36/37`. Desert right vertical edges use tile `19`. Tiles `81`–`86` are decorative and excluded from coastline selection. Each island can have at most two connected wall formations, with an empty grid cell separating independent formations. Horizontal layouts use `46-[16|47|48|76]-62`; vertical layouts are `61-[15|31|32]-45` read bottom-to-top; the two-course fort is `77-16-78` above `93-16-94`. Solo towers `13/14` remain separate and never bridge wall pieces. Decorative layers do not alter the logical collision grid. The renderer loads the atlas during normal asset loading and rebuilds the island layer from the new simulation grids on phase changes.

When a tile family has authored variants, the renderer chooses among those IDs by minimizing perceptual color differences along shared edges. Adjacent grass-center sprites then receive a narrow, gradual color correction on their own edge pixels only. The four concave-corner sprites retain their shapes and alpha while their pale sand pixels are brought closer to the shoreline palette. Generated textures are owned and released by the island layer.

## Records and persistence

`src/main.tsx` starts the MSW service worker before React mounts. The worker script lives in `public/mockServiceWorker.js`, so the same local mock API is available in development and production builds without an external service.

Axios calls the paginated `/api/ranking` and `/api/history` endpoints and the idempotent `/api/matches` endpoint. TanStack Query caches requests, cancels stale page requests, retries read failures once, and invalidates ranking/history after a match is accepted. Ranking queries include session duration and enemy spawn interval, so only equivalent configurations are compared. Ties use earlier completion time and then match ID.

Every completed match receives one stable match ID and is queued in `localStorage` before submission. Accepted records are stored locally by the MSW handlers and appear in later ranking/history queries. Pending records survive refresh and remain available for manual retry after a failure; a new voyage is never blocked by an older pending upload. The mock recognizes duplicate match IDs, including the commit-then-timeout scenario. Captain ID/name, options, latest result, pending queue, accepted records, and the selected network scenario are local to the browser.

The records pages include normal, slow, seed-derived variable latency, out-of-order, empty-ranking, connection failure, HTTP 400, ranking/history 503, submit 503, and commit-then-timeout scenarios. **Reset local records** clears confirmed/pending data and restores the normal scenario. The mock validates the `Idempotency-Key` header against `matchId` and returns the accepted record on retry.

`src/game/ships.ts` imports all 30 supplied ship sprites through Vite's asset glob. The menu persists the selected ship ID and captain name. The selected ship texture replaces the player's visual; all choices intentionally share the same simulation stats and collision radius.

## Rendering lifecycle and input

`GameCanvas` loads ship, terrain, projectile, effect, and HUD textures before starting the ticker. React shows progress/error/retry states. Phase changes replace the island display layer without replacing the Pixi application. Cleanup stops the ticker, disconnects the resize observer, removes keyboard and focus listeners, destroys display objects without destroying shared textures, and clears the host. The setup/cleanup path supports React Strict Mode and match restarts.

Keyboard and held touch controls produce the same `GameInput`. The game canvas retains 16:9 proportions; portrait mode letterboxes the arena and landscape is recommended. The DOM HUD exposes phase, score, time, and player health semantically while per-ship health bars remain Pixi-rendered.

## Remaining delivery gaps

Playwright is configured for desktop and mobile Chromium. The E2E flows cover profile/options persistence, ranking/history pagination and failure states, pending-record recovery/idempotency, keyboard combat, island damage cooldown, arena wrapping, phase transition, death, restart, abandonment, focus trap/restoration, semantic HUD values, touch controls, visual baselines, enemy pursuit and firing, boundary-stall recovery, and the stationary Shooter attack hold. A test-only bridge publishes simulation snapshots and advances the real `stepSimulation` only for pages opened with `?testMode=1`; dedicated `testScenario` fixtures seed repeatable phase-transition and NPC states while retaining the real simulation and Pixi rendering. Regular gameplay continues to use the Pixi ticker. Manual accessibility/visual review, asset-license confirmation, clean-checkout validation, and release hosting are tracked in `DELIVERY_CATALOG.md`. The mocked records API is browser-local and does not synchronize results across devices.
