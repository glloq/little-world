import * as THREE from 'three';
import {
  creaturePosition,
  ECOLOGY_SECTOR_SIZE,
  generateEcologySector,
  type BiomeSampler,
  type CreatureSite,
  type PlantKind,
} from './biomes.ts';

interface ResidentSector {
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

/** Original low-poly plants and grouped wildlife. Geometry/materials belong to this system, never to a sector. */
export function createEcology(
  parent: THREE.Group,
  seed: number,
  density: number,
  sampler?: BiomeSampler,
) {
  const root = new THREE.Group();
  root.name = 'Ecology';
  parent.add(root);
  const residents = new Map<string, ResidentSector>();
  const ownedGeometry: THREE.BufferGeometry[] = [];
  const ownedMaterials: THREE.Material[] = [];
  const material = (color: number) => {
    const result = new THREE.MeshLambertMaterial({
      color,
      side: THREE.DoubleSide,
    });
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
    flower: {
      geometry: geo(
        new THREE.IcosahedronGeometry(0.24, 0).translate(0, 0.5, 0),
      ),
      material: material(0xe6bf83),
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
    const source = generateEcologySector(seed, cx, cz, density, sampler);
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
  return {
    stats,
    setDetail(level: number) {
      detail = level;
    },
    update(_dt: number, time: number, x: number, z: number) {
      if (retired) return;
      const cx = Math.floor(x / ECOLOGY_SECTOR_SIZE),
        cz = Math.floor(z / ECOLOGY_SECTOR_SIZE);
      let created = false;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const key = `${cx + dx}:${cz + dz}`;
          if (!residents.has(key) && !created) {
            residents.set(key, build(cx + dx, cz + dz));
            created = true;
          }
        }
      for (const [key, sector] of residents) {
        const [sx, sz] = key.split(':').map(Number),
          distance = Math.max(Math.abs(sx - cx), Math.abs(sz - cz));
        if (distance > 2) {
          remove(sector);
          residents.delete(key);
          continue;
        }
        sector.root.visible = distance <= (detail >= 2 ? 0 : 1);
        if (!sector.root.visible) continue;
        for (const mesh of sector.creatures) {
          let index = 0;
          for (const site of sector.sites) {
            if (site.kind !== mesh.name) continue;
            const p = creaturePosition(site, time);
            dummy.position.set(p.x, p.y, p.z);
            dummy.rotation.set(
              0,
              -(site.phase + time * (site.kind === 'bird' ? 0.35 : 0.75)),
              site.kind === 'fish' ? 0 : Math.sin(time * 8 + site.phase) * 0.2,
            );
            if (site.kind === 'fish') dummy.scale.set(0.32, 0.12, 0.65);
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
        const [cx, cz] = key.split(':').map(Number);
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
