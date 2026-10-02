# Asset audit

All active runtime assets are under `assets/`. The former root-level runtime water image is now `assets/png/default/backgrounds/sea.png`; island source images and the tile contact sheet are in `assets/references/`. The Pirate Pack art matches Kenney's pack and CC0 terms are linked in `THIRD_PARTY_NOTICES.md`. Rights for challenge-provided title/background/logo art still need confirmation before the public release is fully cleared.

## Playable ships

`src/game/ships.ts` discovers all **30** PNGs in `assets/png/default/ships/`: `ship_1.png` through `ship_24.png`, `dinghy_large_1.png` through `dinghy_large_3.png`, and `dinghy_small_1.png` through `dinghy_small_3.png`. They appear in the captain profile picker, are persisted locally, and the selected texture is rendered for the player. Every option currently shares the same gameplay stats and collision radius; hull size differences are cosmetic only.

The runtime also uses `ship_2.png` as the Chaser and `ship_3.png` as the Shooter. The other ships were previously unused as selectable assets and are now exposed to the player.

## Runtime and useful assets

| Asset group | Current status | Next useful improvement |
| --- | --- | --- |
| `png/default/tiles/tile_1.png`–`tile_96.png` | All numbered tiles are packed into the runtime island atlas. Ground rules select the appropriate terrain family. | Continue the wall/vegetation catalog in `WALL_SPRITE_CATALOG.md`; tiles 81/84 are wreck/debris, 82/83 gray ground overlays, and 85/86 foliage rocks. Add only tested overlay IDs. |
| `png/default/ships/` | All 30 ship images selectable; first three also serve as player/enemy defaults. | Per-ship thumbnail dimensions and optional cosmetics can be tuned without changing combat stats. |
| `png/default/ship_parts/cannon_ball.png` | Live projectile texture. | — |
| `png/default/ship_parts/` remaining cannons, hulls, sails, flags, crew, wood | Not assembled at runtime. | Could support cosmetics or wreck effects; assembling arbitrary hull parts is additional art work and needs a consistent anchor/scale rig. |
| `png/default/effects/explosion_1.png`, `fire_1.png` | Live hit, firing, and explosion effects. | `explosion_2/3` and `fire_2` can add deterministic effect variation. |
| `png/default/ui/` | Menu controls, HUD, loading, results, and buttons use the supplied UI art. | Audit unused variants before adding alternate UI themes. |
| `assets/sounds/*.wav` (27 files) | Not connected to a runtime audio system; WAV playback is outside this release scope. | Add opt-in sound, volume/mute, and reduced-motion/audio preference handling only if audio enters scope. |
| `assets/spritesheet/` and `assets/tilesheet/` | Source sheets and metadata retained; runtime island atlas is generated losslessly from numbered PNGs. | Keep sources for attribution and asset verification. |
| `png/default/backgrounds/sea.png`, `ui_scene_background.png` | Live water/menu backdrops. The water image is stored with the runtime PNG assets. | Optimize the 1.85 MB water background for mobile if visual quality is preserved. |
| `assets/references/ilha.png`, `Ilhasub.png`, sample screens, vector/SWF sources | Reference/legacy material; `ilha.png` is the source used to document the collision-mask sampling. | Retained in the source archive; these files are not loaded at runtime. |

## Numbered tile usage by ID

The 96 numbered PNGs are all available in the generated atlas; only 47 distinct IDs are selected by the current live terrain, prop, water, and wall rules. Terrain families can choose variants deterministically per island cell. The live wall renderer currently places `46-16-62`; vertical and L-shaped wall presets are modeled separately and validated, but are not rendered by the live map yet.

| Tile IDs not drawn by the current live map | Visual reading | Safe opportunity / validation needed |
| --- | --- | --- |
| 10-12, 26-28, 42-44, 58-59, 74-75 | Translucent gray corner, curve, and shadow masks | Possible soft coast shadows or concave overlays. Validate alpha, stacking order, and contrast before use; do not use as collision or wall cells. |
| 13-15, 29-32, 45, 47-48, 60-61, 63-64, 76-80, 89-96 | Additional towers, line pieces, terminals, a curved corner, gate, and damaged masonry | Classified in `WALL_SPRITE_CATALOG.md`; horizontal, vertical, and L presets exist, while only `46-16-62` is currently generated. Socket alignment still needs visual validation before expanding generation. Solo tower/gate pieces stay isolated. |
| 41 | Alternate grass shoreline edge | Compare edge colors against tiles 22/38 and exercise neighboring masks before adding as a left-edge variant. |
| 81, 84 | Wrecked dinghy and wooden debris | Sparse shoreline detail, clear of navigation and wall openings. |
| 82-83 | Gray corner/shadow shapes | Layering role remains uncertain; inspect alpha and original art before overlaying. |
| 85-86 | Foliage rocks | Sparse upper island decoration. |
| 87-88 | Small plant clusters | Additional foliage options; keep deterministic and non-blocking. |
The live selected IDs are 1-9, 16-25, 33-40, 46, 49-57, 62, 65-73. The mapped terrain variants may not all appear in every map seed. The contact sheet is [tile-contact-all.png](assets/references/tile-contact-all.png); see [WALL_SPRITE_CATALOG.md](WALL_SPRITE_CATALOG.md) for the wall socket map.
