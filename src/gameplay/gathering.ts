/** Gathering V1 — felling trees (logs), picking fruits, mushrooms, flowers and reeds from the
 * procedural natural dressing, and fishing. Pure logic (no Three.js):
 *  - targets are read from the SAME deterministic generator as the renderer (seed + cell), so a
 *    tree the player sees is the tree the rules know, whatever the LOD;
 *  - only what the player changed is stored: one entry per gathered element (stable key from
 *    dressing version + cell + kind + index) with its time, removed when it has grown back;
 *  - every harvest is validated (tool, reach, regrowth) and granted atomically by the runtime.
 * No identifier is ever created for untouched vegetation (doc 18). */
import {DRESSING_CELL_M,DRESSING_VERSION,ITEM_STRIDE,generateDressingCell,type DressingCell,type DressingKind} from '../geography/dressing.ts';
import type {GeoContext} from '../geography/classify.ts';
import {SPECIES} from '../world-production/biotopes.ts';

export type GatherKind='fell'|'pick'|'collect';
export interface GatherRule {action:GatherKind;label:string;tool?:string;strikes:number;yields:{itemId:string;min:number;max:number};regrowSeconds:number;hides:boolean}
/** What each library species gives (data). Trees without a rule can only be felled. */
const FRUIT:Record<string,string>={'nature.fruit_apple':'food:apple','nature.fruit_pear':'food:pear','nature.fruit_plum':'food:plum','nature.fruit_cherry':'food:cherry'};
export function ruleFor(speciesId:string,kind:DressingKind,hasFruit:boolean):GatherRule|null{
  if(FRUIT[speciesId]&&hasFruit)return {action:'pick',label:'Cueillir',strikes:1,yields:{itemId:FRUIT[speciesId],min:2,max:4},regrowSeconds:600,hides:false};
  if(kind==='pine'||kind==='oak'){const small=speciesId==='nature.sapling_thin';return {action:'fell',label:'Abattre',tool:'tool:axe',strikes:small?3:speciesId==='nature.pine'?9:7,yields:{itemId:'wood:log',min:small?1:2,max:small?1:5},regrowSeconds:1800,hides:true};}
  if(kind==='deadwood')return {action:'fell',label:'Débiter',tool:'tool:axe',strikes:3,yields:{itemId:'wood:log',min:1,max:2},regrowSeconds:3600,hides:true};
  if(speciesId==='nature.mushrooms_patch'||speciesId==='nature.mushroom_tall')return {action:'collect',label:'Ramasser des champignons',strikes:1,yields:{itemId:'forage:mushroom',min:1,max:3},regrowSeconds:900,hides:true};
  if(speciesId==='nature.wildflowers_patch'||speciesId==='nature.flowers_tall')return {action:'collect',label:'Cueillir des fleurs',strikes:1,yields:{itemId:'forage:flower',min:1,max:2},regrowSeconds:700,hides:true};
  if(speciesId==='nature.reeds_patch')return {action:'collect',label:'Couper des roseaux',strikes:1,yields:{itemId:'forage:reed',min:1,max:3},regrowSeconds:900,hides:true};
  return null;
}
export interface GatherTarget {key:string;cx:number;cz:number;kind:DressingKind;index:number;speciesId:string;x:number;y:number;z:number;rule:GatherRule;hits:number;distance:number}
export interface GatherSave {schemaVersion:1;gathered:Record<string,number>}
export const GATHER_REACH=2.8;
const KINDS:DressingKind[]=['pine','oak','plant','deadwood'];
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0)/4294967296;};
export interface GatherDeps {ctx:()=>GeoContext;seed:number;inside(x:number,z:number):boolean;time():number;grant(changes:{itemId:string;quantity:number}[]):boolean;has(itemId:string):boolean}
export function createGathering(deps:GatherDeps){
  const cells=new Map<string,DressingCell>(),gathered=new Map<string,{t:number;action:GatherKind;regrow:number}>(),hits=new Map<string,number>();
  const listeners=new Set<(t:{x:number;z:number;key:string})=>void>();
  function cell(cx:number,cz:number){const k=cx+':'+cz;let c=cells.get(k);if(!c){c=generateDressingCell(deps.ctx(),deps.seed,cx,cz,deps.inside);cells.set(k,c);if(cells.size>48)cells.delete(cells.keys().next().value!);}return c;}
  const keyOf=(cx:number,cz:number,kind:DressingKind,i:number)=>`${DRESSING_VERSION}:${cx}:${cz}:${kind}:${i}`;
  /** True while a gathered element has not grown back (also used by the renderer to hide it). */
  /** True while a gathered element has not grown back. */
  function gone(key:string){const g=gathered.get(key);if(!g)return false;if(deps.time()-g.t>=g.regrow){gathered.delete(key);return false;}return true;}
  /** Renderer filter: felled trees, picked mushrooms/flowers/reeds are not drawn until regrowth. */
  function hiddenAt(cx:number,cz:number,kind:DressingKind,index:number){const key=keyOf(cx,cz,kind,index),g=gathered.get(key);return !!g&&g.action!=='pick'&&gone(key);}
  /** Element in front of the player (cone ±60°), nearest first. */
  function target(p:{x:number;y:number;z:number},forward:{x:number;z:number}):GatherTarget|null{
    const len=Math.hypot(forward.x,forward.z)||1,fx=forward.x/len,fz=forward.z/len;let best:GatherTarget|null=null;
    const c0=Math.floor((p.x-GATHER_REACH)/DRESSING_CELL_M),c1=Math.floor((p.x+GATHER_REACH)/DRESSING_CELL_M),r0=Math.floor((p.z-GATHER_REACH)/DRESSING_CELL_M),r1=Math.floor((p.z+GATHER_REACH)/DRESSING_CELL_M);
    for(let cz=r0;cz<=r1;cz++)for(let cx=c0;cx<=c1;cx++){const c=cell(cx,cz);
      for(const kind of KINDS){const a=c.items[kind];for(let i=0;i<a.length;i+=ITEM_STRIDE){const sp=a[i+6];if(sp<0)continue;
        const dx=a[i]-p.x,dz=a[i+2]-p.z,d=Math.hypot(dx,dz);if(d>GATHER_REACH+(kind==='pine'||kind==='oak'?.6:0)||Math.abs(a[i+1]-p.y)>3)continue;
        if(d>.6&&(dx*fx+dz*fz)/d<.5)continue;
        const index=i/ITEM_STRIDE,key=keyOf(cx,cz,kind,index),speciesId=SPECIES[sp].id,g=gone(key)?gathered.get(key):undefined;
        if(g&&g.action!=='pick')continue; // felled or collected, not grown back yet
        const effective=ruleFor(speciesId,kind,!g);if(!effective)continue;
        if(!best||d<best.distance)best={key,cx,cz,kind,index,speciesId,x:a[i],y:a[i+1],z:a[i+2],rule:effective,hits:hits.get(key)??0,distance:d};}}}
    return best;
  }
  /** One strike / pick on the target in front: validated, then granted atomically when done. */
  function act(p:{x:number;y:number;z:number},forward:{x:number;z:number}):{ok:boolean;message:string;done?:boolean;target?:GatherTarget}{
    const t=target(p,forward);if(!t)return {ok:false,message:'Rien à récolter ici'};
    if(t.rule.tool&&!deps.has(t.rule.tool))return {ok:false,message:t.rule.tool==='tool:axe'?'Il faut une hache (comptoir du bûcheron ou marché)':'Outil manquant',target:t};
    const n=(hits.get(t.key)??0)+1;
    if(n<t.rule.strikes){hits.set(t.key,n);return {ok:true,message:`${t.rule.label} : ${n}/${t.rule.strikes}`,target:t};}
    const {itemId,min,max}=t.rule.yields,quantity=min+Math.floor(hash(t.key+':'+deps.time().toFixed(0))*(max-min+1));
    if(!deps.grant([{itemId,quantity}]))return {ok:false,message:'Sac plein',target:t};
    hits.delete(t.key);gathered.set(t.key,{t:deps.time(),action:t.rule.action,regrow:t.rule.regrowSeconds});if(gathered.size>5000)gathered.delete(gathered.keys().next().value!);
    for(const l of listeners)l({x:t.x,z:t.z,key:t.key});
    return {ok:true,done:true,message:`+${quantity}`,target:t};
  }
  return {
    target,act,hiddenAt,
    subscribe(l:(t:{x:number;z:number;key:string})=>void){listeners.add(l);return ()=>listeners.delete(l);},
    /** Saved as « key:action:regrow » → time (only elements not grown back yet). */
    serialize():GatherSave{const out:Record<string,number>={};for(const [k,g]of gathered)if(deps.time()-g.t<g.regrow)out[`${k}:${g.action[0]}:${g.regrow}`]=g.t;return {schemaVersion:1,gathered:out};},
    restore(save?:GatherSave|null){gathered.clear();hits.clear();if(!save){for(const l of listeners)l({x:0,z:0,key:''});return;}const actions:Record<string,GatherKind>={f:'fell',p:'pick',c:'collect'};
      for(const [k,t]of Object.entries(save.gathered)){const parts=k.split(':');if(parts[0]!==String(DRESSING_VERSION))continue;gathered.set(parts.slice(0,5).join(':'),{t,action:actions[parts[5]]??'fell',regrow:Number(parts[6])||1800});}
      for(const l of listeners)l({x:0,z:0,key:''});},
    get count(){return gathered.size;},
  };
}
export type Gathering=ReturnType<typeof createGathering>;
export function parseGatherSave(value:unknown):GatherSave{
  const v=value as GatherSave;if(!v||typeof v!=='object'||v.schemaVersion!==1||!v.gathered||typeof v.gathered!=='object'||Object.keys(v.gathered).length>5000)throw Error('Récoltes sauvegardées invalides');
  for(const [k,t]of Object.entries(v.gathered))if(!/^\d+:-?\d+:-?\d+:[a-z]+:\d+:[fpc]:\d+$/.test(k)||!Number.isFinite(t)||t<0)throw Error('Récolte sauvegardée invalide');
  return structuredClone(v);
}

