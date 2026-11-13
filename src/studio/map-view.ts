import {node} from './dom.ts';
import type {StudioSession} from './session.ts';
import {createTerrainSource} from '../terrain.ts';
import type {ProjectDocument} from '../studio-core/types.ts';
/** Low-resolution hypsometric preview of the base relief + loaded edits (≤ 256 px on the long side).
 * Pure sampling: it never configures the shared runtime terrain or loads 3D geometry. */
export function topographyCanvas(p:ProjectDocument):HTMLCanvasElement{
 const b=p.world.bounds,width=b.maxX-b.minX,length=b.maxZ-b.minZ,step=Math.max(width,length)/256,w=Math.max(2,Math.round(width/step)),h=Math.max(2,Math.round(length/step));
 const edits=Object.values(p.chunks).flatMap(c=>c.terrainEdits).sort((a,c)=>a.order-c.order);
 const height=createTerrainSource({seed:p.world.seed,density:p.world.density,width,length,seaLevel:p.world.seaLevel,...(p.world.terrain?{terrain:p.world.terrain}:{})},edits);
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d')!,image=ctx.createImageData(w,h),sea=p.world.seaLevel;
 const sample=new Float32Array((w+1)*(h+1));for(let j=0;j<=h;j++)for(let i=0;i<=w;i++)sample[j*(w+1)+i]=height(-width/2+Math.min(width,(i+.5)*width/w),-length/2+Math.min(length,(j+.5)*length/h));
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){
  const y=sample[j*(w+1)+i]-sea,shade=Math.max(.6,Math.min(1.25,1+(sample[j*(w+1)+i+1]-sample[(j+1)*(w+1)+i])/step*1.6));
  const c=y<0?[110+Math.max(-60,y)*.6,170+Math.max(-60,y)*.6,190]:y<3?[222,206,160]:y<80?[150,182,128]:y<200?[164,176,134]:y<350?[168,162,146]:[150,140,132];
  const k=(j*w+i)*4,f=y<0?1:shade;image.data[k]=c[0]*f;image.data[k+1]=c[1]*f;image.data[k+2]=c[2]*f;image.data[k+3]=255;
 }
 ctx.putImageData(image,0,0);return canvas;
}
export function mountMap(host:HTMLElement,session:StudioSession,onPick:(x:number,z:number)=>void){
 const wrap=node('div','','map-wrap'),canvas=node('canvas'),note=node('div','Glisser : déplacer · Molette : zoom · Clic : sélectionner / placer','map-note');wrap.append(canvas,note);host.replaceChildren(wrap);
 const ctx=canvas.getContext('2d')!,p=session.document,b=p.world.bounds;
 let scale=1,cx=session.selection.state.camera.x,cz=session.selection.state.camera.z;
 const base=()=>Math.min(canvas.width/(b.maxX-b.minX+50),canvas.height/(b.maxZ-b.minZ+50))*scale;
 const point=(x:number,z:number)=>({x:canvas.width/2+(x-cx)*base(),y:canvas.height/2+(z-cz)*base()});
 const world=(x:number,y:number)=>({x:cx+(x-canvas.width/2)/base(),z:cz+(y-canvas.height/2)/base()});
 let topo:HTMLCanvasElement|null=null,topoKey='';
 const draw=()=>{
  const r=wrap.getBoundingClientRect();canvas.width=Math.max(1,r.width);canvas.height=Math.max(1,r.height);ctx.fillStyle='#e9f0e5';ctx.fillRect(0,0,canvas.width,canvas.height);
  const a=point(b.minX,b.minZ),c=point(b.maxX,b.maxZ);
  const key=JSON.stringify(p.world.terrain??null)+'|'+p.world.editSequence+'|'+Object.keys(p.chunks).length;
  if(key!==topoKey){topoKey=key;try{topo=topographyCanvas(p);}catch{topo=null;}}
  if(topo){ctx.imageSmoothingEnabled=true;ctx.drawImage(topo,a.x,a.y,c.x-a.x,c.y-a.y);}else{ctx.fillStyle='#d3dfbf';ctx.fillRect(a.x,a.y,c.x-a.x,c.y-a.y);}
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
