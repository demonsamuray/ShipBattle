interface Window {
  __PIRATE_TEST__?: {
    timeScale: number;
    snapshot: Record<string, unknown> | null;
    failNextAssetOnce?: boolean;
    freezeVisuals?: boolean;
    advance?: (deltaSeconds: number) => void;
  };
}
