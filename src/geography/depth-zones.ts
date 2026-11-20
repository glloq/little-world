/**
 * Depth zones (doc 104 §3): one classification of the underwater ground used
 * by seabed colours, underwater dressing, dive-site planning and quests.
 * Derived from depth and slope only, so it follows any authored bathymetry.
 */
export const DEPTH_ZONES=['shore','shallow','mid','drop-off','deep','abyss'] as const;
export type DepthZone=typeof DEPTH_ZONES[number];
/** `depth` in metres below the water surface (≤ 0 = dry), `slope` = rise/run of the seabed. */
export function depthZone(depth:number,slope:number):DepthZone|null{
 if(depth<=0)return null;
 if(depth<2)return 'shore';
 if(depth<8)return 'shallow';
 if(slope>.55&&depth<70)return 'drop-off';
 if(depth<25)return 'mid';
 if(depth<60)return 'deep';
 return 'abyss';
}
/** Seabed palette: light sand near the beach, green-blue sediments, dark deep floor, grey rock on drop-offs. */
export const SEABED_ZONE_COLORS:Record<DepthZone,number>={shore:0xcfc49a,shallow:0xb7bf9c,mid:0x8fae9c,'drop-off':0x6f7a76,deep:0x5f8580,abyss:0x3f5c62};
