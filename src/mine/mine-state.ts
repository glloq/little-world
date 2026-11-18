/** MINE-2/3 — occupancy grid, persistent excavation state and dig rule.
 *  - `MineGrid` is derived from the authoring zone (never saved): zone mask, initial open cells
 *    (galleries, entrance corridor, stair landings) and geology on demand.
 *  - `MineState` holds only what the player changed: one 32×32 bitset (32 × Uint32) per touched
 *    chunk and level, with a revision. Excavated ore = exhausted resource (never re-granted).
 *  - `dig` validates level, cell, accessibility, reach and material, then applies the cell and
 *    the reward atomically (reward callback must accept first) and is idempotent per requestId.
 * Pure: no Three.js, no storage. */
import {MINE_CHUNK,MINE_MATERIALS,geologyAt,insidePolygon,type MineZone,type MineLevelV3} from './mine-data.ts';
import {mineHubCell,mineHubLayout,mineHubGalleryApproach} from './mine-hub.ts';
import {MINE_WORK_PER_CYCLE,mineStrikeWork,mineBlockDurability,mineHitsUntilCycle,mineInterimReward,type StrikeAccuracy} from './mine-rhythm.ts';

export interface DigRequest {requestId:string;levelId:string;ix:number;iz:number;from:{x:number;y:number;z:number};expectedRevision?:number}
export type DigResult={ok:true;material:number;reward:{itemId:string;quantity:number}|null;chunks:string[];revision:number}|{ok:false;reason:string};
export interface MineSaveState {mineId:string;seed:number;geologyVersion:number;levels:Record<string,Record<string,{r:number;b:string}>>;requests:string[];
  /** Partially struck cells « levelId:ix:iz » → damage (optional, bounded). */damage?:Record<string,number>;
  /** Accepted strike count per cell; optional for older saves. */hits?:Record<string,number>;
  /** 0–14 fixed-point progress towards the next collection cycle. */
  work?:Record<string,number>;
  /** Version 2 means damage stores consumed durability rather than historical HP. */
  miningVersion?:2
}
export type StrikeResult=DigResult|{ok:true;partial:true;material:number;progress:number;fragment:{itemId:string;quantity:number}|null;hits:number;nextResult:number;accuracy:StrikeAccuracy;durabilityRemaining:number;durabilityMax:number};
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
    // MINE-HUB V1: identical reception space on every floor. Clip at authoring polygon;
    // the persistent excavation bitsets remain independent of these initial void cells.
    for(let l=0;l<this.levels.length;l++){
      const hub=mineHubLayout(zone,l);
      // The new 13×14 m hall extends 10 m laterally. Rotate-safe 29×29 bounds,
      // still bounded independent of the mine's possible 512×512 cell extent.
      for(let iz=Math.floor(hub.shaft.z)-14;iz<=Math.floor(hub.shaft.z)+14;iz++)
        for(let ix=Math.floor(hub.shaft.x)-14;ix<=Math.floor(hub.shaft.x)+14;ix++){
          const k=this.cell(ix,iz);
          if(k>=0&&this.mask[k]&&mineHubCell(hub,ix,iz))this.open[l][k]=1;
        }
    }
    // Keep 5.8 m of unobstructed extraction tunnel behind EVERY arch, then
    // connect it to the nearest authored gallery. Previously the immediate bend
    // looked like a solid rock wall right behind the timber lintel.
    for(let l=0;l<this.levels.length;l++){
      const hub=mineHubLayout(zone,l),approach=mineHubGalleryApproach(hub),
        candidates=zone.mine.galleries.filter(g=>g.levelId===hub.levelId);
      let target:{x:number;z:number}|null=null,shortest=Infinity;
      for(const g of candidates){
        const x=g.maxX-g.minX<1?(g.minX+g.maxX)/2:
          Math.max(g.minX+.5,Math.min(g.maxX-.5,approach.x));
        const z=g.maxZ-g.minZ<1?(g.minZ+g.maxZ)/2:
          Math.max(g.minZ+.5,Math.min(g.maxZ-.5,approach.z));
        const d=(x-approach.x)**2+(z-approach.z)**2;
        if(d<shortest){shortest=d;target={x,z};}
      }
      const segment=(a:{x:number;z:number},b:{x:number;z:number})=>{
        const dx=b.x-a.x,dz=b.z-a.z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)*2));
        for(let t=0;t<=steps;t++){
          const x=a.x+dx*t/steps,z=a.z+dz*t/steps;
          // Six-metre extraction mouth. It spans the real timber arch, so players
          // pass through the visually intended opening rather than a smaller hole.
          for(let offX=-3;offX<=3;offX++)for(let offZ=-3;offZ<=3;offZ++){
            if(offX*offX+offZ*offZ>9)continue;
            const ix=Math.floor(x+offX),iz=Math.floor(z+offZ),k=this.cell(ix,iz);
            if(k>=0&&this.mask[k])this.open[l][k]=1;
          }
        }
      };
      segment(hub.gallery,approach);
      if(target)segment(approach,target);
    }
    // The level-1 rear doorway must connect to the existing surface portal at floor
    // height without a lift, load screen or exterior terrain excavation.
    const rear=mineHubLayout(zone,0).surfaceExit;
    if(rear){
      const sx=e.x+hx*3,sz=e.z+hz*3,dx=rear.x-sx,dz=rear.z-sz;
      const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)*2));
      for(let t=0;t<=steps;t++){
        const x=sx+dx*t/steps,z=sz+dz*t/steps;
        for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
          if(a*a+b*b>2)continue;
          const ix=Math.floor(x+a),iz=Math.floor(z+b),k=this.cell(ix,iz);
          if(k>=0&&this.mask[k])this.open[0][k]=1;
        }
      }
    }
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
  private requests=new Map<string,StrikeResult>();private order:string[]=[];
  private damage=new Map<string,number>();
  private hits=new Map<string,number>();
  private work=new Map<string,number>();
  /** A bounded request cache is also saved to prevent replay across reload. */
  private remember(id:string,result:StrikeResult){
    this.requests.set(id,result);this.order.push(id);
    if(this.order.length>256)this.requests.delete(this.order.shift()!);
  }
  revision=0;
  constructor(grid:MineGrid){this.grid=grid;this.chunks=grid.levels.map(()=>new Map());}
  excavated(level:number,ix:number,iz:number){const c=this.chunks[level].get(chunkKey(Math.floor(ix/MINE_CHUNK),Math.floor(iz/MINE_CHUNK)));if(!c)return false;const lx=ix-Math.floor(ix/MINE_CHUNK)*MINE_CHUNK,lz=iz-Math.floor(iz/MINE_CHUNK)*MINE_CHUNK;return (c.bits[lz]>>>lx&1)===1;}
  isOpen(level:number,ix:number,iz:number){return this.grid.initiallyOpen(level,ix,iz)||this.excavated(level,ix,iz);}
  /** Current material: air once excavated, otherwise the initial geology. */
  material(level:number,ix:number,iz:number){return this.excavated(level,ix,iz)?0:this.grid.material(level,ix,iz);}
  chunkRevision(level:number,cx:number,cz:number){return this.chunks[level].get(chunkKey(cx,cz))?.revision??0;}
  get excavatedCount(){let n=0;for(const level of this.chunks)for(const c of level.values())for(const row of c.bits){let v=row;while(v){v&=v-1;n++;}}return n;}
  /** Same validation as `dig`, without writing anything nor granting (UI preview). */
  check(req:Omit<DigRequest,'requestId'>):{ok:true;material:number;reward:{itemId:string;quantity:number}|null}|{ok:false;reason:string}{
    const fail=(reason:string)=>({ok:false as const,reason});
    const level=this.grid.levelIndex(req.levelId);if(level<0)return fail('Niveau inconnu');
    if(!Number.isInteger(req.ix)||!Number.isInteger(req.iz))return fail('Cellule invalide');
    if(req.expectedRevision!==undefined&&req.expectedRevision!==this.chunkRevision(level,Math.floor(req.ix/MINE_CHUNK),Math.floor(req.iz/MINE_CHUNK)))return fail('État de la mine modifié entre-temps');
    if(this.isOpen(level,req.ix,req.iz))return fail('Déjà creusé');
    const material=this.grid.material(level,req.ix,req.iz),info=MINE_MATERIALS[material];
    if(!info.diggable)return fail(info.name+' : impossible à creuser');
    if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>this.isOpen(level,req.ix+dx,req.iz+dz)))return fail('Paroi inaccessible');
    const l=this.grid.levels[level];
    if(Math.hypot(req.from.x-(req.ix+.5),req.from.z-(req.iz+.5))>DIG_REACH||req.from.y<l.floorY-.5||req.from.y>l.floorY+l.height)return fail('Trop loin');
    return {ok:true,material,reward:info.item?{itemId:info.item,quantity:1}:null};
  }
  dig(req:DigRequest,grant:(reward:{itemId:string;quantity:number})=>boolean,finalBonus=0):DigResult{
    const cached=this.requests.get(req.requestId);
    if(cached)return 'partial'in cached?{ok:false,reason:'Demande déjà traitée'}:cached;
    const fail=(reason:string):DigResult=>({ok:false,reason});
    const verdict=this.check(req);if(!verdict.ok)return fail(verdict.reason);
    const level=this.grid.levelIndex(req.levelId),material=verdict.material;
    let reward=verdict.reward;
    // Only final excavation receives the slightly larger actual-ore payout.
    // Attempt larger batches first, gracefully falling back when the bag
    // has less room. Direct dig (used by authoring/tests) still grants 1.
    if(reward){
      let accepted=false;
      for(let quantity=reward.quantity+Math.min(2,Math.max(0,Math.floor(finalBonus)));
        quantity>=reward.quantity;quantity--){
        const choice={...reward,quantity};
        if(grant(choice)){reward=choice;accepted=true;break;}
      }
      if(!accepted)return fail('Inventaire plein');
    }
    // Commit: cell + revision (the reward has been accepted in the same step).
    const cx=Math.floor(req.ix/MINE_CHUNK),cz=Math.floor(req.iz/MINE_CHUNK),key=chunkKey(cx,cz);
    let c=this.chunks[level].get(key);if(!c)this.chunks[level].set(key,c={bits:new Uint32Array(MINE_CHUNK),revision:0});
    const lx=req.ix-cx*MINE_CHUNK,lz=req.iz-cz*MINE_CHUNK;c.bits[lz]|=1<<lx;c.revision++;this.revision++;
    const chunks=new Set([key]);if(lx===0)chunks.add(chunkKey(cx-1,cz));if(lx===MINE_CHUNK-1)chunks.add(chunkKey(cx+1,cz));if(lz===0)chunks.add(chunkKey(cx,cz-1));if(lz===MINE_CHUNK-1)chunks.add(chunkKey(cx,cz+1));
    // Direct dig calls and completed strikes both consume partial progress.
    this.damage.delete(`${req.levelId}:${req.ix}:${req.iz}`);
    this.hits.delete(`${req.levelId}:${req.ix}:${req.iz}`);
    this.work.delete(`${req.levelId}:${req.ix}:${req.iz}`);
    const result:DigResult={ok:true,material,reward,chunks:[...chunks],revision:c.revision};
    this.remember(req.requestId,result);
    return result;
  }
  /** Damage already dealt to a wall cell (0 when intact). */
  damageAt(level:number,ix:number,iz:number){return this.damage.get(`${this.grid.levels[level].id}:${ix}:${iz}`)??0;}
  hitCountAt(level:number,ix:number,iz:number){return this.hits.get(`${this.grid.levels[level].id}:${ix}:${iz}`)??0;}
  workAt(level:number,ix:number,iz:number){return this.work.get(`${this.grid.levels[level].id}:${ix}:${iz}`)??0;}
  durabilityAt(level:number,ix:number,iz:number){
    const max=mineBlockDurability(this.grid.material(level,ix,iz));
    return Math.max(0,max-this.damageAt(level,ix,iz));
  }
  /** All mining is performed on the same physical cell. Accepted strikes
   * contribute 3/4/5 fixed-point work for normal/good/perfect timing.
   * When work reaches 15, one small collection is resolved and EXACTLY 1
   * durability unit is deducted. Only at zero durability is dig() called;
   * this last batch yields 2 or 3 pieces of the original material and opens
   * the wall. A rejected inventory transaction leaves all state untouched. */
  strike(req:DigRequest,power:number,
    grant:(reward:{itemId:string;quantity:number})=>boolean,
    accuracy:StrikeAccuracy='normal'):StrikeResult{
    const cached=this.requests.get(req.requestId);if(cached)return cached;
    const verdict=this.check(req);if(!verdict.ok)return {ok:false,reason:verdict.reason};
    if(!Number.isFinite(power)||power<=0)return {ok:false,reason:'Outil invalide'};
    const level=this.grid.levelIndex(req.levelId),
      key=`${req.levelId}:${req.ix}:${req.iz}`,
      maximum=mineBlockDurability(verdict.material),
      spent=this.damage.get(key)??0,
      count=(this.hits.get(key)??0)+1,
      work=(this.work.get(key)??0)+mineStrikeWork(accuracy),
      batchFinished=work>=MINE_WORK_PER_CYCLE;
    if(batchFinished&&spent+1>=maximum){
      // Better picks recover a little more ore at the final breakthrough.
      // Only this operation changes the excavated occupancy/chunk revision.
      return this.dig(req,grant,power>=25?2:1);
    }
    let fragment:{itemId:string;quantity:number}|null=null;
    if(batchFinished){
      const cycle=spent+1,bonus=mineInterimReward(
        verdict.material,accuracy,level,req.ix,req.iz,cycle);
      if(!grant(bonus))return {ok:false,reason:'Inventaire plein'};
      fragment=bonus;
      this.damage.set(key,spent+1); // -1 of remaining cell durability.
    }
    this.hits.set(key,count);
    const remainingWork=batchFinished?work-MINE_WORK_PER_CYCLE:work;
    if(remainingWork)this.work.set(key,remainingWork);
    else this.work.delete(key);
    if(this.hits.size>256){
      // Keep all three maps in lock-step to bound save size.
      const oldest=this.hits.keys().next().value!;
      this.hits.delete(oldest);this.damage.delete(oldest);this.work.delete(oldest);
    }
    const remaining=maximum-spent-(batchFinished?1:0);
    const result:StrikeResult={ok:true,partial:true,material:verdict.material,
      progress:Math.min(1,(maximum-remaining+remainingWork/MINE_WORK_PER_CYCLE)/maximum),
      fragment,hits:count,nextResult:mineHitsUntilCycle(remainingWork),
      accuracy,durabilityRemaining:remaining,durabilityMax:maximum};
    this.remember(req.requestId,result);
    return result;
  }
  /** Differences only: excavated bitsets per level/chunk (base64) + revisions + recent request ids. */
  serialize():MineSaveState{
    const levels:MineSaveState['levels']={};
    this.grid.levels.forEach((l,i)=>{const out:Record<string,{r:number;b:string}>={};for(const [k,c]of this.chunks[i])out[k]={r:c.revision,b:encodeBits(c.bits)};if(Object.keys(out).length)levels[l.id]=out;});
    return {mineId:this.grid.zone.id,seed:this.grid.zone.mine.seed,geologyVersion:this.grid.zone.mine.geologyVersion,levels,requests:this.order.slice(-64),miningVersion:2 as const,...(this.damage.size?{damage:Object.fromEntries(this.damage)}:{}),...(this.hits.size?{hits:Object.fromEntries(this.hits)}:{}),...(this.work.size?{work:Object.fromEntries(this.work)}:{})};
  }
  /** Restores excavations (also after a geology change: dug cells never reappear). Returns warnings. */
  restore(save:MineSaveState):string[]{
    const warnings:string[]=[];if(save.mineId!==this.grid.zone.id)throw Error('Sauvegarde d’une autre mine');
    if(save.seed!==this.grid.zone.mine.seed||save.geologyVersion!==this.grid.zone.mine.geologyVersion)warnings.push('Géologie de la mine modifiée depuis la sauvegarde : les cellules creusées restent creusées.');
    this.chunks=this.grid.levels.map(()=>new Map());this.revision=0;this.requests.clear();this.order=[];
    for(const [levelId,chunks]of Object.entries(save.levels)){const level=this.grid.levelIndex(levelId);if(level<0){warnings.push('Niveau supprimé : '+levelId);continue;}
      for(const [key,c]of Object.entries(chunks)){if(!/^-?\d+,-?\d+$/.test(key)||!Number.isInteger(c.r)||c.r<0)throw Error('Chunk de mine invalide');this.chunks[level].set(key,{bits:decodeBits(c.b),revision:c.r});this.revision+=c.r;}}
    this.damage=new Map();this.work=new Map();this.hits=new Map();
    if(save.miningVersion===2){
      this.damage=new Map(Object.entries(save.damage??{}));
      this.work=new Map(Object.entries(save.work??{}));
      this.hits=new Map(Object.entries(save.hits??{}));
    }else{
      // V4/V5 save migration: old damage measured HP (20–500). Convert the
      // fraction to consumed durability and in-cycle work. Never rewind a
      // completed excavation or mint a reward as a side-effect of loading.
      for(const [key,oldHpDamage]of Object.entries(save.damage??{})){
        const match=/^(.+):(-?\d+):(-?\d+)$/.exec(key);
        if(!match)continue;
        const level=this.grid.levelIndex(match[1]);
        if(level<0)continue;
        const material=this.grid.material(level,Number(match[2]),Number(match[3])),
          hp=MINE_MATERIALS[material]?.hp??0,max=mineBlockDurability(material);
        if(!hp||!max)continue;
        const scaled=Math.max(0,Math.min(max-1/MINE_WORK_PER_CYCLE,oldHpDamage/hp*max));
        const spent=Math.floor(scaled),
          work=Math.min(MINE_WORK_PER_CYCLE-1,Math.floor((scaled-spent)*MINE_WORK_PER_CYCLE));
        if(spent)this.damage.set(key,spent);
        if(work)this.work.set(key,work);
      }
      // Old request IDs are retained; old `hits` were counts of individual
      // HP strikes and do not map to the new 3–5-strike harvest cycle.
    }
    for(const id of save.requests){this.order.push(id);this.requests.set(id,{ok:false,reason:'Demande déjà traitée'});}
    return warnings;
  }
}
function encodeBits(bits:Uint32Array){const bytes=new Uint8Array(bits.buffer.slice(0));let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
function decodeBits(text:string){const s=atob(text);if(s.length!==MINE_CHUNK*4)throw Error('Chunk de mine corrompu');const bytes=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);return new Uint32Array(bytes.buffer);}
export function parseMineSave(value:unknown):MineSaveState{
  const v=value as MineSaveState;if(!v||typeof v!=='object'||typeof v.mineId!=='string'||!Number.isFinite(v.seed)||!Number.isFinite(v.geologyVersion)||!v.levels||typeof v.levels!=='object'||!Array.isArray(v.requests)||v.requests.length>64||!v.requests.every(r=>typeof r==='string'&&r.length<=128))throw Error('État de mine invalide');
  if(v.miningVersion!==undefined&&v.miningVersion!==2)throw Error('Version de minage invalide');
  if(v.damage!==undefined&&(typeof v.damage!=='object'||Array.isArray(v.damage)||Object.keys(v.damage).length>256||!Object.entries(v.damage).every(([k,d])=>/^[a-zA-Z0-9_:.-]+:-?\d+:-?\d+$/.test(k)&&Number.isFinite(d)&&d>=0&&d<=1000)))throw Error('État de mine invalide');
  if(v.hits!==undefined&&(typeof v.hits!=='object'||Array.isArray(v.hits)||Object.keys(v.hits).length>256||!Object.entries(v.hits).every(([k,n])=>/^[a-zA-Z0-9_:.-]+:-?\d+:-?\d+$/.test(k)&&Number.isInteger(n)&&n>=0&&n<=10000)))throw Error('Nombre de coups de mine invalide');
  if(v.work!==undefined&&(typeof v.work!=='object'||Array.isArray(v.work)||Object.keys(v.work).length>256||!Object.entries(v.work).every(([k,n])=>/^[a-zA-Z0-9_:.-]+:-?\d+:-?\d+$/.test(k)&&Number.isInteger(n)&&n>=0&&n<MINE_WORK_PER_CYCLE)))throw Error('Progression de minage invalide');
  for(const chunks of Object.values(v.levels))for(const c of Object.values(chunks)){if(!c||typeof c.b!=='string'||c.b.length!==172||!Number.isInteger(c.r))throw Error('État de mine invalide');}
  return structuredClone(v);
}
