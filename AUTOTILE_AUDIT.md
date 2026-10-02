# Island autotile lookup

The island terrain uses the project's own atlas IDs and a canonical 8-neighbor mask.

- The raw mask contains `N, NE, E, SE, S, SW, W, NW` in bits `1, 2, 4, 8, 16, 32, 64, 128`.
- A diagonal remains set only when both adjacent cardinal neighbors are land.
- Canonicalization reduces the 256 raw masks to 47 lookup entries.
- Every raw mask resolves through `AUTOTILE_LOOKUP` to a project ground-tile family and any concave-corner overlays.
- `validateAllNeighborMasks()` in `src/game/grassTileRules.ts` checks all 256 inputs, the 47 canonical entries, and every selected ground/overlay ID.
- When a cell has authored variants, the renderer scores their shared atlas edge colors and chooses compatible neighboring variants. A gradual color correction is confined to the shared edge bands between grass-center sprites.
- Concave-corner sprites `52`, `53`, `36`, and `37` keep their authored silhouettes and transparency; only their pale sand colors are toned toward the shoreline palette.

## Project tile mapping

The grass families below are shared by forest and grass islands. Desert uses a separate 47-mask lookup: corners `1/3/33/35`, top edge `2`, bottom edge `34`, left edge `17`, right edge `19`, and interior variants `18/68/69`; inset corner overlays are `21/20/4/5`.

| Grid feature | Ground sprite IDs |
| --- | --- |
| Upper-left, upper-right | 6, 9 |
| Upper horizontal edge | 7, 8 |
| Left vertical edge | 22, 38 |
| Right vertical edge | 25 |
| Lower-left, lower-right | 54, 57 |
| Lower horizontal edge | 55, 56 |
| Interior | 39, 40, 23, 24 |

Concave diagonal overlays are `NW → 53`, `NE → 52`, `SE → 36`, and `SW → 37`. They are selected only when both adjoining cardinal neighbors are land and the diagonal is water.

Tiles `81` and `84` are wreck/debris; `82` and `83` are gray overlay tiles whose exact layer role still needs source-art confirmation; `85` and `86` are foliage rocks. None is a coastline edge, and they must not be selected by either terrain rule.

Each occupied logical grid cell renders its selected atlas sprite at the authored 64×64 tile size. Collision reads the same boolean grid. The optional F3 inspection overlay displays grid coordinates, canonical mask, and selected ground tile ID.
