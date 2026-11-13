import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {resolve, sep} from 'node:path';

// Reject publishing the source tree even when every HTML page exists.
export function compiledResources(html, page = 'index.html') {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
  const styles = [...html.matchAll(/<link\b[^>]*>/gi)]
    .filter(m => /\brel=["']stylesheet["']/i.test(m[0]))
    .map(m => /\bhref=["']([^"']+)["']/i.exec(m[0])?.[1]);
  assert.ok(scripts.length && styles.length, `${page} : JS/CSS compilés absents. Publier dist/ via GitHub Actions, pas les sources.`);
  assert.ok(scripts.every(p => /^\/little-world\/assets\/[^?#]+\.js$/.test(p)), `${page} : script non compilé. Ne pas publier les fichiers TypeScript du dépôt.`);
  assert.ok(styles.every(p => /^\/little-world\/assets\/[^?#]+\.css$/.test(p)), `${page} : feuille de style hors du build.`);
  return [...scripts, ...styles];
}

export async function verifyStaticBuild(directory = 'dist') {
  const root = resolve(directory);
  for (const page of ['index.html', 'studio/index.html', 'editor/index.html']) {
    const html = await readFile(resolve(root, page), 'utf8');
    for (const url of compiledResources(html, page)) {
      const file = resolve(root, url.slice('/little-world/'.length));
      assert.ok(file.startsWith(root + sep), 'Ressource hors du build');
      assert.ok((await stat(file)).isFile(), `Ressource absente : ${url}`);
    }
  }
  for (const asset of ['models/pine.glb', 'models/rock.glb', 'models/crate.glb', 'maps/default.json']) {
    assert.ok((await stat(resolve(root, asset))).isFile(), `Ressource absente : ${asset}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  await verifyStaticBuild(process.argv[2]);
  console.log('Build statique validé : jeu, Studio et éditeur utilisent les JS/CSS compilés.');
}
