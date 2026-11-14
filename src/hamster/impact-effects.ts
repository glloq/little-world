/** Impact chips (doc 43): a pooled InstancedMesh of small flat-shaded shards thrown at a tool
 * impact (wood, stone, soil, water). One draw call, fixed capacity, no allocation per frame, no
 * physics engine: ballistic motion for ~0.6 s. Purely visual. */
import * as THREE from 'three';

export const IMPACT_COLORS = { wood: 0x9a6b3c, stone: 0x9a968c, soil: 0x7a5a3a, crystal: 0x8fd6e8, iron: 0xa26a4a, water: 0xcfe8f2, leaf: 0x6f9a4a } as const;
export type ImpactKind = keyof typeof IMPACT_COLORS;
export function createImpactEffects(parent: THREE.Object3D, capacity = 48) {
  const mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.07, 0), new THREE.MeshLambertMaterial({ flatShading: true }), capacity);
  mesh.name = 'ImpactChips'; mesh.frustumCulled = false; mesh.count = 0; parent.add(mesh);
  const life = new Float32Array(capacity), pos = new Float32Array(capacity * 3), vel = new Float32Array(capacity * 3), m = new THREE.Matrix4(), c = new THREE.Color();
  let next = 0, active = 0;
  return {
    spawn(at: { x: number; y: number; z: number }, kind: ImpactKind, count = 7) {
      c.setHex(IMPACT_COLORS[kind]);
      for (let n = 0; n < count; n++) {
        const i = next; next = (next + 1) % capacity; const a = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 1.8;
        life[i] = .45 + Math.random() * .25; pos.set([at.x, at.y, at.z], i * 3); vel.set([Math.cos(a) * s, 2 + Math.random() * 2.5, Math.sin(a) * s], i * 3);
        mesh.setColorAt(i, c);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; active = capacity;
    },
    update(dt: number) {
      if (!active) return; let alive = 0;
      for (let i = 0; i < capacity; i++) {
        if (life[i] <= 0) { m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m); continue; }
        life[i] -= dt; vel[i * 3 + 1] -= 12 * dt; for (let k = 0; k < 3; k++) pos[i * 3 + k] += vel[i * 3 + k] * dt;
        const s = Math.max(0, Math.min(1, life[i] * 3)); m.makeScale(s, s, s).setPosition(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); mesh.setMatrixAt(i, m); alive++;
      }
      mesh.count = capacity; mesh.instanceMatrix.needsUpdate = true; if (!alive) { active = 0; mesh.count = 0; }
    },
    get alive() { let n = 0; for (let i = 0; i < capacity; i++) if (life[i] > 0) n++; return n; },
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); },
  };
}
