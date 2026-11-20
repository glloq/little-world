/**
 * Authored bathymetry (doc 104 §3, doc 21): an offshore depth profile
 * (shallow shelf, drop-off, deep floor) and local seabed shapes — reefs,
 * sandbars, shoals, trenches and blue holes. Applied to the archipelago
 * height only offshore (coast < 0), AFTER the coastal relief fade, so it is
 * never erased and never touches land. Pure analytic data: no voxels, no
 * raster, same result in the Studio, the compiler, workers and the game.
 * Without `bathymetry` the historical single falloff is kept bit for bit.
 */
export interface PointXZ {x:number;z:number}
export type SeabedFeatureV1=
 /** Ridge rising to `crestDepthM` below the surface (coral reef, rocky bar). */
 |{id:string;kind:'reef'|'sandbar';points:PointXZ[];widthM:number;crestDepthM:number}
 /** Round rise (shoal) or pit (trench / blue hole) reaching `depthM` below the surface. */
 |{id:string;kind:'shoal'|'blue-hole';x:number;z:number;radiusM:number;depthM:number}
 /** Elongated canyon along a polyline down to `depthM`. */
 |{id:string;kind:'trench';points:PointXZ[];widthM:number;depthM:number};
export interface BathymetryV1 {
 /** Depth (m) at the outer edge of the shallow shelf. */
 shelfDepthM:number;
 /** Width (m) of the shelf measured from the shore line. */
 shelfWidthM:number;
 /** Horizontal width (m) of the drop-off from the shelf to the deep floor (seabedDepthM). */
 dropWidthM:number;
 features:SeabedFeatureV1[];
}
export const SEABED_FEATURE_LIMIT=64;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const num=(v:unknown,label:string,a:number,b:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<a||v>b)throw Error('Fonds marins : '+label+' invalide');return v;};
const pts=(v:unknown,min:number,max:number):PointXZ[]=>{if(!Array.isArray(v)||v.length<min||v.length>max)throw Error('Fonds marins : tracé invalide');return v.map(q=>{if(!record(q)||Object.keys(q).some(k=>k!=='x'&&k!=='z'))throw Error('Fonds marins : point invalide');return {x:num(q.x,'x',-1e5,1e5),z:num(q.z,'z',-1e5,1e5)};});};
export function parseBathymetry(value:unknown,seabedDepthM:number):BathymetryV1{
 if(!record(value)||Object.keys(value).some(k=>!['shelfDepthM','shelfWidthM','dropWidthM','features'].includes(k)))throw Error('Fonds marins invalides');
 const shelfDepthM=num(value.shelfDepthM,'profondeur du plateau',1,Math.max(1,seabedDepthM)),shelfWidthM=num(value.shelfWidthM,'largeur du plateau',0,3000),dropWidthM=num(value.dropWidthM,'largeur du tombant',5,2000);
 if(!Array.isArray(value.features)||value.features.length>SEABED_FEATURE_LIMIT)throw Error(`Fonds marins : ${SEABED_FEATURE_LIMIT} formes au maximum`);
 const ids=new Set<string>();
 const features=value.features.map((f):SeabedFeatureV1=>{
  if(!record(f)||typeof f.id!=='string'||!/^[a-zA-Z0-9_.:-]{1,80}$/.test(f.id)||ids.has(f.id))throw Error('Fonds marins : identifiant invalide');ids.add(f.id);
  if(f.kind==='reef'||f.kind==='sandbar'){if(Object.keys(f).some(k=>!['id','kind','points','widthM','crestDepthM'].includes(k)))throw Error('Fonds marins : champ inconnu');return {id:f.id,kind:f.kind,points:pts(f.points,2,64),widthM:num(f.widthM,'largeur',4,600),crestDepthM:num(f.crestDepthM,'profondeur de crête',.3,200)};}
  if(f.kind==='shoal'||f.kind==='blue-hole'){if(Object.keys(f).some(k=>!['id','kind','x','z','radiusM','depthM'].includes(k)))throw Error('Fonds marins : champ inconnu');return {id:f.id,kind:f.kind,x:num(f.x,'x',-1e5,1e5),z:num(f.z,'z',-1e5,1e5),radiusM:num(f.radiusM,'rayon',4,1500),depthM:num(f.depthM,'profondeur',.3,400)};}
  if(f.kind==='trench'){if(Object.keys(f).some(k=>!['id','kind','points','widthM','depthM'].includes(k)))throw Error('Fonds marins : champ inconnu');return {id:f.id,kind:'trench',points:pts(f.points,2,64),widthM:num(f.widthM,'largeur',4,600),depthM:num(f.depthM,'profondeur',1,400)};}
  throw Error('Fonds marins : forme inconnue');
 });
 return {shelfDepthM,shelfWidthM,dropWidthM,features};
}
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
/** Depth (m, positive) of the offshore profile at `offshore` metres from the shore line. */
export function profileDepth(b:Pick<BathymetryV1,'shelfDepthM'|'shelfWidthM'|'dropWidthM'>,seabedDepthM:number,offshore:number):number{
 const d=Math.max(0,offshore);
 // The beach slope reaches the shelf depth within ~90 m (moorings, ports), then the shelf stays flat.
 if(d<=b.shelfWidthM)return 1+(b.shelfDepthM-1)*smooth(0,Math.max(1,Math.min(90,b.shelfWidthM*.35)),d);
 return b.shelfDepthM+(Math.max(b.shelfDepthM,seabedDepthM)-b.shelfDepthM)*smooth(b.shelfWidthM,b.shelfWidthM+b.dropWidthM,d);
}
function polyDist(points:readonly PointXZ[],x:number,z:number){let best=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1))),ex=x-a.x-t*dx,ez=z-a.z-t*dz,d=ex*ex+ez*ez;if(d<best)best=d;}return Math.sqrt(best);}
interface Compiled {box:{minX:number;maxX:number;minZ:number;maxZ:number};apply(x:number,z:number,h:number,sea:number):number}
function compile(f:SeabedFeatureV1):Compiled{
 if(f.kind==='shoal'||f.kind==='blue-hole'){
  const r=f.radiusM,box={minX:f.x-r,maxX:f.x+r,minZ:f.z-r,maxZ:f.z+r};
  // Shoals rise gently; blue holes have steep walls (most of the depth in the outer 25 %).
  return {box,apply:f.kind==='shoal'
   ?(x,z,h,sea)=>{const d=Math.hypot(x-f.x,z-f.z);if(d>=r)return h;const w=1-smooth(0,r,d);return Math.max(h,h+(sea-f.depthM-h)*w);}
   :(x,z,h,sea)=>{const d=Math.hypot(x-f.x,z-f.z);if(d>=r)return h;const w=smooth(r,r*.7,d);return Math.min(h,h+(sea-f.depthM-h)*w);}};
 }
 const line=f as Extract<SeabedFeatureV1,{points:PointXZ[]}>,xs=line.points.map(p=>p.x),zs=line.points.map(p=>p.z),pad=line.widthM;
 const box={minX:Math.min(...xs)-pad,maxX:Math.max(...xs)+pad,minZ:Math.min(...zs)-pad,maxZ:Math.max(...zs)+pad};
 if(line.kind==='trench'){const t=line;return {box,apply:(x,z,h,sea)=>{const d=polyDist(t.points,x,z);if(d>=t.widthM)return h;const w=smooth(t.widthM,t.widthM*.45,d);return Math.min(h,h+(sea-t.depthM-h)*w);}};}
 const r=line as Extract<SeabedFeatureV1,{crestDepthM:number}>;
 // Reefs: flat-topped steep ridge; sandbars: rounded low ridge.
 const sharp=r.kind==='reef';
 return {box,apply:(x,z,h,sea)=>{const d=polyDist(r.points,x,z);if(d>=r.widthM)return h;const w=sharp?smooth(r.widthM,r.widthM*.55,d):1-smooth(0,r.widthM,d);return Math.max(h,h+(sea-r.crestDepthM-h)*w);}};
}
/**
 * Offshore height post-process: `offshore` is the distance from the shore line
 * (>0 at sea). The shape blends in over the first 20 m offshore so beaches stay intact.
 */
export function compileSeabedFeatures(b:BathymetryV1|undefined):((x:number,z:number,h:number,sea:number,offshore:number)=>number)|null{
 if(!b?.features.length)return null;
 const list=b.features.map(compile);
 return (x,z,h,sea,offshore)=>{
  if(offshore<=0)return h;
  const fade=smooth(0,20,offshore);let out=h;
  for(const c of list){const box=c.box;if(x<box.minX||x>box.maxX||z<box.minZ||z>box.maxZ)continue;out=c.apply(x,z,out,sea);}
  // Never raise the seabed above the surface: reefs and shoals stay submerged.
  out=Math.min(out,sea-.3);
  return h+(out-h)*fade;
 };
}
