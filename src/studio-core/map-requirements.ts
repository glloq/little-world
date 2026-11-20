import {validateLayout,type LayoutRequirements} from './terrain-sites.ts';
import {validateIslandStyle,type IslandStyle} from './island-styles.ts';
/** Versioned author preferences, independent from UI and compiled/runtime data. */
export const LANDSCAPES={mountain:'Montagne',hills:'Collines',plain:'Plaine',plateau:'Plateaux',forest:'Forêt',meadow:'Prairie',marsh:'Marais',lake:'Lac',coast:'Côte',volcanic:'Volcan'} as const;
export type Landscape=keyof typeof LANDSCAPES;
export const WELCOME_ACTIVITIES={fishing:'Pêche',agriculture:'Agriculture',forest:'Forêt',mine:'Mine',commerce:'Commerce',mixed:'Polyvalent'} as const;
export type WelcomeActivity=keyof typeof WELCOME_ACTIVITIES;
export interface MapRequirements {
 version:1;activities?:{races:'none'|'flat'|'downhill'|'both';ski:boolean;music:'contextual'|'off'};maritimePort?:boolean;welcomeVillage?:'none'|'hamlet'|'village';welcomeActivity?:WelcomeActivity;compositionVersion?:1|2|3|4|5;layout?:LayoutRequirements;islandStyle?:IslandStyle;type:'island'|'archipelago'|'valley'|'continental';width:number;length:number;seed:number;
 landscapes:{kind:Landscape;required:boolean}[];
 rivers:number;tributaries:number;lakes:boolean;waterfalls:boolean;
 relief:'gentle'|'balanced'|'rugged';cliffs:number;terraces:number;diversity:number;
 biomeMode:'automatic'|'custom';sequence:Landscape[];
}
export const STEPPED_MAP_REQUIREMENTS:MapRequirements={version:1,compositionVersion:3,type:'island',width:4000,length:3000,seed:4242,
 landscapes:['mountain','forest','meadow','marsh','coast'].map(kind=>({kind:kind as Landscape,required:true})),
 rivers:1,tributaries:2,lakes:false,waterfalls:true,relief:'balanced',cliffs:.65,terraces:5,diversity:.65,
 biomeMode:'automatic',sequence:['mountain','forest','meadow','marsh','coast']};
/** Frozen defaults used by version-2 projects and their reproducibility fixtures. */
export const PROVINCE_MAP_REQUIREMENTS:MapRequirements={...structuredClone(STEPPED_MAP_REQUIREMENTS),compositionVersion:2,tributaries:0,waterfalls:false,cliffs:.35,terraces:3};
export const DEFAULT_MAP_REQUIREMENTS:MapRequirements={...structuredClone(STEPPED_MAP_REQUIREMENTS),compositionVersion:4,terraces:1,cliffs:.2,waterfalls:false,rivers:2,tributaries:0,
 landscapes:['mountain','forest','meadow','marsh','coast'].map(kind=>({kind:kind as Landscape,required:kind==='coast'||kind==='forest'})),
 islandStyle:{version:1,model:'central-massif',orientation:0,elongation:1.5,altitudeM:420,valleys:.4,plateaus:0,hydrology:'preferred',volcanism:'ancient'}};
