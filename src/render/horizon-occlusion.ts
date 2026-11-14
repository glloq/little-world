/** Relief occlusion of distant content (doc 42 §H5, doc 17/22): the heightfield itself hides whole
 * regions behind ridges and hills, so what lies under the terrain horizon seen from the camera
 * need not be drawn. For each of SECTORS azimuths the field stores, at every STEP metres, the
 * largest elevation slope (tan) of the relief between the camera and that distance. An object is
 * hidden only when its TOP is below that horizon in both neighbouring azimuths, with a margin:
 * conservative (silhouettes on a crest stay drawn). The terrain itself is never culled (no hole);
 * the field is recomputed in time slices after the camera moves, so no frame pays the full cost.
 * Purely visual: gameplay, collisions and simulation never read it. */
export const OCCLUSION={sectors:64,step:24,maxDistance:2400,margin:1.5,moveM:12} as const;
export interface OcclusionStats {refreshes:number;samples:number;tested:number;hidden:number;ready:boolean}
export function createHorizonOcclusion(height:(x:number,z:number)=>number,o:{sectors?:number;step?:number;maxDistance?:number}={}){
  const sectors=o.sectors??OCCLUSION.sectors,step=o.step??OCCLUSION.step,steps=Math.ceil((o.maxDistance??OCCLUSION.maxDistance)/step);
  let field=new Float32Array(sectors*steps).fill(-Infinity),next=new Float32Array(sectors*steps);
  let origin={x:NaN,y:NaN,z:NaN},pending={x:0,y:0,z:0},cursor=-1;
  const stats:OcclusionStats={refreshes:0,samples:0,tested:0,hidden:0,ready:false};
  /** One azimuth: running maximum of the elevation slope along the ray. */
  function sweep(sector:number,c:{x:number;y:number;z:number}){
    const a=sector/sectors*Math.PI*2,dx=Math.sin(a),dz=Math.cos(a);let best=-Infinity;
    for(let i=0;i<steps;i++){const d=(i+1)*step,slope=(height(c.x+dx*d,c.z+dz*d)-c.y)/d;if(slope>best)best=slope;next[sector*steps+i]=best;}
    stats.samples+=steps;
  }
  return {
    stats,
    /** Advances the refresh (≤ `budget` azimuths per call); starts a new one after a move. */
    update(camera:{x:number;y:number;z:number},budget=16){
      if(cursor<0&&!(Math.hypot(camera.x-origin.x,camera.z-origin.z)<OCCLUSION.moveM&&Math.abs(camera.y-origin.y)<OCCLUSION.moveM/2)){pending={...camera};cursor=0;}
      if(cursor<0)return false;
      for(let n=0;n<budget&&cursor<sectors;n++)sweep(cursor++,pending);
      if(cursor<sectors)return false;
      [field,next]=[next,field];origin=pending;cursor=-1;stats.refreshes++;stats.ready=true;return true;
    },
    /** False when a point of height `topY` at (x, z) is below the relief horizon of the camera. */
    visible(x:number,z:number,topY:number):boolean{
      if(!stats.ready)return true;stats.tested++;
      const dx=x-origin.x,dz=z-origin.z,d=Math.hypot(dx,dz),i=Math.floor(d/step)-1;
      if(i<1||i>=steps)return true;
      const t=(Math.atan2(dx,dz)/(Math.PI*2)+1)%1*sectors,s0=Math.floor(t)%sectors,s1=(s0+1)%sectors;
      const horizon=Math.min(field[s0*steps+i-1],field[s1*steps+i-1]);
      const ok=(topY+OCCLUSION.margin-origin.y)/d>=horizon;if(!ok)stats.hidden++;return ok;
    },
    /** Camera position the current field was computed from. */
    get origin(){return origin;},
  };
}
export type HorizonOcclusion=ReturnType<typeof createHorizonOcclusion>;
