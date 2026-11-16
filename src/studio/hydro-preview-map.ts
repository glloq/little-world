/** Small 2D geographic overview of hydrology proposals, independent of terrain
 * tiles, WebGL and project source. Pure projection + one transient Canvas2D draw. */
import type {PointXZ} from '../geography/archipelago.ts';
export type OverviewBounds={minX:number;maxX:number;minZ:number;maxZ:number};
export interface HydroOverviewPolyline {points:readonly PointXZ[];kind:'river'|'lake'|'fall';label?:string}
export interface HydroOverviewMark {point:PointXZ;kind:'pit'|'sea'|'source'|'fall';label?:string}
export function hydroOverviewProjection(bounds:OverviewBounds,width:number,height:number,padding=12){
 const dx=bounds.maxX-bounds.minX,dz=bounds.maxZ-bounds.minZ;
 if(!(dx>0&&dz>0&&width>2*padding&&height>2*padding))throw Error('Échelle de carte hydrologique invalide');
 const scale=Math.min((width-2*padding)/dx,(height-2*padding)/dz),
   offsetX=(width-dx*scale)/2,offsetY=(height-dz*scale)/2;
 return (p:PointXZ)=>({x:offsetX+(p.x-bounds.minX)*scale,y:offsetY+(p.z-bounds.minZ)*scale});
}
export function drawHydroOverview(
 canvas:HTMLCanvasElement,bounds:OverviewBounds,lines:readonly HydroOverviewPolyline[],marks:readonly HydroOverviewMark[]=[]
):void{
 const g=canvas.getContext('2d');if(!g)return;
 const w=canvas.width,h=canvas.height,project=hydroOverviewProjection(bounds,w,h);
 g.clearRect(0,0,w,h);g.fillStyle='#f0f5f3';g.fillRect(0,0,w,h);
 const top=project({x:bounds.minX,z:bounds.minZ}),bottom=project({x:bounds.maxX,z:bounds.maxZ});
 g.strokeStyle='#cedad6';g.lineWidth=1;g.strokeRect(top.x,top.y,bottom.x-top.x,bottom.y-top.y);
 g.save();g.beginPath();g.rect(top.x,top.y,bottom.x-top.x,bottom.y-top.y);g.clip();
 for(const row of lines.slice(0,96)){
  if(row.points.length<2)continue;
  g.beginPath();
  row.points.slice(0,128).forEach((p,i)=>{const pt=project(p);if(i===0)g.moveTo(pt.x,pt.y);else g.lineTo(pt.x,pt.y);});
  if(row.kind==='lake'){
   g.closePath();g.fillStyle='#7bc3e655';g.fill();g.strokeStyle='#217fb4';g.lineWidth=1.8;
  }else{g.strokeStyle=row.kind==='fall'?'#c49a37':'#2f91bb';g.lineWidth=row.kind==='fall'?2.4:1.8;}
  g.stroke();
 }
 for(const mark of marks.slice(0,128)){
  const p=project(mark.point);
  g.beginPath();g.arc(p.x,p.y,mark.kind==='source'?3.8:3,0,Math.PI*2);
  g.fillStyle=mark.kind==='pit'?'#a57850':mark.kind==='sea'?'#3c779d':mark.kind==='fall'?'#d19028':'#3b9b66';
  g.fill();g.strokeStyle='#ffffff';g.lineWidth=1;g.stroke();
 }
 g.restore();
 canvas.dataset.overview=JSON.stringify({lines:lines.length,markers:marks.length});
}
