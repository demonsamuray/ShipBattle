import { useEffect, useRef } from 'react';
import { Application, Assets, Container, Sprite, TilingSprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import backgroundTextureUrl from '../assets/png/default/backgrounds/sea.png';
import chaserShipUrl from '../assets/png/default/ships/ship_2.png';
import shooterShipUrl from '../assets/png/default/ships/ship_3.png';
import cannonballUrl from '../assets/png/default/ship_parts/cannon_ball.png';
import explosionUrl from '../assets/png/default/effects/explosion_1.png';
import fireUrl from '../assets/png/default/effects/fire_1.png';
import waterTextureUrl from '../assets/png/default/tiles/tile_73.png';
import healthFrameUrl from '../assets/png/default/ui/hud/health_frame.png';
import healthGreenUrl from '../assets/png/default/ui/hud/health_fill_green.png';
import healthAmberUrl from '../assets/png/default/ui/hud/health_fill_amber.png';
import healthRedUrl from '../assets/png/default/ui/hud/health_fill_red.png';
import enemyHealthFrameUrl from '../assets/png/default/ui/hud/enemy_health_frame.png';
import enemyHealthGreenUrl from '../assets/png/default/ui/hud/enemy_health_fill_green.png';
import enemyHealthRedUrl from '../assets/png/default/ui/hud/enemy_health_fill_red.png';
import { GAME_CONFIG, type GameSettings } from './game/config';
import { attachKeyboardInput } from './game/input';
import { createIslandLayer, destroyIslandLayer, setIslandDebugVisible, type IslandTextures } from './game/islands';
import { createGameState, stepSimulation } from './game/simulation';
import type { GameInput, GameSnapshot, MatchResult, ProjectileEntity, SimulationEvents, VesselEntity } from './game/types';
import { getPlayerShip } from './game/ships';

declare global {
  interface Window {
    __PIRATE_TEST__?: { timeScale: number; snapshot: Record<string, unknown> | null; failNextAssetOnce?: boolean; freezeVisuals?: boolean; advance?: (deltaSeconds: number) => void };
  }
}

export type PauseReason = 'manual' | 'focus';
interface GameCanvasProps {
  settings: GameSettings;
  playerShipId: string;
  touchInput: GameInput;
  paused: boolean;
  onPauseChange: (paused: boolean, reason: PauseReason) => void;
  onSnapshot: (snapshot: GameSnapshot) => void;
  onGameOver: (result: MatchResult) => void;
  onLoadingChange: (state: GameLoadingState) => void;
}

export type GameLoadingState =
  | { status: 'loading'; loaded: number; total: number }
  | { status: 'ready' }
  | { status: 'error' };

interface VesselView {
  sprite: Sprite;
  healthBackground: Sprite;
  healthFill: Sprite;
  displayedHealth: number;
  motionPhase: number;
  motionOffsetX: number;
  motionOffsetY: number;
}

interface ProjectileView {
  sprite: Sprite;
}

interface VisualEffect {
  sprite: Sprite;
  remainingSeconds: number;
  lifetimeSeconds: number;
  baseScale: number;
}

interface RenderLayers {
  islands: Container;
  projectiles: Container;
  vessels: Container;
  healthBars: Container;
  effects: Container;
}

type VesselTextures = Record<VesselEntity['kind'], Texture>;
interface HealthTextures {
  playerFrame: Texture;
  playerGreen: Texture;
  playerAmber: Texture;
  playerRed: Texture;
  enemyFrame: Texture;
  enemyGreen: Texture;
  enemyRed: Texture;
}

function gameSnapshot(state: ReturnType<typeof createGameState>): GameSnapshot {
  return {
    score: state.score,
    phase: state.phase,
    timeRemainingSeconds: state.timeRemainingSeconds,
    playerHealth: state.player.health,
    playerMaxHealth: state.player.maxHealth,
  };
}

function seededRandom(seed: string) {
  let state = Array.from(seed).reduce((value, character) => (Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0), 2166136261);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createTestEnemy(id: number, kind: 'chaser' | 'shooter', x: number, y: number, rotation = 0): VesselEntity {
  const stats = kind === 'chaser' ? GAME_CONFIG.chaser : GAME_CONFIG.shooter;
  return {
    id, kind, x, y, rotation, health: stats.maxHealth, maxHealth: stats.maxHealth,
    collisionRadius: stats.collisionRadius, boundaryRadius: stats.boundaryRadius,
    alive: true, fireCooldown: 0, damageFlashSeconds: 0, islandDamageCooldownSeconds: 0,
    touchingIslandIds: [], navigationTarget: null, navigationRefreshSeconds: 0, driveDirection: 1,
    maneuverSeconds: 0, stuckSeconds: 0, stuckRouteAttempts: 0, boundaryEscapeSeconds: 0,
    circumnavigationIslandId: null, circumnavigationWaypoints: [], circumnavigationWaypointIndex: 0,
    circumnavigationDirection: 1, circumnavigationSteps: 0, circumnavigationLegSeconds: 0,
    stationarySeconds: 0, islandHitCount: 0, islandHitWindowSeconds: 0, islandHitCooldownSeconds: 0,
    islandEscapeSeconds: 0, islandEscapeX: 0, islandEscapeY: 0, steeringSide: 1,
    humanErrorSeconds: 10, humanOffsetX: 0, humanOffsetY: 0,
  };
}

function syncVesselViews(
  vessels: VesselEntity[],
  views: Map<number, VesselView>,
  layers: RenderLayers,
  textures: VesselTextures,
  healthTextures: HealthTextures,
  deltaSeconds = 0,
  elapsedSeconds = 0,
) {
  const visibleIds = new Set<number>();

  for (const vessel of vessels) {
    visibleIds.add(vessel.id);
    let view = views.get(vessel.id);
    if (!view) {
      const sprite = new Sprite(textures[vessel.kind]);
      sprite.anchor.set(0.5);
      sprite.scale.set(1.15);
      const isPlayer = vessel.kind === 'player';
      const healthBackground = new Sprite(isPlayer ? healthTextures.playerFrame : healthTextures.enemyFrame);
      healthBackground.anchor.set(0.5, 0);
      healthBackground.width = GAME_CONFIG.healthBar.width;
      healthBackground.height = GAME_CONFIG.healthBar.height;
      const healthFill = new Sprite(isPlayer ? healthTextures.playerGreen : healthTextures.enemyGreen);
      healthFill.anchor.set(0, 0.5);
      view = {
        sprite,
        healthBackground,
        healthFill,
        displayedHealth: -1,
        motionPhase: vessel.id * 1.618,
        motionOffsetX: 0,
        motionOffsetY: 0,
      };
      views.set(vessel.id, view);
      layers.vessels.addChild(sprite);
      layers.healthBars.addChild(healthBackground, healthFill);
    }

    const wave = elapsedSeconds * 1.05 + view.motionPhase;
    const impulseFade = Math.exp(-4.2 * deltaSeconds);
    view.motionOffsetX *= impulseFade;
    view.motionOffsetY *= impulseFade;
    const bobX = Math.sin(wave) * 1.8;
    const bobY = Math.sin(wave * 1.22 + 0.8) * 2.2 + Math.sin(wave * 0.56 + view.motionPhase) * 0.45;
    const visualX = vessel.x + bobX + view.motionOffsetX;
    const visualY = vessel.y + bobY + view.motionOffsetY;
    view.sprite.position.set(visualX, visualY);
    view.sprite.rotation = vessel.rotation + Math.sin(wave * 0.62) * 0.016;
    const healthFraction = vessel.health / vessel.maxHealth;
    view.sprite.tint = vessel.damageFlashSeconds > 0
      ? 0xff7568
      : healthFraction < 0.3
        ? 0xb97064
        : healthFraction < 0.6
          ? 0xd2b47b
          : 0xffffff;
    view.sprite.alpha = healthFraction < 0.25 ? 0.82 : 1;

    if (view.displayedHealth !== vessel.health) {
      const fraction = Math.max(0, vessel.health / vessel.maxHealth);
      const fillTexture = vessel.kind === 'player'
        ? fraction > 0.6 ? healthTextures.playerGreen : fraction > 0.3 ? healthTextures.playerAmber : healthTextures.playerRed
        : fraction > 0.3 ? healthTextures.enemyGreen : healthTextures.enemyRed;
      view.healthFill.texture = fillTexture;
      view.healthFill.width = (GAME_CONFIG.healthBar.width - 18) * fraction;
      view.healthFill.height = GAME_CONFIG.healthBar.height * 0.43;
      view.displayedHealth = vessel.health;
    }

    const angleCos = Math.abs(Math.cos(vessel.rotation));
    const angleSin = Math.abs(Math.sin(vessel.rotation));
    const spriteHalfWidth = (view.sprite.texture.width * view.sprite.scale.x) / 2;
    const spriteHalfHeight = (view.sprite.texture.height * view.sprite.scale.y) / 2;
    const rotatedHalfHeight = angleSin * spriteHalfWidth + angleCos * spriteHalfHeight;
    const barY = visualY - rotatedHalfHeight - GAME_CONFIG.healthBar.verticalOffset;
    view.healthBackground.position.set(visualX, barY);
    view.healthFill.position.set(visualX - (GAME_CONFIG.healthBar.width - 18) / 2 + 1, barY + GAME_CONFIG.healthBar.height * 0.56);
  }

  for (const [id, view] of views) {
    if (visibleIds.has(id)) continue;
    layers.vessels.removeChild(view.sprite);
    layers.healthBars.removeChild(view.healthBackground, view.healthFill);
    view.sprite.destroy();
    view.healthBackground.destroy();
    view.healthFill.destroy();
    views.delete(id);
  }
}

function applyVesselImpulses(events: SimulationEvents, views: Map<number, VesselView>) {
  const impulses = new Map<number, { x: number; y: number }>();
  for (const event of [...events.shotsFired, ...events.impacts]) {
    if (event.vesselId === undefined || event.impulseX === undefined || event.impulseY === undefined) continue;
    const impulse = impulses.get(event.vesselId) ?? { x: 0, y: 0 };
    impulse.x += event.impulseX;
    impulse.y += event.impulseY;
    impulses.set(event.vesselId, impulse);
  }

  for (const [vesselId, impulse] of impulses) {
    const view = views.get(vesselId);
    const magnitude = Math.hypot(impulse.x, impulse.y);
    if (!view || magnitude < 0.001) continue;
    view.motionOffsetX += (impulse.x / magnitude) * 4;
    view.motionOffsetY += (impulse.y / magnitude) * 4;
    const offsetMagnitude = Math.hypot(view.motionOffsetX, view.motionOffsetY);
    if (offsetMagnitude > 5.5) {
      view.motionOffsetX = (view.motionOffsetX / offsetMagnitude) * 5.5;
      view.motionOffsetY = (view.motionOffsetY / offsetMagnitude) * 5.5;
    }
  }
}

function syncProjectileViews(
  projectiles: ProjectileEntity[],
  views: Map<number, ProjectileView>,
  layer: Container,
  texture: Texture,
) {
  const visibleIds = new Set<number>();
  for (const projectile of projectiles) {
    visibleIds.add(projectile.id);
    let view = views.get(projectile.id);
    if (!view) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(1.5);
      view = { sprite };
      views.set(projectile.id, view);
      layer.addChild(sprite);
    }
    view.sprite.position.set(projectile.x, projectile.y);
  }

  for (const [id, view] of views) {
    if (visibleIds.has(id)) continue;
    layer.removeChild(view.sprite);
    view.sprite.destroy();
    views.delete(id);
  }
}

function addVisualEffect(
  x: number,
  y: number,
  baseScale: number,
  lifetimeSeconds: number,
  texture: Texture,
  layer: Container,
  effects: VisualEffect[],
  rotation = 0,
) {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.position.set(x, y);
  sprite.rotation = rotation;
  sprite.scale.set(baseScale);
  layer.addChild(sprite);
  effects.push({ sprite, remainingSeconds: lifetimeSeconds, lifetimeSeconds, baseScale });
}

function addSimulationEffects(events: SimulationEvents, texture: Texture, fireTexture: Texture, layer: Container, effects: VisualEffect[]) {
  for (const vessel of events.destroyedVessels) {
    addVisualEffect(
      vessel.x,
      vessel.y,
      GAME_CONFIG.effects.explosionScale,
      GAME_CONFIG.effects.explosionLifetimeSeconds,
      texture,
      layer,
      effects,
    );
  }
  for (const impact of events.impacts) {
    addVisualEffect(
      impact.x,
      impact.y,
      impact.scale,
      GAME_CONFIG.effects.impactLifetimeSeconds,
      texture,
      layer,
      effects,
    );
  }
  for (const shot of events.shotsFired) {
    addVisualEffect(
      shot.x,
      shot.y,
      shot.scale,
      GAME_CONFIG.effects.muzzleFlashLifetimeSeconds,
      fireTexture,
      layer,
      effects,
      shot.rotation,
    );
  }
}

function updateVisualEffects(effects: VisualEffect[], deltaSeconds: number, layer: Container) {
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const effect = effects[index];
    effect.remainingSeconds -= deltaSeconds;
    const progress = Math.max(0, effect.remainingSeconds / effect.lifetimeSeconds);
    effect.sprite.alpha = progress;
    effect.sprite.scale.set(effect.baseScale * (1.35 - progress * 0.35));
    if (effect.remainingSeconds > 0) continue;
    layer.removeChild(effect.sprite);
    effect.sprite.destroy();
    effects.splice(index, 1);
  }
}

