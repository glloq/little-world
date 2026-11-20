import * as THREE from 'three';
import { addRadialFade, type RadialFade } from './render/radial-fade.ts';
import { insideWorld, terrainHeight, waterSurface } from './terrain.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ECOLOGY_SECTOR_SIZE,
  ecologyExcluded,
  generateEcologySector,
  type BiomeSampler,
  type CreatureSite,
  type PlantKind,
} from './biomes.ts';

interface ResidentSector {
  cx: number;
  cz: number;
  /** Per creature: habitat along its circular path, sampled once (doc 106, HITCH-8). */
  paths: CreaturePath[];
  root: THREE.Group;
  sites: CreatureSite[];
  creatures: THREE.InstancedMesh[];
  plantCount: number;
}
export interface EcologyStats {
  sectors: number;
  plants: number;
  creatures: number;
}

/** Habitat of a creature along its circle, sampled at PATH_SAMPLES phases when its sector is
 * built: per frame only the y-dependent rule is evaluated (no terrain/water/classification
 * query per creature per frame). Same rules as habitatAllows. */
const PATH_SAMPLES = 32;
interface CreaturePath { floor: Float32Array; surface: Float32Array; ok: Uint8Array }
function creatureRadius(site: CreatureSite) { return site.kind === 'bird' ? 6 : site.kind === 'fish' ? 1.2 : 1.8; }
function samplePath(site: CreatureSite): CreaturePath {
  const floor = new Float32Array(PATH_SAMPLES), surface = new Float32Array(PATH_SAMPLES), ok = new Uint8Array(PATH_SAMPLES), r = creatureRadius(site);
  for (let i = 0; i < PATH_SAMPLES; i++) {
    const a = (i / PATH_SAMPLES) * Math.PI * 2, x = site.x + Math.cos(a) * r, z = site.z + Math.sin(a) * r;
    if (!insideWorld(x, z)) continue;
    const f = terrainHeight(x, z), w = waterSurface(x, z);
    floor[i] = f; surface[i] = w === null ? NaN : w;
    ok[i] = site.kind === 'butterfly' ? ((w === null || w - f < 0.05) && !ecologyExcluded(x, z) ? 1 : 0) : 1;
  }
  return { floor, surface, ok };
}
const pathPoint = { x: 0, y: 0, z: 0 };
/** creaturePosition() with the sampled habitat. */
function pathPosition(site: CreatureSite, path: CreaturePath, time: number) {
  const phase = site.phase + time * (site.kind === 'bird' ? 0.35 : 0.75), r = creatureRadius(site);
  const x = site.x + Math.cos(phase) * r, y = site.y + Math.sin(phase * 1.7) * (site.kind === 'fish' ? 0.12 : 0.45), z = site.z + Math.sin(phase) * r;
  const turn = phase / (Math.PI * 2), i = ((Math.round((turn - Math.floor(turn)) * PATH_SAMPLES) % PATH_SAMPLES) + PATH_SAMPLES) % PATH_SAMPLES;
  const floor = path.floor[i], surface = path.surface[i], water = !Number.isNaN(surface);
  let allowed = path.ok[i] === 1;
  if (allowed && site.kind === 'fish') allowed = water && surface - floor > 0.6 && y > floor + 0.12 && y < surface - 0.12;
  else if (allowed && site.kind === 'bird') allowed = y > Math.max(floor, water ? surface : floor) + 2;
  if (allowed) { pathPoint.x = x; pathPoint.y = y; pathPoint.z = z; }
  else { pathPoint.x = site.x; pathPoint.y = site.y; pathPoint.z = site.z; }
  return pathPoint;
}
/** Plants and creatures are drawn within this radius of the focus (m), fading over the last
 * 16 m: a round, soft edge instead of 48 m square sectors appearing at once. Close to the area
 * of the former 3 × 3 sectors at full detail, the player's own sector at the lowest. */
