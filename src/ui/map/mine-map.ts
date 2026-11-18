/** Shared 2D mine plan. Uses the CURRENT level's logical occupancy rather than
 * drawing the island through the cave. No 3D renderer, no guessed minerals, no
 * out-of-level markers, and no per-frame redraw of the entire grid. */
import type {MineState} from '../../mine/mine-state.ts';
import type {MineHubLayout} from '../../mine/mine-hub.ts';
import {el,button} from '../shared/dom.ts';

export interface MineMapSnapshot {
  mineId:string;mineName:string;level:number;levelName:string;
  state:MineState;hub:MineHubLayout;
  player:{x:number;z:number;yaw:number};
}
type MapView={centreX:number;centreZ:number;scale:number};
let cached:{state:MineState;level:number;count:number;canvas:HTMLCanvasElement}|null=null;
function raster(s:MineMapSnapshot):HTMLCanvasElement {
  const g=s.state.grid,count=s.state.excavatedCount;
  if(cached&&cached.state===s.state&&cached.level===s.level&&cached.count===count)return cached.canvas;
  // At 1px/cell the maximum authored 512×512 mine is only one RGBA megabyte.
  const canvas=document.createElement('canvas');canvas.width=g.width;canvas.height=g.depth;
  const ctx=canvas.getContext('2d');if(!ctx)return canvas;
  const data=ctx.createImageData(g.width,g.depth);
  for(let z=0;z<g.depth;z++)for(let x=0;x<g.width;x++){
    const ix=g.minX+x,iz=g.minZ+z,idx=(z*g.width+x)*4;
    const inside=g.inZone(ix,iz),open=inside&&s.state.isOpen(s.level,ix,iz);
    const v=open?176:inside?49:19;
    data.data[idx]=open?157:v;
    data.data[idx+1]=open?150:v-2;
    data.data[idx+2]=open?132:v-5;
    data.data[idx+3]=255;
  }
  ctx.putImageData(data,0,0);
  cached={state:s.state,level:s.level,count,canvas};
  return canvas;
}
export function drawMineMap(ctx:CanvasRenderingContext2D,view:MineMapSnapshot,
  camera:MapView,withLabels:boolean):void{
  const width=ctx.canvas.width,height=ctx.canvas.height,g=view.state.grid;
  ctx.fillStyle='#181816';ctx.fillRect(0,0,width,height);
  const src=raster(view),toScreen=(x:number,z:number)=>({
    x:width*.5+(x-camera.centreX)*camera.scale,
    y:height*.5+(z-camera.centreZ)*camera.scale,
  });
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.drawImage(src,width*.5+(g.minX-camera.centreX)*camera.scale,
    height*.5+(g.minZ-camera.centreZ)*camera.scale,g.width*camera.scale,g.depth*camera.scale);
  ctx.restore();
  const mark=(at:{x:number;z:number},color:string,label:string)=>{
    const p=toScreen(at.x,at.z);if(p.x<-12||p.y<-12||p.x>width+12||p.y>height+12)return;
    ctx.fillStyle=color;ctx.strokeStyle='#292521';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(p.x,p.y,withLabels?6:5,0,Math.PI*2);ctx.fill();ctx.stroke();
    if(withLabels){ctx.font='12px sans-serif';ctx.textBaseline='middle';
      ctx.fillStyle='#fff4db';ctx.fillText(label,p.x+10,p.y);}
  };
  mark(view.hub.shaft,'#9abac2','Monte-charge');
  mark(view.hub.counter,'#ddb16e','Comptoir');
  mark(view.hub.gallery,'#9acb8c','Minage');
  if(view.hub.surfaceExit)mark(view.hub.surfaceExit,'#c5ad86','Sortie île');
  const p=toScreen(view.player.x,view.player.z);
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.PI-view.player.yaw);
  ctx.fillStyle='#fff8e8';ctx.strokeStyle='#28372e';ctx.lineWidth=1.7;
  ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(7,7);ctx.lineTo(0,3);
  ctx.lineTo(-7,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}
export function drawMineMinimap(ctx:CanvasRenderingContext2D,view:MineMapSnapshot){
  drawMineMap(ctx,view,{centreX:view.player.x,centreZ:view.player.z,scale:ctx.canvas.width/68},false);
}
export function createMineMapPanel(get:()=>MineMapSnapshot|null){
  let canvas:HTMLCanvasElement|null=null,zoom=1,offset:{x:number;z:number}|null=null;
  function params(view:MineMapSnapshot):MapView{
    const g=view.state.grid,w=canvas!.width,h=canvas!.height;
    const scale=Math.min((w-75)/Math.max(1,g.width),(h-75)/Math.max(1,g.depth))*zoom;
    return {centreX:offset?.x??view.player.x,centreZ:offset?.z??view.player.z,
      scale:Math.max(.04,Math.min(26,scale))};
  }
  function refresh(){
    const view=get(),ctx=canvas?.getContext('2d');if(!view||!ctx)return;
    drawMineMap(ctx,view,params(view),true);
  }
  function render(body:HTMLElement){
    body.replaceChildren();const view=get();if(!view)return;
    const title=el('p','ui-muted',view.mineName+' · '+view.levelName+
      ' · Zones accessibles en clair, roche en foncé');
    const controls=el('div','ui-row ui-map-tools'),area=el('canvas','ui-map-canvas');
    area.width=840;area.height=540;area.setAttribute('aria-label','Plan de la mine, étage actuel');
    area.tabIndex=0;canvas=area;zoom=1;offset=null;
    controls.append(
      button('◎ Autour de moi',()=>{offset=null;refresh();},'ui-button'),
      button('+',()=>{zoom=Math.min(12,zoom*1.25);refresh();},'ui-button'),
      button('−',()=>{zoom=Math.max(.65,zoom/1.25);refresh();},'ui-button'),
    );
    area.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.65,Math.min(12,zoom*(e.deltaY<0?1.2:.8)));refresh();},{passive:false});
    let drag:{x:number;y:number}|null=null;
    area.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};area.setPointerCapture(e.pointerId);});
    area.addEventListener('pointermove',e=>{if(!drag)return;const ctx=get();if(!ctx)return;
      const scale=params(ctx).scale,rect=area.getBoundingClientRect();
      const x=(e.clientX-drag.x)*area.width/Math.max(1,rect.width),
        y=(e.clientY-drag.y)*area.height/Math.max(1,rect.height);
      const center=params(ctx);offset={x:center.centreX-x/scale,z:center.centreZ-y/scale};
      drag={x:e.clientX,y:e.clientY};refresh();});
    area.addEventListener('pointerup',()=>{drag=null;});
    area.addEventListener('pointercancel',()=>{drag=null;});
    body.append(title,controls,area);
    refresh();
  }
  return {render,refresh,close(){canvas=null;offset=null;}};
}
