/**
 * Studio 3D render profile (doc 105). The Studio is an editor: on a small PC
 * it trades decorative density for responsiveness. Automatic from the device
 * (≤ 4 logical cores or ≤ 4 GB reported memory), overridable with
 * `?studioQuality=low|normal` and remembered per browser. Never affects the
 * authored sources, the game or gameplay.
 */
export interface StudioRenderProfile {id:'low'|'normal';pixelRatio:number;antialias:boolean;detail:number;economy:boolean}
const KEY='little-world.studio-quality';
export function detectLowEnd(nav:{hardwareConcurrency?:number;deviceMemory?:number}=globalThis.navigator??{}):boolean{
 return (nav.hardwareConcurrency??8)<=4||(nav.deviceMemory??8)<=4;
}
export function studioRenderProfile(search=globalThis.location?.search??'',nav?:{hardwareConcurrency?:number;deviceMemory?:number},dpr=globalThis.devicePixelRatio??1):StudioRenderProfile{
 const asked=new URLSearchParams(search).get('studioQuality');
 let stored:string|null=null;try{stored=globalThis.localStorage?.getItem(KEY)??null;}catch{/* private mode */}
 if(asked==='low'||asked==='normal'){try{globalThis.localStorage?.setItem(KEY,asked);}catch{/* optional */}}
 const choice=asked==='low'||asked==='normal'?asked:stored==='low'||stored==='normal'?stored:detectLowEnd(nav)?'low':'normal';
 // No 'economy' tier: it would also shrink the light pool, and the night preview must show the game budget.
 return choice==='low'?{id:'low',pixelRatio:1,antialias:false,detail:1,economy:false}:{id:'normal',pixelRatio:Math.min(dpr,1.25),antialias:true,detail:0,economy:false};
}
