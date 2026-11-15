/** Pure, cyclic-dependency-free V3 regional authoring schema. */
import type {PointXZ} from '../geography/archipelago.ts';
import {validMaskString,type MaskLayerId} from '../geography/layers.ts';
import {SPECIES,SPECIES_IDS,type SpeciesId} from '../world-production/biotopes.ts';
export const REGION_PRESETS={
  forest:{label:'Forêt',layers:{biome:'f',moisture:'7',material:'f'},description:'Bois et sous-bois fournis par le biotope existant'},
  meadow:{label:'Prairie',layers:{biome:'m',material:'g'},description:'Herbes et fleurs naturellement instanciées'},
  marsh:{label:'Marais',layers:{biome:'w',moisture:'9',material:'m'},description:'Roselières et végétation humide'},
  mountain:{label:'Montagnes',layers:{biome:'n',geology:'r',material:'r'},description:'Roches, conifères rares, éboulis'},
  coast:{label:'Plage / côte',layers:{biome:'c',geology:'a',material:'s'},description:'Sable et végétation côtière'},
  volcanic:{label:'Volcanique',layers:{biome:'v',geology:'b',material:'b',moisture:'2'},description:'Roches basaltiques et végétation rare'},
  scrub:{label:'Lande',layers:{biome:'s',moisture:'3',material:'y'},description:'Herbes sèches et arbustes'},
  settlement:{label:'Village / clairière',layers:{biome:'g',occupation:'p'},description:'Protège l’espace des végétaux procéduraux'}
} as const;
export type RegionPreset=keyof typeof REGION_PRESETS;
export interface RegionGenerated {
 revision:number;
 /** Only cells applied by this recipe have a non-dot mark. Author corrections win. */
 masks:Record<string,Partial<Record<MaskLayerId,string>>>;
 featureHash?:string;
}
/** Biotope dressing tuning, applied at runtime, independent of the 16x16 classification masks.
 * 0 removes this category, 1 uses the native profile; maximum 2. Species stay instanced. */
