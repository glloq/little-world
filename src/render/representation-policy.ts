/** Shared visual policy; consumes the existing PresentationBudget, never regulates it.
 * Selection is independent from entity identity, simulation and network cadence. */
export type Representation='lod0'|'lod1'|'lod2'|'impostor'|'aggregate'|'hidden';
export type RenderFamily='tree'|'shrub'|'rock'|'building'|'landmark'|'character';
export interface RepresentationView {x:number;y:number;z:number;fov:number;height:number;quality:number}
export const REPRESENTATION_POLICY:Record<RenderFamily,{pixels:readonly number[];maxM:number;hysteresis:number}>={
 tree:{pixels:[90,32,7,1],maxM:2000,hysteresis:.16},shrub:{pixels:[50,16,5,2],maxM:180,hysteresis:.18},
 rock:{pixels:[90,28,5,1],maxM:1600,hysteresis:.16},building:{pixels:[100,35,8,1],maxM:2400,hysteresis:.15},
 landmark:{pixels:[110,40,6,.5],maxM:6500,hysteresis:.15},character:{pixels:[32,14,3,.65],maxM:1800,hysteresis:.18},
};
export const REPRESENTATION_ORDER:Representation[]=['lod0','lod1','impostor','lod2','hidden'];
export function projectedPixels(size:number,distance:number,fov:number,height:number){return Math.max(0,size)*height/(2*Math.tan(fov*Math.PI/360)*Math.max(1,distance));}
export function representationFor(family:RenderFamily,size:number,distance:number,view:Pick<RepresentationView,'fov'|'height'|'quality'>,previous:Representation='hidden',impostor=false,importance=1):Representation{
 const p=REPRESENTATION_POLICY[family];if(distance>p.maxM*importance)return 'hidden';
 const pixels=projectedPixels(size,distance,view.fov,view.height)*importance,thresholds=p.pixels;
 let level=thresholds.findIndex(t=>pixels>=t*(1+Math.max(0,view.quality)*.12));if(level<0)level=4;
 const old=REPRESENTATION_ORDER.indexOf(previous);
 if(old>=0&&old!==level&&old<4){const boundary=thresholds[Math.min(old,level)];if(Math.abs(pixels-boundary)<boundary*p.hysteresis)level=old;}
 const mode=REPRESENTATION_ORDER[level];return mode==='impostor'&&!impostor?'lod2':mode;
}
/** Same quotas for every consumer; exposed by PresentationBudget.resources. */
export const REPRESENTATION_BUDGETS=[
 {sprites:4096,sectors:32,fullCharacters:12,atlasBytes:12*1024*1024},
 {sprites:3072,sectors:24,fullCharacters:8,atlasBytes:12*1024*1024},
 {sprites:2048,sectors:16,fullCharacters:4,atlasBytes:8*1024*1024},
] as const;
export type RepresentationBudget=typeof REPRESENTATION_BUDGETS[number];
