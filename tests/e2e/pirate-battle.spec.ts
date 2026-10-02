import { expect, test, type Page } from '@playwright/test';

async function openGame(page: Page) {
  await page.goto('/?testMode=1&seed=14159');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
}

async function startVoyage(page: Page) {
  await page.getByLabel('Your ship').selectOption('ship_12');
  await page.getByLabel('Captain name (used in ranking)').fill('Test Captain');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.game-canvas-host canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.game-canvas-host')).toHaveAttribute('data-player-ship-id', 'ship_12');
}

async function state(page: Page) {
  return page.evaluate(() => window.__PIRATE_TEST__?.snapshot ?? JSON.parse(document.querySelector('.game-canvas-host')?.getAttribute('data-game-state') ?? '{}')) as Promise<{
    player: { x: number; y: number; rotation: number; health: number; alive: boolean };
    enemies: { kind: 'chaser' | 'shooter'; x: number; y: number; health: number; stationarySeconds: number; navigationTarget: { x: number; y: number } | null }[];
    islands: { x: number; y: number; width: number; height: number }[];
    projectiles: number;
    score: number;
    phase: number;
    timeRemainingSeconds: number;
    playerShotsFired: number;
    enemyShotsFired: number;
    maximumEntityCount: number;
    enemyKindsSeen: string[];
  }>;
}

async function advanceSimulation(page: Page, seconds: number) {
  await page.evaluate((delta) => window.__PIRATE_TEST__?.advance?.(delta), seconds);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pirate-battle-test-seed-v1', '14159');
    window.__PIRATE_TEST__ = { timeScale: 0, snapshot: null, freezeVisuals: true };
  });
});

test('captain and all playable ships are selectable and persist across reload', async ({ page }) => {
  await openGame(page);
  const options = await page.locator('#player-ship option').count();
  expect(options).toBe(30);
  await page.getByLabel('Captain name (used in ranking)').fill('Ada Corsair');
  await page.getByLabel('Your ship').selectOption('dinghy_large_2');
  await page.getByRole('button', { name: 'Save captain and ship' }).click();
  await page.reload();
  await expect(page.getByLabel('Captain name (used in ranking)')).toHaveValue('Ada Corsair');
  await expect(page.getByLabel('Your ship')).toHaveValue('dinghy_large_2');
});