export function validateMapRequirements(value:unknown):MapRequirements {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Besoins géographiques invalides');
 const v=value as MapRequirements;
 const allowed=['version','activities','maritimePort','welcomeVillage','welcomeActivity','compositionVersion','layout','islandStyle','type','width','length','seed','landscapes','rivers','tributaries','lakes','waterfalls','relief','cliffs','terraces','diversity','biomeMode','sequence'];
 if(Object.keys(v).some(k=>!allowed.includes(k))||v.version!==1)throw Error('Version ou champ des besoins inconnu');
 if(v.compositionVersion!==undefined&&v.compositionVersion!==1&&v.compositionVersion!==2&&v.compositionVersion!==3&&v.compositionVersion!==4&&v.compositionVersion!==5)throw Error('Version de composition inconnue');
 const number=(n:number,a:number,b:number,int=false)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b&&(!int||Number.isInteger(n));
 if(v.activities!==undefined){const a=v.activities;if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['races','ski','music'].includes(k))||!['none','flat','downhill','both'].includes(a.races)||typeof a.ski!=='boolean'||!['contextual','off'].includes(a.music)||v.compositionVersion!==5)throw Error('Options d’activités invalides (composition V5 requise)');}
 if(v.maritimePort!==undefined&&typeof v.maritimePort!=='boolean'||v.welcomeVillage!==undefined&&!['none','hamlet','village'].includes(v.welcomeVillage))throw Error('Port ou village de création invalide');
 if(!['island','archipelago','valley','continental'].includes(v.type)||!['gentle','balanced','rugged'].includes(v.relief)||!['automatic','custom'].includes(v.biomeMode))throw Error('Type de composition inconnu');
 if(!number(v.width,500,8000,true)||!number(v.length,500,8000,true)||!number(v.seed,1,9999999,true))throw Error('Dimensions : 500–8 000 m ; graine : 1–9 999 999');
 if(!number(v.rivers,0,6,true)||!number(v.tributaries,0,6,true)||!number(v.terraces,1,6,true)||!number(v.cliffs,0,1)||!number(v.diversity,0,1)||typeof v.lakes!=='boolean'||typeof v.waterfalls!=='boolean')throw Error('Paramètres hydrologiques ou relief invalides');
 if(!Array.isArray(v.landscapes)||v.landscapes.length>10||new Set(v.landscapes.map(l=>l?.kind)).size!==v.landscapes.length||v.landscapes.some(l=>!l||!Object.hasOwn(LANDSCAPES,l.kind)||typeof l.required!=='boolean'||Object.keys(l).some(k=>!['kind','required'].includes(k))))throw Error('Paysages invalides ou répétés');
 if(!Array.isArray(v.sequence)||v.sequence.length>10||v.sequence.some(k=>!Object.hasOwn(LANDSCAPES,k))||new Set(v.sequence).size!==v.sequence.length)throw Error('Succession de paysages invalide');
 if(v.biomeMode==='custom'&&(!v.sequence.length||v.sequence.some(k=>!v.landscapes.some(l=>l.kind===k))))throw Error('La succession doit utiliser les paysages sélectionnés');
 if(v.compositionVersion===4||v.compositionVersion===5)validateIslandStyle(v.islandStyle);else if(v.islandStyle!==undefined)throw Error('Le style insulaire nécessite la composition 4');
 if(v.compositionVersion!==5&&(v.layout!==undefined||v.islandStyle?.silhouette!==undefined))throw Error('Les silhouettes et zones utiles nécessitent la composition 5');
 if((v.maritimePort||v.welcomeVillage&&v.welcomeVillage!=='none')&&v.compositionVersion!==5)throw Error('Le départ maritime complet nécessite la composition 5');
 if(v.welcomeActivity!==undefined&&(typeof v.welcomeActivity!=='string'||!Object.hasOwn(WELCOME_ACTIVITIES,v.welcomeActivity)||v.compositionVersion!==5))throw Error('Activité du village invalide (composition V5 requise)');
 if(v.welcomeVillage&&v.welcomeVillage!=='none'&&!v.maritimePort)throw Error('Le village d’accueil nécessite le port maritime');
 if(v.layout!==undefined)validateLayout(v.layout);
 if(v.compositionVersion===5&&v.islandStyle?.model==='caldera'&&v.islandStyle.silhouette&&v.islandStyle.silhouette!=='natural')throw Error('Choisir un relief non annulaire pour cette silhouette');
 return structuredClone(v);
}

/** New Studio worlds opt into the complete coastal start; frozen historical defaults stay intact. */
export function newIslandRequirements():MapRequirements{return {...structuredClone(DEFAULT_MAP_REQUIREMENTS),compositionVersion:5,maritimePort:true,welcomeVillage:'hamlet'};}
