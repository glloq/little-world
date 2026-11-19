/** Surf presentation profile derived from the existing quality setting and the adaptive
 * PresentationBudget level (no second adaptive controller). Physics and gameplay data are
 * identical in every profile: only foam detail, drawn tube crests, wake and distant-zone
 * tessellation change. */
export type SurfQualityName='low'|'medium'|'hq';
export interface SurfQualityProfile {
 name:SurfQualityName;
 /** 0 crest band only, 1 noise + breaking trail, 2 finer foam. */
 foamDetail:0|1|2;
 /** Breaking crests drawn by the 3D lip. */
 tubeFronts:1|2|4;
 /** 0 short trail without spray, 1 trail + spray, 2 longer trail + more spray. */
 wakeDetail:0|1|2;
 /** Minimum water tessellation tier of zones nobody is riding (the rider's zone stays at 0). */
 waterTierFloor:0|1|2;
}
export const SURF_QUALITY:Readonly<Record<SurfQualityName,Readonly<SurfQualityProfile>>>={
 low:{name:'low',foamDetail:0,tubeFronts:1,wakeDetail:0,waterTierFloor:1},
 medium:{name:'medium',foamDetail:1,tubeFronts:2,wakeDetail:1,waterTierFloor:0},
 hq:{name:'hq',foamDetail:2,tubeFronts:4,wakeDetail:2,waterTierFloor:0},
};
/** User quality caps the profile; each adaptive budget level lowers it by one step. */
export function surfQualityProfile(userQuality:string,budgetLevel:number):Readonly<SurfQualityProfile>{
 // Unknown values fall back to the medium cap.
 const cap=userQuality==='low'?0:userQuality==='high'?2:1;
 const level=Number.isFinite(budgetLevel)?Math.max(0,Math.min(2,Math.floor(budgetLevel))):0;
 const step=Math.max(0,cap-level);
 return step>=2?SURF_QUALITY.hq:step===1?SURF_QUALITY.medium:SURF_QUALITY.low;
}
