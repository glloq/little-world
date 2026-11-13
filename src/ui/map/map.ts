/** World map (M). A light 2D raster of the existing relief/water functions, computed once and
 * progressively (a few ms per frame, never a second Three.js scene or a duplicated world), then
 * cached. Zoom (wheel, + / −), pan (drag, arrows), general / local views, player position and
 * heading, markers (mines, plots, inhabitants, active missions). « Visited » marks are session
 * interface state: no save contract stores discoveries yet, so nothing is persisted. */
import {el,button} from '../shared/dom.ts';

export interface MapMarker {id:string;kind:'mine'|'farm'|'npc'|'quest';label:string;x:number;z:number}
export interface MapDeps {bounds:{minX:number;maxX:number;minZ:number;maxZ:number};height(x:number,z:number):number;water(x:number,z:number):number|null;seaLevel:number;markers():MapMarker[];player():{x:number;z:number;yaw:number}}
/** Raster of the world (z grows downwards, north = −Z at the top), filled row by row. */
export function createMapRaster(deps:Pick<MapDeps,'bounds'|'height'|'water'|'seaLevel'>,maxSide=256){
  const b=deps.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ,scale=maxSide/Math.max(w,d),width=Math.max(8,Math.round(w*scale)),height=Math.max(8,Math.round(d*scale)),data=new Uint8ClampedArray(width*height*4);
  let row=0;const heights=new Float32Array(width*2);
  const sample=(i:number,j:number)=>{const x=b.minX+(i+.5)/width*w,z=b.minZ+(j+.5)/height*d;return {x,z,h:deps.height(x,z)};};
  return {width,height,data,get done(){return row>=height;},get progress(){return row/height;},
    /** Compute rows until the budget is spent; returns true when the raster is complete. */
    step(budgetMs:number){const t0=performance.now(),startRow=row;
      // At least one row per call (progress is guaranteed), then as many as the budget allows.
      while(row<height&&(performance.now()-t0<budgetMs||row===startRow)){
        for(let i=0;i<width;i++){const {x,z,h}=sample(i,row),wl=deps.water(x,z),o=(row*width+i)*4,prev=row?heights[(row-1)%2*width+i]:h;heights[row%2*width+i]=h;
          if(wl!==null&&wl>h+.05){const depth=Math.min(1,(wl-h)/8);data[o]=110-50*depth;data[o+1]=172-50*depth;data[o+2]=196-30*depth;}
          else{const e=Math.max(0,Math.min(1,(h-deps.seaLevel)/120)),shade=Math.max(-.2,Math.min(.2,(prev-h)*.08));const lo=e<.5?e*2:1,hi=e<.5?0:(e-.5)*2,r=146+44*lo+18*hi,g=184-12*lo+20*hi,bl=118+14*lo+60*hi;data[o]=r*(1+shade);data[o+1]=g*(1+shade);data[o+2]=bl*(1+shade);}
          data[o+3]=255;}
        row++;}
      return row>=height;}};
}
type Raster=ReturnType<typeof createMapRaster>;
const COLORS:Record<MapMarker['kind'],string>={mine:'#7a4f2e',farm:'#c9952f',npc:'#3b6fa0',quest:'#c4472f'};
const ICONS:Record<MapMarker['kind'],string>={mine:'⛏',farm:'❀',npc:'●',quest:'!'};
export function mapPanel(deps:MapDeps){
  let raster:Raster|null=null,frame=0,canvas:HTMLCanvasElement|null=null,ppm=0,cx=0,cz=0,visited=new Set<string>();
  const b=deps.bounds,fit=()=>{if(!canvas)return;ppm=Math.min(canvas.width/(b.maxX-b.minX),canvas.height/(b.maxZ-b.minZ))*.95;cx=(b.minX+b.maxX)/2;cz=(b.minZ+b.maxZ)/2;};
  const local=()=>{const p=deps.player();ppm=4;cx=p.x;cz=p.z;};
  const toScreen=(x:number,z:number)=>({x:(x-cx)*ppm+canvas!.width/2,y:(z-cz)*ppm+canvas!.height/2});
  let image:HTMLCanvasElement|null=null;
  function draw(){
    if(!canvas||!raster)return;const g=canvas.getContext('2d');if(!g)return;g.fillStyle='#bcd8dc';g.fillRect(0,0,canvas.width,canvas.height);
    image??=document.createElement('canvas');if(image.width!==raster.width){image.width=raster.width;image.height=raster.height;}image.getContext('2d')?.putImageData(new ImageData(raster.data,raster.width,raster.height),0,0);
    const a=toScreen(b.minX,b.minZ),c=toScreen(b.maxX,b.maxZ);g.imageSmoothingEnabled=true;g.drawImage(image,a.x,a.y,c.x-a.x,c.y-a.y);
    const p=deps.player();
    for(const m of deps.markers()){if(Math.hypot(m.x-p.x,m.z-p.z)<35)visited.add(m.id);const s=toScreen(m.x,m.z);if(s.x<-20||s.y<-20||s.x>canvas.width+20||s.y>canvas.height+20)continue;
      g.fillStyle=COLORS[m.kind];g.globalAlpha=visited.has(m.id)||m.kind==='quest'?1:.65;g.beginPath();g.arc(s.x,s.y,m.kind==='npc'?5:8,0,Math.PI*2);g.fill();g.globalAlpha=1;g.fillStyle='#fff';g.font='bold 10px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText(ICONS[m.kind],s.x,s.y+.5);
      if(ppm>.5||m.kind==='quest'){g.fillStyle='#22382e';g.font='11px system-ui';g.fillText(m.label+(visited.has(m.id)?' ✓':''),s.x,s.y-14);}}
    // Player: arrow along the camera heading (forward = (sin yaw, cos yaw)).
    const s=toScreen(p.x,p.z),ang=Math.atan2(Math.sin(p.yaw),Math.cos(p.yaw));g.save();g.translate(s.x,s.y);g.rotate(-ang+Math.PI);g.fillStyle='#ffffff';g.strokeStyle='#1f5f4b';g.lineWidth=2.5;g.beginPath();g.moveTo(0,-11);g.lineTo(8,9);g.lineTo(0,4);g.lineTo(-8,9);g.closePath();g.fill();g.stroke();g.restore();
    canvas.dataset.player=`${Math.round(p.x)},${Math.round(p.z)}`;canvas.dataset.progress=raster.done?'1':raster.progress.toFixed(2);canvas.dataset.markers=String(deps.markers().length);canvas.dataset.visited=String(visited.size);
  }
  function loop(){frame=0;if(!canvas?.isConnected||!raster)return;const done=raster.step(6);draw();if(!done)frame=requestAnimationFrame(loop);}
  return {
    render(body:HTMLElement){
      body.replaceChildren();raster??=createMapRaster(deps);const view=el('canvas','ui-map-canvas');canvas=view;canvas.setAttribute('aria-label','Carte du monde');canvas.tabIndex=0;
      const r=body.getBoundingClientRect();canvas.width=Math.max(320,Math.round(Math.min(window.innerWidth*.86,1100)));canvas.height=Math.max(240,Math.round(Math.min(window.innerHeight*.66,720)));void r;fit();
      const zoom=(f:number,ax=view.width/2,ay=view.height/2)=>{const wx=(ax-canvas!.width/2)/ppm+cx,wz=(ay-canvas!.height/2)/ppm+cz;ppm=Math.min(16,Math.max(.02,ppm*f));cx=wx-(ax-canvas!.width/2)/ppm;cz=wz-(ay-canvas!.height/2)/ppm;draw();};
      canvas.addEventListener('wheel',e=>{e.preventDefault();const rect=canvas!.getBoundingClientRect();zoom(e.deltaY<0?1.25:.8,(e.clientX-rect.left)*canvas!.width/rect.width,(e.clientY-rect.top)*canvas!.height/rect.height);},{passive:false});
      let drag:{x:number;y:number}|null=null;canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas!.setPointerCapture(e.pointerId);});
      canvas.addEventListener('pointermove',e=>{if(!drag)return;const rect=canvas!.getBoundingClientRect(),k=canvas!.width/rect.width;cx-=(e.clientX-drag.x)*k/ppm;cz-=(e.clientY-drag.y)*k/ppm;drag={x:e.clientX,y:e.clientY};draw();});
      canvas.addEventListener('pointerup',()=>{drag=null;});
      canvas.addEventListener('keydown',e=>{const step=60/ppm;if(e.key==='+'||e.key==='=')zoom(1.25);else if(e.key==='-')zoom(.8);else if(e.key==='ArrowLeft')cx-=step;else if(e.key==='ArrowRight')cx+=step;else if(e.key==='ArrowUp')cz-=step;else if(e.key==='ArrowDown')cz+=step;else if(e.key==='0')fit();else return;e.preventDefault();e.stopPropagation();draw();});
      const tools=el('div','ui-row ui-map-tools');tools.append(button('Vue générale',()=>{fit();draw();}),button('Autour de moi',()=>{local();draw();}),button('+',()=>zoom(1.25),'ui-button','Zoomer'),button('−',()=>zoom(.8),'ui-button','Dézoomer'));
      const legend=el('p','ui-muted','⛏ mine · ❀ parcelle · ● habitant · ! mission en cours · ✓ visité pendant cette session · Glisser pour déplacer, molette ou + / − pour zoomer, flèches pour parcourir.');
      body.append(tools,canvas,legend);cancelAnimationFrame(frame);frame=requestAnimationFrame(loop);
    },
    close(){cancelAnimationFrame(frame);frame=0;canvas=null;},
    get raster(){return raster;},
  };
}
