/** Compact player-centred minimap. Shares the world raster with the full map:
 * no second 3D scene, no terrain regeneration and no per-frame canvas work. */
import {hudIcon} from '../shared/icons.ts';
import type {MapDeps,MapMarker,MapRaster} from './map.ts';
import {drawMineMinimap,type MineMapSnapshot} from './mine-map.ts';
const SIZE=180,VISIBLE_METRES=310;
export function createMinimap(deps:MapDeps,raster:MapRaster,open:()=>void,mine?:()=>MineMapSnapshot|null){
  const root=document.createElement('button');root.type='button';root.className='ui-minimap';root.setAttribute('aria-label','Ouvrir la carte du monde (M)');root.title='Ouvrir la carte · M';
  const canvas=document.createElement('canvas');canvas.width=SIZE;canvas.height=SIZE;canvas.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.className='ui-minimap-title';const labelText=document.createTextNode('Carte · M');label.append(hudIcon('map'),labelText);
  root.append(canvas,label);root.addEventListener('click',open);
  const ctx=canvas.getContext('2d'),b=deps.bounds,worldWidth=b.maxX-b.minX,worldDepth=b.maxZ-b.minZ;
  let base:HTMLCanvasElement|null=null,frame=0,removed=false;
  function background(){
    if(!base){base=document.createElement('canvas');base.width=raster.width;base.height=raster.height;}
    if(!raster.done)return;
    base.getContext('2d')?.putImageData(new ImageData(raster.data,raster.width,raster.height),0,0);
  }
  function update(){
    if(!ctx||removed||document.body.classList.contains('touch-mode'))return; // Mobile displays a map shortcut, not the 180px raster.
    const underground=mine?.();
    if(underground){
      drawMineMinimap(ctx,underground);
      const label='Mine · '+underground.levelName+' · M';
      if(labelText.textContent!==label)labelText.textContent=label;
      root.setAttribute('aria-label','Ouvrir le plan de la mine, '+underground.levelName+' (M)');
      root.title='Plan de la mine · M';
      return;
    }
    root.title='Carte de l’île · M';
    const player=deps.player(),zoom=SIZE/VISIBLE_METRES;
    ctx.fillStyle='#d2ded2';ctx.fillRect(0,0,SIZE,SIZE);
    if(base&&raster.done){ctx.imageSmoothingEnabled=true;ctx.drawImage(base,(b.minX-player.x)*zoom+SIZE/2,(b.minZ-player.z)*zoom+SIZE/2,worldWidth*zoom,worldDepth*zoom);}
    const toMini=(x:number,z:number)=>({x:(x-player.x)*zoom+SIZE/2,y:(z-player.z)*zoom+SIZE/2});
    const markerKinds:Record<MapMarker['kind'],string>={mine:'#765037',farm:'#b78237',npc:'#4a83ae',quest:'#cd6d43',poi:'#4d7455',waypoint:'#a34e75',ferry:'#285986'};
    const markers=deps.markers();
    for(const m of markers){
      if(Math.abs(m.x-player.x)>VISIBLE_METRES/2||Math.abs(m.z-player.z)>VISIBLE_METRES/2)continue;
      const pos=toMini(m.x,m.z);ctx.fillStyle=markerKinds[m.kind];ctx.beginPath();ctx.arc(pos.x,pos.y,m.active?5:3.25,0,Math.PI*2);ctx.fill();
      if(m.active){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();}
    }
    const destination=markers.find(m=>m.active);
    if(destination){
      const vx=(destination.x-player.x)*zoom,vy=(destination.z-player.z)*zoom;
      const dx=Math.max(9,Math.min(SIZE-9,SIZE/2+vx)),dy=Math.max(9,Math.min(SIZE-9,SIZE/2+vy));
      ctx.strokeStyle='#a34e75';ctx.lineWidth=1.5;ctx.setLineDash([3,3]);
      ctx.beginPath();ctx.moveTo(SIZE/2,SIZE/2);ctx.lineTo(dx,dy);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#a34e75';ctx.beginPath();ctx.arc(dx,dy,4,0,Math.PI*2);ctx.fill();
      const meters=Math.round(Math.hypot(destination.x-player.x,destination.z-player.z));
      const text=meters+' m · M';if(labelText.textContent!==text)labelText.textContent=text;
      root.setAttribute('aria-label','Carte : '+destination.label+' à '+meters+' mètres (M)');
    }else{if(labelText.textContent!=='Carte · M')labelText.textContent='Carte · M';root.setAttribute('aria-label','Ouvrir la carte du monde (M)');}
    ctx.save();ctx.translate(SIZE/2,SIZE/2);ctx.rotate(Math.PI-player.yaw);
    ctx.fillStyle='#fffdf4';ctx.strokeStyle='#315e49';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(7,7);ctx.lineTo(0,3);ctx.lineTo(-7,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  }
  function build(){
    frame=0;if(removed)return;
    if(raster.done){background();update();return;}
    raster.step(4);
    if(raster.done){background();update();}else{update();frame=requestAnimationFrame(build);}
  }
  frame=requestAnimationFrame(build);
  return {element:root,update,dispose(){removed=true;cancelAnimationFrame(frame);root.remove();base=null;}};
}
