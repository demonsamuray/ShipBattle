const shipAssetModules = import.meta.glob('../../assets/png/default/ships/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export interface PlayableShip {
  id: string;
  label: string;
  url: string;
}

export const PLAYABLE_SHIPS: PlayableShip[] = Object.entries(shipAssetModules)
  .map(([path, url]) => {
    const filename = path.split('/').at(-1)?.replace(/\.png$/i, '') ?? '';
    const id = filename;
    const label = filename.startsWith('ship_')
      ? `Warship ${filename.slice(5)}`
      : filename.replace('dinghy_', '').replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    return { id, label, url };
  })
  .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

export const DEFAULT_PLAYER_SHIP_ID = 'ship_1';

export function getPlayerShip(id: string) {
  return PLAYABLE_SHIPS.find((ship) => ship.id === id) ?? PLAYABLE_SHIPS.find((ship) => ship.id === DEFAULT_PLAYER_SHIP_ID)!;
}
