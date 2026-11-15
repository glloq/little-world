/** Lightweight authoring audit: no global generation, no GPU work, no source mutation.
 * Summary is intentionally conservative: missing content is guidance, not a release gate. */
import type {ProjectDocument} from './types.ts';
export interface ProductionCheck {id:string;label:string;ready:boolean;detail:string}
export interface GeographyReadiness {
 sectors:{indexed:number;hydrated:number};
 counts:{regions:number;generatedRegions:number;reliefFeatures:number;cliffs:number;rivers:number;lakes:number;entities:number;paths:number;zones:number};
 checks:ProductionCheck[];warnings:string[];
}
export function geographyReadiness(p:ProjectDocument):GeographyReadiness{
 const terrain=p.world.terrain,archipelago=terrain?.kind==='archipelago'?terrain.archipelago:null;
 const regions=Object.values(p.libraries.regions??{}),waters=Object.values(p.libraries.water);
 const counts={
  regions:regions.length,generatedRegions:regions.filter(r=>!!r.generated).length,
  reliefFeatures:archipelago?.features.length??0,
  cliffs:archipelago?.features.filter(f=>f.kind==='ridge'&&f.id.startsWith('rl-cliff-')).length??0,
  rivers:waters.filter(w=>w.kind!=='lake').length,lakes:waters.filter(w=>w.kind==='lake').length,
  entities:Object.keys(p.entityIndex).length,paths:Object.keys(p.libraries.paths).length,
  zones:Object.keys(p.libraries.zones??{}).length
 };
 const sectors={indexed:Object.keys(p.chunkIndex).length,hydrated:Object.keys(p.chunks).length};
 const checks:ProductionCheck[]=[
  {id:'map',label:'Géographie',ready:!!archipelago,detail:archipelago?counts.reliefFeatures+' formes de relief':'Activer la création île/archipel'},
  {id:'regions',label:'Régions écologiques',ready:counts.regions>0&&counts.regions===counts.generatedRegions,
   detail:counts.generatedRegions+'/'+counts.regions+' région(s) générée(s)'},
  {id:'water',label:'Hydrologie',ready:counts.rivers>0,detail:counts.rivers+' rivière(s), '+counts.lakes+' lac(s)'},
  {id:'biomes',label:'Habillage',ready:counts.generatedRegions>0,detail:counts.generatedRegions+' recettes actives'},
  {id:'objects',label:'Construction',ready:counts.entities>0,detail:counts.entities+' entité(s)'},
  {id:'paths',label:'Chemins',ready:counts.paths>0,detail:counts.paths+' chemin(s)'},
  {id:'zones',label:'Activités',ready:counts.zones>0,detail:counts.zones+' zone(s)'}
 ];
 const warnings:string[]=[];
 if(sectors.hydrated>512)warnings.push('Plus de 512 secteurs auteur hydratés : surveiller la mémoire et le compactage');
 if(counts.reliefFeatures>54)warnings.push('Le relief approche la limite native de 64 formes');
 if(counts.regions!==counts.generatedRegions)warnings.push('Certaines régions n’ont pas été appliquées depuis leurs modifications');
 if(counts.regions>16)warnings.push('Composer les recettes par lots de 16 régions maximum');
 if(counts.rivers>0&&!counts.lakes)warnings.push('Contrôler les exutoires des rivières sans lac récepteur');
 return {sectors,counts,checks,warnings};
}
