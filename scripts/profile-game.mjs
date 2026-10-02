import { spawn } from 'node:child_process';
import { cpus, hostname, platform, release, totalmem } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const minimalProfile = process.argv.includes('--minimal');
const matchDurationSeconds = minimalProfile ? 60 : 180;
const wallLimitSeconds = minimalProfile ? 25 : 240;
const enemySpawnIntervalSeconds = 15;
const origin = 'http://127.0.0.1:5174';
const artifacts = resolve('artifacts');
const preview = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { stdio: 'ignore' });
let browser;

async function waitForPreview() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch { /* Vite preview has not started yet. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  throw new Error('Production preview did not start on 127.0.0.1:5174.');
}

try {
  await waitForPreview();
  browser = await chromium.launch({ args: ['--js-flags=--expose-gc', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('pirate-battle-test-seed-v1', '987654'));
  await page.goto(`${origin}/?testMode=1&seed=987654`);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Options' }).click();
  const sessionUp = page.getByRole('button', { name: 'Increase Game session time' });
  const sessionDown = page.getByRole('button', { name: 'Decrease Game session time' });
  const sessionAdjust = minimalProfile ? sessionDown : sessionUp;
  for (let clicks = 0; clicks < 12 && await sessionAdjust.isEnabled(); clicks += 1) await sessionAdjust.click();
  const spawnUp = page.getByRole('button', { name: 'Increase Enemy spawn time' });
  for (let clicks = 0; clicks < 30 && await spawnUp.isEnabled(); clicks += 1) await spawnUp.click();
  await expect(page.locator('.option-stepper output').first()).toContainText(String(matchDurationSeconds));
  await page.getByRole('button', { name: 'Save Options' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.game-canvas-host canvas')).toBeVisible({ timeout: 30_000 });
  const initialTime = `${String(Math.floor(matchDurationSeconds / 60)).padStart(2, '0')}:${String(matchDurationSeconds % 60).padStart(2, '0')}`;
  await expect(page.getByRole('group', { name: `Time remaining ${initialTime}` })).toBeVisible();

  await page.evaluate(() => {
    const profile = { startedAt: performance.now(), lastFrame: 0, intervals: [], memorySamples: [], maxEntities: 0, maxEnemies: 0, stopped: false };
    const sample = (now) => {
      if (profile.stopped) return;
      if (profile.lastFrame) profile.intervals.push(now - profile.lastFrame);
      profile.lastFrame = now;
      const snapshot = window.__PIRATE_TEST__?.snapshot;
      if (snapshot && typeof snapshot === 'object') {
        const value = snapshot;
        profile.maxEntities = Math.max(profile.maxEntities, Number(value.maximumEntityCount ?? 0));
        profile.maxEnemies = Math.max(profile.maxEnemies, Array.isArray(value.enemies) ? value.enemies.length : 0);
      }
      requestAnimationFrame(sample);
    };
    const sampleMemory = () => {
      if (profile.stopped) return;
      const memory = performance.memory;
      if (memory) profile.memorySamples.push({ atSeconds: (performance.now() - profile.startedAt) / 1000, usedBytes: memory.usedJSHeapSize, totalBytes: memory.totalJSHeapSize });
      window.setTimeout(sampleMemory, 1000);
    };
    window.__PROFILE__ = profile;
    requestAnimationFrame(sample);
    sampleMemory();
  });

  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyQ');
  await page.keyboard.down('KeyE');
  const resultHeading = page.getByRole('heading', { name: /VOYAGE COMPLETE|SHIP DESTROYED/ });
  let matchCompleted = false;
  for (let second = 0; second < wallLimitSeconds; second += 1) {
    if (await resultHeading.isVisible().catch(() => false)) { matchCompleted = true; break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyQ');
  await page.keyboard.up('KeyE');

  const measurement = await page.evaluate(() => {
    const profile = window.__PROFILE__;
    profile.stopped = true;
    const intervals = [...profile.intervals].sort((a, b) => a - b);
    const p95 = intervals.length ? intervals[Math.ceil(intervals.length * 0.95) - 1] : null;
    const elapsedSeconds = (performance.now() - profile.startedAt) / 1000;
    const snapshot = window.__PIRATE_TEST__?.snapshot ?? {};
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const renderer = gl?.getExtension('WEBGL_debug_renderer_info')
      ? gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)
      : null;
    return {
      elapsedSeconds,
      frameCount: intervals.length,
      averageFps: elapsedSeconds ? intervals.length / elapsedSeconds : null,
      averageFrameMs: intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null,
      p95FrameMs: p95,
      maxEntities: profile.maxEntities,
      maxEnemies: profile.maxEnemies,
      endReason: document.querySelector('.result-heading')?.textContent?.trim() ?? 'Incomplete: wall-time limit reached',
      simTimeRemaining: snapshot.timeRemainingSeconds ?? null,
      memorySamples: profile.memorySamples,
      browser: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGiB: navigator.deviceMemory ?? null,
      renderer,
      resolution: `${innerWidth}x${innerHeight} @${devicePixelRatio}x`,
      finalUsedHeapBytes: performance.memory?.usedJSHeapSize ?? null,
    };
  });
  measurement.matchCompleted = matchCompleted;
  if (!matchCompleted) measurement.endReason = `Incomplete: ${wallLimitSeconds}-second wall-time limit reached`;

  const cycles = [];
  if (!matchCompleted) {
    await page.getByRole('button', { name: 'Pause game' }).click();
    await page.getByRole('button', { name: 'Return to Main Menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  }
  for (let cycle = 1; cycle <= 5; cycle += 1) {
    const before = await page.evaluate(() => {
      window.gc?.();
      return performance.memory?.usedJSHeapSize ?? null;
    });
    if (cycle === 1 && matchCompleted) await page.getByRole('button', { name: 'Play Again' }).click();
    else await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.game-canvas-host canvas')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1000);
    await page.keyboard.up('KeyW');
    await page.getByRole('button', { name: 'Pause game' }).click();
    await page.getByRole('button', { name: 'Return to Main Menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    const after = await page.evaluate(() => {
      window.gc?.();
      return performance.memory?.usedJSHeapSize ?? null;
    });
    cycles.push({ cycle, heapBeforeGcBytes: before, heapAfterGcBytes: after, heapDeltaBytes: before !== null && after !== null ? after - before : null });
  }

  const system = {
    hostname: hostname(), platform: `${platform()} ${release()}`,
    cpuModel: cpus()[0]?.model ?? 'unknown', cpuLogicalCores: cpus().length,
    physicalMemoryGiB: Math.round(totalmem() / (1024 ** 3) * 10) / 10,
    browserVersion: browser.version(),
  };
  const configuration = { sessionTimeSeconds: matchDurationSeconds, enemySpawnIntervalSeconds, seed: 987654 };
  const report = { profileType: minimalProfile ? 'minimal-diagnostic' : 'full-three-minute', configuration, system, match: measurement, lifecycleCycles: cycles, pageErrors };
  await mkdir(artifacts, { recursive: true });
  const jsonPath = resolve(artifacts, 'performance-profile.json');
  const markdownPath = resolve(artifacts, 'performance-profile.md');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const memoryRange = measurement.memorySamples.length
    ? `${Math.round(Math.min(...measurement.memorySamples.map((sample) => sample.usedBytes)) / 1048576)}–${Math.round(Math.max(...measurement.memorySamples.map((sample) => sample.usedBytes)) / 1048576)} MiB`
    : 'unavailable in this Chromium build';
  const rows = cycles.map((cycle) => `| ${cycle.cycle} | ${cycle.heapBeforeGcBytes === null ? 'n/a' : `${(cycle.heapBeforeGcBytes / 1048576).toFixed(1)} MiB`} | ${cycle.heapAfterGcBytes === null ? 'n/a' : `${(cycle.heapAfterGcBytes / 1048576).toFixed(1)} MiB`} | ${cycle.heapDeltaBytes === null ? 'n/a' : `${(cycle.heapDeltaBytes / 1048576).toFixed(2)} MiB`} |`).join('\n');
  const profileScope = minimalProfile
    ? `This is a minimal ${wallLimitSeconds}-second diagnostic sample, not the required full three-minute performance profile.`
    : `The match was allowed to end by its configured ${matchDurationSeconds}-second timer or ship destruction, with a ${wallLimitSeconds}-second wall-clock cap. If it did not complete, the remaining simulation time and incomplete status are reported instead of treating it as a full-match result.`;
  const markdown = `# Pirate Battle performance profile${minimalProfile ? ' (minimal diagnostic)' : ''}\n\n- Date: ${new Date().toISOString()}\n- Browser: Chromium ${system.browserVersion}\n- OS: ${system.platform} on ${system.hostname}\n- CPU: ${system.cpuModel} (${system.cpuLogicalCores} logical cores)\n- System memory: ${system.physicalMemoryGiB} GiB\n- Viewport: ${measurement.resolution}\n- Configuration: ${configuration.sessionTimeSeconds}-second session, ${configuration.enemySpawnIntervalSeconds}-second enemy interval, seed ${configuration.seed}\n- WebGL renderer: ${measurement.renderer ?? 'not exposed'}\n- Match end: ${measurement.endReason}\n- Match measured: ${measurement.elapsedSeconds.toFixed(1)} seconds${measurement.matchCompleted ? " (completed)" : ` (incomplete; capped at ${wallLimitSeconds} wall-clock seconds)`}\n- Average frame rate: ${measurement.averageFps?.toFixed(1) ?? 'n/a'} FPS\n- Average frame interval: ${measurement.averageFrameMs?.toFixed(2) ?? 'n/a'} ms\n- p95 frame interval: ${measurement.p95FrameMs?.toFixed(2) ?? 'n/a'} ms\n- Maximum observed entities/enemies: ${measurement.maxEntities}/${measurement.maxEnemies}\n- JavaScript heap during match: ${memoryRange}\n- Unhandled page errors: ${pageErrors.length}\n\n## Five start/play/exit cycles\n\n| Cycle | Heap before GC | Heap after GC | Change |\n| ---: | ---: | ---: | ---: |\n${rows}\n\n## Limits\n\nThis is a headless Chromium run on the host listed above, not a representative physical mobile device. The FPS numbers include Chromium's headless WebGL/rendering path. Memory uses the non-standard Chromium performance.memory JavaScript heap metric; it does not measure GPU allocations or all browser-process memory. ${profileScope}\n`;
  await writeFile(markdownPath, markdown);
  console.log(markdownPath);
  console.log(JSON.stringify({ elapsedSeconds: measurement.elapsedSeconds, averageFps: measurement.averageFps, p95FrameMs: measurement.p95FrameMs, maxEntities: measurement.maxEntities, pageErrors: pageErrors.length }));
  await context.close();
} finally {
  if (browser) await browser.close();
  preview.kill();
}
