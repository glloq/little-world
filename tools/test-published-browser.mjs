import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {compiledResources} from './verify-static-build.mjs';

const base = new URL(process.argv[2] ?? process.env.WORLD_URL ?? 'http://127.0.0.1:5173/little-world/');
assert.ok(base.pathname.endsWith('/'), 'La base doit se terminer par /');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const artifacts = process.env.ARTIFACTS_DIR ?? '/tmp/little-world-browser';
await mkdir(artifacts, {recursive: true});
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);});
  if (process.env.EXPECTED_REVISION) {
    const revision = await context.request.get(new URL('deployment.json', base).href, {headers: {'Cache-Control': 'no-cache'}});
    assert.ok(revision.ok(), `Révision publiée absente : HTTP ${revision.status()}`);
    assert.equal((await revision.json()).revision, process.env.EXPECTED_REVISION, 'Le site public sert une autre révision');
  }
  // Detect raw source publication before waiting for an interface that cannot start.
  for (const path of ['', 'studio/']) {
    const response = await context.request.get(new URL(path, base).href, {headers: {'Cache-Control': 'no-cache'}});
    assert.ok(response.ok(), `${path}: HTTP ${response.status()}`);
    for (const resource of compiledResources(await response.text(), path || 'jeu')) {
      const asset = await context.request.get(new URL(resource, base).href);
      assert.ok(asset.ok(), `${resource}: HTTP ${asset.status()}`);
      assert.match(asset.headers()['content-type'] ?? '', resource.endsWith('.js') ? /javascript/ : /text\/css/, `MIME invalide : ${resource}`);
    }
  }
  await page.goto(base.href);
  await page.waitForFunction(() => document.querySelector('#start')?.disabled === false);
  await page.locator('#start').click();
  await page.waitForFunction(() => /FPS : [1-9]\d*/.test(document.querySelector('#fps')?.textContent ?? ''));
  assert.ok(await page.locator('#viewport canvas').isVisible(), 'Scène du jeu invisible');
  await page.screenshot({path: `${artifacts}/published-game.png`});
  await page.goto(new URL('studio/', base).href);
  await page.getByText('Des idées aux petits mondes').waitFor();
  await page.getByLabel('Nom du projet').fill('Vérification de publication');
  await page.getByRole('button', {name: 'Créer le projet', exact: true}).click();
  await page.waitForFunction(() => {const c = document.querySelector('#workspace canvas'); return c && c.width > 100 && c.height > 100;});
  assert.ok(await page.locator('#workspace canvas').isVisible(), 'Carte du Studio invisible');
  await page.screenshot({path: `${artifacts}/published-studio.png`});
  assert.deepEqual(errors, [], 'Erreurs de chargement ou d’exécution');
  console.log('Publication vérifiée : JS/CSS compilés et servis avec le bon MIME ; jeu (île) animé et carte Studio visibles.');
} finally {
  await browser.close();
}
