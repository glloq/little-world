/**
 * World brief (doc 104 §C1): a declarative theme — climate, shape, coasts,
 * poles, activities, underwater wishes, density and language — translated
 * into MapRequirements for the single composition pipeline. A new theme is a
 * new brief (data), never a new island builder. Impossible wishes come back
 * as composition diagnostics; nothing is silently replaced by decoration.
 */
import type {MapRequirements,Landscape,WelcomeActivity} from './map-requirements.ts';
import {newIslandRequirements,validateMapRequirements} from './map-requirements.ts';
import {selectIslandStyle,ISLAND_STYLES,type IslandModel} from './island-styles.ts';
import type {ArchitectureStyleId,PoleRole} from '../settlements/architecture.ts';
import {ARCHITECTURE_STYLE_IDS,POLE_ROLES} from '../settlements/architecture.ts';
import type {PoleRequest} from './world-poles.ts';
import {composeWorld,type WorldComposition} from './world-composition.ts';

export const CLIMATES=['temperate','alpine','tropical','arid','boreal'] as const;
export type Climate=typeof CLIMATES[number];
export interface WorldBriefV1 {
 version:1;id:string;name:string;seed:number;
 size:'small'|'medium'|'large';
 climate:Climate;
 shape:{model:IslandModel;altitudeM?:number;silhouette?:'natural'|'crescent'|'turtle'};
 coast:'beach'|'cliffs'|'reef'|'lagoon';
 architecture?:ArchitectureStyleId;
 port:boolean;
 welcome:'none'|'hamlet'|'village';
 poles:PoleRequest[];
 activities:{races?:'none'|'flat'|'downhill'|'both';ski?:'none'|'run'|'resort';surf?:boolean;flight?:boolean;diving?:'none'|'reefs'|'deep'};
 rivers?:number;lakes?:boolean;
 stories?:boolean;locale?:'fr'|'en';
}
const SIZE={small:[2000,1500],medium:[3000,2200],large:[4000,3000]} as const;
const CLIMATE:Record<Climate,{landscapes:Landscape[];architecture:ArchitectureStyleId;welcome:WelcomeActivity}>={
 temperate:{landscapes:['hills','forest','meadow','marsh','coast'],architecture:'temperate',welcome:'mixed'},
 alpine:{landscapes:['mountain','forest','meadow','lake','coast'],architecture:'alpine',welcome:'forest'},
 tropical:{landscapes:['forest','meadow','coast','marsh'],architecture:'tropical',welcome:'fishing'},
 arid:{landscapes:['plain','plateau','coast','hills'],architecture:'arid',welcome:'commerce'},
 boreal:{landscapes:['forest','marsh','lake','hills','coast'],architecture:'alpine',welcome:'forest'},
};

export function validateWorldBrief(value:unknown):WorldBriefV1{
 const v=value as WorldBriefV1;
 if(!v||typeof v!=='object'||v.version!==1||typeof v.id!=='string'||!/^[a-z0-9-]{1,64}$/.test(v.id)||typeof v.name!=='string'||!v.name.trim()||v.name.length>100)throw Error('Fiche de monde : identité invalide');
 if(!Number.isInteger(v.seed)||v.seed<1||v.seed>9999999||!(v.size in SIZE)||!CLIMATES.includes(v.climate)||!v.shape||!(v.shape.model in ISLAND_STYLES)||!['beach','cliffs','reef','lagoon'].includes(v.coast))throw Error('Fiche de monde : paramètres invalides');
 if(v.architecture!==undefined&&!ARCHITECTURE_STYLE_IDS.includes(v.architecture))throw Error('Fiche de monde : architecture inconnue');
 if(!Array.isArray(v.poles)||v.poles.some(p=>!POLE_ROLES.includes(p.role as PoleRole)))throw Error('Fiche de monde : pôles invalides');
 return structuredClone(v);
}

