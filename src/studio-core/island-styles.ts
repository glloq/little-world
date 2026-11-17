/** Authoring styles are independent of saved project schema and runtime terrain. */
import type {MapRequirements,Landscape} from './map-requirements.ts';
export const ISLAND_STYLES={
 gentle:{name:'Île douce',description:'Collines larges, petits ruisseaux et basses terres.',altitude:110,elongation:1.15},
 'central-massif':{name:'Île allongée · massif central',description:'Dorsale irrégulière et vallées vers les deux côtes.',altitude:420,elongation:1.5},
 'side-massif':{name:'Île à massif latéral',description:'Un versant court, un long piémont et des plaines.',altitude:480,elongation:1.35},
 volcanic:{name:'Île volcanique',description:'Un édifice principal et des écoulements rayonnants.',altitude:620,elongation:1.05},
 caldera:{name:'Archipel de caldera ancienne',description:'Couronne fragmentée, lagune marine et sommets inégaux.',altitude:230,elongation:1},
 stepped:{name:'Île illustrée · plateaux locaux',description:'Massifs et vallées avec quelques replats interrompus.',altitude:440,elongation:1.2},
} as const;
export type IslandModel=keyof typeof ISLAND_STYLES;
export interface IslandStyle {
 version:1;model:IslandModel;orientation:number;elongation:number;altitudeM:number;
 valleys:number;plateaus:number;hydrology:'preferred'|'required';volcanism:'ancient'|'active';
}
export function validateIslandStyle(value:unknown):asserts value is IslandStyle {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choisir un style insulaire');
 const v=value as IslandStyle,keys=['version','model','orientation','elongation','altitudeM','valleys','plateaus','hydrology','volcanism'];
 const num=(n:number,a:number,b:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
 if(Object.keys(v).some(k=>!keys.includes(k))||v.version!==1||!Object.hasOwn(ISLAND_STYLES,v.model)||
  !num(v.orientation,0,359)||!num(v.elongation,1,2.5)||!num(v.altitudeM,30,1000)||!num(v.valleys,0,1)||!num(v.plateaus,0,1)||
  !['preferred','required'].includes(v.hydrology)||!['ancient','active'].includes(v.volcanism))throw Error('Paramètres du style insulaire invalides');
}
/** Explicit model selection resets its suggestions; later author edits are never reset. */
export function selectIslandStyle(r:MapRequirements,model:IslandModel):MapRequirements {
 const style=ISLAND_STYLES[model],isVolcanic=model==='volcanic',low=model==='gentle'||model==='caldera';
 const kinds:Landscape[]=low?['hills','forest','meadow','marsh','coast']:['mountain','forest','meadow','marsh','coast'];
 if(isVolcanic)kinds.push('volcanic');if(model==='stepped')kinds.push('plateau');
 return {...r,compositionVersion:4,type:model==='caldera'?'archipelago':'island',biomeMode:'automatic',sequence:kinds,
  landscapes:kinds.map(kind=>({kind,required:kind==='coast'})),rivers:model==='gentle'?1:2,tributaries:0,
  waterfalls:model==='stepped',lakes:false,cliffs:low?.1:.25,terraces:1,
  islandStyle:{version:1,model,orientation:r.islandStyle?.orientation??0,elongation:style.elongation,altitudeM:style.altitude,
   valleys:model==='gentle'?.2:.4,plateaus:model==='stepped'?.45:0,hydrology:'preferred',volcanism:'ancient'}};
}