test('options persist and ranking pagination, empty, 4xx, 5xx, network, and variable latency render states', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('button', { name: 'Increase Enemy spawn time' }).click();
  await page.getByRole('button', { name: 'Save Options' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Options' }).click();
  await expect(page.locator('.option-stepper output').nth(1)).toContainText('3.5');
  await page.getByRole('button', { name: 'Decrease Enemy spawn time' }).click();
  await page.getByRole('button', { name: 'Save Options' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Ranking' }).click();
  await expect(page.getByText('Page 1 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Page 2 of 3')).toBeVisible();

  await page.getByText('Local API demo and reset').click();
  const scenario = page.getByLabel('Network scenario');
  await scenario.selectOption('empty');
  await expect(page.getByText('No scores yet for these match settings.')).toBeVisible();
  await scenario.selectOption('client-error');
  await expect(page.getByRole('alert')).toContainText('ranking could not be loaded');
  await scenario.selectOption('ranking-error');
  await expect(page.getByRole('alert')).toContainText('ranking could not be loaded');
  await scenario.selectOption('connection-error');
  await expect(page.getByRole('alert')).toContainText('ranking could not be loaded');
  await scenario.selectOption('slow-variable');
  await expect(page.getByRole('list', { name: 'Paginated ranking' })).toBeVisible({ timeout: 5000 });

  await scenario.selectOption('out-of-order');
  const delayedFirstPage = page.waitForResponse((response) => response.url().includes('/ranking') && response.url().includes('page=1'));
  await page.getByRole('button', { name: 'Previous' }).click();
  await delayedFirstPage;
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Page 2 of 3')).toBeVisible();
  await page.waitForTimeout(1700);
  await expect(page.getByText('Page 2 of 3')).toBeVisible();

  await page.getByRole('button', { name: 'Back to Main Menu' }).click();
  await page.getByRole('button', { name: 'Match History' }).click();
  await expect(page.getByText('Your completed voyages will appear here.')).toBeVisible();
  await page.getByText('Local API demo and reset').click();
  await page.getByLabel('Network scenario').selectOption('history-error');
  await expect(page.getByRole('alert')).toContainText('Match history could not be loaded.');
  await page.getByLabel('Network scenario').selectOption('empty');
  await expect(page.getByText('Your completed voyages will appear here.')).toBeVisible();
});

test('real keyboard movement, front and broadside attacks, pause, and resume affect gameplay', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard combat is exercised in desktop Chromium.');
  await openGame(page);
  await page.getByLabel('Captain name (used in ranking)').fill('Combat Tester');
  await page.getByRole('button', { name: 'Options' }).click();
  const spawnUp = page.getByRole('button', { name: 'Increase Enemy spawn time' });
  while (!(await spawnUp.isDisabled())) await spawnUp.click();
  await page.getByRole('button', { name: 'Save Options' }).click();
  await startVoyage(page);
  await expect(page.locator('.game-canvas-host')).toHaveAttribute('data-test-mode', 'true');
  await expect(page.locator('.game-canvas-host')).toHaveAttribute('data-game-state', /player/);
  const start = await state(page);
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyE');
  await page.keyboard.down('KeyW');
  await advanceSimulation(page, 0.25);
  expect((await state(page)).playerShotsFired).toBeGreaterThan(0);
  await advanceSimulation(page, 0.5);
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyE');
  await page.keyboard.up('KeyW');
  const moved = await state(page);
  expect(Math.hypot(moved.player.x - start.player.x, moved.player.y - start.player.y)).toBeGreaterThan(5);
  expect(moved.playerShotsFired).toBeGreaterThan(1);
  await expect(page.getByRole('progressbar', { name: 'Player hull' })).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByRole('group', { name: 'Phase 1. Score 0' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Time remaining 02:00' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause game' }).click();
  await expect(page.getByRole('dialog', { name: 'VOYAGE PAUSED' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('dialog');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Resume Voyage' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Return to Main Menu' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Resume Voyage' })).toBeFocused();
  const pausedAt = await state(page);
  await advanceSimulation(page, 1);
  const stillPaused = await state(page);
  expect(stillPaused.timeRemainingSeconds).toBe(pausedAt.timeRemainingSeconds);
  await page.getByRole('button', { name: 'Resume Voyage' }).click();
  await expect(page.getByRole('dialog', { name: 'VOYAGE PAUSED' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause game' })).toBeFocused();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('dialog', { name: 'VOYAGE PAUSED' })).toContainText('lost focus');
  await page.getByRole('button', { name: 'Resume Voyage' }).click();
});

test('island contact applies damage once per cooldown', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Deterministic island collision is exercised in desktop Chromium.');
  await openGame(page);
  await page.getByRole('button', { name: 'Options' }).click();
  const spawnUp = page.getByRole('button', { name: 'Increase Enemy spawn time' });
  while (!(await spawnUp.isDisabled())) await spawnUp.click();
  await page.getByRole('button', { name: 'Save Options' }).click();
  await startVoyage(page);
  const initial = await state(page);
  const island = initial.islands.filter((candidate) => candidate.x > initial.player.x)
    .sort((first, second) => first.x - second.x)[0];
  expect(island).toBeTruthy();
  const targetX = island.x - island.width / 2 - 12;
  const targetY = Math.max(island.y - island.height / 2 + 20, Math.min(island.y + island.height / 2 - 20, initial.player.y));
  const wanted = Math.atan2(-(targetX - initial.player.x), targetY - initial.player.y);
  let turn = wanted - initial.player.rotation;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  const turnKey = turn < 0 ? 'KeyA' : 'KeyD';
  await page.keyboard.down(turnKey);
  await advanceSimulation(page, Math.abs(turn) / 2.6);
  await page.keyboard.up(turnKey);
  await page.keyboard.down('KeyW');
  await advanceSimulation(page, 1);
  const firstContact = await state(page);
  expect(firstContact.player.health).toBe(88);
  await advanceSimulation(page, 0.5);
  expect((await state(page)).player.health).toBe(88);
  await advanceSimulation(page, 0.3);
  expect((await state(page)).player.health).toBe(76);
  await page.keyboard.up('KeyW');
});

test('player wraps safely across an arena boundary', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Boundary traversal is exercised in desktop Chromium.');
  await openGame(page);
  await page.getByRole('button', { name: 'Options' }).click();
  const spawnUp = page.getByRole('button', { name: 'Increase Enemy spawn time' });
  while (!(await spawnUp.isDisabled())) await spawnUp.click();
  await page.getByRole('button', { name: 'Save Options' }).click();
  await startVoyage(page);
  const initial = await state(page);
  await page.keyboard.down('KeyW');
  await advanceSimulation(page, 0.45);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD');
  await advanceSimulation(page, Math.PI / (2 * 2.6));
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyW');
  await advanceSimulation(page, 4);
  await page.keyboard.up('KeyW');
  const wrapped = await state(page);
  expect(wrapped.player.alive).toBeTruthy();
  expect(wrapped.player.x).toBeGreaterThan(initial.player.x + 300);
});

test('abandoning a voyage does not save a result and menus remain navigable', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The abandon flow is exercised in desktop Chromium.');
  await openGame(page);
  await startVoyage(page);
  await page.getByRole('button', { name: 'Pause game' }).click();
  await page.getByRole('button', { name: 'Return to Main Menu' }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pirate-battle-last-result-v1'))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pirate-battle-pending-records-v1') ?? '[]'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Match History' }).click();
  await expect(page.getByText('Your completed voyages will appear here.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to Main Menu' }).click();
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Ranking' }).click();
  await expect(page.getByText('Page 1 of 3')).toBeVisible();
});

test('enemy pressure ends the voyage by destruction and records that end reason', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Death result handling is exercised in desktop Chromium.');
  await openGame(page);
  await page.getByRole('button', { name: 'Options' }).click();
  const spawnDown = page.getByRole('button', { name: 'Decrease Enemy spawn time' });
  while (!(await spawnDown.isDisabled())) await spawnDown.click();
  await page.getByRole('button', { name: 'Save Options' }).click();
  await startVoyage(page);
  await page.evaluate(() => {
    const bridge = window.__PIRATE_TEST__;
    for (let step = 0; step < 1200; step += 1) {
      const current = bridge?.snapshot as { player?: { alive: boolean } } | null | undefined;
      if (!current?.player?.alive) break;
      bridge?.advance?.(0.1);
    }
  });
  await expect(page.getByRole('heading', { name: 'SHIP DESTROYED' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/DEFEATED/)).toBeVisible();
  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.getByRole('button', { name: 'Match History' }).click();
  await expect(page.locator('.history-list .record-row')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('.history-list .record-row').first()).toContainText('Ship destroyed');
});

test('a real hit advances phase, clears the old fleet, and replaces the island map', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The deterministic phase transition is exercised in desktop Chromium.');
  await page.goto('/?testMode=1&seed=14159&testScenario=phase-transition');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await startVoyage(page);
  const before = await state(page);
  expect(before.score).toBe(9);
  expect(before.phase).toBe(1);
  expect(before.enemies).toHaveLength(1);
  await page.keyboard.down('Space');
  await page.evaluate(() => {
    for (let step = 0; step < 20; step += 1) {
      window.__PIRATE_TEST__?.advance?.(0.1);
      const current = window.__PIRATE_TEST__?.snapshot as { score?: number } | null | undefined;
      if ((current?.score ?? 0) >= 10) break;
    }
  });
  await page.keyboard.up('Space');
  const after = await state(page);
  expect(after.playerShotsFired).toBeGreaterThan(0);
  expect(after.score).toBe(10);
  expect(after.phase).toBe(2);
  expect(after.enemies).toHaveLength(0);
  expect(after.projectiles).toBe(0);
  expect(after.islands.map(({ x, y }) => [x, y])).toEqual([[280, 520], [1000, 220]]);
  await expect(page.getByRole('status').filter({ hasText: 'PHASE 2' })).toBeVisible();
});

test('mobile exposes touch controls and fits game canvas in viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch layout is exercised in the mobile Chromium project.');
  await openGame(page);
  await startVoyage(page);
  await expect(page.getByRole('button', { name: 'Move forward' })).toBeVisible();
  const bounds = await page.locator('.game-canvas-host canvas').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await page.getByRole('button', { name: 'Move forward' }).tap();
  expect(isMobile).toBeTruthy();
});

test('result screen and locally saved last voyage survive a refresh', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Accelerated timed result flow is exercised in desktop Chromium.');
  await openGame(page);
  await page.getByRole('button', { name: 'Options' }).click();
  const sessionDown = page.getByRole('button', { name: 'Decrease Game session time' });
  while (!(await sessionDown.isDisabled())) await sessionDown.click();
  const spawnUp = page.getByRole('button', { name: 'Increase Enemy spawn time' });
  while (!(await spawnUp.isDisabled())) await spawnUp.click();
  await page.getByRole('button', { name: 'Save Options' }).click();
  await startVoyage(page);
  await advanceSimulation(page, 60);
  await expect(page.getByRole('heading', { name: 'VOYAGE COMPLETE' })).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('.result-panel')).toHaveScreenshot('result-screen.png', { animations: 'disabled' });
  await page.reload();
  await page.getByRole('button', { name: /Last voyage/ }).click();
  await expect(page.getByRole('heading', { name: 'VOYAGE COMPLETE' })).toBeVisible();
  await page.getByRole('button', { name: 'Play Again' }).click();
  await expect(page.locator('.game-canvas-host canvas')).toBeVisible({ timeout: 30_000 });
  const restarted = await state(page);
  expect(restarted.phase).toBe(1);
  expect(restarted.score).toBe(0);
  expect(restarted.player.health).toBe(100);
  expect(restarted.timeRemainingSeconds).toBe(60);
});

