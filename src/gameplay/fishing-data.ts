/** Canonical Little World fishing tables: keep item IDs and water habitats compatible with economy V1. */
export type WaterKind='sea'|'river'|'lake';
export type FishId='fish:sardine'|'fish:mackerel'|'fish:seabass'|'fish:trout'|'fish:perch'|'fish:carp'|'fish:golden';
export interface FishProfile {id:FishId;gain:number;pull:number;relax:number;frequency:number;}
/** Each profile is tuned for one-button reel/release gameplay (seconds are simulation seconds). */
export const FISH_PROFILES:Record<FishId,FishProfile>={
  'fish:sardine':{id:'fish:sardine',gain:.42,pull:.19,relax:.63,frequency:2.7},
  'fish:perch':{id:'fish:perch',gain:.35,pull:.27,relax:.60,frequency:3.6},
  'fish:trout':{id:'fish:trout',gain:.29,pull:.34,relax:.62,frequency:4.7},
  'fish:carp':{id:'fish:carp',gain:.24,pull:.39,relax:.65,frequency:2.4},
  'fish:mackerel':{id:'fish:mackerel',gain:.29,pull:.37,relax:.64,frequency:5.2},
  'fish:seabass':{id:'fish:seabass',gain:.22,pull:.44,relax:.68,frequency:4.1},
  'fish:golden':{id:'fish:golden',gain:.18,pull:.51,relax:.75,frequency:5.8},
};
/** Original weights; preserve the rarity and locality of existing species. */
export const FISH_BY_WATER:Record<WaterKind,readonly (readonly [FishId,number])[]>={
  sea:[['fish:sardine',5],['fish:mackerel',4],['fish:seabass',2],['fish:golden',.15]],
  river:[['fish:trout',5],['fish:perch',3],['fish:golden',.1]],
  lake:[['fish:carp',5],['fish:perch',4],['fish:golden',.1]],
};
export function selectFish(water:WaterKind,random:number):FishId{
  const list=FISH_BY_WATER[water];
  const total=list.reduce((sum,[,weight])=>sum+weight,0);
  let threshold=Math.min(.999999999,Math.max(0,random))*total;
  for(const [id,weight] of list){threshold-=weight;if(threshold<0)return id;}
  return list[list.length-1][0];
}
