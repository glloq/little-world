/** MINE-1 — authoring contract and deterministic geology of a 2.5D multi-level mine.
 * A mine is an activity zone (`kind: 'mine'`) with optional settings: stable level ids with
 * explicit floor altitudes, an entrance, stair connectors between adjacent levels, initial
 * galleries and a geology seed/version. Cells are 1 × 1 m, addressed by absolute world cell
 * coordinates (ix = floor(x), iz = floor(z)); chunks are 32 × 32 cells. Pure module. */
import type {PointXZ} from '../studio-core/types.ts';

export const MINE_CELL=1,MINE_CHUNK=32,MINE_GEOLOGY_VERSION=1;
export interface MineLevelV3 {id:string;name:string;floorY:number;height:number}
/** Stairs between two adjacent levels at a world cell (open on both levels). */
export interface MineConnectorV3 {id:string;upper:string;lower:string;x:number;z:number}
export interface MineGalleryV3 {levelId:string;minX:number;maxX:number;minZ:number;maxZ:number}
export interface MineSettingsV3 {seed:number;geologyVersion:1;entrance:{x:number;z:number;heading:number};levels:MineLevelV3[];connectors:MineConnectorV3[];galleries:MineGalleryV3[]}
export interface MineZone {id:string;name:string;polygon:PointXZ[];mine:MineSettingsV3}

/** Materials: palette versioned with the geology (never 256 kinds of 3D objects). */
/** `hp` = hit points of a cell (20 … 500): strikes remove `power` each (hands 2, pickaxe 8, steel 25).
 * `fragment` = chance per non-final strike to break off one unit of the cell's resource. */
export interface MineMaterial {id:number;key:string;name:string;color:number;diggable:boolean;item?:string;hp:number;fragment:number}
export const MINE_MATERIALS:MineMaterial[]=[
  {id:0,key:'air',name:'Vide',color:0,diggable:false,hp:0,fragment:0},
  {id:1,key:'dirt',name:'Terre',color:0x7a5a3e,diggable:true,hp:20,fragment:0},
  {id:2,key:'rock',name:'Roche',color:0x7d7a76,diggable:true,item:'mine:stone',hp:60,fragment:.15},
  {id:3,key:'hard',name:'Roche dure',color:0x5c5a5f,diggable:true,item:'mine:stone',hp:150,fragment:.12},
  {id:4,key:'iron',name:'Filon de fer',color:0xa0643c,diggable:true,item:'mine:iron',hp:220,fragment:.06},
  {id:5,key:'crystal',name:'Cristal',color:0x63c7d8,diggable:true,item:'mine:crystal',hp:500,fragment:.03},
  {id:6,key:'bedrock',name:'Roche mère (protégée)',color:0x3a3638,diggable:false,hp:0,fragment:0},
];
export const MINE_ITEMS=[{id:'mine:stone',name:'Pierre',category:'mine',maxQuantity:999,description:'Roche taillée en creusant les galeries.'},{id:'mine:iron',name:'Minerai de fer',category:'mine',maxQuantity:999,description:'Extrait des filons rouillés des mines.'},{id:'mine:crystal',name:'Cristal',category:'mine',maxQuantity:999,description:'Rare, il brille dans les amas des parois.'}];

const finite=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=64&&!/[\u0000-\u001f]/.test(v);
export function insidePolygon(points:PointXZ[],x:number,z:number):boolean{
  let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;
}
/** Starting settings for a freshly drawn mine zone: levels below the entrance ground. */
export function defaultMineSettings(polygon:PointXZ[],levels:number,groundY:number,seed=1):MineSettingsV3{
  const xs=polygon.map(p=>p.x),zs=polygon.map(p=>p.z),cx=Math.floor((Math.min(...xs)+Math.max(...xs))/2),z0=Math.floor(Math.min(...zs))+2,top=Math.floor(groundY)-6;
  const list=Array.from({length:levels},(_,i)=>({id:'level-'+(i+1),name:'Niveau '+(i+1),floorY:top-i*7,height:3.5}));
  return {seed,geologyVersion:1,entrance:{x:cx+.5,z:z0+.5,heading:0},levels:list,
    connectors:list.slice(1).map((l,i)=>({id:'stairs-'+(i+1),upper:list[i].id,lower:l.id,x:cx+.5,z:z0+10.5+i*4})),
    galleries:list.map((l,i)=>({levelId:l.id,minX:cx-1,maxX:cx+2,minZ:z0,maxZ:z0+14+i*4}))};
}
/** Validation of the settings against the zone outline (throws a French message). */
export function validateMineSettings(value:unknown,polygon:PointXZ[],levelCount:number):MineSettingsV3{
  const m=value as MineSettingsV3,fail=(t:string)=>{throw Error('Mine : '+t);};
  if(!m||typeof m!=='object'||Array.isArray(m))fail('paramètres invalides');
  for(const k of Object.keys(m))if(!['seed','geologyVersion','entrance','levels','connectors','galleries'].includes(k))fail('champ inconnu '+k);
  if(!Number.isSafeInteger(m.seed)||!finite(m.seed,0,2**31))fail('graine invalide');if(m.geologyVersion!==1)fail('version de géologie inconnue');
  const xs=polygon.map(p=>p.x),zs=polygon.map(p=>p.z),b={minX:Math.min(...xs)-1,maxX:Math.max(...xs)+1,minZ:Math.min(...zs)-1,maxZ:Math.max(...zs)+1};
  const inBox=(x:number,z:number)=>finite(x,b.minX,b.maxX)&&finite(z,b.minZ,b.maxZ);
  if(!m.entrance||!inBox(m.entrance.x,m.entrance.z)||!finite(m.entrance.heading,-10,10))fail('entrée hors de la zone');
  if(!Array.isArray(m.levels)||m.levels.length!==levelCount||levelCount<1||levelCount>8)fail(`${levelCount} niveau(x) attendu(s)`);
  const seen=new Set<string>();
  m.levels.forEach((l,i)=>{if(!id(l.id)||seen.has(l.id))fail('identifiant de niveau invalide ou dupliqué');seen.add(l.id);if(typeof l.name!=='string'||!l.name.trim()||l.name.length>60)fail('nom de niveau requis');
    if(!finite(l.floorY,-2000,2000)||!finite(l.height,2.5,6))fail(`altitude ou hauteur du niveau « ${l.name} » invalide (2,5 à 6 m)`);
    const up=m.levels[i-1];if(up&&up.floorY-(l.floorY+l.height)<1.5)fail(`« ${l.name} » doit être au moins 1,5 m sous le sol de « ${up.name} »`);});
  if(!Array.isArray(m.connectors)||m.connectors.length>32)fail('connexions invalides');
  const index=new Map(m.levels.map((l,i)=>[l.id,i]));const cids=new Set<string>();
  for(const c of m.connectors){if(!id(c.id)||cids.has(c.id))fail('connexion dupliquée');cids.add(c.id);const u=index.get(c.upper),d=index.get(c.lower);if(u===undefined||d===undefined||d!==u+1)fail(`l’escalier « ${c.id} » doit relier deux niveaux voisins`);if(!inBox(c.x,c.z)||!insidePolygon(polygon,c.x,c.z))fail(`l’escalier « ${c.id} » est hors de la zone`);}
  if(!Array.isArray(m.galleries)||m.galleries.length>64)fail('galeries invalides');
  for(const g of m.galleries){if(!index.has(g.levelId)||![g.minX,g.maxX,g.minZ,g.maxZ].every(v=>finite(v,-1e5,1e5))||g.minX>=g.maxX||g.minZ>=g.maxZ||(g.maxX-g.minX)*(g.maxZ-g.minZ)>4096)fail('galerie invalide');}
  return structuredClone(m);
}

