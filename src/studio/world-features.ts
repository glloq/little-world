import {node,button,field,input,numberInput} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {PolylineTarget} from './viewport/polyline-tool.ts';
import {putPath,removePath,putWater,removeWater} from '../studio-core/source.ts';
import {putZone,removeZone,validateZone,polygonArea,ZONE_KINDS} from '../studio-core/zones.ts';
import {lineChunkIds,waterEditChunkIds} from '../water/sectors.ts';
import {compileWaterBody} from '../water/profile.ts';
import {sourceTerrainHeight} from '../terrain.ts';
import type {ActivityZoneV3} from '../studio-core/types.ts';
import type {PathDefinition,WaterBody} from '../world-data.ts';

/** E6 — lines (paths, rivers) and activity zones edited in the 3D view with the shared
 * polyline tool. Every validation goes through the existing V3 validators. */
export interface FeatureContext {session:StudioSession;edit(target:PolylineTarget):void;status(text:string,error?:boolean):void;focus(x:number,z:number):void;}
const length=(pts:{x:number;z:number}[])=>pts.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-pts[i].x,p.z-pts[i].z),0);
/** Manual river heights follow a change of point count by interpolation along the line. */
export function resampleLevels(levels:number[],before:{x:number;z:number}[],after:{x:number;z:number}[]):number[]{
  if(levels.length===after.length)return [...levels];
  const cumulative=(pts:{x:number;z:number}[])=>{const out=[0];for(let i=1;i<pts.length;i++)out.push(out[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z));return out.map(v=>v/(out.at(-1)||1));};
  const a=cumulative(before),b=cumulative(after);
  return b.map(t=>{let i=1;while(i<a.length-1&&a[i]<t)i++;const k=(t-a[i-1])/((a[i]-a[i-1])||1);return levels[i-1]+(levels[i]-levels[i-1])*Math.min(1,Math.max(0,k));});
}
export function riverWithPoints(water:WaterBody,points:{x:number;z:number}[]):WaterBody{
  const profile=water.profile?.mode==='manual'?{mode:'manual' as const,levels:resampleLevels(water.profile.levels,water.points,points)}:water.profile;
  return {...structuredClone(water),points:points.map(p=>({x:p.x,z:p.z})),...(profile?{profile}:{})};
}
function riverRemark(water:WaterBody):string|null{const d=compileWaterBody(water,sourceTerrainHeight).diagnostics;const first=d.find(v=>v.severity==='ERROR')??d[0];return first?first.message:null;}
export function mountPathsPanel(host:HTMLElement,ctx:FeatureContext){
  const s=ctx.session,p=s.document;let width=3;
  const newPath=():PolylineTarget=>({label:'Nouveau chemin',points:[],min:2,max:100,color:0xc9a46a,commit:async points=>{const path:PathDefinition={id:'path:'+crypto.randomUUID(),points,width};await s.change('Tracer un chemin',lineChunkIds(p.world,path),d=>putPath(d,path));}});
  const newRiver=():PolylineTarget=>{const base:WaterBody={id:crypto.randomUUID(),points:[],width:8,depth:2,level:4,profile:{mode:'terrain',offset:-.35}};
    return {label:'Nouvelle rivière (de la source vers l’aval)',points:[],min:2,max:100,color:0x4fa3d1,diagnose:points=>riverRemark({...base,points}),commit:async points=>{const water={...base,points};await s.change('Tracer une rivière',waterEditChunkIds(p,undefined,water),d=>putWater(d,water));}};};
  host.append(node('div','CHEMINS ET RIVIÈRES','kicker'),node('h3','Tracés du monde'),field('Largeur des nouveaux chemins (m)',numberInput(width,v=>width=Math.max(1,Math.min(40,v||3)),1,40)),
    button('Nouveau chemin',()=>ctx.edit(newPath()),'primary-button'),button('Nouvelle rivière',()=>ctx.edit(newRiver())),
    node('p','Clic : ajouter des points · glisser un point pour le déplacer · Entrée : valider. Les rivières suivent le relief ; les incohérences de profil s’affichent pendant le tracé.','muted'));
  const list=node('div','','feature-list');
  for(const path of Object.values(p.libraries.paths)){
    const row=node('div','','feature-row');row.append(node('strong',`Chemin · ${Math.round(length(path.points))} m`),
      button('Voir',()=>ctx.focus(path.points[0].x,path.points[0].z)),
      button('Éditer les points',()=>ctx.edit({label:'Chemin',points:path.points,min:2,max:100,color:0xc9a46a,commit:async points=>{const next={...path,points};await s.change('Modifier un chemin',[...new Set([...lineChunkIds(p.world,path),...lineChunkIds(p.world,next)])],d=>putPath(d,next));}})),
      button('Supprimer',async()=>{try{await s.change('Supprimer un chemin',lineChunkIds(p.world,path),d=>removePath(d,path.id));}catch(e){ctx.status(String(e),true);}}));list.append(row);
  }
  for(const water of Object.values(p.libraries.water)){
    const row=node('div','','feature-row');row.append(node('strong',`Rivière · ${Math.round(length(water.points))} m`),
      button('Voir',()=>ctx.focus(water.points[0].x,water.points[0].z)),
      button('Éditer les points',()=>ctx.edit({label:'Rivière',points:water.points,min:2,max:100,color:0x4fa3d1,diagnose:points=>riverRemark(riverWithPoints(water,points)),commit:async points=>{const next=riverWithPoints(water,points);await s.change('Modifier une rivière',waterEditChunkIds(p,water,next),d=>putWater(d,next));}})),
      button('Supprimer',async()=>{try{await s.change('Supprimer une rivière',waterEditChunkIds(p,water,undefined),d=>removeWater(d,water.id));}catch(e){ctx.status(String(e),true);}}));list.append(row);
  }
  if(!list.children.length)list.append(node('p','Aucun chemin ni rivière pour l’instant.','muted'));
  host.append(node('h4','Tracés existants'),list);
}
export function mountZonesPanel(host:HTMLElement,ctx:FeatureContext){
  const s=ctx.session,p=s.document;let levels=3;
  const zoneTarget=(kind:ActivityZoneV3['kind'],existing?:ActivityZoneV3):PolylineTarget=>{
    const make=(polygon:{x:number;z:number}[]):ActivityZoneV3=>({id:existing?.id??'zone:'+crypto.randomUUID(),kind,name:existing?.name??(kind==='mine'?'Mine':'Parcelle')+' '+(Object.keys(p.libraries.zones??{}).length+1),polygon,...(kind==='mine'?{levels:existing?.levels??levels}:{})});
    return {label:(existing?'Contour : ':'Nouvelle ')+(existing?.name??ZONE_KINDS[kind].toLowerCase()),points:existing?.polygon??[],min:3,max:64,closed:true,color:kind==='mine'?0x8a5a3c:0xd9a520,
      diagnose:points=>{try{validateZone(make(points),p.world);return null;}catch(e){return String(e instanceof Error?e.message:e);}},
      commit:async points=>{const zone=make(points);await s.change(existing?'Modifier une zone':'Dessiner '+ZONE_KINDS[kind].toLowerCase(),[],d=>putZone(d,zone));}};
  };
  host.append(node('div','ZONES D’ACTIVITÉ','kicker'),node('h3','Parcelles et mines'),node('p','Les limites sont des données auteur (contrat V3) : le moteur de mine et d’agriculture n’est pas encore implémenté.','muted'),
    button('Nouvelle parcelle agricole',()=>ctx.edit(zoneTarget('farm-plot')),'primary-button'),field('Niveaux des nouvelles mines',numberInput(levels,v=>levels=Math.max(1,Math.min(8,Math.round(v)||1)),1,8,'1')),button('Nouvelle mine',()=>ctx.edit(zoneTarget('mine'))));
  const list=node('div','','feature-list');
  for(const zone of Object.values(p.libraries.zones??{})){
    const row=node('div','','feature-row'),update=async(label:string,next:ActivityZoneV3)=>{try{await s.change(label,[],d=>putZone(d,next));}catch(e){ctx.status(String(e instanceof Error?e.message:e),true);}};
    row.append(node('strong',`${ZONE_KINDS[zone.kind]} · ${Math.round(polygonArea(zone.polygon))} m²`),field('Nom de la zone',input(zone.name,v=>void update('Renommer une zone',{...zone,name:v}))));
    if(zone.kind==='mine')row.append(field('Niveaux',numberInput(zone.levels??1,v=>void update('Niveaux de la mine',{...zone,levels:Math.round(v)}),1,8,'1')));
    row.append(button('Voir',()=>ctx.focus(zone.polygon[0].x,zone.polygon[0].z)),button('Éditer le contour',()=>ctx.edit(zoneTarget(zone.kind,zone))),button('Supprimer',async()=>{await s.change('Supprimer une zone',[],d=>removeZone(d,zone.id));}));list.append(row);
  }
  if(!list.children.length)list.append(node('p','Aucune zone dessinée.','muted'));
  host.append(node('h4','Zones du projet'),list);
}
