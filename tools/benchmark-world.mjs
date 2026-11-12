#!/usr/bin/env node
/** Real browser frame-interval benchmark. Run a development server first.
 * NODE_PATH is deliberately unnecessary: set PLAYWRIGHT_MODULE to an installed
 * playwright ESM entry if it is not installed alongside this repository.
 * Example: node tools/benchmark-world.mjs http://127.0.0.1:5173/little-world/ /tmp/world-bench
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
let playwright;
try {
  playwright = await import('playwright');
} catch {
  playwright = await import(
    pathToFileURL(
      process.env.PLAYWRIGHT_MODULE ??
        '/workspace/.little-world-tools/node_modules/playwright/index.mjs',
    ).href
  );
}
const { chromium } = playwright;
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:5173/little-world/');
const output = resolve(
  process.argv[3] ?? '../little-world-artifacts/benchmark',
);
const sampleFrames = Number(process.env.BENCHMARK_FRAMES ?? 90);
if (!Number.isInteger(sampleFrames) || sampleFrames < 20)
  throw Error('BENCHMARK_FRAMES must be an integer of at least 20');
async function fingerprint() {
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  const hash = createHash('sha256');
  for (const path of paths.sort()) {
    try {
      hash.update(path);
      hash.update(await readFile(path));
    } catch {
      hash.update(`missing:${path}`);
    }
  }
  return hash.digest('hex');
}
await mkdir(output, { recursive: true });
const launchArgs = [
  '--no-sandbox',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  headless: true,
  args: launchArgs,
});
const run = {
  recordedAt: new Date().toISOString(),
  base: base.href,
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  dirtyFiles: execFileSync('git', ['status', '--short'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean),
  browserVersion: browser.version(),
  viewport: { width: 960, height: 640 },
  deviceScaleFactor: 1,
  launchArgs,
  sampleFrames,
  workingTreeBefore: await fingerprint(),
  notes: [
    'Chromium headless uses software SwiftShader: these measurements are not representative of a hardware GPU.',
    'FPS is computed from uncapped browser requestAnimationFrame intervals, not from the game HUD.',
    'Frame intervals include scheduling and rendering; they do not isolate CPU work or GPU execution time.',
    'The large-map scenarios extend synthetic terrain with the same demo content, not a fully populated square-kilometer ecosystem.',
    'Snapshots represent the current working tree shown by dirtyFiles, not necessarily the recorded HEAD alone.',
    'Screenshots and metrics are gathered after the terrain generation queue drains; no state mutation or rendering hooks are used.',
  ],
  scenarios: [],
};
try {
  for (const scenario of [
    { name: 'valley-start', width: 200, length: 600 },
    { name: 'valley-port', width: 200, length: 600, port: true },
    { name: 'terrain-1km', width: 1000, length: 1000 },
    { name: 'terrain-2km', width: 2000, length: 2000 },
  ].filter(
    (s) =>
      !process.env.BENCHMARK_SCENARIOS ||
      process.env.BENCHMARK_SCENARIOS.split(',').includes(s.name),
  )) {
    const context = await browser.newContext({
      viewport: run.viewport,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`);
    });
    const begin = performance.now();
    // Use the editor's actual sessionStorage preview contract. Dynamic imports
    // deliberately require the documented Vite development server.
    await page.goto(base.href, { waitUntil: 'networkidle' });
    await page.evaluate(
      async ({ baseHref, width, length }) => {
        const module = await import(
          new URL('src/world-data.ts', baseHref).href
        );
        const world = module.defaultWorld();
        world.config.width = width;
        world.config.length = length;
        sessionStorage.setItem('little-world-preview', JSON.stringify(world));
        localStorage.setItem('little-world-quality', 'medium');
      },
      { baseHref: base.href, ...scenario },
    );
    const url = new URL(base);
    url.searchParams.set('preview', '1');
    url.searchParams.set('metrics', '1');
    await page.goto(url.href, { waitUntil: 'networkidle' });
    await page.locator('#start').click();
    if (scenario.port) await page.keyboard.press('p');
    await page.waitForFunction(
      () => window.littleWorldMetrics?.chunks.pending === 0,
      {},
      { timeout: 30000 },
    );
    await page.waitForTimeout(1200);
    const readyMs = performance.now() - begin;
    const scenarioFingerprint = await fingerprint();
    const sampled = await page.evaluate(
      (targetSamples) =>
        new Promise((resolve) => {
          const intervals = [],
            metricSamples = [];
          let start, last;
          function frame(now) {
            if (start === undefined) {
              start = now;
              last = now;
              requestAnimationFrame(frame);
              return;
            }
            intervals.push(now - last);
            last = now;
            if (window.littleWorldMetrics)
              metricSamples.push(structuredClone(window.littleWorldMetrics));
            if (intervals.length < targetSamples) {
              requestAnimationFrame(frame);
              return;
            }
            const sorted = [...intervals].sort((a, b) => a - b);
            const mean =
              intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const numericMean = (key) =>
              metricSamples.reduce((a, b) => a + b[key], 0) /
              metricSamples.length;
            const gl = document.querySelector('canvas')?.getContext('webgl2');
            const debug = gl?.getExtension('WEBGL_debug_renderer_info');
            resolve({
              sampleCount: intervals.length,
              actualDurationMs: now - start,
              frameIntervalMeanMs: mean,
              frameIntervalMedianMs: sorted[Math.floor(sorted.length * 0.5)],
              frameIntervalP95Ms: sorted[Math.floor(sorted.length * 0.95)],
              fps: 1000 / mean,
              drawCallsMean: numericMean('calls'),
              trianglesMean: numericMean('triangles'),
              lastMetrics: metricSamples.at(-1),
              gpu: debug
                ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
                : 'unavailable',
              heap: performance.memory
                ? {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                  }
                : null,
              transferredBytes: performance
                .getEntriesByType('resource')
                .reduce((sum, r) => sum + r.transferSize, 0),
              encodedResourceBytes: performance
                .getEntriesByType('resource')
                .reduce((sum, r) => sum + r.encodedBodySize, 0),
              rawFrameIntervalsMs: intervals,
            });
          }
          requestAnimationFrame(frame);
        }),
      sampleFrames,
    );
    await page.screenshot({ path: resolve(output, `${scenario.name}.png`) });
    const afterFingerprint = await fingerprint();
    const result = {
      ...scenario,
      readyMs,
      workingTreeBefore: scenarioFingerprint,
      workingTreeAfter: afterFingerprint,
      sourceChangedDuringSampling: scenarioFingerprint !== afterFingerprint,
      ...sampled,
      errors,
    };
    run.scenarios.push(result);
    console.log(
      JSON.stringify({
        ...scenario,
        fps: sampled.fps,
        frameIntervalMeanMs: sampled.frameIntervalMeanMs,
        drawCallsMean: sampled.drawCallsMean,
        trianglesMean: sampled.trianglesMean,
        chunks: sampled.lastMetrics?.chunks,
        errors,
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
  run.workingTreeAfter = await fingerprint();
  run.sourceChangedDuringRun = run.workingTreeBefore !== run.workingTreeAfter;
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(run, null, 2) + '\n',
  );
}
if (run.scenarios.some((s) => s.errors.length)) process.exitCode = 1;
console.log(`Results: ${resolve(output, 'results.json')}`);
