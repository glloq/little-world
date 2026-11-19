/** Declarative quest data contracts. These types do NOT replace GameplayData objectives
 * or grant rewards: all commits must later pass through the native inventory port.
 */
export type QuestDifficulty=0|1|2|3|4|5;
export type QuestStatus='available'|'active'|'ready'|'claimed'|'cancelled'|'expired'|'suspended';
export type QuestSource='any'|'gather'|'fishing'|'mine'|'farm'|'trade'|'craft';
export type QuestStepV1=
 |{kind:'talk';npcRole?:string;npcId?:string;islandId?:string}
 |{kind:'visit';targetId:string;withinM:number;islandId?:string}
 |{kind:'acquire';itemId:string;quantity:number;source?:QuestSource;fromIslandId?:string}
 |{kind:'deliver';itemId:string;quantity:number;giverId:string;islandId?:string}
 |{kind:'craft';recipeId:string;quantity:number;stationId?:string;islandId?:string}
 |{kind:'race';raceId:string;maxSeconds?:number;islandId?:string}
 |{kind:'event';eventType:string;subjectId?:string;count:number;islandId?:string}
 |{kind:'travel';fromIslandId:string;toIslandId:string};
export interface QuestTemplateV1{
 id:string;version:1;family:string;difficulty:QuestDifficulty;
 titleKey:string;descriptionKey:string;giverRoles:string[];
 requiredCapabilities:string[];steps:QuestStepV1[];rewardProfileId:string;
 repeatable:boolean;cooldownGameMinutes?:number;uniquePerArchipelago?:boolean;
}
export type QuestRewardV1=
 |{kind:'item';itemId:string;quantity:number}
 |{kind:'coins';quantity:number}
 |{kind:'unlock';unlockId:string;unlockKind:string};
export interface QuestCatalogEntryV1{
 questKey:string;templateId:string;templateVersion:number;islandId:string;giverId:string;
 bindings:Record<string,string|number>;steps:QuestStepV1[];rewards:QuestRewardV1[];
 dependencies:string[];catalogRevision:string;
 proof:{capabilityIds:string[];validatorVersion:string};
}
export interface QuestInstanceV1 extends QuestCatalogEntryV1{
 instanceId:string;acceptedAtGameMinute:number;status:QuestStatus;stepIndex:number;
 stepProgress:number[];appliedEventIds:string[];rewardClaimId?:string;
}
export interface QuestGameEventV1{
 schemaVersion:1;eventId:string;type:string;worldId:string;islandId:string;
 gameMinute:number;sequence:number;actorId?:string;targetId?:string;
 itemId?:string;quantity?:number;source?:string;recipeId?:string;raceId?:string;
 measuredSeconds?:number;distanceM?:number;
}
export interface QuestCommandV1{
 commandId:string;type:'accept'|'cancel'|'claim';instanceId:string;actorId?:string;
}
export interface QuestOfferConfigV1{
 schemaVersion:1;enabled:boolean;density:'low'|'normal'|'high';
 maxDifficulty:QuestDifficulty;enabledFamilies:string[];
 maxVisiblePerGiver:number;maxActivePerPlayer:number;
 disabledTemplates?:string[];pinnedTemplateIds?:string[];
}