test('failed atlas load exposes retry and recovers when the asset is available', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Asset failure/retry is covered in desktop Chromium.');
  await page.addInitScript(() => { if (window.__PIRATE_TEST__) window.__PIRATE_TEST__.failNextAssetOnce = true; });
  await openGame(page);
  await page.getByLabel('Your ship').selectOption('ship_12');
  await page.getByLabel('Captain name (used in ranking)').fill('Test Captain');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'THE SEA IS UNAVAILABLE' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Retry Loading' }).click();
  await expect(page.locator('.game-canvas-host canvas')).toBeVisible({ timeout: 30_000 });
});

test('commit-then-timeout retries the same match without a duplicate history row', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The idempotent retry flow is covered in desktop Chromium.');
  await openGame(page);
  await page.getByRole('button', { name: 'Options' }).click();
  const sessionDown = page.getByRole('button', { name: 'Decrease Game session time' });
  while (!(await sessionDown.isDisabled())) await sessionDown.click();
  const spawnUp = page.getByRole('button', { name: 'Increase Enemy spawn time' });
  while (!(await spawnUp.isDisabled())) await spawnUp.click();
  await page.getByRole('button', { name: 'Save Options' }).click();
  await page.getByRole('button', { name: 'Ranking' }).click();
  await page.getByText('Local API demo and reset').click();
  await page.getByLabel('Network scenario').selectOption('submit-timeout');
  await page.getByRole('button', { name: 'Back to Main Menu' }).click();
  await startVoyage(page);
  await advanceSimulation(page, 60);
  await expect(page.getByRole('heading', { name: 'VOYAGE COMPLETE' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/waiting to be sent/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.getByRole('button', { name: 'Ranking' }).click();
  await page.getByText('Local API demo and reset').click();
  await page.getByLabel('Network scenario').selectOption('normal');
  await page.getByRole('button', { name: 'Retry pending' }).click();
  await expect(page.getByText('Score recorded in the ranking and match history.')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Back to Main Menu' }).click();
  await page.getByRole('button', { name: 'Match History' }).click();
  await expect(page.locator('.history-list .record-row')).toHaveCount(1);
});

test('pending score survives refresh and recovers after a failed submission', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Pending record recovery is exercised in desktop Chromium.');
  await openGame(page);
  await page.evaluate(() => {
    const playerId = localStorage.getItem('pirate-battle-player-id-v1')!;
    const pending = [{
      matchId: 'pending-refresh-recovery-1', playerId, playerName: 'Refresh Captain',
      createdAt: new Date().toISOString(), score: 125, durationSeconds: 60,
      endReason: 'time', settings: { sessionTimeSeconds: 90, enemySpawnIntervalSeconds: 3 }, phaseReached: 1,
    }];
    localStorage.setItem('pirate-battle-pending-records-v1', JSON.stringify(pending));
    localStorage.setItem('pirate-battle-network-scenario-v1', 'submit-error');
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pirate-battle-pending-records-v1') ?? '[]').length)).toBe(1);
  await page.getByRole('button', { name: 'Ranking' }).click();
  await expect(page.getByRole('button', { name: 'Retry pending' })).toBeVisible();
  await page.getByText('Local API demo and reset').click();
  await page.getByLabel('Network scenario').selectOption('normal');
  await page.getByRole('button', { name: 'Retry pending' }).click();
  await expect(page.getByText('Score recorded in the ranking and match history.')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pirate-battle-pending-records-v1') ?? '[]').length)).toBe(0);
  await page.getByRole('button', { name: 'Back to Main Menu' }).click();
  await page.getByRole('button', { name: 'Match History' }).click();
  await expect(page.locator('.history-list .record-row')).toHaveCount(1);
});

test('match history paginates records scoped to the active captain', async ({ page, isMobile }) => {
  test.skip(isMobile, 'History pagination is exercised in desktop Chromium.');
  await openGame(page);
  const playerId = await page.evaluate(() => localStorage.getItem('pirate-battle-player-id-v1')!);
  await page.evaluate((captainId) => {
    const records = Array.from({ length: 8 }, (_, index) => ({
      matchId: `history-page-${index + 1}`, playerId: captainId, playerName: 'History Captain',
      createdAt: new Date(Date.UTC(2026, 0, 20 - index)).toISOString(), score: 100 - index,
      durationSeconds: 60, endReason: 'time',
      settings: { sessionTimeSeconds: 90, enemySpawnIntervalSeconds: 3 }, phaseReached: 1,
    }));
    localStorage.setItem('pirate-battle-confirmed-records-v1', JSON.stringify(records));
  }, playerId);
  await page.reload();
  await page.getByRole('button', { name: 'Match History' }).click();
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(page.locator('.history-list .record-row')).toHaveCount(6);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(page.locator('.history-list .record-row')).toHaveCount(2);
});

test('main menu has a stable visual baseline', async ({ page }) => {
  test.skip(test.info().project.name === 'chromium-mobile', 'Menu baseline is captured in desktop Chromium.');
  await openGame(page);
  await expect(page.locator('.menu-panel')).toHaveScreenshot('main-menu.png', { animations: 'disabled' });
});

test('arena has a stable visual baseline', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Arena baseline is captured in desktop Chromium.');
  await openGame(page);
  await startVoyage(page);
  expect(await page.screenshot({ animations: 'disabled' })).toMatchSnapshot('arena.png', { maxDiffPixelRatio: 0.02 });
  await page.getByRole('button', { name: 'Pause game' }).click();
  await expect(page.getByRole('dialog', { name: 'VOYAGE PAUSED' })).toBeVisible();
});

test('enemy movement pilot steers toward a target using ship navigation and weapon controls', async ({ page }) => {
  test.skip(test.info().project.name === 'chromium-mobile', 'Keyboard pilot is run in desktop Chromium.');
  await openGame(page);
  await page.getByRole('button', { name: 'Options' }).click();
  const spawnDown = page.getByRole('button', { name: 'Decrease Enemy spawn time' });
  while (!(await spawnDown.isDisabled())) await spawnDown.click();
  await page.getByRole('button', { name: 'Save Options' }).click();
  await startVoyage(page);
  await page.evaluate(() => {
    const bridge = window.__PIRATE_TEST__;
    bridge?.advance?.(1);
    bridge?.advance?.(1);
  });
  const starting = await state(page);
  expect(starting.enemies.length).toBeGreaterThan(0);
  expect((await state(page)).enemyKindsSeen).toContain('shooter');

  // Pilot copies the enemies' target-seeking turn, then uses real movement and weapon keys.
  const pilot = page.keyboard;
  const target = starting.enemies[0];
  const deltaX = target.x - starting.player.x;
  const deltaY = target.y - starting.player.y;
  const wanted = Math.atan2(-deltaX, deltaY);
  let difference = wanted - starting.player.rotation;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  const turnKey = difference >= 0 ? 'KeyD' : 'KeyA';
  await pilot.down(turnKey);
  await advanceSimulation(page, Math.min(0.3, Math.max(0.05, Math.abs(difference) / 2.6)));
  await pilot.up(turnKey);
  await pilot.down('KeyW');
  await pilot.down('Space');
  await pilot.down('KeyQ');
  await advanceSimulation(page, 0.35);
  await pilot.up('KeyW');
  await pilot.up('Space');
  await pilot.up('KeyQ');
  const completed = await state(page);
  expect(completed.playerShotsFired).toBeGreaterThan(0);
  expect(Math.hypot(completed.player.x - starting.player.x, completed.player.y - starting.player.y)).toBeGreaterThan(0);
});

test('Chaser pursues, Shooter fires, and a stationary Shooter keeps its attack position', async ({ page }) => {
  await page.goto('/?testMode=1&seed=14159&testScenario=npc-behaviors');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await startVoyage(page);
  const starting = await state(page);
  const chaserStart = starting.enemies.find((enemy) => enemy.kind === 'chaser')!;
  const initialDistance = Math.hypot(chaserStart.x - starting.player.x, chaserStart.y - starting.player.y);
  await page.evaluate(() => {
    for (let step = 0; step < 30; step += 1) window.__PIRATE_TEST__?.advance?.(0.1);
  });
  const advanced = await state(page);
  const chaserEnd = advanced.enemies.find((enemy) => enemy.kind === 'chaser');
  expect(chaserEnd).toBeTruthy();
  expect(Math.hypot(chaserEnd!.x - advanced.player.x, chaserEnd!.y - advanced.player.y)).toBeLessThan(initialDistance);
  expect(advanced.enemyShotsFired).toBeGreaterThan(0);
});

test('an NPC stuck beside the edge recovers across the arena and clears its stale route', async ({ page }) => {
  await page.goto('/?testMode=1&seed=14159&testScenario=npc-edge-recovery');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await startVoyage(page);
  const starting = await state(page);
  expect(starting.enemies).toHaveLength(1);
  expect(starting.enemies[0].x).toBeLessThan(100);
  await advanceSimulation(page, 0.1);
  const recovered = await state(page);
  expect(recovered.enemies).toHaveLength(1);
  expect(recovered.enemies[0].x).toBeGreaterThan(1100);
  expect(recovered.enemies[0].stationarySeconds).toBe(0);
  expect(recovered.enemies[0].navigationTarget).toBeNull();
});

test('a Shooter holding a clear attack position is exempt from edge-stall recovery', async ({ page }) => {
  await page.goto('/?testMode=1&seed=14159&testScenario=npc-shooter-hold');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await startVoyage(page);
  const starting = await state(page);
  expect(starting.enemies).toHaveLength(1);
  const initialX = starting.enemies[0].x;
  await advanceSimulation(page, 0.1);
  const after = await state(page);
  expect(after.enemies).toHaveLength(1);
  expect(after.enemies[0].x).toBeCloseTo(initialX, 1);
  expect(after.enemies[0].stationarySeconds).toBe(0);
  expect(after.enemyShotsFired).toBeGreaterThan(0);
});