// Deterministic noise (integer hash, smooth value noise) — same seed + version = same deposit.
function hash(a:number,b:number,c:number,seed:number){let h=Math.imul(a|0,0x27d4eb2d)^Math.imul(b|0,0x165667b1)^Math.imul(c|0,0x1b873593)^Math.imul(seed|0,0x9e3779b1);h=Math.imul(h^(h>>>15),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);return ((h^(h>>>16))>>>0)/4294967296;}
function noise(x:number,z:number,layer:number,seed:number,scale:number){
  const fx=x/scale,fz=z/scale,ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz,sx=tx*tx*(3-2*tx),sz=tz*tz*(3-2*tz);
  const a=hash(ix,iz,layer,seed),b=hash(ix+1,iz,layer,seed),c=hash(ix,iz+1,layer,seed),d=hash(ix+1,iz+1,layer,seed);
  return a+(b-a)*sx+(c-a)*sz+(a-b-c+d)*sx*sz;
}
/** Initial material of a world cell on level `levelIndex` (0 = top). Veins span several cells
 * (ridged noise bands); crystals form small clusters; deeper levels hold harder rock. */
export function geologyAt(seed:number,levelIndex:number,ix:number,iz:number):number{
  const L=levelIndex*101+7;
  const crystalCell=hash(Math.floor(ix/9),Math.floor(iz/9),L+3,seed);
  if(crystalCell<.3){const ox=Math.floor(ix/9)*9+1+Math.floor(hash(Math.floor(ix/9),Math.floor(iz/9),L+4,seed)*7),oz=Math.floor(iz/9)*9+1+Math.floor(hash(Math.floor(ix/9),Math.floor(iz/9),L+5,seed)*7);if((ix-ox)**2+(iz-oz)**2<=2)return 5;}
  if(Math.abs(noise(ix,iz,L+1,seed,7)-.5)<.045+levelIndex*.008)return 4;
  const n=noise(ix,iz,L,seed,5)+levelIndex*.18;return n<.42?1:n<.95?2:3;
}
/** Same mine with `count` levels: extra levels are added below (7 m apart, stairs and a
 * gallery reaching them), removed levels take their stairs and galleries with them. */
export function withLevelCount(m:MineSettingsV3,count:number):MineSettingsV3{
  const next=structuredClone(m);count=Math.max(1,Math.min(8,Math.round(count)));
  while(next.levels.length>count){const gone=next.levels.pop()!;next.connectors=next.connectors.filter(c=>c.lower!==gone.id&&c.upper!==gone.id);next.galleries=next.galleries.filter(g=>g.levelId!==gone.id);}
  while(next.levels.length<count){
    const last=next.levels.at(-1)!,used=new Set(next.levels.map(l=>l.id));let n=next.levels.length+1;while(used.has('level-'+n))n++;
    const level={id:'level-'+n,name:'Niveau '+(next.levels.length+1),floorY:last.floorY-7,height:last.height};next.levels.push(level);
    const anchor=next.connectors.at(-1)??{x:next.entrance.x,z:next.entrance.z+6},x=Math.floor(anchor.x)+.5,z=Math.floor(anchor.z)+4.5;
    let cid=next.connectors.length+1;while(next.connectors.some(c=>c.id==='stairs-'+cid))cid++;
    next.connectors.push({id:'stairs-'+cid,upper:last.id,lower:level.id,x,z});
    next.galleries.push({levelId:last.id,minX:Math.floor(x)-1,maxX:Math.floor(x)+2,minZ:Math.floor(anchor.z),maxZ:Math.floor(z)+3},{levelId:level.id,minX:Math.floor(x)-1,maxX:Math.floor(x)+2,minZ:Math.floor(z)-2,maxZ:Math.floor(z)+10});
  }
  return next;
}
