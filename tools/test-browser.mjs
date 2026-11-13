import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const base = process.env.WORLD_URL ?? 'http://127.0.0.1:5173/little-world/';
const artifacts = process.env.ARTIFACTS_DIR ?? '/tmp/little-world-browser';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  headless: true,
  args: [
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const errors = [];
let checks = 0;
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  page.on('dialog', (d) => d.accept());
  await page.goto(base + 'editor/');
  await page.waitForFunction(() =>
    document.querySelector('#editor-message').textContent.startsWith('Prêt'),
  );
  const map = JSON.parse(
    await readFile(new URL('../maps/default.json', import.meta.url), 'utf8'),
  );
  map.placements = [
    {
      id: 'smoke-crate',
      assetId: 'props.crate',
      x: -20,
      z: -130,
      rotation: 0,
      scale: 1,
    },
  ];
  // A talking NPC near the actual spawn makes the interaction reproducible via normal E input.
  map.npcs[0].x = -23;
  map.npcs[0].z = -182;
  map.npcs[0].behavior = 'idle';
  await page.locator('#import-file').setInputFiles({
    name: 'map.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(map)),
  });
  await page.waitForFunction(
    () =>
      document.querySelector('#editor-message').textContent ===
      'Carte importée',
  );
  checks++;
  await page.locator('#object-list').selectOption('npc:' + map.npcs[0].id);
  await page
    .getByLabel('Texte du PNJ', { exact: true })
    .fill('Bienvenue dans notre vallée !');
  await page.getByLabel('Texte du PNJ', { exact: true }).press('Tab');
  await page.getByRole('button', { name: '+ Réplique', exact: true }).click();
  checks++;
  await page.locator('#npc-speed').fill('9');
  await page.locator('#npc-apply').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#editor-message')
      .textContent.includes('PNJ ou dialogues invalides'),
  );
  await page.locator('#object-list').selectOption('smoke-crate');
  await page.locator('#object-scale').fill('1.5');
  await page.locator('#object-scale').press('Tab');
  await page.locator('#object-x').fill('5000');
  await page.locator('#object-x').press('Tab');
  await page.waitForFunction(() =>
    document
      .querySelector('#editor-message')
      .textContent.includes('Objets invalides'),
  );
  await page.locator('#object-list').selectOption('smoke-crate');
  assert.equal(await page.locator('#object-x').inputValue(), '-20');
  checks++;
  await page.locator('#duplicate-object').click();
  assert.equal(await page.locator('#object-list option').count(), 7);
  checks++;
  await page.locator('#undo').click();
  assert.equal(await page.locator('#object-list option').count(), 6);
  await page.locator('#redo').click();
  assert.equal(await page.locator('#object-list option').count(), 7);
  checks++;
  await page.getByText('Affichage', { exact: true }).click();
  await page.locator('#top-view').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-tool="raise"]').click();
  const viewport = await page.locator('#editor-viewport').boundingBox();
  await page.mouse.click(
    viewport.x + viewport.width * 0.45,
    viewport.y + viewport.height * 0.45,
  );
  await page.waitForFunction(() =>
    /1 retouches/.test(document.querySelector('#object-count').textContent),
  );
  checks++;
  await page.locator('[data-tool="biome"]').click();
  await page.locator('#biome').selectOption('meadow');
  await page.mouse.click(
    viewport.x + viewport.width * 0.55,
    viewport.y + viewport.height * 0.5,
  );
  await page.locator('[data-tool="path"]').click();
  await page.mouse.click(
    viewport.x + viewport.width * 0.4,
    viewport.y + viewport.height * 0.5,
  );
  await page.mouse.click(
    viewport.x + viewport.width * 0.6,
    viewport.y + viewport.height * 0.5,
  );
  await page.locator('#finish-line').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#editor-message').textContent ===
      'Tracé appliqué',
  );
  checks++;
  await page.locator('#save').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#editor-message')
      .textContent.includes('enregistré dans IndexedDB'),
  );
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadPromise;
  await download.saveAs(artifacts + '/export.json');
  const exported = JSON.parse(
    await readFile(artifacts + '/export.json', 'utf8'),
  );
  assert.equal(
    exported.npcs[0].dialogue.lines[0].text,
    'Bienvenue dans notre vallée !',
  );
  assert.equal(exported.npcs[0].dialogue.lines.length, 4);
  assert.equal(exported.placements.length, 2);
  assert.equal(exported.placements[0].scale, 1.5);
  assert.equal(exported.terrain.length, 1);
  assert.equal(exported.biomes.length, 1);
  assert.equal(exported.paths.length, 1);
  checks++;
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector('#editor-message').textContent.startsWith('Prêt'),
  );
  assert.match(await page.locator('#object-count').textContent(), /2 objets/);
  checks++;
  await page.screenshot({ path: artifacts + '/editor.png' });
  await page.locator('#play-preview').click();
  await page.waitForURL('**/?preview=1');
  await page.locator('#start').click();
  await page.waitForFunction(() =>
    document.querySelector('#fps').textContent.match(/FPS : \d+/),
  );
  checks++;
  await page.keyboard.press('e');
  await page.locator('.npc-dialogue:not([hidden])').waitFor();
  await page
    .locator('.npc-dialogue:not([hidden]) > div button')
    .first()
    .click();
  // Escape closes a dialogue that is still open; with no dialogue it would open the game Menu.
  if (await page.locator('.npc-dialogue:not([hidden])').count()) {
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ui-panel:not([hidden])').count(), 0, 'Escape closing a dialogue does not also open the Menu');
  }
  checks++;
  await page.keyboard.down('a');
  await page.locator('#appearance-menu[aria-hidden="false"]').waitFor();
  await page.locator('[data-emotion="curious"]').click();
  await page.keyboard.up('a');
  await page
    .locator('#appearance-menu[aria-hidden="true"]')
    .waitFor({ state: 'hidden' });
  checks++;
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  await page.keyboard.press('Space');
  await page.waitForTimeout(180);
  await page.keyboard.press('Space');
  await page.waitForFunction(
    () => document.querySelector('#status').textContent === 'En planage',
  );
  checks++;
  await page.keyboard.press('p');
  await page.waitForTimeout(500);
  await page.keyboard.press('e');
  await page.waitForFunction(
    () =>
      document.querySelector('#status').textContent === 'Navigation en bateau',
  );
  await page.keyboard.down('w');
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('#coords').textContent.match(/Z ([\d.-]+)/)?.[1],
      ) > 242,
  );
  await page.keyboard.up('w');
  await page.keyboard.press('e');
  await page.waitForFunction(
    () => document.querySelector('#status').textContent === 'Nage',
  );
  await page.keyboard.down('Control');
  await page.waitForFunction(
    () => document.querySelector('#status').textContent === 'Plongée',
  );
  await page.keyboard.up('Control');
  await page.keyboard.down('Space');
  await page.waitForFunction(
    () => document.querySelector('#status').textContent === 'Nage',
  );
  await page.keyboard.up('Space');
  checks++;
  await page.screenshot({ path: artifacts + '/game.png' });
  await page.goto(base + 'editor/');
  await page.waitForFunction(() =>
    document.querySelector('#editor-message').textContent.startsWith('Prêt'),
  );
  assert.match(await page.locator('#object-count').textContent(), /2 objets/);
  checks++;
  const bad = structuredClone(exported);
  bad.placements = [null];
  await page.locator('#import-file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('#editor-message')
      .textContent.startsWith('Import refusé'),
  );
  assert.match(await page.locator('#object-count').textContent(), /2 objets/);
  checks++;
  assert.deepEqual(errors, []);
  await writeFile(
    artifacts + '/result.json',
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    `Browser: ${checks} checks passed; no JS/HTTP errors. Artifacts: ${artifacts}`,
  );
} catch (e) {
  console.error(
    'At check',
    checks,
    errors,
    await page
      ?.locator('#editor-message')
      .textContent({ timeout: 1000 })
      .catch(() => ''),
  );
  await page?.screenshot({ path: artifacts + '/failure.png' }).catch(() => {});
  throw e;
} finally {
  await browser.close();
}