function GameCanvas({ settings, playerShipId, touchInput, paused, onPauseChange, onSnapshot, onGameOver, onLoadingChange }: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  const touchInputRef = useRef(touchInput);
  const callbacksRef = useRef({ onPauseChange, onSnapshot, onGameOver, onLoadingChange });
  pausedRef.current = paused;
  touchInputRef.current = touchInput;
  callbacksRef.current = { onPauseChange, onSnapshot, onGameOver, onLoadingChange };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | undefined;
    let activeIslandLayer: Container | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let keyboard: ReturnType<typeof attachKeyboardInput> | undefined;
    let onIslandDebugKeyDown: ((event: KeyboardEvent) => void) | undefined;
    const vesselViews = new Map<number, VesselView>();
    const projectileViews = new Map<number, ProjectileView>();
    const visualEffects: VisualEffect[] = [];
    let gameOverReported = false;
    let snapshotElapsed = 0;

    const requestPause = (reason: PauseReason) => {
      if (pausedRef.current) return;
      pausedRef.current = true;
      callbacksRef.current.onPauseChange(true, reason);
    };
    const onWindowBlur = () => requestPause('focus');
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') requestPause('focus');
    };

    const destroyApplication = () => {
      resizeObserver?.disconnect();
      resizeObserver = undefined;
      keyboard?.destroy();
      keyboard = undefined;
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (onIslandDebugKeyDown) window.removeEventListener('keydown', onIslandDebugKeyDown);
      onIslandDebugKeyDown = undefined;
      if (app) {
        app.ticker.stop();
        if (activeIslandLayer) {
          app.stage.removeChild(activeIslandLayer);
          destroyIslandLayer(activeIslandLayer);
          activeIslandLayer = undefined;
        }
        app.destroy(true, { children: true, texture: false, textureSource: false });
        app = undefined;
      }
      vesselViews.clear();
      projectileViews.clear();
      visualEffects.length = 0;
      host.replaceChildren();
    };

    const start = async () => {
      if (window.__PIRATE_TEST__?.failNextAssetOnce) {
        window.__PIRATE_TEST__.failNextAssetOnce = false;
        throw new Error('Test harness simulated one failed asset request.');
      }
      const islandAtlasUrl = `${import.meta.env.BASE_URL}island-atlas.json`;
      const playerShipUrl = getPlayerShip(playerShipId).url;
      const coreAssetUrls = [playerShipUrl, chaserShipUrl, shooterShipUrl, cannonballUrl, explosionUrl, fireUrl, waterTextureUrl, backgroundTextureUrl, islandAtlasUrl];
      const assetUrls = coreAssetUrls;
      let loadedAssets = 0;
      const hudAssetUrls = [healthFrameUrl, healthGreenUrl, healthAmberUrl, healthRedUrl, enemyHealthFrameUrl, enemyHealthGreenUrl, enemyHealthRedUrl];
      const allAssetUrls = [...assetUrls, ...hudAssetUrls];
      callbacksRef.current.onLoadingChange({ status: 'loading', loaded: 0, total: allAssetUrls.length });
      const loadedTextures = await Promise.all(allAssetUrls.map(async (url) => {
        const texture = await Assets.load(url);
        loadedAssets += 1;
        if (!disposed) callbacksRef.current.onLoadingChange({ status: 'loading', loaded: loadedAssets, total: allAssetUrls.length });
        return texture;
      }));
      if (disposed) return;
      const [playerTexture, chaserTexture, shooterTexture, cannonballTexture, explosionTexture, fireTexture, waterTexture, backgroundImageTexture, islandAtlas] = loadedTextures;
      const hudOffset = assetUrls.length;
      const [playerHealthFrame, playerHealthGreen, playerHealthAmber, playerHealthRed, enemyHealthFrame, enemyHealthGreen, enemyHealthRed] = loadedTextures.slice(hudOffset);

      const game = new Application();
      await game.init({
        width: GAME_CONFIG.arena.width,
        height: GAME_CONFIG.arena.height,
        background: '#08799a',
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        preference: 'webgl',
      });
      if (disposed) {
        game.destroy(true, { children: true, texture: false, textureSource: false });
        return;
      }
      app = game;

      const sea = new TilingSprite({
        texture: waterTexture,
        width: GAME_CONFIG.arena.width,
        height: GAME_CONFIG.arena.height,
      });
      sea.tileScale.set(1);
      sea.alpha = 0.75;
      const background = new TilingSprite({
        texture: backgroundImageTexture,
        width: GAME_CONFIG.arena.width,
        height: GAME_CONFIG.arena.height,
      });
      background.tileScale.set(1.5);
      const atlasTextures = islandAtlas.textures as Record<string, Texture>;
      const islandTextures: IslandTextures = {
        tiles: Object.fromEntries(Array.from({ length: 96 }, (_, index) => {
          const tileId = index + 1;
          const texture = atlasTextures[`tile_${tileId}.png`];
          if (!texture) throw new Error(`Island atlas is missing frame tile_${tileId}.png.`);
          return [tileId, texture];
        })),
      };
      const islandLayer = createIslandLayer(GAME_CONFIG.islands, islandTextures);
      activeIslandLayer = islandLayer;
      const layers: RenderLayers = {
        islands: islandLayer,
        projectiles: new Container(),
        vessels: new Container(),
        healthBars: new Container(),
        effects: new Container(),
      };
      game.stage.addChild(background, sea, layers.islands, layers.projectiles, layers.vessels, layers.healthBars, layers.effects);
      let islandDebugVisible = false;
      onIslandDebugKeyDown = (event) => {
        if (event.code !== 'F3' || event.repeat) return;
        event.preventDefault();
        islandDebugVisible = !islandDebugVisible;
        setIslandDebugVisible(layers.islands, islandDebugVisible);
      };
      window.addEventListener('keydown', onIslandDebugKeyDown);

      const gameState = createGameState(settings);
      const testMode = new URLSearchParams(window.location.search).get('testMode') === '1';
      const testBridge = testMode ? (window.__PIRATE_TEST__ ??= { timeScale: 1, snapshot: null }) : undefined;
      const testSeed = new URLSearchParams(window.location.search).get('seed') ?? localStorage.getItem('pirate-battle-test-seed-v1') ?? '2026';
      const random = testBridge ? seededRandom(testSeed) : Math.random;
      const testScenario = new URLSearchParams(window.location.search).get('testScenario');
      if (testMode && testScenario === 'phase-transition') {
        gameState.score = GAME_CONFIG.phases.killsPerPhase - 1;
        gameState.spawnCountdown = 30;
        gameState.enemies.push(createTestEnemy(
          100_000,
          'chaser',
          gameState.player.x,
          gameState.player.y + 160,
        ));
      }
      if (testMode && testScenario === 'npc-edge-recovery') {
        gameState.spawnCountdown = 30;
        const enemy = createTestEnemy(100_001, 'chaser', GAME_CONFIG.chaser.boundaryRadius, gameState.player.y);
        enemy.stationarySeconds = GAME_CONFIG.enemyNavigation.stationaryWrapSeconds - 0.05;
        gameState.enemies.push(enemy);
      }
      if (testMode && testScenario === 'npc-shooter-hold') {
        gameState.spawnCountdown = 30;
        const enemy = createTestEnemy(100_002, 'shooter', gameState.player.x + 250, gameState.player.y);
        enemy.rotation = Math.atan2(-(gameState.player.x - enemy.x), gameState.player.y - enemy.y);
        enemy.stationarySeconds = GAME_CONFIG.enemyNavigation.stationaryWrapSeconds - 0.05;
        gameState.enemies.push(enemy);
      }
      if (testMode && testScenario === 'npc-behaviors') {
        gameState.spawnCountdown = 30;
        gameState.enemies.push(createTestEnemy(100_003, 'chaser', gameState.player.x, gameState.player.y + 220));
        const shooter = createTestEnemy(100_004, 'shooter', gameState.player.x + 250, gameState.player.y);
        shooter.rotation = Math.atan2(-(gameState.player.x - shooter.x), gameState.player.y - shooter.y);
        gameState.enemies.push(shooter);
      }
      host.dataset.playerShipId = playerShipId;
      host.dataset.testMode = String(testMode);
      const vesselTextures: VesselTextures = {
        player: playerTexture,
        chaser: chaserTexture,
        shooter: shooterTexture,
      };
      const healthTextures: HealthTextures = {
        playerFrame: playerHealthFrame,
        playerGreen: playerHealthGreen,
        playerAmber: playerHealthAmber,
        playerRed: playerHealthRed,
        enemyFrame: enemyHealthFrame,
        enemyGreen: enemyHealthGreen,
        enemyRed: enemyHealthRed,
      };
      let renderedPhase: 1 | 2 | 3 = gameState.phase;
      keyboard = attachKeyboardInput(window, () => {
        if (pausedRef.current) {
          pausedRef.current = false;
          callbacksRef.current.onPauseChange(false, 'manual');
        } else {
          requestPause('manual');
        }
      });
      window.addEventListener('blur', onWindowBlur);
      document.addEventListener('visibilitychange', onVisibilityChange);
      if (document.visibilityState === 'hidden') requestPause('focus');
      syncVesselViews([gameState.player], vesselViews, layers, vesselTextures, healthTextures);
      callbacksRef.current.onSnapshot({
        score: 0,
        phase: 1,
        timeRemainingSeconds: settings.sessionTimeSeconds,
        playerHealth: gameState.player.health,
        playerMaxHealth: gameState.player.maxHealth,
      });

      const fitCanvasToScreen = () => {
        const rect = host.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        const scale = Math.min(rect.width / GAME_CONFIG.arena.width, rect.height / GAME_CONFIG.arena.height);
        game.canvas.style.width = `${GAME_CONFIG.arena.width * scale}px`;
        game.canvas.style.height = `${GAME_CONFIG.arena.height * scale}px`;
      };
      fitCanvasToScreen();
      resizeObserver = new ResizeObserver(fitCanvasToScreen);
      resizeObserver.observe(host);

      let waterTime = 0;
      let playerShotsFired = 0;
      let enemyShotsFired = 0;
      let maximumEntityCount = 1;
      const enemyKindsSeen = new Set<string>();
      const readCombinedInput = (): GameInput => {
        const keyboardInput = keyboard?.read() ?? EMPTY_INPUT;
        return {
          forward: keyboardInput.forward || touchInputRef.current.forward,
          reverse: keyboardInput.reverse || touchInputRef.current.reverse,
          turnLeft: keyboardInput.turnLeft || touchInputRef.current.turnLeft,
          turnRight: keyboardInput.turnRight || touchInputRef.current.turnRight,
          fireFront: keyboardInput.fireFront || touchInputRef.current.fireFront,
          fireLeft: keyboardInput.fireLeft || touchInputRef.current.fireLeft,
          fireRight: keyboardInput.fireRight || touchInputRef.current.fireRight,
        };
      };
      const trackEvents = (events: SimulationEvents) => {
        playerShotsFired += events.shotsFired.filter((shot) => shot.vesselId === gameState.player.id).length;
        enemyShotsFired += events.shotsFired.filter((shot) => shot.vesselId !== gameState.player.id).length;
        for (const enemy of gameState.enemies) enemyKindsSeen.add(enemy.kind);
        maximumEntityCount = Math.max(maximumEntityCount, 1 + gameState.enemies.length + gameState.projectiles.length);
      };
      const publishTestSnapshot = () => {
        if (!testBridge) return;
        testBridge.snapshot = {
          player: { x: gameState.player.x, y: gameState.player.y, rotation: gameState.player.rotation, health: gameState.player.health, alive: gameState.player.alive },
          enemies: gameState.enemies.map(({ kind, x, y, health, stationarySeconds, navigationTarget }) => ({ kind, x, y, health, stationarySeconds, navigationTarget })),
          projectiles: gameState.projectiles.length,
          islands: gameState.islands.map(({ x, y, grid, gridCellSize }) => ({ x, y, width: Math.max(...grid.map((row) => row.length)) * gridCellSize, height: grid.length * gridCellSize })),
          score: gameState.score,
          phase: gameState.phase,
          timeRemainingSeconds: gameState.timeRemainingSeconds,
          spawnCountdown: gameState.spawnCountdown,
          playerShotsFired,
          enemyShotsFired,
          maximumEntityCount,
          enemyKindsSeen: [...enemyKindsSeen],
        };
        host.dataset.gameState = JSON.stringify(testBridge.snapshot);
      };
      if (testBridge) {
        testBridge.advance = (deltaSeconds) => {
          if (pausedRef.current || gameState.endReason) return;
          const events = stepSimulation(gameState, readCombinedInput(), Math.min(120, Math.max(0, deltaSeconds)), random);
          trackEvents(events);
          publishTestSnapshot();
          const snapshot = gameSnapshot(gameState);
          callbacksRef.current.onSnapshot(snapshot);
          if (gameState.endReason && !gameOverReported) {
            gameOverReported = true;
            callbacksRef.current.onGameOver({
              ...snapshot,
              timePlayedSeconds: Math.max(0, settings.sessionTimeSeconds - gameState.timeRemainingSeconds),
              endReason: gameState.endReason,
            });
          }
        };
        publishTestSnapshot();
      }
      game.ticker.add((ticker) => {
        if (!testBridge?.freezeVisuals) waterTime += Math.min(ticker.deltaMS / 1000, GAME_CONFIG.simulation.maxDeltaSeconds);
        // Scroll the water pattern continuously and add a slower vertical swell.
        sea.tilePosition.set(waterTime * 8, waterTime * 14 + Math.sin(waterTime * 0.8) * 10);
        if (pausedRef.current) return;
        const maximumDeltaSeconds = testBridge && testBridge.timeScale >= 100
          ? 120
          : GAME_CONFIG.simulation.maxDeltaSeconds;
        const deltaSeconds = Math.min(ticker.deltaMS / 1000 * (testBridge?.timeScale ?? 1), maximumDeltaSeconds);
        const events = testBridge?.timeScale === 0
          ? { destroyedVessels: [], impacts: [], shotsFired: [] }
          : stepSimulation(gameState, readCombinedInput(), deltaSeconds, random);
        if (testBridge?.timeScale !== 0) trackEvents(events);
        addSimulationEffects(events, explosionTexture, fireTexture, layers.effects, visualEffects);
        if (testBridge?.timeScale !== 0) publishTestSnapshot();

        if (gameState.phase !== renderedPhase) {
          game.stage.removeChild(layers.islands);
          destroyIslandLayer(layers.islands);
          layers.islands = createIslandLayer(gameState.islands, islandTextures);
          activeIslandLayer = layers.islands;
          setIslandDebugVisible(layers.islands, islandDebugVisible);
          game.stage.addChildAt(layers.islands, 2);
          renderedPhase = gameState.phase;
        }

        const visibleVessels = [
          ...(gameState.player.alive ? [gameState.player] : []),
          ...gameState.enemies,
        ];
        syncVesselViews(visibleVessels, vesselViews, layers, vesselTextures, healthTextures, deltaSeconds, waterTime);
        applyVesselImpulses(events, vesselViews);
        syncProjectileViews(gameState.projectiles, projectileViews, layers.projectiles, cannonballTexture);
        updateVisualEffects(visualEffects, deltaSeconds, layers.effects);

        snapshotElapsed += deltaSeconds;
        if (snapshotElapsed >= 0.2 || gameState.endReason) {
          snapshotElapsed = 0;
          const snapshot = gameSnapshot(gameState);
          callbacksRef.current.onSnapshot(snapshot);
          if (gameState.endReason && !gameOverReported) {
            gameOverReported = true;
            callbacksRef.current.onGameOver({
              ...snapshot,
              timePlayedSeconds: Math.max(0, settings.sessionTimeSeconds - gameState.timeRemainingSeconds),
              endReason: gameState.endReason,
            });
          }
        }
      });

      host.appendChild(game.canvas);
      game.start();
      callbacksRef.current.onLoadingChange({ status: 'ready' });
    };

    void start().catch((error: unknown) => {
      if (!disposed) {
        callbacksRef.current.onLoadingChange({ status: 'error' });
        console.error('Unable to initialize the sea trial.', error);
      }
    });

    return () => {
      disposed = true;
      pausedRef.current = true;
      destroyApplication();
    };
  }, [settings, playerShipId]);

  return (
    <div
      className="game-canvas-host"
      ref={hostRef}
      role="application"
      aria-label="Pirate Battle. WASD or arrow keys to sail, Space to fire forward, Q and E for side broadsides, Escape to pause."
    />
  );
}

const EMPTY_INPUT: GameInput = {
  forward: false,
  reverse: false,
  turnLeft: false,
  turnRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
};

export default GameCanvas;
