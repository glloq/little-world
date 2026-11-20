/** Shader program warm-up (doc 106, HITCH-4). Three.js compiles a program the first time a
 * material is drawn with a new combination of defines (lights, fog, skinning, batching…):
 * that compilation and the driver link stall the frame on which the object first appears.
 * Here every material already in the scene is compiled ahead of time, in the background
 * (`compileAsync` uses KHR_parallel_shader_compile when available), for the normal state
 * and for each listed variant (underwater fog, miner headlamp…). Programs are cached per
 * material, so later switches between these states only rebind existing programs.
 * Purely a presentation optimisation: nothing visible changes. */
import type * as THREE from 'three';

/** Temporarily applies a scene state; returns the function that restores it. */
export type ShaderVariant = () => () => void;

export function createShaderWarmup(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, variants: ShaderVariant[] = []) {
  const stats = { runs: 0, lastMs: 0, programs: 0 };
  let running: Promise<void> | null = null, again = false;
  async function run() {
    const begin = performance.now(), waits: Promise<unknown>[] = [];
    // compileAsync issues every compile synchronously, then only waits for completion:
    // each variant is active exactly during its own synchronous pass.
    waits.push(renderer.compileAsync(scene, camera));
    for (const variant of variants) {
      const restore = variant();
      try { waits.push(renderer.compileAsync(scene, camera)); } finally { restore(); }
    }
    await Promise.all(waits);
    stats.runs++; stats.lastMs = performance.now() - begin;
    stats.programs = renderer.info.programs?.length ?? 0;
  }
  function request(): Promise<void> {
    if (running) { again = true; return running; }
    running = run().catch(error => { console.warn('Préchargement des shaders incomplet :', error); }).finally(() => {
      running = null;
      if (again) { again = false; void request(); }
    });
    return running;
  }
  return { stats, request };
}