/** Translate a brief into validated composition requirements (V5, coherence options on). */
export function briefToRequirements(raw:WorldBriefV1):MapRequirements{
 const b=validateWorldBrief(raw),c=CLIMATE[b.climate],[width,length]=SIZE[b.size];
 const base=selectIslandStyle(newIslandRequirements(),b.shape.model);
 const altitudeM=b.shape.altitudeM??(b.climate==='alpine'?Math.max(600,ISLAND_STYLES[b.shape.model].altitude):ISLAND_STYLES[b.shape.model].altitude);
 const landscapes=[...new Set([...c.landscapes,...(b.shape.model==='volcanic'?['volcanic' as Landscape]:[])])];
 const a=b.activities,diving=a.diving??'none',reefCoast=b.coast==='reef'||b.coast==='lagoon';
 const r:MapRequirements={...base,seed:b.seed,width,length,
  landscapes:landscapes.map(kind=>({kind,required:kind==='coast'})),sequence:landscapes,
  rivers:b.rivers??base.rivers,lakes:b.lakes??landscapes.includes('lake'),
  cliffs:b.coast==='cliffs'?.7:b.coast==='beach'?.12:.2,
  islandStyle:{...base.islandStyle!,altitudeM,...(b.shape.silhouette?{silhouette:b.shape.silhouette}:{})},
  maritimePort:b.port,welcomeVillage:b.port?b.welcome:'none',welcomeActivity:c.welcome,
  architecture:b.architecture??c.architecture,poles:b.poles,
  activities:{races:a.races??'none',ski:a.ski==='run'||a.ski==='resort',music:'contextual',
   ...(a.ski==='resort'?{skiResort:true}:{}),...(a.surf?{surf:true}:{}),...(a.flight?{flight:true}:{})},
  ...(reefCoast||diving!=='none'?{underwater:{shelf:reefCoast?'wide' as const:'narrow' as const,reefs:b.coast==='lagoon'?5:reefCoast?3:diving==='reefs'?2:0,holes:diving==='deep'?2:diving==='reefs'?1:0,trench:diving==='deep',diveSites:diving!=='none'}}:{}),
  earthworks:true,circulation:true,roads:true,stories:b.stories??true,...(b.locale?{locale:b.locale}:{}),
 };
 return validateMapRequirements(r);
}
export function composeBrief(b:WorldBriefV1,identity?:{projectId:string;worldId:string}):WorldComposition{
 return composeWorld(briefToRequirements(b),b.name,identity??{projectId:'brief-'+b.id+'-authoring',worldId:'brief-'+b.id});
}

/** Example briefs: each is data only. They cover the shipped themes and new ones. */
export const WORLD_BRIEFS:Record<string,WorldBriefV1>={
 'tropical-port':{version:1,id:'tropical-port',name:'Archipel des Lagons',seed:17,size:'medium',climate:'tropical',shape:{model:'gentle'},coast:'reef',port:true,welcome:'village',
  poles:[{role:'fishing',size:'village'},{role:'market',size:'village'},{role:'farming',size:'hamlet'}],
  activities:{races:'flat',surf:true,flight:true,diving:'reefs'}},
 'alpine-resort':{version:1,id:'alpine-resort',name:'Massif des Neiges',seed:4243,size:'large',climate:'alpine',shape:{model:'central-massif',altitudeM:650},coast:'cliffs',port:true,welcome:'hamlet',
  poles:[{role:'resort',size:'hamlet'},{role:'forest',size:'hamlet'}],activities:{races:'downhill',ski:'resort',flight:true}},
 'harvest-valley':{version:1,id:'harvest-valley',name:'Vallons des Moissons',seed:4242,size:'medium',climate:'temperate',shape:{model:'gentle'},coast:'beach',port:true,welcome:'village',
  poles:[{role:'farming',size:'village'},{role:'farming',size:'hamlet'},{role:'market',size:'village'}],activities:{races:'flat'}},
 'surf-coast':{version:1,id:'surf-coast',name:'Côte des Rouleaux',seed:42811,size:'small',climate:'tropical',shape:{model:'gentle'},coast:'beach',architecture:'fishing',port:true,welcome:'hamlet',
  poles:[{role:'fishing',size:'hamlet'}],activities:{surf:true,races:'flat'}},
 'volcano-isle':{version:1,id:'volcano-isle',name:'Île du Volcan',seed:9001,size:'large',climate:'temperate',shape:{model:'volcanic'},coast:'cliffs',architecture:'medieval',port:true,welcome:'village',
  poles:[{role:'market',size:'town'},{role:'mine',size:'hamlet'},{role:'fishing',size:'hamlet'},{role:'farming',size:'hamlet'}],activities:{races:'both',flight:true,diving:'deep'}},
 'arid-mesa':{version:1,id:'arid-mesa',name:'Mesas du Couchant',seed:2024,size:'medium',climate:'arid',shape:{model:'stepped'},coast:'cliffs',port:true,welcome:'hamlet',
  poles:[{role:'market',size:'village'},{role:'mine',size:'hamlet'}],activities:{races:'downhill',flight:true}},
};
