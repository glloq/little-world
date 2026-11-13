/** MINE-2/3 — occupancy grid, persistent excavation state and dig rule.
 *  - `MineGrid` is derived from the authoring zone (never saved): zone mask, initial open cells
 *    (galleries, entrance corridor, stair landings) and geology on demand.
 *  - `MineState` holds only what the player changed: one 32×32 bitset (32 × Uint32) per touched
 *    chunk and level, with a revision. Excavated ore = exhausted resource (never re-granted).
 *  - `dig` validates level, cell, accessibility, reach and material, then applies the cell and
 *    the reward atomically (reward callback must accept first) and is idempotent per requestId.
 * Pure: no Three.js, no storage. */
import {MINE_CHUNK,MINE_MATERIALS,geologyAt,insidePolygon,type MineZone,type MineLevelV3} from './mine-data.ts';

export interface DigRequest {requestId:string;levelId:string;ix:number;iz:number;from:{x:number;y:number;z:number};expectedRevision?:number}
export type DigResult={ok:true;material:number;reward:{itemId:string;quantity:number}|null;chunks:string[];revision:number}|{ok:false;reason:string};
export interface MineSaveState {mineId:string;seed:number;geologyVersion:number;levels:Record<string,Record<string,{r:number;b:string}>>;requests:string[]}
export const DIG_REACH=2.6;
const chunkKey=(cx:number,cz:number)=>cx+','+cz;

export class MineGrid {
  readonly zone:MineZone;readonly levels:MineLevelV3[];readonly minX:number;readonly minZ:number;readonly width:number;readonly depth:number;
  private mask:Uint8Array;private open:Uint8Array[];private index:Map<string,number>;
  constructor(zone:MineZone){
    this.zone=zone;this.levels=zone.mine.levels;this.index=new Map(this.levels.map((l,i)=>[l.id,i]));
    const xs=zone.polygon.map(p=>p.x),zs=zone.polygon.map(p=>p.z);this.minX=Math.floor(Math.min(...xs))-1;this.minZ=Math.floor(Math.min(...zs))-1;
    this.width=Math.ceil(Math.max(...xs))+1-this.minX;this.depth=Math.ceil(Math.max(...zs))+1-this.minZ;
    if(this.width*this.depth>512*512)throw Error('Mine trop étendue : 512 × 512 cellules au plus');
    this.mask=new Uint8Array(this.width*this.depth);
    for(let z=0;z<this.depth;z++)for(let x=0;x<this.width;x++)this.mask[z*this.width+x]=insidePolygon(zone.polygon,this.minX+x+.5,this.minZ+z+.5)?1:0;
    this.open=this.levels.map(()=>new Uint8Array(this.width*this.depth));
    const opened=(level:number,x0:number,x1:number,z0:number,z1:number)=>{for(let iz=Math.floor(z0);iz<Math.ceil(z1);iz++)for(let ix=Math.floor(x0);ix<Math.ceil(x1);ix++){const k=this.cell(ix,iz);if(k>=0&&this.mask[k])this.open[level][k]=1;}};
    for(const g of zone.mine.galleries){const l=this.index.get(g.levelId);if(l!==undefined)opened(l,g.minX,g.maxX,g.minZ,g.maxZ);}
    // Entrance corridor on the top level (3 cells wide, 4 deep along the heading).
    const e=zone.mine.entrance,hx=Math.sin(e.heading),hz=Math.cos(e.heading);
    for(let d=0;d<5;d++)for(let s=-1;s<=1;s++){const x=Math.floor(e.x+hx*d+hz*s),z=Math.floor(e.z+hz*d-hx*s),k=this.cell(x,z);if(k>=0&&this.mask[k])this.open[0][k]=1;}
    // Stair landings: 3 × 5 cells around each connector, on both levels.
    for(const c of zone.mine.connectors)for(const l of [this.index.get(c.upper)!,this.index.get(c.lower)!])opened(l,Math.floor(c.x)-1,Math.floor(c.x)+2,Math.floor(c.z)-2,Math.floor(c.z)+3);
  }
  levelIndex(id:string){return this.index.get(id)??-1;}
  /** Flat index of a world cell in the grid, -1 outside. */
  cell(ix:number,iz:number){const x=ix-this.minX,z=iz-this.minZ;return x<0||z<0||x>=this.width||z>=this.depth?-1:z*this.width+x;}
  inZone(ix:number,iz:number){const k=this.cell(ix,iz);return k>=0&&this.mask[k]===1;}
  initiallyOpen(level:number,ix:number,iz:number){const k=this.cell(ix,iz);return k>=0&&this.open[level][k]===1;}
  /** Initial material (0 = air for initial galleries, 6 = protected bedrock outside the zone). */
  material(level:number,ix:number,iz:number){return !this.inZone(ix,iz)?6:this.initiallyOpen(level,ix,iz)?0:geologyAt(this.zone.mine.seed,level,ix,iz);}
  chunkRange(){return {cx0:Math.floor(this.minX/MINE_CHUNK),cx1:Math.floor((this.minX+this.width-1)/MINE_CHUNK),cz0:Math.floor(this.minZ/MINE_CHUNK),cz1:Math.floor((this.minZ+this.depth-1)/MINE_CHUNK)};}
}

