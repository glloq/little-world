/** E10 — reproducible light-source scenarios for benchmarks (Node and `?lightBench=` in the game).
 * Sources only: they exercise selection and budget, they never create one Three.js light each. */
import {LIGHT_PRESETS,type RuntimeLight} from './light-data.ts';

export type BenchLayout='cluster'|'spread';
export function benchLights(count:number,layout:BenchLayout,cx:number,cz:number,seed=7):RuntimeLight[]{
  let s=seed>>>0;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  const out:RuntimeLight[]=[],presets=['warm-lantern','flickering-fire','fixed-lamp','cold-light'] as const;
  for(let i=0;i<count;i++){
    // cluster: a village of ~70 m radius; spread: lanterns along a 1.6 km wide area.
    const a=rnd()*Math.PI*2,r=layout==='cluster'?Math.sqrt(rnd())*70:Math.sqrt(rnd())*800;
    const p=LIGHT_PRESETS[presets[i%presets.length]],x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;
    out.push({id:`light:bench-${String(i).padStart(4,'0')}`,entityId:`bench-${i}`,x,y:p.offsetY,z,offset:{x:0,y:p.offsetY,z:0},color:p.color,intensity:p.intensity,range:p.range,mode:p.mode,...(p.flicker?{flicker:{...p.flicker}}:{}),follow:false});
  }
  return out;
}
