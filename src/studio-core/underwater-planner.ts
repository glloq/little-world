/**
 * Underwater planner (doc 104 §3): authored bathymetry for a composed island
 * (shelf, drop-off, reefs parallel to the coast, blue holes, an offshore
 * trench) and dive sites derived from it, with discoveries and an optional
 * wreck. Keeps away from the port approach and surf breaks; everything is
 * ordinary source data (archipelago.bathymetry, libraries.diveSites, props).
 */
import type {ProjectDocument} from './types.ts';
import type {PlanDiagnostic} from './world-plan.ts';
import type {BathymetryV1,SeabedFeatureV1} from '../geography/bathymetry.ts';
import type {DiveSiteV1} from '../water/dive-sites.ts';
import {generatorField} from '../terrain-generator.ts';
import {projectGeography} from './geo-context.ts';
import {chunkAt} from './schema.ts';
import {putEntity} from './source.ts';

import {assetDefinitionFor} from '../world-production/registry.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';

export interface UnderwaterRequest {shelf:'narrow'|'wide';reefs:number;holes:number;trench:boolean}
export const SHELF={narrow:{shelfDepthM:12,shelfWidthM:150,dropWidthM:110},wide:{shelfDepthM:9,shelfWidthM:320,dropWidthM:180}} as const;
const rnd=(seed:number,i:number)=>{const v=parseInt(fingerprint([seed,i]).slice(0,8),16);return v/0xffffffff;};
const round=(v:number)=>Math.round(v*10)/10;
/** Wrecks rest listed on one side (≈ 28° roll, slight pitch) after the yaw. */
function wreckQuaternion(yaw:number){
 const q=(ax:number,ay:number,az:number,a:number)=>({x:ax*Math.sin(a/2),y:ay*Math.sin(a/2),z:az*Math.sin(a/2),w:Math.cos(a/2)});
 const mul=(a:{x:number;y:number;z:number;w:number},b:{x:number;y:number;z:number;w:number})=>({w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z,x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w});
 const r=mul(mul(q(0,1,0,yaw),q(1,0,0,.14)),q(0,0,1,.49));return {x:Math.round(r.x*1e6)/1e6,y:Math.round(r.y*1e6)/1e6,z:Math.round(r.z*1e6)/1e6,w:Math.round(r.w*1e6)/1e6};
}

/** Coast-parallel points at a given offshore distance (sampled on a grid, ordered by angle around the island centre). */
function isobath(p:ProjectDocument,coast:(x:number,z:number)=>number,offshore:number,step=40){
 const b=p.world.bounds,out:{x:number;z:number;a:number}[]=[],cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
 for(let z=b.minZ+step;z<b.maxZ-step;z+=step)for(let x=b.minX+step;x<b.maxX-step;x+=step){const c=-coast(x,z);if(Math.abs(c-offshore)<step*.5)out.push({x,z,a:Math.atan2(z-cz,x-cx)});}
 return out.sort((u,v)=>u.a-v.a);
}

