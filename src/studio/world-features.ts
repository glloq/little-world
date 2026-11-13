import {levelCountPatch} from './activity-inspector.ts';
import {node,button,field,input,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {PolylineTarget} from './viewport/polyline-tool.ts';
import {putPath,removePath,putWater,removeWater} from '../studio-core/source.ts';
import {putZone,removeZone,validateZone,polygonArea,ZONE_KINDS} from '../studio-core/zones.ts';
import {lineChunkIds,waterEditChunkIds} from '../water/sectors.ts';
import {compileWaterBody} from '../water/profile.ts';
import {sourceTerrainHeight,terrainHeight,waterSurface} from '../terrain.ts';
import {pathDiagnostics,snapToPaths,PATH_PROFILES,PATH_KIND_IDS} from '../paths/path-geometry.ts';
import type {ActivityZoneV3} from '../studio-core/types.ts';
import type {PathDefinition,PathKind,WaterBody} from '../world-data.ts';

/** E6 — lines (paths, rivers) and activity zones edited in the 3D view with the shared
 * polyline tool. Every validation goes through the existing V3 validators. */
export interface FeatureContext {session:StudioSession;edit(target:PolylineTarget):void;status(text:string,error?:boolean):void;focus(x:number,z:number):void;
  /** PHYS diagnostics overlay of the 3D view. */physics?:{enabled():boolean;toggle(on:boolean):void};}
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
/** E8 — snapping and live diagnostics shared by the paths panel and the inspector. */
export function pathTarget(s:StudioSession,label:string,base:PathDefinition,commit:(path:PathDefinition)=>Promise<void>):PolylineTarget{
  const p=s.document,others=()=>Object.values(p.libraries.paths).filter(o=>o.id!==base.id);
  return {label,points:base.points,min:2,max:100,color:0xc9a46a,
    snap:q=>snapToPaths(others(),q,Math.max(2.5,base.width)),
    diagnose:points=>{const draft={...base,points};const d=pathDiagnostics([...others(),draft],PATH_ENV).find(v=>v.pathId===base.id);return d?d.message:null;},
    commit:points=>commit({...base,points})};
}
export const PATH_ENV={height:terrainHeight,water:waterSurface};
export function mountPathsPanel(host:HTMLElement,ctx:FeatureContext){
  const s=ctx.session,p=s.document;let width=3,kind:PathKind='dirt',smooth=true;
  const newPath=():PolylineTarget=>pathTarget(s,'Nouveau chemin',{id:'path:'+crypto.randomUUID(),points:[],width,kind,smooth},async path=>{await s.change('Tracer un chemin',lineChunkIds(p.world,path),d=>putPath(d,path));});
  const newRiver=():PolylineTarget=>{const base:WaterBody={id:crypto.randomUUID(),points:[],width:8,depth:2,level:4,profile:{mode:'terrain',offset:-.35}};
    return {label:'Nouvelle rivière (de la source vers l’aval)',points:[],min:2,max:100,color:0x4fa3d1,diagnose:points=>riverRemark({...base,points}),commit:async points=>{const water={...base,points};await s.change('Tracer une rivière',waterEditChunkIds(p,undefined,water),d=>putWater(d,water));}};};
  const smoothBox=node('input');smoothBox.type='checkbox';smoothBox.checked=smooth;smoothBox.onchange=()=>{smooth=smoothBox.checked;};
  host.append(node('div','CHEMINS ET RIVIÈRES','kicker'),node('h3','Tracés du monde'),
    field('Type des nouveaux chemins',select(kind,PATH_KIND_IDS.map(k=>[k,PATH_PROFILES[k].label] as [string,string]),v=>{kind=v as PathKind;})),
    field('Largeur des nouveaux chemins (m)',numberInput(width,v=>width=Math.max(1,Math.min(40,v||3)),1,40)),field('Courbes adoucies',smoothBox),
    button('Nouveau chemin',()=>ctx.edit(newPath()),'primary-button'),button('Nouvelle rivière',()=>ctx.edit(newRiver())),
    node('p','Clic : ajouter des points (aimantés aux chemins existants pour les raccords) · glisser un point pour le déplacer · Entrée : valider. Pentes et raccords incohérents s’affichent pendant le tracé.','muted'));
  const list=node('div','','feature-list');
  const diagnostics=pathDiagnostics(Object.values(p.libraries.paths),PATH_ENV);
  for(const path of Object.values(p.libraries.paths)){
    const row=node('div','','feature-row'),issues=diagnostics.filter(d=>d.pathId===path.id);
    row.append(node('strong',`${PATH_PROFILES[path.kind??'dirt'].label} · ${Math.round(length(path.points))} m`),...issues.map(d=>node('p','⚠ '+d.message,'muted')),
      button('Voir',()=>ctx.focus(path.points[0].x,path.points[0].z)),
      button('Éditer les points',()=>ctx.edit(pathTarget(s,'Chemin',path,async next=>{await s.change('Modifier un chemin',[...new Set([...lineChunkIds(p.world,path),...lineChunkIds(p.world,next)])],d=>putPath(d,next));}))),
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
    const make=(polygon:{x:number;z:number}[]):ActivityZoneV3=>({id:existing?.id??'zone:'+crypto.randomUUID(),kind,name:existing?.name??(kind==='mine'?'Mine':'Parcelle')+' '+(Object.keys(p.libraries.zones??{}).length+1),polygon,...(kind==='mine'?{levels:existing?.levels??levels}:{}),...(existing?.mine?{mine:existing.mine}:{}),...(existing?.farm?{farm:existing.farm}:{})});
    return {label:(existing?'Contour : ':'Nouvelle ')+(existing?.name??ZONE_KINDS[kind].toLowerCase()),points:existing?.polygon??[],min:3,max:64,closed:true,color:kind==='mine'?0x8a5a3c:0xd9a520,
      diagnose:points=>{try{validateZone(make(points),p.world);return null;}catch(e){return String(e instanceof Error?e.message:e);}},
      commit:async points=>{const zone=make(points);await s.change(existing?'Modifier une zone':'Dessiner '+ZONE_KINDS[kind].toLowerCase(),[],d=>putZone(d,zone));}};
  };
  host.append(node('div','ZONES D’ACTIVITÉ','kicker'),node('h3','Parcelles et mines'),node('p','Dessinez une zone, puis réglez ses niveaux, son entrée, sa géologie ou ses cultures dans l’inspecteur. « Jouer ici » permet de creuser et de cultiver sur une copie de test.','muted'),
    button('Nouvelle parcelle agricole',()=>ctx.edit(zoneTarget('farm-plot')),'primary-button'),field('Niveaux des nouvelles mines',numberInput(levels,v=>levels=Math.max(1,Math.min(8,Math.round(v)||1)),1,8,'1')),button('Nouvelle mine',()=>ctx.edit(zoneTarget('mine'))));
  if(ctx.physics){const overlay=node('input');overlay.type='checkbox';overlay.checked=ctx.physics.enabled();overlay.onchange=()=>ctx.physics!.toggle(overlay.checked);
    host.append(field('Diagnostic physique : volumes de collision, pentes infranchissables, niveaux de mine',overlay));}
  const list=node('div','','feature-list');
  for(const zone of Object.values(p.libraries.zones??{})){
    const row=node('div','','feature-row'),update=async(label:string,next:ActivityZoneV3)=>{try{await s.change(label,[],d=>putZone(d,next));}catch(e){ctx.status(String(e instanceof Error?e.message:e),true);}};
    row.append(node('strong',`${ZONE_KINDS[zone.kind]} · ${Math.round(polygonArea(zone.polygon))} m²`),field('Nom de la zone',input(zone.name,v=>void update('Renommer une zone',{...zone,name:v}))));
    if(zone.kind==='mine')row.append(field('Niveaux',numberInput(zone.levels??1,v=>void update('Niveaux de la mine',{...zone,...levelCountPatch(zone,v)}),1,8,'1')));
    row.append(button('Voir',()=>ctx.focus(zone.polygon[0].x,zone.polygon[0].z)),button('Éditer le contour',()=>ctx.edit(zoneTarget(zone.kind,zone))),button('Supprimer',async()=>{await s.change('Supprimer une zone',[],d=>removeZone(d,zone.id));}));list.append(row);
  }
  if(!list.children.length)list.append(node('p','Aucune zone dessinée.','muted'));
  host.append(node('h4','Zones du projet'),list);
}
