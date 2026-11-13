import {node} from './dom.ts';
import type {StudioSession} from './session.ts';
export function mountMap(host:HTMLElement,session:StudioSession,onPick:(x:number,z:number)=>void){
 const wrap=node('div','','map-wrap'),canvas=node('canvas'),note=node('div','Glisser : déplacer · Molette : zoom · Clic : sélectionner / placer','map-note');wrap.append(canvas,note);host.replaceChildren(wrap);
 const ctx=canvas.getContext('2d')!,p=session.document,b=p.world.bounds;
 let scale=1,cx=session.selection.state.camera.x,cz=session.selection.state.camera.z;
 const base=()=>Math.min(canvas.width/(b.maxX-b.minX+50),canvas.height/(b.maxZ-b.minZ+50))*scale;
 const point=(x:number,z:number)=>({x:canvas.width/2+(x-cx)*base(),y:canvas.height/2+(z-cz)*base()});
 const world=(x:number,y:number)=>({x:cx+(x-canvas.width/2)/base(),z:cz+(y-canvas.height/2)/base()});
 const draw=()=>{
  const r=wrap.getBoundingClientRect();canvas.width=Math.max(1,r.width);canvas.height=Math.max(1,r.height);ctx.fillStyle='#e9f0e5';ctx.fillRect(0,0,canvas.width,canvas.height);
  const a=point(b.minX,b.minZ),c=point(b.maxX,b.maxZ);ctx.fillStyle='#d3dfbf';ctx.fillRect(a.x,a.y,c.x-a.x,c.y-a.y);
  ctx.strokeStyle='#9ab294';ctx.lineWidth=.5;
  // Grid only for visible cells, bounded by zoom and viewport.
  const lo=world(0,0),hi=world(canvas.width,canvas.height),step=p.world.chunkSizeM;
  if(step*base()>8){for(let x=Math.max(b.minX,b.minX+Math.ceil((lo.x-b.minX)/step)*step);x<=Math.min(b.maxX,hi.x);x+=step){const q=point(x,0);ctx.beginPath();ctx.moveTo(q.x,a.y);ctx.lineTo(q.x,c.y);ctx.stroke();}for(let z=Math.max(b.minZ,b.minZ+Math.ceil((lo.z-b.minZ)/step)*step);z<=Math.min(b.maxZ,hi.z);z+=step){const q=point(0,z);ctx.beginPath();ctx.moveTo(a.x,q.y);ctx.lineTo(c.x,q.y);ctx.stroke();}}
  for(const line of [...Object.values(p.libraries.water),...Object.values(p.libraries.paths)]){ctx.strokeStyle='kind' in line?'#6aabc0':'#bbac86';ctx.lineWidth=Math.max(2,line.width*base());ctx.beginPath();line.points.forEach((v,i)=>{const q=point(v.x,v.z);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.stroke();}
  for(const chunk of Object.values(p.chunks))for(const edit of chunk.terrainEdits){const q=point(edit.x,edit.z);ctx.strokeStyle='#ae895b';ctx.lineWidth=1;ctx.beginPath();ctx.arc(q.x,q.y,edit.radius*base(),0,Math.PI*2);ctx.stroke();}
  for(const e of Object.values(p.entityIndex)){const q=point(e.position.x,e.position.z);if(q.x<0||q.x>canvas.width||q.y<0||q.y>canvas.height)continue;ctx.fillStyle=session.selection.state.selected?.id===e.id?'#b86c40':e.kind==='character'?'#ad8655':'#426c51';ctx.beginPath();ctx.arc(q.x,q.y,session.selection.state.selected?.id===e.id?7:4,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#526d55';ctx.font='12px system-ui';ctx.fillText(`${b.maxX-b.minX} × ${b.maxZ-b.minZ} m · ${Object.keys(p.chunkIndex).length} secteurs sources`,16,canvas.height-18);
 };
 let start:{x:number;y:number;cx:number;cz:number}|null=null,moved=false;
 canvas.onpointerdown=e=>{start={x:e.clientX,y:e.clientY,cx,cz};moved=false;canvas.setPointerCapture(e.pointerId);};
 canvas.onpointermove=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.hypot(dx,dy)>4)moved=true;if(moved){cx=start.cx-dx/base();cz=start.cz-dy/base();draw();}};
 canvas.onpointerup=e=>{if(!start)return;start=null;if(moved){session.selection.setCamera({x:cx,y:150,z:cz,mode:'map2d'});return;}const r=canvas.getBoundingClientRect(),q=world(e.clientX-r.left,e.clientY-r.top);if(q.x>=b.minX&&q.x<=b.maxX&&q.z>=b.minZ&&q.z<=b.maxZ)onPick(q.x,q.z);};
 canvas.onwheel=e=>{e.preventDefault();scale=Math.max(.25,Math.min(30,scale*Math.exp(-e.deltaY*.001)));draw();};
 const observer=new ResizeObserver(draw);observer.observe(wrap);const unsub=session.subscribe(draw);draw();
 return {dispose(){observer.disconnect();unsub();},focus(x:number,z:number){cx=x;cz=z;draw();}};
}
