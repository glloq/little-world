#!/usr/bin/env node
/** Compile a validated source into static data served unchanged by GitHub Pages. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseWorld, resolveConfig } from '../src/world-data.ts';
import { planChunks } from '../src/chunks.ts';
export async function compileMap(input, output) {
  const raw = await readFile(input, 'utf8');
  if (Buffer.byteLength(raw) > 2_000_000) throw Error('Map exceeds 2MB');
  const map = parseWorld(JSON.parse(raw)),
    config = resolveConfig(map.config);
  // Manifest describes stable sector bounds; meshes remain generated lazily by the client.
  const chunks = new Map();
  for (
    let z = -config.length / 2;
    z <= config.length / 2;
    z += config.chunkSize
  )
    for (
      let x = -config.width / 2;
      x <= config.width / 2;
      x += config.chunkSize
    )
      for (const chunk of planChunks(config, x, z))
        chunks.set(chunk.id, {
          id: chunk.id,
          minX: chunk.minX,
          maxX: chunk.maxX,
          minZ: chunk.minZ,
          maxZ: chunk.maxZ,
        });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(map, null, 2) + '\n');
  await writeFile(
    output.replace(/\.json$/, '.chunks.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        generatorVersion: config.generatorVersion,
        chunks: [...chunks.values()],
      },
      null,
      2,
    ) + '\n',
  );
  return {
    objects: map.placements.length,
    npcs: map.npcs.length,
    chunks: chunks.size,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error(
      'Usage: node --experimental-strip-types tools/compile-map.mjs source.json public/maps/default.json',
    );
    process.exitCode = 1;
  } else
    try {
      console.log(await compileMap(input, output));
    } catch (e) {
      console.error(e.message);
      process.exitCode = 1;
    }
}
