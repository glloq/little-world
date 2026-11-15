/** A2 — author native archipelago ridge/valley features with the shared two-or-more
 * point editor. Cliff = narrow ridge, pass = valley cut; neither adds GPU geometry.
 * True vertical overhangs remain the separate Natural Structures tool. */
import type {ProjectDocument} from './types.ts';
import type {PointXZ,ReliefFeature} from '../geography/archipelago.ts';
import {ARCHIPELAGO_LIMITS} from '../geography/archipelago-params.ts';
export type ReliefLinePreset='ridge'|'cliff'|'valley'|'pass';
export interface ReliefLineDraft {id:string;preset:ReliefLinePreset;points:PointXZ[];widthM:number;amountM:number}
const PREFIX='rl-';
export const RELIEF_LINE_DEFAULTS:Record<ReliefLinePreset,{label:string;widthM:number;amountM:number;help:string}>={
 ridge:{label:'Crête montagneuse',widthM:55,amountM:90,help:'Soulèvement progressif autour du tracé.'},
 cliff:{label:'Escarpement rocheux',widthM:10,amountM:75,help:'Crête très étroite : pente abrupte, sans paroi verticale ni surplomb.'},
 valley:{label:'Vallée',widthM:65,amountM:32,help:'Creusement progressif autour du tracé.'},
 pass:{label:'Col / passage',widthM:42,amountM:45,help:'Découpe un passage abaissé à travers une crête ou un massif.'}
};
export function isAuthoredReliefLine(f:ReliefFeature):boolean{return f.id.startsWith(PREFIX)&&(f.kind==='ridge'||f.kind==='valley');}
export function reliefLinePreset(f:ReliefFeature):ReliefLinePreset{
 if(f.kind==='ridge')return f.id.startsWith('rl-cliff-')?'cliff':'ridge';
 return f.id.startsWith('rl-pass-')?'pass':'valley';
}
export function newReliefLine(preset:ReliefLinePreset,id?:string):ReliefLineDraft{
 const info=RELIEF_LINE_DEFAULTS[preset];return {id:id??'rl-'+preset+'-'+crypto.randomUUID(),preset,points:[],widthM:info.widthM,amountM:info.amountM};
}
export function reliefLineFromFeature(f:ReliefFeature):ReliefLineDraft {
 if(!isAuthoredReliefLine(f))throw Error('Forme de relief non gérée par cet outil');
 if(f.kind!=='ridge'&&f.kind!=='valley')throw Error('Forme incompatible');
 return {id:f.id,preset:reliefLinePreset(f),points:f.points.map(p=>({...p})),widthM:f.widthM,
   amountM:f.kind==='ridge'?f.heightM:f.depthM};
}
export function validateReliefLine(world:ProjectDocument['world'],draft:ReliefLineDraft){
 const allowed=RELIEF_LINE_DEFAULTS;
 if(!Object.hasOwn(allowed,draft.preset)||!/^rl-(ridge|cliff|valley|pass)-[a-zA-Z0-9-]{1,70}$/.test(draft.id))throw Error('Type de relief ou ID non valide');
 const b=world.bounds;
 if(draft.points.length<2||draft.points.length>ARCHIPELAGO_LIMITS.line)throw Error('Relief : 2 à 32 points requis');
 if(!Number.isFinite(draft.widthM)||draft.widthM<5||draft.widthM>2000||!Number.isFinite(draft.amountM)||draft.amountM<.5||draft.amountM>((draft.preset==='valley'||draft.preset==='pass')?400:800))throw Error('Relief : largeur ou amplitude hors limites');
 let length=0;
 for(let i=0;i<draft.points.length;i++){
  const q=draft.points[i];
  if(!Number.isFinite(q.x)||!Number.isFinite(q.z)||q.x<b.minX||q.x>b.maxX||q.z<b.minZ||q.z>b.maxZ)throw Error('Relief : tracé hors carte');
  if(i){const dx=q.x-draft.points[i-1].x,dz=q.z-draft.points[i-1].z;const d=Math.hypot(dx,dz);if(d<.5)throw Error('Relief : deux points trop proches');length+=d;}
 }
 if(length<8)throw Error('Relief : longueur minimale de 8 m');
}
export function upsertReliefLine(p:ProjectDocument,draft:ReliefLineDraft):ReliefFeature {
 if(p.world.terrain?.kind!=='archipelago')throw Error('Relief linéaire : monde archipel requis');
 validateReliefLine(p.world,draft);
 const old=p.world.terrain.archipelago.features.find(f=>f.id===draft.id);
 if(old&&!isAuthoredReliefLine(old))throw Error('Le tracé existe dans un autre outil');
 if(old&&reliefLinePreset(old)!==draft.preset)throw Error('Changer de type nécessite un nouveau tracé');
 const features=p.world.terrain.archipelago.features.filter(f=>f.id!==draft.id);
 if(features.length>=ARCHIPELAGO_LIMITS.features)throw Error('Limite de formes de relief atteinte');
 const feature:ReliefFeature=draft.preset==='ridge'||draft.preset==='cliff'?
   {id:draft.id,kind:'ridge',points:draft.points.map(q=>({...q})),widthM:draft.widthM,heightM:draft.amountM}:
   {id:draft.id,kind:'valley',points:draft.points.map(q=>({...q})),widthM:draft.widthM,depthM:draft.amountM};
 const world=p.world.terrain;
 p.world.terrain={...world,archipelago:{...world.archipelago,features:[...features,feature]}};
 return feature;
}
export function removeReliefLine(p:ProjectDocument,id:string):void {
 if(p.world.terrain?.kind!=='archipelago')throw Error('Relief non disponible');
 const f=p.world.terrain.archipelago.features.find(f=>f.id===id);
 if(!f||!isAuthoredReliefLine(f))throw Error('Relief non géré par cet outil');
 const old=p.world.terrain;
 p.world.terrain={...old,archipelago:{...old.archipelago,features:old.archipelago.features.filter(f=>f.id!==id)}};
}
