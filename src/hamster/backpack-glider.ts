/** Backpack-mounted low-poly V glider.
 * Cosmetic only: physics and collisions remain owned by player.ts.
 * Nothing is rendered while stowed; the wing assembly emerges only on deployment.
 * Shared geometries/material keep the cost bounded for local and remote hamsters.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface GliderVisualInput {
  mode: string;
  speed: number;
  stalled?: boolean;
  turnRate?: number;
  pitch?: number;
  brake?: number;
  boosting?: boolean;
  pulseSeq?: number;
}
export interface BackpackGlider {
  readonly group: THREE.Group;
  readonly deployment: number;
  update(input: GliderVisualInput, dt: number): void;
  /** Cosmetic selection: unknown or unavailable designs fall back to the free classic sail. */
  setStyle(id: string | null): void;
  dispose(): void;
}
export const GLIDER_MOTION = Object.freeze({
  openSeconds: .38,
  closeSeconds: .26,
  stallBlendSeconds: .16,
  brakeBlendSeconds: .12,
  boostKickSeconds: .24,
});
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
const smooth = (value: number) => value * value * (3 - 2 * value);
const wood = 0x916137, darkWood = 0x67452d, cloth = 0xe4c695, clothShade = 0xd3af77, metal = 0x827d73;
const palettes: Readonly<Record<string, readonly [number,number]>> = Object.freeze({
  classic: [cloth, clothShade],
  // Future skins can extend this table without changing the mount or gameplay.
});
const color = (hex: number, count: number) => {
  const c = new THREE.Color(hex), values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { values[i * 3] = c.r; values[i * 3 + 1] = c.g; values[i * 3 + 2] = c.b; }
  return values;
};
function boxBetween(a: THREE.Vector3, b: THREE.Vector3, width: number, depth: number, tint: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(width, a.distanceTo(b), depth).toNonIndexed();
  g.deleteAttribute('uv');
  const middle = a.clone().add(b).multiplyScalar(.5);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(middle, rotation, new THREE.Vector3(1, 1, 1)));
  g.setAttribute('color', new THREE.BufferAttribute(color(tint, g.getAttribute('position').count), 3));
  return g;
}
function wingGeometry(side: -1 | 1, main: number, shade: number): THREE.BufferGeometry {
  const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(side * 1.32, .17, -.06);
  const c = new THREE.Vector3(side * .96, -.07, -.52), d = new THREE.Vector3(side * .12, -.13, -.54);
  const triangles = [a,b,c, a,c,d];
  const positions = new Float32Array(triangles.flatMap(v => [v.x,v.y,v.z]));
  const colors = new Float32Array(18);
  const c0 = new THREE.Color(main), c1 = new THREE.Color(shade);
  for (let i = 0; i < 6; i++) {
    const v = i < 3 ? c0 : c1;
    colors.set([v.r, v.g, v.b], i * 3);
  }
  const fabric = new THREE.BufferGeometry();
  fabric.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  fabric.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  fabric.computeVertexNormals();
  const leading = boxBetween(a, b, .075, .075, wood);
  const trailing = boxBetween(b, c, .028, .03, darkWood);
  const merged = mergeGeometries([fabric,leading,trailing], false);
  fabric.dispose();leading.dispose();trailing.dispose();
  if (!merged) throw new Error('Unable to build V glider geometry');
  merged.computeBoundingSphere();
  return merged;
}
let shared: {
  wingL: THREE.BufferGeometry;
  wingR: THREE.BufferGeometry;
  mast: THREE.BufferGeometry;
  hinge: THREE.BufferGeometry;
  material: THREE.MeshLambertMaterial;
} | null = null;
function assets() {
  if (shared) return shared;
  const main = palettes.classic;
  const wingL = wingGeometry(-1, main[0], main[1]), wingR = wingGeometry(1, main[0], main[1]);
  const mast = boxBetween(new THREE.Vector3(0,0,0),new THREE.Vector3(0,.64,.02),.095,.11,wood);
  const hinge = new THREE.BoxGeometry(.20,.15,.18).toNonIndexed();
  hinge.deleteAttribute('uv');
  hinge.setAttribute('color',new THREE.BufferAttribute(color(metal,hinge.getAttribute('position').count),3));
  return shared = {wingL,wingR,mast,hinge,material:new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true,side:THREE.DoubleSide})};
}
/** Visual state machine: STOWED / OPENING / OPEN / CLOSING are implicit in deployment.
 * Stall, braking, boost and turn remain additive, never exclusive states.
 */
