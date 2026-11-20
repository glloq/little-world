import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
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
  for (const page of ['index.html', 'studio/index.html']) {
    const html = await readFile(resolve(root, page), 'utf8');
    for (const url of compiledResources(html, page)) {
      const file = resolve(root, url.slice('/little-world/'.length));
      assert.ok(file.startsWith(root + sep), 'Ressource hors du build');
      assert.ok((await stat(file)).isFile(), `Ressource absente : ${url}`);
    }
  }
  for (const asset of ['models/pine.glb', 'models/rock.glb', 'models/crate.glb', 'maps/island/manifest.json', 'maps/island.project.json']) {
    assert.ok((await stat(resolve(root, asset))).isFile(), `Ressource absente : ${asset}`);
  }

  // Keep the published map allowlist intact: the second island lives in /archipelago.
  const catalog=JSON.parse(await readFile(resolve(root,'archipelago/catalog.json'),'utf8'));
  assert.equal(catalog.schemaVersion,1,'Version du registre invalide');
  assert.equal(catalog.islands.length,3,'Trois îles jouables attendues');
  const manifest=JSON.parse(await readFile(resolve(root,'archipelago/worlds/forest-valley/manifest.json'),'utf8'));
  assert.equal(manifest.worldId,'little-world-production-reference','Mauvaise île d’exemple');
  const forest=JSON.parse(await readFile(resolve(root,'archipelago/worlds/forest-valley/project.json'),'utf8'));
  assert.equal(forest.manifest.worldId,manifest.worldId,'La source Studio pointe vers une autre île');
  assert.ok(forest.libraries.objectives['forest:lost-journal'],'Quête du carnet absente de la source Studio');
  assert.deepEqual((await readdir(resolve(root,'archipelago/worlds/forest-valley/chunks'))).sort(),
    manifest.chunks.map(chunk=>chunk.url.slice('chunks/'.length)).sort(),'Fichiers de secteurs hors manifeste');
  for(const chunk of manifest.chunks)assert.ok((await stat(resolve(root,'archipelago/worlds/forest-valley',chunk.url))).isFile(),'Secteur absent : '+chunk.url);
  assert.ok((await stat(resolve(root,'archipelago/worlds/forest-valley',manifest.logic.url))).isFile(),'Logique de l’île absente');
  const surf=JSON.parse(await readFile(resolve(root,'archipelago/worlds/surf-island/manifest.json'),'utf8'));
  assert.equal(surf.worldId,'little-world-surf-island','Identité de l’île Surf invalide');
  assert.equal(surf.kind,'compiled-world');
  const surfProject=JSON.parse(await readFile(resolve(root,'archipelago/worlds/surf-island/project.json'),'utf8'));
  assert.equal(surfProject.manifest.worldId,surf.worldId);
  assert.ok(surfProject.libraries.settlements['composition-welcome-village'].buildings.length>=4);
  assert.equal(Object.keys(surfProject.libraries.races).length,3);
  assert.ok(surf.chunks.length>0,'Île Surf sans secteur');
  for(const chunk of surf.chunks)
    assert.ok((await stat(resolve(root,'archipelago/worlds/surf-island',chunk.url))).isFile(),
      'Secteur Surf absent : '+chunk.url);
  assert.ok((await stat(resolve(root,'archipelago/worlds/surf-island',surf.logic.url))).isFile(),
    'Logique Surf absente');
  const layout=JSON.parse(await readFile(resolve(root,'archipelago/worlds/surf-island/surf-layout.json'),'utf8'));
  assert.equal(layout.beaches.length,3,'Trois plages Surf manquantes');
  assert.ok(layout.port?.boat,'Port Surf physique absent');
  // Never accidentally deploy the regression fixtures to GitHub Pages.
  assert.deepEqual((await readdir(resolve(root,'maps'))).sort(),['island','island.project.json']);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  await verifyStaticBuild(process.argv[2]);
  console.log('Build statique validé : jeu et Studio utilisent les JS/CSS compilés.');
}