export class MineState {
  readonly grid:MineGrid;
  private chunks:Map<string,{bits:Uint32Array;revision:number}>[];
  private requests=new Map<string,DigResult>();private order:string[]=[];
  revision=0;
  constructor(grid:MineGrid){this.grid=grid;this.chunks=grid.levels.map(()=>new Map());}
  excavated(level:number,ix:number,iz:number){const c=this.chunks[level].get(chunkKey(Math.floor(ix/MINE_CHUNK),Math.floor(iz/MINE_CHUNK)));if(!c)return false;const lx=ix-Math.floor(ix/MINE_CHUNK)*MINE_CHUNK,lz=iz-Math.floor(iz/MINE_CHUNK)*MINE_CHUNK;return (c.bits[lz]>>>lx&1)===1;}
  isOpen(level:number,ix:number,iz:number){return this.grid.initiallyOpen(level,ix,iz)||this.excavated(level,ix,iz);}
  /** Current material: air once excavated, otherwise the initial geology. */
  material(level:number,ix:number,iz:number){return this.excavated(level,ix,iz)?0:this.grid.material(level,ix,iz);}
  chunkRevision(level:number,cx:number,cz:number){return this.chunks[level].get(chunkKey(cx,cz))?.revision??0;}
  get excavatedCount(){let n=0;for(const level of this.chunks)for(const c of level.values())for(const row of c.bits){let v=row;while(v){v&=v-1;n++;}}return n;}
  dig(req:DigRequest,grant:(reward:{itemId:string;quantity:number})=>boolean):DigResult{
    const cached=this.requests.get(req.requestId);if(cached)return cached;
    const fail=(reason:string):DigResult=>({ok:false,reason});
    const level=this.grid.levelIndex(req.levelId);if(level<0)return fail('Niveau inconnu');
    if(!Number.isInteger(req.ix)||!Number.isInteger(req.iz))return fail('Cellule invalide');
    if(req.expectedRevision!==undefined&&req.expectedRevision!==this.chunkRevision(level,Math.floor(req.ix/MINE_CHUNK),Math.floor(req.iz/MINE_CHUNK)))return fail('État de la mine modifié entre-temps');
    if(this.isOpen(level,req.ix,req.iz))return fail('Déjà creusé');
    const material=this.grid.material(level,req.ix,req.iz),info=MINE_MATERIALS[material];
    if(!info.diggable)return fail(info.name+' : impossible à creuser');
    if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>this.isOpen(level,req.ix+dx,req.iz+dz)))return fail('Paroi inaccessible');
    const l=this.grid.levels[level];
    if(Math.hypot(req.from.x-(req.ix+.5),req.from.z-(req.iz+.5))>DIG_REACH||req.from.y<l.floorY-.5||req.from.y>l.floorY+l.height)return fail('Trop loin');
    const reward=info.item?{itemId:info.item,quantity:1}:null;
    if(reward&&!grant(reward))return fail('Inventaire plein');
    // Commit: cell + revision (the reward has been accepted in the same step).
    const cx=Math.floor(req.ix/MINE_CHUNK),cz=Math.floor(req.iz/MINE_CHUNK),key=chunkKey(cx,cz);
    let c=this.chunks[level].get(key);if(!c)this.chunks[level].set(key,c={bits:new Uint32Array(MINE_CHUNK),revision:0});
    const lx=req.ix-cx*MINE_CHUNK,lz=req.iz-cz*MINE_CHUNK;c.bits[lz]|=1<<lx;c.revision++;this.revision++;
    const chunks=new Set([key]);if(lx===0)chunks.add(chunkKey(cx-1,cz));if(lx===MINE_CHUNK-1)chunks.add(chunkKey(cx+1,cz));if(lz===0)chunks.add(chunkKey(cx,cz-1));if(lz===MINE_CHUNK-1)chunks.add(chunkKey(cx,cz+1));
    const result:DigResult={ok:true,material,reward,chunks:[...chunks],revision:c.revision};
    this.requests.set(req.requestId,result);this.order.push(req.requestId);if(this.order.length>256)this.requests.delete(this.order.shift()!);
    return result;
  }
  /** Differences only: excavated bitsets per level/chunk (base64) + revisions + recent request ids. */
  serialize():MineSaveState{
    const levels:MineSaveState['levels']={};
    this.grid.levels.forEach((l,i)=>{const out:Record<string,{r:number;b:string}>={};for(const [k,c]of this.chunks[i])out[k]={r:c.revision,b:encodeBits(c.bits)};if(Object.keys(out).length)levels[l.id]=out;});
    return {mineId:this.grid.zone.id,seed:this.grid.zone.mine.seed,geologyVersion:this.grid.zone.mine.geologyVersion,levels,requests:this.order.slice(-64)};
  }
  /** Restores excavations (also after a geology change: dug cells never reappear). Returns warnings. */
  restore(save:MineSaveState):string[]{
    const warnings:string[]=[];if(save.mineId!==this.grid.zone.id)throw Error('Sauvegarde d’une autre mine');
    if(save.seed!==this.grid.zone.mine.seed||save.geologyVersion!==this.grid.zone.mine.geologyVersion)warnings.push('Géologie de la mine modifiée depuis la sauvegarde : les cellules creusées restent creusées.');
    this.chunks=this.grid.levels.map(()=>new Map());this.revision=0;this.requests.clear();this.order=[];
    for(const [levelId,chunks]of Object.entries(save.levels)){const level=this.grid.levelIndex(levelId);if(level<0){warnings.push('Niveau supprimé : '+levelId);continue;}
      for(const [key,c]of Object.entries(chunks)){if(!/^-?\d+,-?\d+$/.test(key)||!Number.isInteger(c.r)||c.r<0)throw Error('Chunk de mine invalide');this.chunks[level].set(key,{bits:decodeBits(c.b),revision:c.r});this.revision+=c.r;}}
    for(const id of save.requests){this.order.push(id);this.requests.set(id,{ok:false,reason:'Demande déjà traitée'});}
    return warnings;
  }
}
function encodeBits(bits:Uint32Array){const bytes=new Uint8Array(bits.buffer.slice(0));let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
function decodeBits(text:string){const s=atob(text);if(s.length!==MINE_CHUNK*4)throw Error('Chunk de mine corrompu');const bytes=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);return new Uint32Array(bytes.buffer);}
export function parseMineSave(value:unknown):MineSaveState{
  const v=value as MineSaveState;if(!v||typeof v!=='object'||typeof v.mineId!=='string'||!Number.isFinite(v.seed)||!Number.isFinite(v.geologyVersion)||!v.levels||typeof v.levels!=='object'||!Array.isArray(v.requests)||v.requests.length>64||!v.requests.every(r=>typeof r==='string'&&r.length<=128))throw Error('État de mine invalide');
  for(const chunks of Object.values(v.levels))for(const c of Object.values(chunks)){if(!c||typeof c.b!=='string'||c.b.length!==172||!Number.isInteger(c.r))throw Error('État de mine invalide');}
  return structuredClone(v);
}
