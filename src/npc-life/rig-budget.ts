/** Strict adaptive budget for animated rigs, independent of author count.
 * Silhouettes/impostors retain NPC visibility without GPU skeleton allocation.
 */
import {npcVisualTier,type NPCDefinition} from '../npc.ts';
export interface NPCRigCandidate {id:string;kind:NPCDefinition['kind'];x:number;z:number}
export function selectNPCRigs(
 actors:readonly NPCRigCandidate[],camera:{x:number;z:number},budget=12,pinnedId?:string,
):Set<string>{
 const limit=Math.max(0,Math.min(48,Math.floor(Number.isFinite(budget)?budget:12)));
 const near=actors.map(a=>({id:a.id,
   d:Math.hypot(camera.x-a.x,camera.z-a.z),
   kind:a.kind})).filter(a=>npcVisualTier(a.d,a.kind)==='rig');
 near.sort((a,b)=>Number(b.id===pinnedId)-Number(a.id===pinnedId)||a.d-b.d||a.id.localeCompare(b.id));
 return new Set(near.slice(0,limit).map(a=>a.id));
}
