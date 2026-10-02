# Wall and island overlay catalog

[`assets/references/tile-contact-all.png`](assets/references/tile-contact-all.png) is the visual reference for the 96 numbered 64 px tiles. This catalog records the visible orientation in that sheet. A tile can contain its own end cap, turret, door, or damage; connections are validated between whole tile cells. Terrain remains the collision authority, and overlays never change the island grid.

## Wall pieces

| Tile IDs | Visual class | Intended use |
| --- | --- | --- |
| 15, 31, 32, 60, 89, 91, 95 | Vertical line | Straight runs; 31/32 carry side turrets, 60 is a wooden gate, and 89/91/95 are damaged or irregular variants. |
| 16, 47, 48, 76, 90, 92, 96 | Horizontal line | Straight runs; 47/48 carry upward turrets and 76 is a wooden gate; 90/92/96 are damaged or irregular variants. |
| 30, 46, 78 | Horizontal start | Left cap for a horizontal run. |
| 62, 80 | Horizontal end | Right cap / rounded end for a horizontal run. |
| 29, 45 | Vertical start | Top cap where the visible wall continues down. |
| 61, 79 | Vertical end | Bottom cap of a vertical run. |
| 77-16-78 / 93-16-94 | Two-course fort | Exact top and bottom rows of a compact rectangular fort; validated as a fixed six-tile pattern. |
| 64 | Corner | Curved, connected corner piece. |
| 13, 14, 63 | Standalone tower / gate | An isolated structure. These pieces never bridge another wall segment. |

The active map generates at most two connected wall formations per island: the horizontal pattern `46-[16|47|48|76]-62`, plus either the vertical pattern `61-[15|31|32]-45` (read bottom-to-top) or the two-course fort `77-16-78` over `93-16-94`. The second formation alternates deterministically. Different formations require at least one clear grid cell between them, including diagonally; tiles in one formation remain adjacent as required by their sockets. Isolated tower sprites 13 and 14 remain non-connecting decorations and also keep a one-cell gap from other walls and each other. Variants are deterministic by island and cell, and layout selection only uses complete land footprints. `validateWallLayout()` checks horizontal/vertical connections; the fort has a dedicated exact-pattern validator.

## Decorative overlays that can enrich islands

| Tile IDs | Asset family | Current use / safe opportunity |
| --- | --- | --- |
| 49-51, 65-67 | Small and large rocks | Sparse deterministic island props; vary scale and placement in grass/desert interiors. |
| 70-72 | Leaves / shrubs | Sparse deterministic grass props; useful in upper ambient layers. |
| 81, 84 | Wreck and wooden debris | Sparse, non-blocking shoreline or ruin props. |
| 82-83 | Gray ground/corner or shadow overlays | Layering role needs visual confirmation; do not classify these as walls. |
| 85-86 | Rocks with foliage | Sparse, non-blocking island props. |
| 87-88 | Small plant clusters | Additional foliage variants; not yet selected by the live island renderer. |
| 89-96 | Broken wall / masonry variants | Ruined fortification variation; currently not generated. |

Never use prop IDs as terrain edges. All props stay outside collision and must be selected deterministically from island ID and grid coordinate, as in the current renderer.

## Rule API

`src/game/wallRules.ts` exposes `classifyWallSprite()` for `horizontal`, `vertical`, `corner`, terminal, standalone, and decoration classes. `createWallLayout()` creates validated three-piece horizontal and vertical paths or a five-piece L path. `createFortLayout()` returns the requested two-row fort and `validateFortLayout()` checks its exact tile order. Standalone towers never count as connection cells.
