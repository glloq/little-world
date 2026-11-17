/** Versioned author preferences, independent from UI and compiled/runtime data. */
export const LANDSCAPES={mountain:'Montagne',hills:'Collines',plain:'Plaine',plateau:'Plateaux',forest:'Forêt',meadow:'Prairie',marsh:'Marais',lake:'Lac',coast:'Côte',volcanic:'Volcan'} as const;
export type Landscape=keyof typeof LANDSCAPES;
export interface MapRequirements {
 version:1;compositionVersion?:1|2|3;type:'island'|'archipelago'|'valley'|'continental';width:number;length:number;seed:number;
 landscapes:{kind:Landscape;required:boolean}[];
 rivers:number;tributaries:number;lakes:boolean;waterfalls:boolean;
 relief:'gentle'|'balanced'|'rugged';cliffs:number;terraces:number;diversity:number;
 biomeMode:'automatic'|'custom';sequence:Landscape[];
}
export const DEFAULT_MAP_REQUIREMENTS:MapRequirements={version:1,compositionVersion:3,type:'island',width:4000,length:3000,seed:4242,
 landscapes:['mountain','forest','meadow','marsh','coast'].map(kind=>({kind:kind as Landscape,required:true})),
 rivers:1,tributaries:2,lakes:false,waterfalls:true,relief:'balanced',cliffs:.65,terraces:5,diversity:.65,
 biomeMode:'automatic',sequence:['mountain','forest','meadow','marsh','coast']};
/** Frozen defaults used by version-2 projects and their reproducibility fixtures. */
export const PROVINCE_MAP_REQUIREMENTS:MapRequirements={...structuredClone(DEFAULT_MAP_REQUIREMENTS),compositionVersion:2,tributaries:0,waterfalls:false,cliffs:.35,terraces:3};
export function validateMapRequirements(value:unknown):MapRequirements {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Besoins géographiques invalides');
 const v=value as MapRequirements;
 const allowed=Object.keys(DEFAULT_MAP_REQUIREMENTS);
 if(Object.keys(v).some(k=>!allowed.includes(k))||v.version!==1)throw Error('Version ou champ des besoins inconnu');
 if(v.compositionVersion!==undefined&&v.compositionVersion!==1&&v.compositionVersion!==2&&v.compositionVersion!==3)throw Error('Version de composition inconnue');
 const number=(n:number,a:number,b:number,int=false)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b&&(!int||Number.isInteger(n));
 if(!['island','archipelago','valley','continental'].includes(v.type)||!['gentle','balanced','rugged'].includes(v.relief)||!['automatic','custom'].includes(v.biomeMode))throw Error('Type de composition inconnu');
 if(!number(v.width,500,8000,true)||!number(v.length,500,8000,true)||!number(v.seed,1,9999999,true))throw Error('Dimensions : 500–8 000 m ; graine : 1–9 999 999');
 if(!number(v.rivers,0,6,true)||!number(v.tributaries,0,6,true)||!number(v.terraces,1,6,true)||!number(v.cliffs,0,1)||!number(v.diversity,0,1)||typeof v.lakes!=='boolean'||typeof v.waterfalls!=='boolean')throw Error('Paramètres hydrologiques ou relief invalides');
 if(!Array.isArray(v.landscapes)||v.landscapes.length>10||new Set(v.landscapes.map(l=>l?.kind)).size!==v.landscapes.length||v.landscapes.some(l=>!l||!Object.hasOwn(LANDSCAPES,l.kind)||typeof l.required!=='boolean'||Object.keys(l).some(k=>!['kind','required'].includes(k))))throw Error('Paysages invalides ou répétés');
 if(!Array.isArray(v.sequence)||v.sequence.length>10||v.sequence.some(k=>!Object.hasOwn(LANDSCAPES,k))||new Set(v.sequence).size!==v.sequence.length)throw Error('Succession de paysages invalide');
 if(v.biomeMode==='custom'&&(!v.sequence.length||v.sequence.some(k=>!v.landscapes.some(l=>l.kind===k))))throw Error('La succession doit utiliser les paysages sélectionnés');
 return structuredClone(v);
}