export interface RegionVegetation {
 trees:number;shrubs:number;ground:number;deadwood:number;
 /** Optional weighted list of tree species; at most six, no new assets introduced. */
 treeMix?:Partial<Record<SpeciesId,number>>;
}
export const DEFAULT_REGION_VEGETATION:RegionVegetation={trees:1,shrubs:1,ground:1,deadwood:1};
export const REGION_TREE_SPECIES=SPECIES.filter(s=>s.kind==='tree').map(s=>s.id as SpeciesId);
export interface RegionRecipeV1 {
 id:string;version:1;name:string;points:PointXZ[];preset:RegionPreset;
 seed:number;coverage:number;transitionM:number;
 vegetation?:RegionVegetation;
 relief:'none'|'plateau';heightM:number;edgeM:number;
 generated?:RegionGenerated;
}
export interface RegionReport {
 painted:number;cleared:number;protected:number;preserved:number;feature:'added'|'updated'|'kept'|'none';
 sectors:number;warnings:string[];
}
export const RECORD_LIMIT=256,MAX_REGIONS=250;const ID=/^(?!__proto__$|prototype$|constructor$)[A-Za-z0-9_:.-]{1,40}$/;
const finite=(v:number,min:number,max:number)=>Number.isFinite(v)&&v>=min&&v<=max;
function polygonArea(points:readonly PointXZ[]):number{
 let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p.x*q.z-q.x*p.z;}return Math.abs(a)/2;
}
function intersects(a:PointXZ,b:PointXZ,c:PointXZ,d:PointXZ){
 const cross=(u:PointXZ,v:PointXZ,w:PointXZ)=>(v.x-u.x)*(w.z-u.z)-(v.z-u.z)*(w.x-u.x);
 const ab=cross(a,b,c),ab2=cross(a,b,d),cd=cross(c,d,a),cd2=cross(c,d,b);
 return ab*ab2<0&&cd*cd2<0;
}
export function validateRegionRecipe(v:RegionRecipeV1,b:{minX:number;maxX:number;minZ:number;maxZ:number},chunkSizeM?:number):RegionRecipeV1{
 if(!v||v.version!==1||typeof v.id!=='string'||!ID.test(v.id)||typeof v.name!=='string'||!v.name.trim()||v.name.length>100)throw Error('Région : identité invalide');
 const keys=['id','version','name','points','preset','seed','coverage','transitionM','vegetation','relief','heightM','edgeM','generated'];
 if(Object.keys(v).some(k=>!keys.includes(k)))throw Error('Région : champ inconnu');
 if(!Array.isArray(v.points)||v.points.length<3||v.points.length>48)throw Error('Région : 3 à 48 sommets');
 for(const p of v.points)if(!p||Object.keys(p).some(k=>!['x','z'].includes(k))||!finite(p.x,b.minX,b.maxX)||!finite(p.z,b.minZ,b.maxZ))throw Error('Région : point hors carte');
 if(polygonArea(v.points)<25)throw Error('Région : surface trop petite');
 const n=v.points.length;
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
  if(Math.hypot(v.points[i].x-v.points[(i+1)%n].x,v.points[i].z-v.points[(i+1)%n].z)<.1)throw Error('Région : sommets identiques');
  if(j===i+1||(i===0&&j===n-1))continue;
  if(intersects(v.points[i],v.points[(i+1)%n],v.points[j],v.points[(j+1)%n]))throw Error('Région : contour croisé');
 }
 if(!Object.prototype.hasOwnProperty.call(REGION_PRESETS,v.preset))throw Error('Région : biotope inconnu');
 if(!Number.isSafeInteger(v.seed)||v.seed<0||v.seed>0xffffffff||!finite(v.coverage,0,100)||!finite(v.transitionM,0,150))throw Error('Région : paramètres écologiques invalides');
 if(v.vegetation!==undefined){
  const settings=v.vegetation;
  if(!settings||typeof settings!=='object'||Object.keys(settings).some(k=>!['trees','shrubs','ground','deadwood','treeMix'].includes(k))||
    !['trees','shrubs','ground','deadwood'].every(k=>finite(settings[k as keyof RegionVegetation] as number,0,2)))throw Error('Région : densités végétales invalides');
  if(settings.treeMix!==undefined){
    const mix=settings.treeMix;if(!mix||Array.isArray(mix)||typeof mix!=='object'||Object.keys(mix).length>6)throw Error('Région : mélange d’essences invalide');
    for(const [id,weight] of Object.entries(mix))
      if(!(SPECIES_IDS as readonly string[]).includes(id)||!REGION_TREE_SPECIES.includes(id as SpeciesId)||!finite(weight,1,20))
        throw Error('Région : essence ou proportion inconnue');
  }
 }
 if(!['none','plateau'].includes(v.relief)||!finite(v.heightM,0,1200)||!finite(v.edgeM,2,300))throw Error('Région : paramètres de relief invalides');
 if(v.generated){
  const g=v.generated;
  if(Object.keys(g).some(k=>!['revision','masks','featureHash'].includes(k))||!Number.isSafeInteger(g.revision)||g.revision<0||!g.masks||typeof g.masks!=='object'||Array.isArray(g.masks))throw Error('Région : génération invalide');
  if(Object.keys(g.masks).length>RECORD_LIMIT)throw Error('Région : nombre de secteurs trop grand');
  for(const [sector,layers] of Object.entries(g.masks)){
   const m=/^([0-9]+):([0-9]+)$/.exec(sector);
   if(!m||chunkSizeM&&(Number(m[1])>=Math.ceil((b.maxX-b.minX)/chunkSizeM)||Number(m[2])>=Math.ceil((b.maxZ-b.minZ)/chunkSizeM)))throw Error('Région : secteur généré invalide');
   if(!layers||Object.keys(layers).some(k=>!['geology','moisture','biome','material','occupation'].includes(k)))throw Error('Région : couche suivie inconnue');
   for(const [layer,mask]of Object.entries(layers))if(!validMaskString(layer as MaskLayerId,mask))throw Error('Région : masque généré invalide');
  }
  if(g.featureHash!==undefined&&!/^[0-9a-f]{16}$/.test(g.featureHash))throw Error('Région : empreinte relief invalide');
 }
 return v;
}