export function createBackpackGlider(backSocket: THREE.Object3D): BackpackGlider {
  const asset = assets(), group = new THREE.Group();group.name = 'BackpackVGlider';
  group.position.set(0,.22,-.16);
  const mast = new THREE.Mesh(asset.mast,asset.material);mast.name='GliderMast';
  const hinge = new THREE.Mesh(asset.hinge,asset.material);hinge.name='GliderHinge';
  const wings = new THREE.Group();wings.name='GliderWings';
  const left = new THREE.Mesh(asset.wingL,asset.material);left.name='GliderWingLeft';
  const right = new THREE.Mesh(asset.wingR,asset.material);right.name='GliderWingRight';
  wings.add(left,right);group.add(mast,hinge,wings);backSocket.add(group);
  group.visible=false;group.frustumCulled=false;
  let deployment=0, time=0, stall=0, braking=0, turn=0, kick=0, lastPulse: number | undefined;
  let style='classic';
  return {
    group,
    get deployment(){return deployment;},
    setStyle(id){style=id && Object.hasOwn(palettes,id)?id:'classic';/* future palettes use the same geometry contract */},
    update(input, dt) {
      dt=clamp(dt,0,.1);time+=dt;
      const active=input.mode==='glide';
      const step=dt/(active?GLIDER_MOTION.openSeconds:GLIDER_MOTION.closeSeconds);
      deployment=clamp(deployment+(active?step:-step),0,1);
      group.visible=deployment>0.0001;
      if (!group.visible) {stall=braking=turn=kick=0;return;}
      const open=smooth(deployment);
      const response=(value:number,target:number,seconds:number)=>value+(target-value)*Math.min(1,dt/seconds);
      stall=response(stall,active&&input.stalled?1:0,GLIDER_MOTION.stallBlendSeconds);
      braking=response(braking,active?clamp(input.brake??0,0,1):0,GLIDER_MOTION.brakeBlendSeconds);
      turn=response(turn,active?clamp(input.turnRate??0,-2,2):0,.14);
      const seq=input.pulseSeq;
      if(seq!==undefined&&seq!==lastPulse){if(lastPulse!==undefined&&seq>lastPulse&&active)kick=GLIDER_MOTION.boostKickSeconds;lastPulse=seq;}
      kick=Math.max(0,kick-dt);
      const boost=Math.max(input.boosting&&active?.28:0,kick/GLIDER_MOTION.boostKickSeconds);
      mast.scale.y=Math.max(.001,open);
      hinge.position.set(0,open*.64,.02*open);
      wings.position.copy(hinge.position);
      const swing=(1-open)*Math.PI*.5;
      const flutter=stall*(Math.sin(time*22)*.09+Math.sin(time*37)*.035);
      left.rotation.set(-.035*open-flutter, -swing-braking*.15, -.12*open + flutter*.35 + turn*.035 - boost*.035);
      right.rotation.set(-.035*open+flutter, swing+braking*.15, .12*open - flutter*.35 + turn*.035 + boost*.035);
      // A single mast pitch/roll and gentle wing-tip wobble sell the motion without cloth physics.
      const pitch=clamp(input.pitch??0,-1.1,.8);
      wings.rotation.set(-pitch*.14*open+stall*.10+boost*.08,0,-turn*.075*open);
      const fast=clamp((input.speed-14)/42,0,1);
      const shake=fast*.012*Math.sin(time*32)*(1-stall);
      wings.rotation.x+=shake;
      if(style!=='classic')style='classic'; // graceful fallback until skins are authored
    },
    dispose(){group.removeFromParent();},
  };
}
