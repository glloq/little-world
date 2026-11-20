/**
 * Typed gameplay events (doc 104 §C7). Every producer commit that quests,
 * dialogue or audits may observe is declared here once, with the fields it
 * carries. The quest progress engine still receives the flat, validated
 * QuestGameEventV1; this module is the single registry of allowed types so a
 * quest step can never wait for an event no system emits.
 */
export const GAMEPLAY_EVENTS={
 'npc.talked':{label:'Parler à un habitant',fields:['targetId','source']},
 'location.visited':{label:'Visiter un lieu',fields:['targetId','distanceM']},
 'resource.gathered':{label:'Cueillir / couper',fields:['itemId','quantity','source']},
 'fishing.caught':{label:'Pêcher',fields:['itemId','quantity','source','targetId']},
 'mine.extracted':{label:'Extraire à la mine',fields:['itemId','quantity','source']},
 'farm.harvested':{label:'Récolter',fields:['itemId','quantity','source']},
 'workshop.collected':{label:'Atelier : commande récupérée',fields:['recipeId','targetId']},
 'workshop.item-collected':{label:'Atelier : objet récupéré',fields:['itemId','quantity']},
 'market.traded':{label:'Acheter au marché',fields:['itemId','quantity','source','targetId']},
 'market.sold':{label:'Vendre au marché',fields:['itemId','quantity','source','targetId']},
 'inventory.acquired':{label:'Obtenir un objet',fields:['itemId','quantity']},
 'quest.delivered':{label:'Livrer',fields:['itemId','quantity','targetId']},
 'race.finished':{label:'Terminer une course',fields:['raceId','measuredSeconds','source']},
 'race.personal-best':{label:'Battre son record',fields:['raceId','measuredSeconds','source']},
 'ferry.arrived':{label:'Arriver en bac',fields:['source']},
 'flight.completed':{label:'Réussir un défi de vol',fields:['targetId','measuredSeconds']},
 'ski.piste-completed':{label:'Descendre une piste',fields:['targetId','source','measuredSeconds']},
 'ski.lift-ridden':{label:'Prendre une remontée',fields:['targetId']},
 'surf.wave-ridden':{label:'Surfer une vague',fields:['targetId','source']},
 'surf.trick':{label:'Figure de surf',fields:['targetId','source']},
 'music.played':{label:'Jouer de la musique',fields:['source','targetId']},
 'dive.depth-reached':{label:'Atteindre une profondeur',fields:['targetId','distanceM']},
 'underwater.discovered':{label:'Découverte sous-marine',fields:['targetId','source']},
} as const;
export type GameplayEventType=keyof typeof GAMEPLAY_EVENTS;
export const GAMEPLAY_EVENT_TYPES=Object.keys(GAMEPLAY_EVENTS) as GameplayEventType[];
export function isGameplayEventType(v:unknown):v is GameplayEventType{return typeof v==='string'&&Object.prototype.hasOwnProperty.call(GAMEPLAY_EVENTS,v);}

/** Flat payload accepted by the quest engine (QuestGameEventV1 optional fields). */
export interface GameplayEventFields {itemId?:string;quantity?:number;source?:string;targetId?:string;distanceM?:number;raceId?:string;measuredSeconds?:number;recipeId?:string}
export type GameplayEvent=
 |{type:'race.finished'|'race.personal-best';raceId:string;measuredSeconds:number;raceKind:'flight'|'roll'|'mixed'|'surf'|'ski'}
 |{type:'flight.completed';courseId:string;seconds:number}
 |{type:'ski.piste-completed';areaId:string;difficulty?:string;seconds?:number}
 |{type:'ski.lift-ridden';areaId:string}
 |{type:'surf.wave-ridden';zoneId:string;style?:string}
 |{type:'surf.trick';featureId:string;trick:'boost'|'ramp'|'buoy'|'barrel'}
 |{type:'market.sold';itemId:string;quantity:number;shopId?:string}
 |{type:'music.played';instrument:string;placeId?:string}
 |{type:'dive.depth-reached';siteId:string;depthM:number}
 |{type:'underwater.discovered';discoveryId:string;siteId?:string};
/** Typed event → flat quest fields (one mapping, so producers cannot drift). */
export function questFields(e:GameplayEvent):GameplayEventFields{
 switch(e.type){
  case 'race.finished':case 'race.personal-best':return {raceId:e.raceId,measuredSeconds:e.measuredSeconds,source:e.raceKind};
  case 'flight.completed':return {targetId:e.courseId,measuredSeconds:e.seconds};
  case 'ski.piste-completed':return {targetId:e.areaId,...(e.difficulty?{source:e.difficulty}:{}),...(e.seconds!==undefined?{measuredSeconds:e.seconds}:{})};
  case 'ski.lift-ridden':return {targetId:e.areaId};
  case 'surf.wave-ridden':return {targetId:e.zoneId,...(e.style?{source:e.style}:{})};
  case 'surf.trick':return {targetId:e.featureId,source:e.trick};
  case 'market.sold':return {itemId:e.itemId,quantity:e.quantity,source:'sell',...(e.shopId?{targetId:e.shopId}:{})};
  case 'music.played':return {source:e.instrument,...(e.placeId?{targetId:e.placeId}:{})};
  case 'dive.depth-reached':return {targetId:e.siteId,distanceM:Math.max(0,Math.round(e.depthM*10)/10)};
  case 'underwater.discovered':return {targetId:e.discoveryId,...(e.siteId?{source:e.siteId}:{})};
 }
}
/** Depth thresholds (m) that emit dive.depth-reached once per dive and site. */
export const DIVE_DEPTH_MARKS=[5,10,20,30,45] as const;
