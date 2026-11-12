// Node.js 22: node --experimental-strip-types tools/generate-squirrel.mjs
// No Blender, network, texture download or runtime server is required.
import { mkdir, writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildSquirrel } from '../src/squirrel.ts';
import { createSquirrelAnimationClips } from '../src/character-clips.ts';

// GLTFExporter uses the standard browser FileReader API to pack binary buffers.
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
  async readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
    this.onloadend?.();
  }
};
const model = buildSquirrel();
model.group.userData = {
  provenance: 'Little World original procedural squirrel',
  rig: 'Rigid articulated joints, no weighted skinning',
  runtime: 'Exported reference asset; game uses the procedural rig',
  appearance:
    'Set selected FaceEmotion_* and accessory node scale to 1; keep unselected nodes at 0',
};
// glTF does not encode Object3D.visible. Preserve all facial/accessory nodes and
// encode hidden choices as zero scale; the default face is happy with no gear.
model.group.traverse((node) => {
  if (!node.visible) {
    node.scale.set(0, 0, 0);
    node.visible = true;
  }
});
// Membrane deployment is controlled by its parent scale animation.
model.group.getObjectByName('DeployableGlider').scale.set(1, 1, 1);
model.group.getObjectByName('MembraneJoint').scale.x = 0.0001;
model.group.updateMatrixWorld(true);
const data = await new GLTFExporter().parseAsync(model.group, {
  binary: true,
  animations: createSquirrelAnimationClips(),
  onlyVisible: false,
});
const output = new URL('../public/models/squirrel.glb', import.meta.url);
await mkdir(new URL('../public/models/', import.meta.url), { recursive: true });
await writeFile(output, Buffer.from(data));
console.log(
  `Generated ${output.pathname} (${data.byteLength} bytes; 13 clips, rigid joint rig)`,
);
