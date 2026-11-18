/** Pure, bounded coastal survey for the first authored-looking maritime trade stop.
 * Geometry is derived from final runtime terrain. No random placement and no timers.
 * The result is a preview/runtime placement, not a persisted Studio reservation.
 */
export interface PortPoint {x:number;z:number}
export interface PortN1Layout {
  shore:PortPoint;
  heading:number; // local +Z points toward the sea
  stand:{x:number;y:number;z:number};
  vendor:{x:number;y:number;z:number};
  trade:{x:number;y:number;z:number};
  rower:{x:number;y:number;z:number};
  boarding:{x:number;y:number;z:number};
  boat:{x:number;y:number;z:number};
  dockBaseY:number;
  dockCells:number;
}
export type TradeVisualLevel=1|2|3;
/** PNJ presence: only the N1 itinerant merchant follows the ferry's timetable. */
export function portActorPresence(level:TradeVisualLevel,ferryPresent:boolean){
  return {rower:ferryPresent,merchant:level!==1||ferryPresent};
}
export interface PortSurvey {
  origin:PortPoint;
  anchors?:readonly PortPoint[];
  width:number;
  length:number;
  seaLevel:number;
  height(x:number,z:number):number;
  depth(x:number,z:number):number;
}
export function planPortN1(input:PortSurvey):PortN1Layout|null {
  const {width,length,seaLevel:sea,height,depth}=input;
  if(!Number.isFinite(width)||!Number.isFinite(length)||width<30||length<30)return null;
  const inside=(x:number,z:number,margin=3)=>x>-width/2+margin&&x<width/2-margin&&z>-length/2+margin&&z<length/2-margin;
  const local=(x:number,z:number,angle:number,side:number,out:number):PortPoint=>({
    x:x+side*Math.cos(angle)+out*Math.sin(angle),
    z:z-side*Math.sin(angle)+out*Math.cos(angle),
  });
  // Two compact profiles: a beach near the sea, then a raised but walkable
  // coastal shelf. A V5 island frequently has a several-metre berm at its shore.
  // Reject sites lacking real water, a dry building footprint or land access.
  const profiles=[
    {maxHeight:4.8,shoreDepth:3,standSpread:1.0,landDelta:2.4,cells:3},
    {maxHeight:8.5,shoreDepth:6,standSpread:1.4,landDelta:4.5,cells:5},
  ] as const;
  const radii=[0,5,10,15,22,30,42,56,72,96,128,164,208,260,320,400];
  const orientations=24,samples=32;
  const sorted=[...(input.anchors??[])].filter(p=>inside(p.x,p.z,5))
    .sort((a,b)=>Math.hypot(a.x-input.origin.x,a.z-input.origin.z)-Math.hypot(b.x-input.origin.x,b.z-input.origin.z))
    .slice(0,4);
  sorted.push(input.origin);
  for(const profile of profiles){
    for(const anchor of sorted){
      for(const radius of radii){
        for(let i=0;i<(radius===0?1:samples);i++){
          const a=i*2*Math.PI/samples;
          const sx=anchor.x+radius*Math.cos(a),sz=anchor.z+radius*Math.sin(a);
          if(!inside(sx,sz,10))continue;
          const h=height(sx,sz);
          if(!Number.isFinite(h)||h<sea+.25||h>sea+profile.maxHeight||depth(sx,sz)>.1)continue;
          for(let j=0;j<orientations;j++){
            const angle=j*2*Math.PI/orientations;
            const out=(side:number,z:number)=>local(sx,sz,angle,side,z);
            const offset=profile.cells*2;
            const seaFar=out(0,offset),boat=out(3.25,offset+1.9),bow=out(3.25,offset+3);
            if(!inside(boat.x,boat.z,5)||depth(seaFar.x,seaFar.z)<profile.shoreDepth/2||
              depth(boat.x,boat.z)<1.3||depth(bow.x,bow.z)<1.3)continue;
            const footprint=[out(-1.9,-6.5),out(1.9,-6.5),out(-1.9,-4.1),
              out(1.9,-4.1),out(0,-5.3)];
            if(footprint.some(p=>!inside(p.x,p.z,5)||depth(p.x,p.z)>.1))continue;
            const levels=footprint.map(p=>height(p.x,p.z));
            if(levels.some(v=>!Number.isFinite(v)||v<sea+.25)||
              Math.max(...levels)-Math.min(...levels)>profile.standSpread)continue;
            // Walkable access between shop and quay: no water through the approach
            // and no steep slope on this short dry piece.
            if([-3.5,-2,-1,0].some(z=>{
              const p=out(0,z);
              return depth(p.x,p.z)>.1||Math.abs(height(p.x,p.z)-h)>profile.landDelta;
            }))continue;
            const stand=out(0,-5.3),vendor=out(0,-5.6),trade=out(0,-3.4);
            const rower=out(-.65,offset-3),boarding=out(0,offset-.6);
            const point=(p:PortPoint,y:number)=>({...p,y});
            // Match dock top to the *land* boarding surface. The waterline of
            // the moored rowboat stays at sea level, independent of this deck.
            const shoreward=out(0,-1);
            const deckY=Math.min(h,height(shoreward.x,shoreward.z));
            return {
              shore:{x:sx,z:sz},heading:angle,dockCells:profile.cells,
              stand:point(stand,height(stand.x,stand.z)),
              vendor:point(vendor,height(vendor.x,vendor.z)),
              trade:point(trade,height(trade.x,trade.z)),
              rower:point(rower,deckY),boarding:point(boarding,deckY),
              boat:point(boat,sea),dockBaseY:deckY-1,
            };
          }
        }
      }
    }
  }
  return null;
}
