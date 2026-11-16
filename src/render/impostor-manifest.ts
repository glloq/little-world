/** Derived render data only, deliberately absent from V3 authoring/save schemas. */
export interface AtlasEntry {id:string;first:number;views:number;elevations:number[];frames:number;fps:number;sourceHash:string}
export interface AtlasPage {image:string;width:number;height:number;tile:number;columns:number;rows:number;anchors:number[][];crops?:number[][];entries:AtlasEntry[];inputHash:string}
export interface ImpostorManifest {schemaVersion:1;pages:Record<string,AtlasPage>}
export const IMPOSTOR_LIMITS={maxAtlasBytes:12*1024*1024,maxFrames:1024,sectorM:256,maxSectorInstances:512,maxSectors:32,maxSprites:4096} as const;
export function parseImpostorManifest(value:unknown):ImpostorManifest{
 const m=value as ImpostorManifest;if(!m||m.schemaVersion!==1||!m.pages||typeof m.pages!=='object')throw Error('Manifeste imposteur invalide');
 let bytes=0;
 for(const [kind,p]of Object.entries(m.pages)){
  if(!['trees','characters','buildings'].includes(kind)||!p||!/^impostors\/[a-z0-9.-]+\.png$/.test(p.image))throw Error('Page imposteur invalide');
  if(![p.width,p.height,p.tile,p.columns,p.rows].every(n=>Number.isInteger(n)&&n>0)||p.width>2048||p.height>2048||p.width!==p.columns*p.tile||p.height!==p.rows*p.tile)throw Error('Dimensions atlas invalides');
  if(!Array.isArray(p.anchors)||!p.anchors.length||p.anchors.length>IMPOSTOR_LIMITS.maxFrames||p.anchors.length>p.columns*p.rows||p.anchors.some(a=>!Array.isArray(a)||a.length!==3||a.some(n=>!Number.isFinite(n))||a[0]<-1||a[0]>2||a[1]<-1||a[1]>2||a[2]<=0||a[2]>500))throw Error('Ancrages invalides');
  if(p.crops!==undefined&&(!Array.isArray(p.crops)||p.crops.length!==p.anchors.length||p.crops.some(c=>!Array.isArray(c)||c.length!==4||c.some(n=>!Number.isFinite(n)||n<0||n>1)||c[0]>=c[2]||c[1]>=c[3])))throw Error('Recadrages invalides');
  if(!Array.isArray(p.entries)||p.entries.length>128)throw Error('Index atlas invalide');
  const used=new Set<string>();for(const e of p.entries){if(!e.id||used.has(e.id)||!Number.isInteger(e.first)||e.first<0||e.views!==4||!Number.isInteger(e.frames)||e.frames<1||e.frames>8||!Array.isArray(e.elevations)||!e.elevations.length||e.elevations.length>3||e.elevations.some(n=>!Number.isFinite(n))||e.first+e.views*e.frames*e.elevations.length>p.anchors.length||!Number.isFinite(e.fps)||e.fps<0||e.fps>30||!/^[a-f0-9]{64}$/.test(e.sourceHash))throw Error('Entrée atlas invalide');used.add(e.id);}
  bytes+=p.width*p.height*4+p.anchors.length*32;
 }
 if(bytes>IMPOSTOR_LIMITS.maxAtlasBytes)throw Error('Budget atlas dépassé');return m;
}