export function planBathymetry(p:ProjectDocument,r:UnderwaterRequest):{bathymetry:BathymetryV1;diagnostics:PlanDiagnostic[]}{
 const t=p.world.terrain;if(t?.kind!=='archipelago')throw Error('Fonds marins : relief insulaire requis');
 const a=t.archipelago,diagnostics:PlanDiagnostic[]=[],shelf=SHELF[r.shelf],seed=p.world.seed;
 const b=p.world.bounds,field=generatorField(t,{width:b.maxX-b.minX,length:b.maxZ-b.minZ,seed,seaLevel:p.world.seaLevel},()=>0);
 const keepOut=[...Object.values(p.chunks).flatMap(c=>Object.values(c.entities)).filter(e=>e.components.State?.initial.portN1Authored===true).map(e=>({x:e.components.Transform!.position.x,z:e.components.Transform!.position.z,r:260})),
  ...Object.values(p.libraries.surfZones??{}).map(z=>({x:(z.minX+z.maxX)/2,z:(z.minZ+z.maxZ)/2,r:Math.hypot(z.maxX-z.minX,z.maxZ-z.minZ)/2+60}))];
 const free=(q:{x:number;z:number},pad=0)=>!keepOut.some(k=>Math.hypot(k.x-q.x,k.z-q.z)<k.r+pad)&&q.x>b.minX+30&&q.x<b.maxX-30&&q.z>b.minZ+30&&q.z<b.maxZ-30;
 const features:SeabedFeatureV1[]=[];
 // Reefs: short coast-parallel ridges on the outer shelf, spread around the island.
 const ring=isobath(p,field.coast,shelf.shelfWidthM*.65);
 for(let i=0;i<r.reefs&&ring.length>6;i++){
  const start=Math.floor((i+rnd(seed,i)*.5)/Math.max(1,r.reefs)*ring.length)%ring.length,pts=[];
  for(let k=0;k<6;k++){const q=ring[(start+k)%ring.length];if(!free(q,40))break;if(pts.length&&Math.hypot(q.x-pts[pts.length-1].x,q.z-pts[pts.length-1].z)>90)break;pts.push({x:round(q.x),z:round(q.z)});}
  if(pts.length>=3)features.push({id:'reef-'+i,kind:'reef',points:pts,widthM:22,crestDepthM:round(1.6+rnd(seed,i+40)*1.6)});
  else diagnostics.push({severity:'WARNING',code:'REEF_SKIPPED',message:'Récif '+(i+1)+' : côte occupée (port, surf) ou trop découpée.'});
 }
 // Blue holes on the shelf, trench beyond the drop-off.
 const mid=isobath(p,field.coast,shelf.shelfWidthM*.45);
 for(let i=0;i<r.holes&&mid.length;i++){const q=mid[Math.floor(rnd(seed,100+i)*mid.length)];if(!free(q,60)||features.some(f=>'x' in f&&Math.hypot(f.x-q.x,f.z-q.z)<160)){diagnostics.push({severity:'WARNING',code:'HOLE_SKIPPED',message:'Trou bleu '+(i+1)+' : emplacement libre introuvable.'});continue;}
  features.push({id:'blue-hole-'+i,kind:'blue-hole',x:round(q.x),z:round(q.z),radiusM:28,depthM:Math.min(a.seabedDepthM+20,45)});}
 if(r.trench){const deep=isobath(p,field.coast,shelf.shelfWidthM+shelf.dropWidthM+80,50);if(deep.length>8){const s=Math.floor(rnd(seed,200)*deep.length),pts=[];for(let k=0;k<6;k++){const q=deep[(s+k*2)%deep.length];if(free(q,40))pts.push({x:round(q.x),z:round(q.z)});}
  if(pts.length>=2)features.push({id:'trench-0',kind:'trench',points:pts,widthM:45,depthM:Math.min(200,a.seabedDepthM+30)});}}
 const bathymetry:BathymetryV1={...shelf,features};
 a.bathymetry=bathymetry;
 return {bathymetry,diagnostics};
}

