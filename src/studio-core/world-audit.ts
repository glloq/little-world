import {auditCirculation} from './circulation.ts';
import {projectLandRegistry} from './land-registry.ts';
/** Authoring diagnostics: quick structural checks, independent from the strict compiler preflight.
 * Warnings guide map creators and never silently block publishing. */
import type {ProjectDocument,PointXZ} from './types.ts';
import type {WaterBody} from '../world-data.ts';
export type AuthoringSeverity='ERROR'|'WARNING'|'INFO';
export interface AuthoringIssue {severity:AuthoringSeverity;code:string;message:string;x:number;z:number;kind?:'entity'|'water'|'path'|'zone';id?:string}
const distance=(a:PointXZ,b:PointXZ)=>Math.hypot(a.x-b.x,a.z-b.z);
export function authoringIssues(project:ProjectDocument):AuthoringIssue[]{
  const issues:AuthoringIssue[]=[],bounds=project.world.bounds;
  const inside=(p:PointXZ)=>p.x>=bounds.minX&&p.x<=bounds.maxX&&p.z>=bounds.minZ&&p.z<=bounds.maxZ;
  const add=(severity:AuthoringSeverity,code:string,message:string,p:PointXZ,kind?:AuthoringIssue['kind'],id?:string)=>{
    issues.push({severity,code,message,x:p.x,z:p.z,kind,id});
  };
  const water=Object.values(project.libraries.water),waterById=new Map(water.map(w=>[w.id,w]));
  for(const w of water){
    if(!w.points.length)continue;
    const from=w.points[0],to=w.points[w.points.length-1],lake=w.kind==='lake';
    for(const p of [from,to])if(!inside(p))add('ERROR','WATER_OUTSIDE','Tracé d’eau hors carte',p,'water',w.id);
    if(lake&&w.points.length<3)add('ERROR','LAKE_OUTLINE','Un lac demande un contour de 3 points',from,'water',w.id);
    if(!lake&&w.points.length>=2&&distance(from,to)<Math.max(3,w.width*.25))add('WARNING','SHORT_RIVER','Rivière sans progression suffisante',from,'water',w.id);
    const links:[string,WaterBody['from']|undefined,PointXZ][]=[['source',w.from,from],['sortie',w.to,to]];
    for(const [label,link,point] of links){
      if(!link)continue;
      if(link.kind==='sea'&&link.id)add('WARNING','SEA_LINK_ID','Lien mer avec identifiant superflu',point,'water',w.id);
      if(link.kind==='sea')continue;
      const target=link.id?waterById.get(link.id):undefined;
      if(!target)add('ERROR','WATER_MISSING_LINK','Connexion '+label+' vers un plan d’eau absent',point,'water',w.id);
      else if(target.id===w.id)add('ERROR','WATER_SELF_LINK','Un cours d’eau ne peut pas se raccorder à lui-même',point,'water',w.id);
      else{
        const candidates=target.points;
        if(candidates.length&&Math.min(...candidates.map(p=>distance(p,point)))>Math.max(w.width,target.width,12)*3)
          add('WARNING','WATER_FAR_LINK','Connexion '+label+' distante : vérifier le raccordement visuel',point,'water',w.id);
      }
    }
  }
  for(const route of Object.values(project.libraries.paths)){
    if(!route.points.length)continue;
    const p=route.points[0],end=route.points[route.points.length-1];
    if(!inside(p)||!inside(end))add('ERROR','PATH_OUTSIDE','Chemin hors limites',p,'path',route.id);
    if(route.points.length<2||distance(p,end)<1)add('WARNING','SHORT_PATH','Chemin très court ou fermé sur lui-même',p,'path',route.id);
  }
  for(const z of Object.values(project.libraries.zones??{})){
    if(!z.polygon.length)continue;
    if(z.polygon.some(p=>!inside(p)))add('ERROR','ZONE_OUTSIDE','Zone hors limites',z.polygon[0],'zone',z.id);
    if(z.polygon.length<3)add('ERROR','ZONE_OUTLINE','Zone incomplète',z.polygon[0],'zone',z.id);
  }
  // Land use (doc 104 §C3): incompatible overlaps between villages, fields, pistes, races, surf…
  const registry=projectLandRegistry(project);
  for(const c of registry.conflicts()){
    const r=registry.get(c.a)!,kind=r.owner.kind==='zone'||r.owner.kind==='path'||r.owner.kind==='water'?r.owner.kind:undefined;
    add('WARNING','LAND_OVERLAP',`Occupations incompatibles (${c.useA} / ${c.useB}) sur ~${c.areaM2} m² : ${c.a} et ${c.b}`,c.at,kind,r.owner.id);
  }
  // Circulation (doc 104 §C5): destinations without a walkable link to the port network.
  for(const d of auditCirculation(project))add('WARNING',d.code,d.message,{x:d.x??0,z:d.z??0});
  for(const entity of Object.values(project.entityIndex)){
    const p=entity.position;
    if(!inside(p))add('ERROR','ENTITY_OUTSIDE','Objet hors limites : '+entity.name,p,'entity',entity.id);
  }
  // No gameplay spawn assumptions: authoring projects can intentionally be empty.
  return issues.sort((a,b)=>({ERROR:0,WARNING:1,INFO:2}[a.severity]-{ERROR:0,WARNING:1,INFO:2}[b.severity])||a.code.localeCompare(b.code));
}

/** Optional content-density audit; deliberately separate from structural compilation gates. */
export {auditPlayability} from './playability-audit.ts';
