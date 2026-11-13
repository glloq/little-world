import {PATH_KINDS,type PathKind} from '../world-data.ts';
import {validateWaterProfile,validateWaterNetworkFields} from '../water/profile.ts';
import {validateAudioLinks} from '../audio/schema.ts';
import {parseAnyAudioDefinition} from '../audio/migrate.ts';
import {parseEnvironmentDefinition} from '../environment/climate.ts';
import catalogue from '../../assets/catalog.json' with {type:'json'};
import { EMOTIONS } from '../character-style.ts';
import {parseTerrainGenerator,VERTICAL_ENVELOPE,type TerrainGeneratorDefinition} from '../terrain-generator.ts';
import {validateZone} from './zones.ts';
import {MASK_LAYERS,validMaskString,type MaskLayerId} from '../geography/layers.ts';
import { validDialogue } from '../dialogue.ts';
import type { AssetDefinition, BiomeEdit, ChunkId, ChunkSourceV3, ComponentMap, EntityDefinitionV3, ProjectDocument, StudioProjectV3, TerrainEdit, WorldDefinitionV3 } from './types.ts';

const blocked = new Set(['__proto__','prototype','constructor']);
export function object(value:unknown,label='objet'):Record<string,unknown>{
  if(typeof value!=='object'||value===null||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw Error(`${label} invalide`);
  for(const key of Object.keys(value))if(blocked.has(key))throw Error(`${label} : clé interdite ${key}`);
  return value as Record<string,unknown>;
}
export function string(value:unknown,label:string,max=128):string{if(typeof value!=='string'||!value.length||value.length>max||blocked.has(value))throw Error(`${label} invalide`);return value;}
export function finite(value:unknown,label:string,min=-1e6,max=1e6):number{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(`${label} hors limites`);return value;}
export function integer(value:unknown,label:string,min=0,max=1e9):number{const n=finite(value,label,min,max);if(!Number.isInteger(n))throw Error(`${label} entier requis`);return n;}
export function array(value:unknown,label:string,max=100000):unknown[]{if(!Array.isArray(value)||value.length>max)throw Error(`${label} : liste invalide`);return value;}
export function keys(value:Record<string,unknown>,allowed:readonly string[],label:string):void{for(const key of Object.keys(value))if(!allowed.includes(key))throw Error(`${label} : champ inconnu ${key}`);}
export function localPath(value:unknown,label:string):string{const p=string(value,label,240);if(!/^[a-zA-Z0-9_./-]+$/.test(p)||p.startsWith('/')||p.split('/').some(s=>!s||s==='.'||s==='..'))throw Error(`${label} : chemin local requis`);return p;}
function ids(value:unknown,label:string,max=100000):string[]{const a=array(value,label,max).map(x=>string(x,label));if(new Set(a).size!==a.length)throw Error(`${label} : doublon`);return a;}
function vector(value:unknown,label:string,min=-1e5,max=1e5){const v=object(value,label);keys(v,['x','y','z'],label);return {x:finite(v.x,label,min,max),y:finite(v.y,label,min,max),z:finite(v.z,label,min,max)};}
function point(value:unknown,world:WorldDefinitionV3,label:string){const v=object(value,label);finite(v.x,label,world.bounds.minX,world.bounds.maxX);finite(v.z,label,world.bounds.minZ,world.bounds.maxZ);}
export function parseManifest(value:unknown):StudioProjectV3{
  const v=object(value,'Projet');keys(v,['schemaVersion','projectId','worldId','name','assetCatalogVersion','createdWith','revision','sourceManifest'],'Projet');
  if(v.schemaVersion!==3)throw Error('Version de projet V3 requise');
  for(const key of ['projectId','worldId','name','assetCatalogVersion','createdWith'])string(v[key],`Projet ${key}`);
  integer(v.revision,'Révision');const source=object(v.sourceManifest,'Sources');keys(source,['worldRef','chunkIndexRef','entityIndexRef','librariesRef','assetCatalogRef'],'Sources');
  for(const key of ['worldRef','chunkIndexRef','entityIndexRef','librariesRef','assetCatalogRef'])localPath(source[key],`Source ${key}`);
  return structuredClone(v) as unknown as StudioProjectV3;
}
export function parseWorldV3(value:unknown):WorldDefinitionV3{
  const v=object(value,'Monde');keys(v,['schemaVersion','worldId','seed','generatorVersion','bounds','seaLevel','chunkSizeM','coordinateSystem','chunkIndexRef','density','viewDistance','editSequence','environment','audio','terrain'],'Monde');
  if(v.schemaVersion!==3||v.generatorVersion!=='1'||v.coordinateSystem!=='meters-y-up')throw Error('Version ou coordonnées de monde incompatibles');
  if(v.audio!==undefined)parseAnyAudioDefinition(v.audio);
  if(v.environment!==undefined)parseEnvironmentDefinition(v.environment);
  string(v.worldId,'ID monde');integer(v.editSequence,'Séquence retouches');integer(v.seed,'Graine',1,9999999);finite(v.seaLevel,'Mer',-20,20);finite(v.chunkSizeM,'Taille de secteur',16,512);finite(v.density,'Densité',0,2);finite(v.viewDistance,'Distance visible',64,800);localPath(v.chunkIndexRef,'Index secteurs');
  const b=object(v.bounds,'Limites');keys(b,['minX','maxX','minZ','maxZ'],'Limites');for(const key of ['minX','maxX','minZ','maxZ'])finite(b[key],'Limites',-100000,100000);
  for(const [lo,hi] of [['minX','maxX'],['minZ','maxZ']])finite((b[hi] as number)-(b[lo] as number),'Dimensions',1,10000);
  if(v.terrain!==undefined)parseTerrainGenerator(v.terrain,{width:(b.maxX as number)-(b.minX as number),length:(b.maxZ as number)-(b.minZ as number)});
  return structuredClone(v) as unknown as WorldDefinitionV3;
}
/** Half-open cells, with the world's uppermost edge owned by the final cell. */
export function chunkAt(world:WorldDefinitionV3,x:number,z:number):ChunkId{
  finite(x,'X',world.bounds.minX,world.bounds.maxX);finite(z,'Z',world.bounds.minZ,world.bounds.maxZ);
  const cx=Math.min(Math.ceil((world.bounds.maxX-world.bounds.minX)/world.chunkSizeM)-1,Math.floor((x-world.bounds.minX)/world.chunkSizeM));
  const cz=Math.min(Math.ceil((world.bounds.maxZ-world.bounds.minZ)/world.chunkSizeM)-1,Math.floor((z-world.bounds.minZ)/world.chunkSizeM));return `${cx}:${cz}`;
}
export function chunkCoordinates(world:WorldDefinitionV3,id:ChunkId):{cx:number;cz:number}{
  if(!/^\d+:\d+$/.test(id))throw Error('Identifiant secteur invalide');const [cx,cz]=id.split(':').map(Number);
  integer(cx,'Secteur X',0,Math.ceil((world.bounds.maxX-world.bounds.minX)/world.chunkSizeM)-1);integer(cz,'Secteur Z',0,Math.ceil((world.bounds.maxZ-world.bounds.minZ)/world.chunkSizeM)-1);return {cx,cz};
}
export function affectedChunkIds(world:WorldDefinitionV3,x:number,z:number,radius:number):ChunkId[]{
  finite(radius,'Rayon',0,10000);const {bounds:b,chunkSizeM:s}=world;
  const minX=Math.max(b.minX,x-radius),maxX=Math.min(b.maxX,x+radius),minZ=Math.max(b.minZ,z-radius),maxZ=Math.min(b.maxZ,z+radius);if(minX>maxX||minZ>maxZ)return [];
  const a=chunkCoordinates(world,chunkAt(world,minX,minZ)),c=chunkCoordinates(world,chunkAt(world,maxX,maxZ));const result:string[]=[];
  for(let cz=a.cz;cz<=c.cz;cz++)for(let cx=a.cx;cx<=c.cx;cx++){
    const dx=Math.max(b.minX+cx*s-x,0,x-Math.min(b.maxX,b.minX+(cx+1)*s));const dz=Math.max(b.minZ+cz*s-z,0,z-Math.min(b.maxZ,b.minZ+(cz+1)*s));
    if(Math.hypot(dx,dz)<=radius)result.push(`${cx}:${cz}`);
  }return result;
}
export function emptyChunk(world:WorldDefinitionV3,id:ChunkId):ChunkSourceV3{return {schemaVersion:3,chunkId:id,index:chunkCoordinates(world,id),revision:0,entities:{},entityIds:[],terrainEdits:[],terrainRefs:[],biomeEdits:[],biomeRefs:[],waterRefs:[],pathRefs:[]};}
function validateAppearance(value:unknown){const v=object(value,'Apparence');keys(v,['hat','backpack','neckwear','emotion'],'Apparence');if(typeof v.hat!=='boolean'||typeof v.backpack!=='boolean'||!['none','pendant','scarf'].includes(String(v.neckwear))||!EMOTIONS.includes(v.emotion as typeof EMOTIONS[number]))throw Error('Apparence invalide');}
const componentFields:Record<string,readonly string[]>={
  Transform:['type','position','rotation','scale'],Visual:['type','assetId','variant'],Character:['type','species','rigId','appearance'],Navigation:['type','behaviorId','speed','radius','path'],BehaviorRef:['type','behaviorId'],DialogueActor:['type','dialogueIds'],State:['type','initial'],Persistence:['type','fields'],Interactable:['type','prompt','range','interactionIds'],Collider:['type','shape','size','layer'],Animator:['type','clips','initialClip'],TriggerVolume:['type','shape','size','interactionIds'],Light:['type','kind','color','intensity','range','offset','enabled','mode','stateKey','flicker','preset'],
};
export function parseComponents(value:unknown,world?:WorldDefinitionV3):ComponentMap{
  const components=object(value,'Composants');for(const [name,raw] of Object.entries(components)){
    const c=object(raw,`Composant ${name}`);if(!componentFields[name]||c.type!==name)throw Error(`Composant inconnu ${name}`);keys(c,componentFields[name],`Composant ${name}`);
    switch(name){
      case 'Transform':{const p=vector(c.position,'Position');if(world)point(p,world,'Position');const q=object(c.rotation,'Quaternion');keys(q,['x','y','z','w'],'Quaternion');for(const key of ['x','y','z','w'])finite(q[key],'Quaternion',-1,1);const norm=Math.hypot(q.x as number,q.y as number,q.z as number,q.w as number);if(Math.abs(norm-1)>.001)throw Error('Quaternion non normalisé');vector(c.scale,'Échelle',.01,100);break;}
      case 'Visual':string(c.assetId,'Asset');if(c.variant!==undefined)string(c.variant,'Variante');break;
      case 'Character':if(!['squirrel','animal'].includes(String(c.species))||c.rigId!=='squirrel-rigid')throw Error('Espèce ou rig non pris en charge');validateAppearance(c.appearance);break;
      case 'Navigation':string(c.behaviorId,'Comportement');finite(c.speed,'Vitesse',0,5);finite(c.radius,'Zone',0,100);if(c.path!==undefined)for(const p of array(c.path,'Parcours',100)){const pt=object(p,'Point parcours');keys(pt,['x','z'],'Point parcours');if(world)point(pt,world,'Parcours');else{finite(pt.x,'Parcours');finite(pt.z,'Parcours');}}break;
      case 'BehaviorRef':string(c.behaviorId,'Comportement');break;
      case 'DialogueActor':ids(c.dialogueIds,'Dialogues',100);break;
      case 'State':{const state=object(c.initial,'État');for(const [key,val] of Object.entries(state)){string(key,'Nom état');if(typeof val==='number')finite(val,'Valeur état');else if(typeof val!=='boolean'&&typeof val!=='string')throw Error('État typé requis');else if(typeof val==='string'&&val.length>2000)throw Error('État trop long');}break;}
      case 'Persistence':ids(c.fields,'Champs persistants',100);break;
      case 'Interactable':string(c.prompt,'Invite',200);finite(c.range,'Portée',.1,50);ids(c.interactionIds,'Interactions',100);break;
      case 'Collider':case 'TriggerVolume':if(!['box','sphere'].includes(String(c.shape)))throw Error('Forme inconnue');vector(c.size,'Taille',.01,1000);if(name==='Collider'&&!['solid','trigger'].includes(String(c.layer)))throw Error('Couche inconnue');if(name==='TriggerVolume')ids(c.interactionIds,'Interactions',100);break;
      case 'Light':{if(c.kind!=='point')throw Error('Seules les lumières ponctuelles sont prises en charge');if(typeof c.color!=='string'||!/^#[0-9a-f]{6}$/i.test(c.color))throw Error('Couleur de lumière invalide');finite(c.intensity,'Intensité lumineuse',0,200);finite(c.range,'Portée lumineuse',.5,60);vector(c.offset,'Décalage lumière',-50,50);
        if(typeof c.enabled!=='boolean')throw Error('Activation de lumière invalide');if(!['always','night','state'].includes(String(c.mode)))throw Error('Mode de lumière inconnu');if(c.mode==='state')string(c.stateKey,'État de la lumière',100);else if(c.stateKey!==undefined)string(c.stateKey,'État de la lumière',100);
        if(c.flicker!==undefined){const f=object(c.flicker,'Vacillement');keys(f,['amplitude','speed'],'Vacillement');finite(f.amplitude,'Amplitude',0,1);finite(f.speed,'Vitesse de vacillement',.1,4);}
        if(c.preset!==undefined&&!['warm-lantern','flickering-fire','fixed-lamp','cold-light'].includes(String(c.preset)))throw Error('Préréglage de lumière inconnu');break;}
      case 'Animator':{const clips=ids(c.clips,'Clips',100);if(c.initialClip!==undefined&&!clips.includes(string(c.initialClip,'Clip initial')))throw Error('Clip initial absent');break;}
    }
  }return structuredClone(components) as unknown as ComponentMap;
}
export function parseEntity(value:unknown,world:WorldDefinitionV3):EntityDefinitionV3{
  const e=object(value,'Entité');keys(e,['id','kind','name','ownerChunkId','parentId','prefabId','variantId','components','overrides'],'Entité');string(e.id,'ID entité');string(e.name,'Nom',200);if(!['prop','building','character','trigger','effect'].includes(String(e.kind)))throw Error('Genre entité inconnu');chunkCoordinates(world,string(e.ownerChunkId,'Propriétaire'));for(const key of ['parentId','prefabId','variantId'])if(e[key]!==undefined)string(e[key],key);
  const c=parseComponents(e.components,world);if(!c.Transform&&!e.prefabId)throw Error('Transform requis');if(c.Transform&&chunkAt(world,c.Transform.position.x,c.Transform.position.z)!==e.ownerChunkId)throw Error('Propriétaire spatial incohérent');if(e.overrides!==undefined)validateOverrides(e.overrides);
  return structuredClone(e) as unknown as EntityDefinitionV3;
}
export function validateOverrides(value:unknown):void{
  const allowed:Record<string,string[]>={Transform:['position.x','position.y','position.z','rotation.x','rotation.y','rotation.z','rotation.w','scale.x','scale.y','scale.z'],Visual:['assetId','variant'],Character:['appearance.hat','appearance.backpack','appearance.neckwear','appearance.emotion'],Navigation:['speed','radius'],Interactable:['prompt','range'],State:[]};
  const seen=new Set<string>();for(const raw of array(value,'Overrides',100)){
    const o=object(raw,'Override');keys(o,['component','field','value'],'Override');const component=string(o.component,'Composant override'),field=string(o.field,'Champ override');if(!allowed[component]?.includes(field))throw Error('Champ override non autorisé');const k=`${component}.${field}`;if(seen.has(k))throw Error('Override dupliqué');seen.add(k);
    if(typeof o.value==='number')finite(o.value,'Override');else if(typeof o.value!=='string'&&typeof o.value!=='boolean')throw Error('Valeur override scalaire requise');
  }
}
export function validateTerrainEdit(raw:unknown,world:WorldDefinitionV3,biome=false):void{
  const e=object(raw,'Retouche');keys(e,biome?['id','x','z','radius','biome','density','order']:['id','x','z','radius','strength','mode','height','order'],'Retouche');string(e.id,'ID retouche');point(e,world,'Retouche');finite(e.radius,'Rayon',1,biome?100:80);integer(e.order,'Ordre');
  if(biome){if(!['forest','meadow','mountain','river','lake','coast','village'].includes(String(e.biome)))throw Error('Biotope inconnu');finite(e.density,'Densité',0,2);}else{if(!['raise','lower','flatten','smooth'].includes(String(e.mode)))throw Error('Pinceau inconnu');finite(e.strength,'Intensité',0,10);finite(e.height,'Altitude',VERTICAL_ENVELOPE.min,VERTICAL_ENVELOPE.max);}
}
export function parseChunk(value:unknown,world:WorldDefinitionV3):ChunkSourceV3{
  const c=object(value,'Secteur');keys(c,['schemaVersion','chunkId','index','revision','entities','entityIds','terrainEdits','terrainRefs','biomeEdits','biomeRefs','waterRefs','pathRefs','layers'],'Secteur');
  if(c.layers!==undefined){const layers=object(c.layers,'Couches géographiques');keys(layers,MASK_LAYERS,'Couches géographiques');for(const [layer,mask]of Object.entries(layers))if(!validMaskString(layer as MaskLayerId,mask))throw Error('Masque géographique invalide : '+layer);}if(c.schemaVersion!==3)throw Error('Version secteur V3 requise');const id=string(c.chunkId,'ID secteur'),coord=chunkCoordinates(world,id),index=object(c.index,'Indice');keys(index,['cx','cz'],'Indice');if(index.cx!==coord.cx||index.cz!==coord.cz)throw Error('Indice secteur incohérent');integer(c.revision,'Révision secteur');
  const entities=object(c.entities,'Entités');for(const [key,value]of Object.entries(entities)){const e=parseEntity(value,world);if(e.id!==key||e.ownerChunkId!==id)throw Error('Propriétaire ou ID entité incohérent');}
  const names=ids(c.entityIds,'Liste entités',5000);if(names.length!==Object.keys(entities).length||names.some(id=>!entities[id]))throw Error('Index local entités incohérent');
  for(const field of ['terrainRefs','biomeRefs','waterRefs','pathRefs'])ids(c[field],field,5000);
  for(const [field,biome]of [['terrainEdits',false],['biomeEdits',true]] as const){const edits=array(c[field],field,2000);const seen=new Set();for(const e of edits){validateTerrainEdit(e,world,biome);const data=e as TerrainEdit|BiomeEdit;if(seen.has(data.id))throw Error('Retouche dupliquée');seen.add(data.id);if(chunkAt(world,data.x,data.z)!==id)throw Error('Propriétaire retouche incohérent');}}
  return structuredClone(c) as unknown as ChunkSourceV3;
}
export function createProject(options:{name:string;width?:number;length?:number;seed?:number;projectId?:string;worldId?:string;chunkSizeM?:number;density?:number;seaLevel?:number;viewDistance?:number;terrain?:TerrainGeneratorDefinition}):ProjectDocument{
  const projectId=options.projectId??crypto.randomUUID(),worldId=options.worldId??crypto.randomUUID(),width=options.width??200,length=options.length??600;
  const manifest:StudioProjectV3={schemaVersion:3,projectId,worldId,name:options.name,assetCatalogVersion:String(catalogue.schemaVersion),createdWith:'little-world-studio-v3',revision:0,sourceManifest:{worldRef:'world/world.json',chunkIndexRef:'world/chunk-index.json',entityIndexRef:'world/entity-index.json',librariesRef:'library/index.json',assetCatalogRef:'assets/catalog.json'}};
  const world:WorldDefinitionV3={schemaVersion:3,worldId,seed:options.seed??1284,generatorVersion:'1',bounds:{minX:-width/2,maxX:width/2,minZ:-length/2,maxZ:length/2},seaLevel:options.seaLevel??0,chunkSizeM:options.chunkSizeM??64,coordinateSystem:'meters-y-up',chunkIndexRef:manifest.sourceManifest.chunkIndexRef,density:options.density??1,viewDistance:options.viewDistance??240,editSequence:0,...(options.terrain?{terrain:structuredClone(options.terrain)}:{})};
  parseManifest(manifest);parseWorldV3(world);
  const assets:Record<string,AssetDefinition>={};for(const a of catalogue.assets)assets[a.id]={id:a.id,name:a.name,type:a.type as 'glb'|'procedural',...('file'in a?{file:a.file}:{}),license:a.license,source:'source'in a?String(a.source):'Little World original procedural geometry'};
  return {manifest,world,chunkIndex:{},entityIndex:{},libraries:{prefabs:{},characters:{},dialogues:{},behaviors:{},interactions:{},activities:{},variables:{},items:{},objectives:{},water:{},paths:{}},assets,chunks:{}};
}

import { validateGameplayLibraries } from '../gameplay/schema.ts';
import { ReferenceIndex, entityIndexEntry, resolveEntity } from './references.ts';
function dictionary(value:unknown,label:string,max=100000):Record<string,unknown>{const v=object(value,label);if(Object.keys(v).length>max)throw Error(`${label} trop grand`);for(const key of Object.keys(v))string(key,`Clé ${label}`);return v;}
export function validateLine(value:unknown,world:WorldDefinitionV3,water:boolean):void{
  const line=object(value,'Tracé');keys(line,water?['id','points','width','level','depth','profile','kind','from','to','falls']:['id','points','width','kind','smooth'],'Tracé');
  if(!water){if(line.kind!==undefined&&!PATH_KINDS.includes(line.kind as PathKind))throw Error('Chemin : type inconnu');if(line.smooth!==undefined&&typeof line.smooth!=='boolean')throw Error('Chemin : courbe invalide');}string(line.id,'ID tracé');finite(line.width,'Largeur',1,40);const points=array(line.points,'Points',100);if(points.length<2)throw Error('Tracé : deux points requis');for(const p of points){const v=object(p,'Point');keys(v,['x','z'],'Point');point(v,world,'Tracé');}if(water){finite(line.level,'Niveau',-20,100);finite(line.depth,'Profondeur',.5,20);validateWaterProfile(line.profile,points.length);validateWaterNetworkFields(line as never);}
}
function validateLibraries(value:unknown,world:WorldDefinitionV3,entityIds:string[],chunkIds:string[]):void{
  const libs=object(value,'Bibliothèques');keys(libs,['prefabs','characters','dialogues','behaviors','interactions','activities','variables','items','objectives','water','paths','zones'],'Bibliothèques');
  if(libs.zones!==undefined)for(const [id,zone]of Object.entries(dictionary(libs.zones,'Bibliothèque zones',2000))){if(validateZone(zone,world).id!==id)throw Error('Bibliothèque zones : ID différent de la clé');}
  for(const name of ['prefabs','characters','dialogues','behaviors','interactions','activities','variables','items','objectives','water','paths']){
    const dict=dictionary(libs[name],`Bibliothèque ${name}`,10000);
    for(const [id,value]of Object.entries(dict)){
      const v=object(value,name);if(v.id!==id)throw Error(`Bibliothèque ${name} : ID différent de la clé`);
      if(name==='prefabs'){
        keys(v,['id','version','name','components','variants'],'Prefab');integer(v.version,'Version prefab',1);string(v.name,'Nom prefab',200);parseComponents(v.components);if(v.variants!==undefined)for(const variants of Object.values(dictionary(v.variants,'Variantes',100)))validateOverrides(variants);
      }else if(name==='characters'){
        keys(v,['id','name','species','rigId','appearance'],'Personnage');string(v.name,'Nom personnage',200);parseComponents({Character:{type:'Character',species:v.species,rigId:v.rigId,appearance:v.appearance}});
      }else if(name==='behaviors'){
        keys(v,['id','kind'],'Comportement');if(!['idle','wander','patrol','work'].includes(String(v.kind)))throw Error('Comportement non pris en charge');
      }else if(name==='water'||name==='paths')validateLine(v,world,name==='water');
      else if(name==='dialogues'&&!validDialogue(v))throw Error('Dialogue invalide');
    }
  }
  validateGameplayLibraries(libs,entityIds,chunkIds);
}
function validateAsset(value:unknown,id:string):void{
  const a=object(value,'Asset');keys(a,['id','name','type','file','license','source'],'Asset');if(a.id!==id)throw Error('Clé asset incohérente');string(a.id,'ID asset');string(a.name,'Nom asset',200);string(a.license,'Licence',200);string(a.source,'Provenance',500);if(!['glb','procedural'].includes(String(a.type)))throw Error('Type asset inconnu');if(a.type==='glb')localPath(a.file,'Fichier asset');else if(a.file!==undefined)localPath(a.file,'Fichier asset');
}
function parseProjectInternal(value:unknown,complete:boolean):ProjectDocument{
  const v=object(value,'Document projet');keys(v,['manifest','world','chunkIndex','entityIndex','libraries','assets','chunks'],'Document projet');
  const manifest=parseManifest(v.manifest),world=parseWorldV3(v.world);if(world.worldId!==manifest.worldId||world.chunkIndexRef!==manifest.sourceManifest.chunkIndexRef)throw Error('Manifeste/monde incohérents');
  const chunkIndex=dictionary(v.chunkIndex,'Index secteurs'),chunks=dictionary(v.chunks,'Secteurs chargés'),entityIndex=dictionary(v.entityIndex,'Index entités'),assets=dictionary(v.assets,'Catalogue',10000);
  for(const [id,value]of Object.entries(chunkIndex)){
    const m=object(value,'Index secteur');keys(m,['chunkId','cx','cz','revision','sourceRef','dependencies','terrainOwners','biomeOwners'],'Index secteur');const c=chunkCoordinates(world,id);if(m.chunkId!==id||m.cx!==c.cx||m.cz!==c.cz)throw Error('Index spatial incohérent');integer(m.revision,'Révision secteur');localPath(m.sourceRef,'Fichier secteur');ids(m.dependencies,'Dépendances',100000);for(const dep of m.dependencies as string[])if(!chunkIndex[dep]||dep===id)throw Error('Dépendance secteur absente ou cyclique directe');
    for(const field of ['terrainOwners','biomeOwners'])if(m[field]!==undefined)for(const [editId,owner]of Object.entries(dictionary(m[field],field,5000))){string(editId,'Retouche référencée');const dep=string(owner,'Propriétaire retouche');if(!chunkIndex[dep]||(dep!==id&&!(m.dependencies as string[]).includes(dep)))throw Error('Propriétaire retouche sans dépendance');}
    if(complete&&!chunks[id])throw Error(`Source secteur non chargée : ${id}`);
  }
  for(const [id,value]of Object.entries(chunks)){if(!chunkIndex[id])throw Error('Secteur chargé hors index');const parsed=parseChunk(value,world);if(parsed.chunkId!==id||(chunkIndex[id] as {revision:unknown}).revision!==parsed.revision)throw Error('Révision secteur incohérente');}
  for(const [id,value]of Object.entries(entityIndex)){
    const e=object(value,'Index entité');keys(e,['id','kind','name','ownerChunkId','position','references','logical'],'Index entité');if(e.id!==id)throw Error('ID index incohérent');string(e.name,'Nom entité',200);if(!['prop','building','character','trigger','effect'].includes(String(e.kind)))throw Error('Genre index inconnu');const owner=string(e.ownerChunkId,'Secteur propriétaire');if(!chunkIndex[owner])throw Error('Entité sans secteur');const p=vector(e.position,'Position index');point(p,world,'Position index');if(chunkAt(world,p.x,p.z)!==owner)throw Error('Index propriétaire incohérent');ids(e.references,'Références entité',100);
    if(e.logical!==undefined){const logical=object(e.logical,'État logique');keys(logical,['position','initialState','persistentState','interactable'],'État logique');if(logical.position!==undefined)vector(logical.position,'Position logique');if(logical.initialState!==undefined)parseComponents({State:{type:'State',initial:logical.initialState}});if(logical.persistentState!==undefined)ids(logical.persistentState,'Persistance',100);if(logical.interactable!==undefined)parseComponents({Interactable:{type:'Interactable',...object(logical.interactable,'Interaction logique')}});}
  }
  for(const [id,asset]of Object.entries(assets))validateAsset(asset,id);
  validateLibraries(v.libraries,world,Object.keys(entityIndex),Object.keys(chunkIndex));
  const project=structuredClone({...v,manifest,world}) as unknown as ProjectDocument;
  const audioActions=[...Object.values(project.libraries.interactions).flatMap(i=>i.sequence),...Object.values(project.libraries.dialogues).flatMap(d=>d.lines.flatMap(l=>[...(l.actions??[]),...l.choices.flatMap(c=>c.actions??[])]))];validateAudioLinks(world.audio,Object.keys(project.entityIndex),audioActions.filter(a=>a.type==='playSound').map(a=>(a as {soundId:string}).soundId));
  const canonical=new Map<string,{owner:string;kind:'terrain'|'biome';edit:TerrainEdit|BiomeEdit}>();
  for(const chunk of Object.values(project.chunks)){
    for(const [kind,list]of [['terrain',chunk.terrainEdits],['biome',chunk.biomeEdits]] as const)for(const edit of list){if(canonical.has(edit.id))throw Error('Retouche canonique dupliquée');canonical.set(edit.id,{owner:chunk.chunkId,kind,edit});}
    for(const entity of Object.values(chunk.entities)){
      const resolved=resolveEntity(project,entity),entry=entityIndexEntry(resolved),indexed=project.entityIndex[entity.id];if(!indexed)throw Error('Entité absente de l’index mondial');
      if(JSON.stringify({...indexed,logical:undefined})!==JSON.stringify({...entry,logical:undefined}))throw Error(`Index entité obsolète : ${entity.id}`);
      if(indexed.logical!==undefined&&JSON.stringify(indexed.logical)!==JSON.stringify(entry.logical))throw Error(`État logique obsolète : ${entity.id}`);
      if(resolved.parentId===resolved.id)throw Error('Parent réflexif');
    }
    for(const id of chunk.waterRefs)if(!project.libraries.water[id])throw Error(`Eau absente : ${id}`);for(const id of chunk.pathRefs)if(!project.libraries.paths[id])throw Error(`Chemin absent : ${id}`);
  }
  for(const entry of Object.values(project.entityIndex))if(project.chunks[entry.ownerChunkId]&&!project.chunks[entry.ownerChunkId].entities[entry.id])throw Error('Index vers entité absente du secteur chargé');
  for(const chunk of Object.values(project.chunks))for(const [kind,refs]of [['terrain',chunk.terrainRefs],['biome',chunk.biomeRefs]] as const)for(const id of refs){const target=canonical.get(id);if(!target){if(complete)throw Error(`Retouche absente : ${id}`);continue;}if(target.kind!==kind)throw Error('Type de retouche incorrect');if(target.owner!==chunk.chunkId&&!project.chunkIndex[chunk.chunkId].dependencies.includes(target.owner))throw Error('Dépendance canonique manquante');}
  if(complete){
    const orders={terrain:new Set<number>(),biome:new Set<number>()};
    for(const [id,{owner,kind,edit}]of canonical){if(orders[kind].has(edit.order))throw Error('Ordre de retouche dupliqué');orders[kind].add(edit.order);for(const affected of affectedChunkIds(world,edit.x,edit.z,edit.radius)){const chunk=project.chunks[affected];if(!chunk||(kind==='terrain'?!chunk.terrainRefs.includes(id):!chunk.biomeRefs.includes(id)))throw Error('Référence de retouche multi-secteur manquante');const owners=kind==='terrain'?project.chunkIndex[affected].terrainOwners:project.chunkIndex[affected].biomeOwners;if(owners?.[id]!==owner)throw Error('Index propriétaire de retouche manquant');}}
  }
  for(const id of Object.keys(project.entityIndex)){
    const seen=new Set<string>();let current:string|undefined=id;
    while(current){if(seen.has(current))throw Error('Cycle de hiérarchie');seen.add(current);const entry:ProjectDocument["entityIndex"][string]|undefined=project.entityIndex[current];const e:EntityDefinitionV3|undefined=entry?project.chunks[entry.ownerChunkId]?.entities[current]:undefined;current=e?.parentId;}
  }
  const errors=new ReferenceIndex(project).diagnostics();if(errors.length)throw Error(errors[0].message);
  return project;
}
/** Complete portable source bundle: all indexed sources and references must be present. */
export function parseProject(value:unknown):ProjectDocument{return parseProjectInternal(value,true);}
/** Lightweight header/cache: unloaded sources are valid, dangling global IDs are not. */
export function parseProjectHeader(value:unknown):ProjectDocument{return parseProjectInternal(value,false);}
