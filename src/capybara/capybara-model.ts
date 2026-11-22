/** Original Little World capybara V6.3.
 * One continuous OBJ mesh (802 vertices / 1600 triangles) + shader walk deformation.
 * Opt-in asset: no island spawning, player controls, or autonomous update loop.
 * Model axes: +X forward, +Y up, Z lateral. Ground approximately Y=0.
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { advanceCapybaraGait, makeCapybaraGait, type CapybaraGait } from './capybara-gait.ts';

export const CAPYBARA_ASSET_ID = 'animal.capybara.v6-3';
export const CAPYBARA_TRIANGLES = 1600;
export const CAPYBARA_BOUNDS = { length: 3.57, width: 1.26, height: 1.82 } as const;
export const CAPYBARA_COLLIDER = { shape: 'capsule' as const, radius: 0.51, length: 2.40, centreY: 0.98 };
export const CAPYBARA_SOCKETS = {
  /** Visual passenger position; real mounting and riding rules remain to implement. */
  rider: [-0.48, 1.73, 0] as const,
  /** Cart tow pivot; no cart physics implemented in this module. */
  hitch: [-1.62, 0.77, 0] as const,
} as const;

type ShaderUniforms = { phase: { value: number }; influence: { value: number } };
export interface CapybaraModel {
  group: THREE.Group;
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  riderSocket: THREE.Group;
  hitchSocket: THREE.Group;
  /** Only updates render pose; caller drives world transform/collisions. */
  update(dt: number, groundSpeed: number): void;
  /** Releases per-instance GPU materials. Shared geometry is cached. */
  dispose(): void;
}

let cachedGeometry: Promise<THREE.BufferGeometry> | undefined;
function loadGeometry(): Promise<THREE.BufferGeometry> {
  if (!cachedGeometry) {
    const url = `${import.meta.env.BASE_URL}models/capybara-v6.3.obj`;
    cachedGeometry = new OBJLoader().loadAsync(url).then((root) => {
      const parts: THREE.Mesh[] = [];
      root.traverse((child) => { if (child instanceof THREE.Mesh) parts.push(child); });
      if (parts.length !== 1) throw new Error(`Capybara expects one mesh, found ${parts.length}`);
      const original = parts[0].geometry;
      const geometry = original.clone();
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      const positions = geometry.getAttribute('position');
      const triangles = geometry.index ? geometry.index.count / 3 : positions.count / 3;
      if (triangles !== CAPYBARA_TRIANGLES) {
        geometry.dispose();
        throw new Error(`Capybara triangle count mismatch: ${triangles}`);
      }
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      });
      return geometry;
    }).catch((error: unknown) => { cachedGeometry = undefined; throw error; });
  }
  return cachedGeometry;
}

/** Build one drawable capybara with an independent shader phase and two mounting sockets.
 * Multiple instances reuse geometry but never share animated uniforms.
 */
export async function createCapybaraModel(): Promise<CapybaraModel> {
  const geometry = await loadGeometry();
  const uniforms: ShaderUniforms = { phase: { value: 0 }, influence: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({
    color: 0xc58b5c, roughness: 0.98, metalness: 0,
    flatShading: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.capPhase = uniforms.phase;
    shader.uniforms.capInfluence = uniforms.influence;
    shader.vertexShader = `
      uniform float capPhase;
      uniform float capInfluence;
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      // Four legs: hind (-X) / front (+X), left and right alternate in diagonal pairs.
      float rear = 1.0 - smoothstep(-0.94, -0.70, position.x);
      float front = smoothstep(-0.04, 0.12, position.x) *
                    (1.0 - smoothstep(0.49, 0.69, position.x));
      float legRegion = max(rear, front);
      float groundPart = 1.0 - smoothstep(0.25, 0.78, position.y);
      float lateral = smoothstep(0.18, 0.34, abs(position.z));
      float mask = legRegion * groundPart * lateral;
      float side = position.z >= 0.0 ? 0.0 : 3.141592653589793;
      float legPhase = capPhase + side + (rear > front ? 0.0 : 3.141592653589793);
      float travel = sin(legPhase);
      float lift = max(0.0, cos(legPhase));
      transformed.x += mask * capInfluence * travel * 0.14;
      transformed.y += mask * capInfluence * lift * 0.12;
      // Subtle weight transfer, restricted to the torso.
      float torso = smoothstep(0.42, 0.95, position.y) *
                    (1.0 - smoothstep(1.58, 1.81, position.y));
      transformed.y += torso * capInfluence * 0.010 * cos(2.0 * capPhase);
      `
    );
  };
  material.customProgramCacheKey = () => 'little-world-capybara-v6.3-walk-v1';
  const group = new THREE.Group();
  group.name = 'CapybaraV63';
  const body = new THREE.Mesh(geometry, material);
  body.name = 'CapybaraBody';
  body.castShadow = true;
  body.receiveShadow = true;
  body.frustumCulled = false; // deformation is bounded; review after animation qualification
  group.add(body);
  const riderSocket = new THREE.Group();
  riderSocket.name = 'SocketRider';
  riderSocket.position.set(...CAPYBARA_SOCKETS.rider);
  group.add(riderSocket);
  const hitchSocket = new THREE.Group();
  hitchSocket.name = 'SocketHitch';
  hitchSocket.position.set(...CAPYBARA_SOCKETS.hitch);
  group.add(hitchSocket);
  let gait: CapybaraGait = makeCapybaraGait();
  return {
    group, body, riderSocket, hitchSocket,
    update(dt, groundSpeed) {
      gait = advanceCapybaraGait(gait, { dt, speed: groundSpeed });
      uniforms.phase.value = gait.phase;
      uniforms.influence.value = gait.influence;
    },
    dispose() {
      group.remove(body);
      material.dispose();
    },
  };
}
