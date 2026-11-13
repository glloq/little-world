/** Contextual interaction contract between gameplay and the player interface.
 * The engine identifies a target, the business systems say which actions are possible (and
 * why not), the interface shows one primary action; the command is executed by the same
 * business method. Descriptors are presentation models, never a second source of truth. */
export type TargetType='object'|'npc'|'boat'|'mine-wall'|'farm-plot';
export interface InteractionAction {id:string;key:string;label:string;enabled:boolean;disabledReason?:string}
export interface TargetDescriptor {
  targetId:string;targetType:TargetType;displayName:string;
  primaryAction:InteractionAction|null;availableActions:InteractionAction[];
  disabledReason?:string;interactionRange?:number;contextData?:Record<string,unknown>;
}
/** Ordered sources: the first descriptor found is the target (same order as the E key). */
export type TargetSource=()=>TargetDescriptor|null;
export function resolveTarget(sources:readonly TargetSource[]):TargetDescriptor|null{for(const s of sources){const t=s();if(t)return t;}return null;}
/** Short prompt: « [E] Ramasser — Pomme » or « Ramasser — Pomme · Déjà utilisé ». */
export function promptText(t:TargetDescriptor):string{
  const a=t.primaryAction;if(!a)return t.displayName;const name=t.displayName&&t.displayName!==a.label?' — '+t.displayName:'';
  return a.enabled?`[${a.key}] ${a.label}${name}`:`${a.label}${name} · ${a.disabledReason??t.disabledReason??'Impossible pour le moment'}`;
}
const action=(id:string,label:string,enabled=true,disabledReason?:string,key='E'):InteractionAction=>({id,key,label,enabled,...(enabled?{}:{disabledReason})});

// Builders from the business adapters' outputs (pure, unit tested).
export function objectTarget(o:{entity:{id:string};name:string;prompt:string;range:number;usable:boolean;reason?:string}):TargetDescriptor{
  const primary=action('interact',o.prompt,o.usable,o.reason);
  return {targetId:o.entity.id,targetType:'object',displayName:o.name===o.prompt?'':o.name,primaryAction:primary,availableActions:[primary],interactionRange:o.range,...(o.usable?{}:{disabledReason:o.reason})};
}
export function npcTarget(n:{id:string;name:string}):TargetDescriptor{const primary=action('talk','Parler avec '+n.name);return {targetId:n.id,targetType:'npc',displayName:'',primaryAction:primary,availableActions:[primary]};}
export function boatTarget(aboard:boolean):TargetDescriptor{const primary=aboard?action('disembark','Quitter le bateau'):action('board','Embarquer');return {targetId:'boat',targetType:'boat',displayName:aboard?'':'Bateau',primaryAction:primary,availableActions:[primary]};}
export function mineWallTarget(p:{target:{mineId:string;level:number;ix:number;iz:number;material:number};materialName:string;ok:boolean;reason?:string;reward:{itemId:string}|null;rewardName?:string}):TargetDescriptor{
  const primary=action('dig','Creuser',p.ok,p.reason);
  return {targetId:`${p.target.mineId}:${p.target.level}:${p.target.ix},${p.target.iz}`,targetType:'mine-wall',displayName:p.materialName,primaryAction:primary,availableActions:[primary,{...primary,id:'dig-f',key:'F'}],
    ...(p.ok?{}:{disabledReason:p.reason}),interactionRange:2.6,contextData:{material:p.materialName,resource:p.rewardName??null}};
}
export function farmPlotTarget(v:{zoneId:string;zoneName:string;intent:{type:string;label:string};ok:boolean;reason?:string;choices:number}):TargetDescriptor{
  const primary=action('farm-'+v.intent.type,v.intent.label,v.ok,v.reason),actions=[primary,{...primary,id:primary.id+'-f',key:'F'}];
  if(v.intent.type==='plant'&&v.choices>1)actions.push(action('choose-crop','Changer de culture',true,undefined,'C'));
  return {targetId:v.zoneId,targetType:'farm-plot',displayName:v.zoneName,primaryAction:primary,availableActions:actions,...(v.ok?{}:{disabledReason:v.reason})};
}
