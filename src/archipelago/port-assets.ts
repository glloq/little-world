import type {AssetDefinition} from '../studio-core/types.ts';
/** Already-approved GLBs, shared by authoring and the compiler; no regenerated meshes. */
export const PORT_ASSETS:AssetDefinition[]=[
 {id:'maritime.stand-n1',name:'Comptoir maritime N1',type:'glb',file:'models/commerce-portuaire/port-trade-n1-v1.glb',license:'project-original',source:'Little World approved N1 visual baseline'},
 ...['tile','post','bollard'].map(part=>({id:'maritime.dock-'+part,name:'Quai modulaire · '+part,type:'glb' as const,file:'models/structures/dock/'+part+'/lod0.glb',license:'project-original',source:'Little World original Dock Kit v1'})),
];
export const portAsset=(id:string)=>PORT_ASSETS.find(a=>a.id===id);
