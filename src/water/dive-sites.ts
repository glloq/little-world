/**
 * Dive sites (doc 104 §3): author/generator-owned underwater places — reefs,
 * wrecks, drop-offs, blue holes, kelp forests, sea caves — with an entry point
 * at the surface, an outline, a target depth and optional discoveries. Pure
 * data: physics (swim/dive/oxygen) stays in the player controller, rendering in
 * the underwater view. A site is valid only where the real seabed is deep
 * enough (checked by planners and the activity audit, not by the schema).
 */
export const DIVE_SITE_KINDS=['reef','wreck','drop-off','blue-hole','kelp','cave','shoal'] as const;
export type DiveSiteKind=typeof DIVE_SITE_KINDS[number];
export interface DiveDiscovery {id:string;name:string;x:number;y:number;z:number}
export interface DiveSiteV1 {
 version:1;id:string;name:string;kind:DiveSiteKind;
 /** Surface entry (boat mooring or shore point). */
 entry:{x:number;z:number};
 polygon:{x:number;z:number}[];
 /** Target depth below sea level (m) the site is designed around. */
 depthM:number;
 discoveries?:DiveDiscovery[];
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown,label:string,min:number,max:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Site de plongée : '+label+' invalide');return v;};
export function parseDiveSite(value:unknown,bounds:{minX:number;maxX:number;minZ:number;maxZ:number}):DiveSiteV1{
 if(!record(value))throw Error('Site de plongée invalide');
 const allowed=['version','id','name','kind','entry','polygon','depthM','discoveries'];if(Object.keys(value).some(k=>!allowed.includes(k)))throw Error('Site de plongée : champ inconnu');
 if(value.version!==1||typeof value.id!=='string'||!/^[a-zA-Z0-9_.:-]{1,80}$/.test(value.id)||typeof value.name!=='string'||!value.name.trim()||value.name.length>100)throw Error('Site de plongée : identité invalide');
 if(!DIVE_SITE_KINDS.includes(value.kind as DiveSiteKind))throw Error('Site de plongée : type inconnu');
 const inside=(q:unknown)=>{if(!record(q)||Object.keys(q).some(k=>k!=='x'&&k!=='z'))throw Error('Site de plongée : point invalide');const x=finite(q.x,'x',bounds.minX,bounds.maxX),z=finite(q.z,'z',bounds.minZ,bounds.maxZ);return {x,z};};
 if(!Array.isArray(value.polygon)||value.polygon.length<3||value.polygon.length>64)throw Error('Site de plongée : contour invalide');
 const discoveries=value.discoveries===undefined?undefined:(()=>{if(!Array.isArray(value.discoveries)||value.discoveries.length>32)throw Error('Site de plongée : découvertes invalides');const ids=new Set<string>();return value.discoveries.map(d=>{if(!record(d)||Object.keys(d).some(k=>!['id','name','x','y','z'].includes(k))||typeof d.id!=='string'||!/^[a-zA-Z0-9_.:-]{1,80}$/.test(d.id)||ids.has(d.id)||typeof d.name!=='string'||!d.name.trim())throw Error('Site de plongée : découverte invalide');ids.add(d.id);const q=inside({x:d.x,z:d.z});return {id:d.id,name:d.name,x:q.x,y:finite(d.y,'profondeur de découverte',-300,10),z:q.z};});})();
 return {version:1,id:value.id,name:value.name,kind:value.kind as DiveSiteKind,entry:inside(value.entry),polygon:value.polygon.map(inside),depthM:finite(value.depthM,'profondeur',1,300),...(discoveries?{discoveries}:{})};
}
