/** Geography Engine — natural dressing of generated worlds (G5): trees grouped into forests
 * with clearings, shrubs, cliff rock modules, scree, beach pebbles, basalt columns.
 * Pure and deterministic: seed + cell + classification → items. No ids, nothing stored in
 * the V3 sources (doc 18): authors steer it through biomes, masks, occupation and zones.
 * Habitat rules (habitatOf) exclude roads, buildings, fields, reserved/exclusion zones,
 * water and steep rock; LOD never changes this logic, only which cells are drawn. */
import {classifyPoint,habitatOf,type GeoContext,type GeoSample} from './classify.ts';
import {fbm,hash2} from './noise.ts';
/** Uniform 0..1 from the shared lattice hash (-1..1). */
const rnd=(seed:number,i:number,j:number)=>(hash2(seed,i,j)+1)/2;

export type DressingKind='pine'|'oak'|'shrub'|'rock'|'scree'|'pebble'|'basalt';
export const DRESSING_KINDS:DressingKind[]=['pine','oak','shrub','rock','scree','pebble','basalt'];
/** x, y, z, scale, rotation (rad), tint 0..1 per item. */
export const ITEM_STRIDE=6;
export interface DressingCell {cx:number;cz:number;items:Record<DressingKind,Float32Array>;count:number;ms:number}
export const DRESSING_CELL_M=64;
/** Highest acceptance threshold of the rules of generateDressingCell (cliff rocks .22 + .25;
 * trees ≤ .85 × .42 + shrubs ≤ .5 × .12 = .417; pebbles .45; scree .35; basalt .11). Keep it
 * ≥ every threshold when a rule changes (tests compare with an unskipped generation). */
export const PLACEMENT_CEILING=.47;
/** Candidate spacing per family (m): trees are sparse, small stones dense but short-ranged. */
const STEP=4;
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,x:number)=>{const t=clamp01((x-a)/(b-a));return t*t*(3-2*t);};

/** Forest structure: low-frequency clumps → groves and clearings inside forest biomes. */
export function forestClump(seed:number,x:number,z:number):number{return smooth(-.15,.35,fbm((seed^0x6f1c)>>>0,x/55,z/55,2));}

export function generateDressingCell(ctx:GeoContext,seed:number,cx:number,cz:number,inside:(x:number,z:number)=>boolean,ceiling=PLACEMENT_CEILING):DressingCell{
  const t0=performance.now(),size=DRESSING_CELL_M,n=size/STEP,lists:Record<DressingKind,number[]>={pine:[],oak:[],shrub:[],rock:[],scree:[],pebble:[],basalt:[]};
  const cellSeed=(seed^Math.imul(cx,73856093)^Math.imul(cz,19349663))>>>0;
  const push=(kind:DressingKind,x:number,y:number,z:number,s:number,r:number,t:number)=>lists[kind].push(x,y,z,s,r,t);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const r0=rnd(cellSeed,i,j),r1=rnd(cellSeed^0x9e37,i,j),r2=rnd(cellSeed^0x51ed,i,j),r3=rnd(cellSeed^0x2c1b,i,j);
    const x=cx*size+(i+.15+.7*r0)*STEP,z=cz*size+(j+.15+.7*r1)*STEP;
    // No rule below places anything when r2 ≥ PLACEMENT_CEILING: skip the costly sampling.
    if(r2>=ceiling||!inside(x,z))continue;
    const east=ctx.height(x+2,z),h=ctx.height(x,z),slope=Math.abs(east-h)/2;
    const s:GeoSample=classifyPoint(ctx,x,z,{height:h,slope});if(s.underwater)continue;
    const hab=habitatOf(s);
    // Trees on a 4 m lattice thinned to forest densities (≈ 1 tree / 40 m² in a dense grove).
    const trees=hab.trees*(s.biome==='forest'?forestClump(seed,x,z):1)*.42;
    if(r2<trees){const pine=s.height-ctx.seaLevel>140||s.moisture<.45?.75:.45;push(r3<pine?'pine':'oak',x,h,z,.75+.7*rnd(cellSeed^0x77,i,j),r3*6.283,rnd(cellSeed^0x31,i,j));continue;}
    if(r2<trees+hab.shrubs*.12){push('shrub',x,h,z,.6+.8*r3,r0*6.283,r1);continue;}
    // Geology dressing.
    if(s.geology==='rock'&&(s.slope>.45||s.cliff>.55&&s.coast<160)){if(r2<.22+.25*smooth(.45,1.2,s.slope))push('rock',x,h-.4,z,1.2+2.8*r3,r0*6.283,r1);continue;}
    if(s.geology==='basalt'){
      // Basalt outcrops: small clusters of hexagonal columns of varied heights, rare.
      if(r2<.035){const n=3+Math.floor(r3*4);for(let q=0;q<n;q++){const a=q*2.4+r0*6.283,d=q?.85+.3*r1:0;push('basalt',x+Math.cos(a)*d,h-.5,z+Math.sin(a)*d,.8+.5*rnd(cellSeed^q,i,j),a,rnd(cellSeed^(q+11),i,j));}}
      else if(r2<.11)push('rock',x,h-.3,z,.8+1.6*r3,r0*6.283,.15*r1);
      continue;}
    if(s.geology==='gravel'||s.geology==='rock'){if(r2<.35)push('scree',x,h,z,.25+.5*r3,r0*6.283,r1);continue;}
    if(s.material==='pebbles'){if(r2<.45)push('pebble',x,h,z,.18+.22*r3,r0*6.283,r1);continue;}
    if(hab.rocks>0&&r2<hab.rocks*.06)push('rock',x,h-.3,z,.6+1.4*r3,r0*6.283,r1);
  }
  const items={} as Record<DressingKind,Float32Array>;let count=0;
  for(const kind of DRESSING_KINDS){items[kind]=new Float32Array(lists[kind]);count+=lists[kind].length/ITEM_STRIDE;}
  return {cx,cz,items,count,ms:performance.now()-t0};
}