/** Dive sites from the authored seabed: reefs, blue holes, the drop-off and an optional wreck. */
export function planDiveSites(p:ProjectDocument,o:{max?:number;wreck?:boolean}={}):{sites:DiveSiteV1[];diagnostics:PlanDiagnostic[]}{
 const t=p.world.terrain;if(t?.kind!=='archipelago'||!t.archipelago.bathymetry)return {sites:[],diagnostics:[{severity:'WARNING',code:'DIVE_NO_BATHYMETRY',message:'Aucun fond marin auteur : sites de plongée non planifiés.'}]};
 const bathy=t.archipelago.bathymetry,h=projectGeography(p).ctx.height,sea=p.world.seaLevel,max=o.max??6,sites:DiveSiteV1[]=[],diagnostics:PlanDiagnostic[]=[],b=p.world.bounds;
 const clampPt=(q:{x:number;z:number})=>({x:round(Math.min(b.maxX-1,Math.max(b.minX+1,q.x))),z:round(Math.min(b.maxZ-1,Math.max(b.minZ+1,q.z)))});
 const disc=(c:{x:number;z:number},r:number)=>Array.from({length:12},(_,i)=>clampPt({x:c.x+Math.cos(i/12*Math.PI*2)*r,z:c.z+Math.sin(i/12*Math.PI*2)*r}));
 const discovery=(id:string,name:string,q:{x:number;z:number})=>({id,name,x:round(q.x),z:round(q.z),y:round(Math.min(-1,h(q.x,q.z)-sea+1))});
 for(const f of bathy.features){
  if(sites.length>=max)break;
  if(f.kind==='reef'){const c=f.points[Math.floor(f.points.length/2)],depth=round(sea-h(c.x+f.widthM*.9,c.z));
   sites.push({version:1,id:'dive-'+f.id,name:'Récif '+(sites.length+1),kind:'reef',entry:clampPt(c),polygon:disc(c,70),depthM:Math.max(3,depth),discoveries:[discovery(f.id+'-shell','Coquillage nacré',{x:c.x+6,z:c.z+4})]});}
  else if(f.kind==='blue-hole'){const c={x:f.x,z:f.z};sites.push({version:1,id:'dive-'+f.id,name:'Trou bleu '+(sites.length+1),kind:'blue-hole',entry:clampPt(c),polygon:disc(c,f.radiusM*1.6),depthM:round(sea-h(f.x,f.z)),discoveries:[discovery(f.id+'-pearl','Perle des profondeurs',{x:f.x+3,z:f.z-2})]});}
 }
 // Wreck on the outer shelf: a real boat asset resting on the seabed, with its discovery.
 if(o.wreck!==false&&sites.length<max){
  const ring=isobath(p,(x,z)=>projectGeography(p).ctx.site(x,z).coast,bathy.shelfWidthM+bathy.dropWidthM*.3,60);
  const q=ring.find(r=>!sites.some(s=>Math.hypot(s.entry.x-r.x,s.entry.z-r.z)<250)&&!Object.values(p.chunks).some(c=>Object.values(c.entities).some(e=>e.components.State?.initial.portN1Authored===true&&Math.hypot(e.components.Transform!.position.x-r.x,e.components.Transform!.position.z-r.z)<300)));
  if(q){const id='dive-wreck-0',ground=h(q.x,q.z),asset='boat.sailboat_small',def=assetDefinitionFor(asset);
   if(def){p.assets={...p.assets,[def.id]:def};putEntity(p,{id:id+'-hull',kind:'prop',name:'Épave',ownerChunkId:chunkAt(p.world,q.x,q.z),components:{Transform:{type:'Transform',position:{x:round(q.x),y:0,z:round(q.z)},rotation:wreckQuaternion(rnd(p.world.seed,300)*Math.PI*2),scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:asset}}});}
   sites.push({version:1,id,name:'Épave du '+['Cormoran','Goéland','Albatros'][Math.floor(rnd(p.world.seed,301)*3)],kind:'wreck',entry:clampPt(q),polygon:disc(q,45),depthM:round(Math.max(3,sea-ground)),discoveries:[discovery('wreck-chest','Coffre de l’épave',{x:q.x+2,z:q.z+1})]});}
  else diagnostics.push({severity:'WARNING',code:'WRECK_SKIPPED',message:'Épave : aucun fond libre sur le plateau extérieur.'});
 }
 if(!sites.length)diagnostics.push({severity:'WARNING',code:'DIVE_SITES_MISSING',message:'Aucun site de plongée planifié.'});
 p.libraries.diveSites={...(p.libraries.diveSites??{}),...Object.fromEntries(sites.map(s=>[s.id,s]))};
 return {sites,diagnostics};
}