/** Fishing: cast towards water, wait for a bite, strike in time. Fish depends on the water. */
export type WaterKind='sea'|'river'|'lake';
const FISH:Record<WaterKind,[string,number][]>={sea:[['fish:sardine',5],['fish:mackerel',4],['fish:seabass',2],['fish:golden',.15]],river:[['fish:trout',5],['fish:perch',3],['fish:golden',.1]],lake:[['fish:carp',5],['fish:perch',4],['fish:golden',.1]]};
export interface FishingState {phase:'idle'|'waiting'|'bite';water:WaterKind|null;until:number;castAt:{x:number;z:number}|null}
export function createFishing(rand:()=>number=Math.random){
  const s:FishingState={phase:'idle',water:null,until:0,castAt:null};
  return {
    state:s,
    cast(water:WaterKind,at:{x:number;z:number},now:number){s.phase='waiting';s.water=water;s.castAt=at;s.until=now+2+rand()*5;},
    /** Advance with real time (seconds); returns 'bite' when a fish takes the bait, 'lost' when missed. */
    update(now:number):'bite'|'lost'|null{if(s.phase==='waiting'&&now>=s.until){s.phase='bite';s.until=now+1.3;return 'bite';}if(s.phase==='bite'&&now>=s.until){s.phase='idle';return 'lost';}return null;},
    /** Strike: during a bite returns the fish caught (weighted by water), otherwise null (too early). */
    strike():string|null{if(s.phase!=='bite'){s.phase='idle';return null;}s.phase='idle';const list=FISH[s.water??'sea'],total=list.reduce((t,[,w])=>t+w,0);let r=rand()*total;for(const [id,w]of list){r-=w;if(r<0)return id;}return list[0][0];},
    cancel(){s.phase='idle';},
  };
}