export const ECOLOGY_RADII = [80, 80, 40] as const;
/** Original low-poly plants and grouped wildlife. Geometry/materials belong to this system, never to a sector. */
export function createEcology(
  parent: THREE.Group,
  seed: number,
  density: number,
  sampler?: BiomeSampler,
  cover?: (x: number, z: number) => number,
) {
  const root = new THREE.Group();
  root.name = 'Ecology';
  parent.add(root);
  const residents = new Map<string, ResidentSector>();
  const ownedGeometry: THREE.BufferGeometry[] = [];
  const ownedMaterials: THREE.Material[] = [];
  const fade: RadialFade = { center: { value: new THREE.Vector3() }, radius: { value: ECOLOGY_RADII[0] }, band: { value: 16 } };
  const material = (color: number) => {
    const result = new THREE.MeshLambertMaterial({
      color,
      side: THREE.DoubleSide,
    });
    addRadialFade(result, fade);
    ownedMaterials.push(result);
    return result;
  };
  const vertexMaterial = () => {
    const result = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    addRadialFade(result, fade);
    ownedMaterials.push(result);
    return result;
  };
  const geo = <T extends THREE.BufferGeometry>(value: T): T => {
    ownedGeometry.push(value);
    return value;
  };
  const specs: Record<
    PlantKind,
    { geometry: THREE.BufferGeometry; material: THREE.Material }
  > = {
    grass: {
      geometry: geo(
        new THREE.ConeGeometry(0.25, 0.65, 3).translate(0, 0.325, 0),
      ),
      material: material(0x9cb565),
    },
    // A flower stands on the ground: green stem + open cup (it used to be a beige ball hovering
    // 0.2–0.4 m above the grass, read as a floating pebble).
    flower: {
      geometry: geo(flowerGeometry()),
      material: vertexMaterial(),
    },
    fern: {
      geometry: geo(
        new THREE.ConeGeometry(0.55, 0.65, 5).translate(0, 0.325, 0),
      ),
      material: material(0x608b65),
    },
    mushroom: {
      geometry: geo(
        new THREE.SphereGeometry(
          0.28,
          5,
          3,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        ).translate(0, 0.24, 0),
      ),
      material: material(0xbf775a),
    },
    reed: {
      geometry: geo(
        new THREE.CylinderGeometry(0.04, 0.075, 1.7, 4).translate(0, 0.85, 0),
      ),
      material: material(0x9b9860),
    },
    kelp: {
      geometry: geo(
        new THREE.ConeGeometry(0.19, 0.75, 3).translate(0, 0.375, 0),
      ),
      material: material(0x557e6b),
    },
    lily: {
      geometry: geo(new THREE.CylinderGeometry(0.5, 0.5, 0.035, 7)),
      material: material(0x789766),
    },
  };
  const fishGeometry = geo(new THREE.IcosahedronGeometry(1, 0));
  const wingGeometry = geo(new THREE.BufferGeometry());
  wingGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0.2, -1, 0, -0.1, 0, 0.12, -0.1, 0, 0, 0.2, 0, 0.12, -0.1, 1, 0,
        -0.1,
      ],
      3,
    ),
  );
  wingGeometry.computeVertexNormals();
  const fishMaterial = material(0x92b5ad),
    birdMaterial = material(0xd9d5b5),
    butterflyMaterial = material(0xe2a66b);
  const dummy = new THREE.Object3D();
  const stats: EcologyStats = { sectors: 0, plants: 0, creatures: 0 };
  let retired = false;

  function build(cx: number, cz: number): ResidentSector {
    const source = generateEcologySector(seed, cx, cz, density, sampler, cover);
    const group = new THREE.Group();
    group.name = `Ecology ${source.id}`;
    for (const kind of Object.keys(specs) as PlantKind[]) {
      const items = source.plants.filter((item) => item.kind === kind);
      if (!items.length) continue;
      const spec = specs[kind];
      const mesh = new THREE.InstancedMesh(
        spec.geometry,
        spec.material,
        items.length,
      );
      mesh.name = `Instanced ${kind}`;
      items.forEach((item, i) => {
        dummy.position.set(item.x, item.y, item.z);
        dummy.rotation.set(0, item.phase, 0);
        dummy.scale.setScalar(item.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    const creatures: THREE.InstancedMesh[] = [];
    for (const kind of ['fish', 'bird', 'butterfly'] as const) {
      const count = source.creatures.filter(
        (site) => site.kind === kind,
      ).length;
      if (!count) continue;
      const mesh = new THREE.InstancedMesh(
        kind === 'fish' ? fishGeometry : wingGeometry,
        kind === 'fish'
          ? fishMaterial
          : kind === 'bird'
            ? birdMaterial
            : butterflyMaterial,
        count,
      );
      mesh.name = kind;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Motion stays within a fixed sector envelope; a conservative fixed bound avoids per-frame bounds scans.
      const heights = source.creatures
        .filter((site) => site.kind === kind)
        .map((site) => site.y);
      const low = Math.min(...heights),
        high = Math.max(...heights);
      mesh.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(
          (cx + 0.5) * ECOLOGY_SECTOR_SIZE,
          (low + high) / 2,
          (cz + 0.5) * ECOLOGY_SECTOR_SIZE,
        ),
        Math.hypot(ECOLOGY_SECTOR_SIZE / Math.SQRT2 + 7, (high - low) / 2 + 1),
      );
      group.add(mesh);
      creatures.push(mesh);
    }
    root.add(group);
    return {
      cx,
      cz,
      paths: source.creatures.map(samplePath),
      root: group,
      sites: source.creatures,
      creatures,
      plantCount: source.plants.length,
    };
  }
  function remove(sector: ResidentSector) {
    sector.root.traverse((node) => {
      if (node instanceof THREE.InstancedMesh) node.dispose();
    });
    sector.root.removeFromParent();
  }
  function recount() {
    stats.sectors = residents.size;
    stats.plants = 0;
    stats.creatures = 0;
    for (const item of residents.values())
      if (item.root.visible) {
        stats.plants += item.plantCount;
        stats.creatures += item.sites.length;
      }
  }
  let detail = 0;
  let waterSurfaceAt: ((x: number, z: number) => number | null) | null = null;
  return {
    stats,
    /** Surf swells (presentation height at the current tick): fish stay under the troughs. */
    setWaterSurface(sampler: ((x: number, z: number) => number | null) | null) {
      waterSurfaceAt = sampler;
    },
    setDetail(level: number) {
      detail = level;
    },
    update(_dt: number, time: number, x: number, z: number) {
      if (retired) return;
      const radius = ECOLOGY_RADII[Math.min(2, Math.max(0, detail))], size = ECOLOGY_SECTOR_SIZE;
      fade.center.value.set(x, 0, z); fade.radius.value = radius;
      const near = (sx: number, sz: number) => Math.hypot(Math.max(sx * size - x, 0, x - (sx + 1) * size), Math.max(sz * size - z, 0, z - (sz + 1) * size));
      const cx = Math.floor(x / size), cz = Math.floor(z / size), reach = Math.ceil(radius / size);
      // One new sector per frame, nearest first (the player's own sector, then its ring).
      let best: [number, number] | null = null, bestD = Infinity;
      for (let dz = -reach; dz <= reach; dz++)
        for (let dx = -reach; dx <= reach; dx++) {
          const d = near(cx + dx, cz + dz);
          if (d <= radius && d < bestD && !residents.has(`${cx + dx}:${cz + dz}`)) { bestD = d; best = [cx + dx, cz + dz]; }
        }
      if (best) residents.set(`${best[0]}:${best[1]}`, build(best[0], best[1]));
      for (const [key, sector] of residents) {
        const distance = near(sector.cx, sector.cz);
        if (distance > radius + 16) {
          remove(sector);
          residents.delete(key);
          continue;
        }
        sector.root.visible = distance <= radius;
        if (!sector.root.visible) continue;
        for (const mesh of sector.creatures) {
          let index = 0;
          for (let s = 0; s < sector.sites.length; s++) {
            const site = sector.sites[s];
            if (site.kind !== mesh.name) continue;
            const p = pathPosition(site, sector.paths[s], time);
            let hidden = false;
            if (site.kind === 'fish' && waterSurfaceAt) {
              const under = fishUnderSurface(p.y, site.y, waterSurfaceAt(p.x, p.z));
              p.y = under.y; hidden = under.hidden;
            }
            dummy.position.set(p.x, p.y, p.z);
            dummy.rotation.set(
              0,
              -(site.phase + time * (site.kind === 'bird' ? 0.35 : 0.75)),
              site.kind === 'fish' ? 0 : Math.sin(time * 8 + site.phase) * 0.2,
            );
            if (site.kind === 'fish') {
              if (hidden) dummy.scale.set(0, 0, 0);
              else dummy.scale.set(0.32, 0.12, 0.65);
            }
            else if (site.kind === 'bird')
              dummy.scale.set(
                0.9,
                0.7 + Math.sin(time * 5 + site.phase) * 0.25,
                0.7,
              );
            else
              dummy.scale.set(
                0.22,
                0.3 + Math.sin(time * 13 + site.phase) * 0.25,
                0.22,
              );
            dummy.updateMatrix();
            mesh.setMatrixAt(index++, dummy.matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
      recount();
    },
    refresh(x: number, z: number, radius: number) {
      // Rebuild only intersecting sectors after an authored terrain/biome change.
      for (const [key, sector] of residents) {
        const { cx, cz } = sector;
        const dx = Math.max(
          cx * ECOLOGY_SECTOR_SIZE - x,
          0,
          x - (cx + 1) * ECOLOGY_SECTOR_SIZE,
        );
        const dz = Math.max(
          cz * ECOLOGY_SECTOR_SIZE - z,
          0,
          z - (cz + 1) * ECOLOGY_SECTOR_SIZE,
        );
        if (Math.hypot(dx, dz) <= radius) {
          remove(sector);
          residents.delete(key);
        }
      }
      recount();
    },
    dispose() {
      if (retired) return;
      retired = true;
      for (const sector of residents.values()) remove(sector);
      residents.clear();
      root.removeFromParent();
      for (const geometry of ownedGeometry) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      stats.sectors = stats.plants = stats.creatures = 0;
    },
  };
}

/** Low-poly flower (≈ 18 triangles): thin green stem and a 5-petal cup opening upwards. */
function flowerGeometry(): THREE.BufferGeometry {
  const part = (g: THREE.BufferGeometry, hex: number) => {
    const p = g.index ? g.toNonIndexed() : g, c = new THREE.Color(hex), n = p.getAttribute('position').count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    for (const name of Object.keys(p.attributes)) if (name !== 'position') p.deleteAttribute(name);
    p.setAttribute('color', new THREE.BufferAttribute(col, 3)); return p;
  };
  const stem = part(new THREE.CylinderGeometry(0.018, 0.028, 0.34, 3, 1, true).translate(0, 0.17, 0), 0x5e8f3e);
  const cup = part(new THREE.ConeGeometry(0.16, 0.14, 5, 1, true).rotateX(Math.PI).translate(0, 0.39, 0), 0xf0c24a);
  const heart = part(new THREE.IcosahedronGeometry(0.045, 0).translate(0, 0.36, 0), 0xd9773f);
  const merged = mergeGeometries([stem, cup, heart], false)!;
  merged.computeVertexNormals();
  return merged;
}

/** A surf trough can drop below a fish's static depth: the fish swims under the moving surface,
 * and hides where it would have to dive far below its habitat (never a fish in the air). */
export function fishUnderSurface(y: number, siteY: number, surface: number | null): { y: number; hidden: boolean } {
  if (surface === null || y <= surface - 0.35) return { y, hidden: false };
  const lowered = surface - 0.35;
  return { y: lowered, hidden: lowered < siteY - 2.5 };
}
