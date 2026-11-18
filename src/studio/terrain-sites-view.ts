/** Direct editing of native reservation groups on the generated 2D representation. */
import {drawWelcomePreview} from './home-welcome.ts';
import {button,field,node,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import {editTerrainSite,cultivateTerrainSite,removeTerrainSite,recenterTerrainEntry,previewTerrainAccess,applyTerrainAccess} from '../studio-core/terrain-site-edits.ts';
import {validateTerrainAccess} from '../studio-core/terrain-access.ts';
export function mountTerrainSites(host:HTMLElement,tools:HTMLElement,session:StudioSession,status:(s:string)=>void){
 const p=session.document,b=p.world.bounds,canvas=node('canvas'),messages=node('div');canvas.width=850;canvas.height=590;canvas.style.width='100%';canvas.style.height='auto';canvas.style.touchAction='none';canvas.setAttribute('aria-label','Zones utiles et accès du brouillon');host.replaceChildren(canvas,messages);
 const sites=()=>Object.values(p.libraries.terrainPlans??{}).flatMap(p=>p.sites);let selected=sites()[0]?.id??'',disposed=false,busy=false,rect:{x:number;y:number;w:number;h:number},drag:{id:string;x:number;z:number;dx:number;dz:number}|null=null;
 const point=(x:number,z:number)=>({x:rect.x+(x-b.minX)/(b.maxX-b.minX)*rect.w,y:rect.y+(z-b.minZ)/(b.maxZ-b.minZ)*rect.h});
 function draw(){
  rect=drawWelcomePreview(canvas,p);canvas.dataset.view=JSON.stringify({rect,bounds:b});
  const c=canvas.getContext('2d')!;
  for(const site of sites()){
   const q=point(site.entry.x,site.entry.z);c.fillStyle=site.id===selected?'#c15b2e':'#fff';c.strokeStyle='#3c654b';c.lineWidth=2;c.beginPath();c.arc(q.x,q.y,7,0,Math.PI*2);c.fill();c.stroke();
   if(site.id===selected&&drag){const v=point(site.entry.x+drag.dx,site.entry.z+drag.dz);c.strokeStyle='#c15b2e';c.beginPath();c.arc(v.x,v.y,10,0,Math.PI*2);c.stroke();}
  }
 }
 async function run(label:string,edit:Parameters<StudioSession['change']>[2]){
  if(busy)return;busy=true;
  try{await session.change(label,Object.keys(p.chunks),edit);status(label+' · une opération annulable.');}catch(e){status(String(e));}finally{busy=false;if(!disposed)panel();}
 }
 function panel(){
  tools.replaceChildren(node('h3','Zones utiles et accès'));
  const all=sites();if(!all.length){tools.append(node('p','Aucune zone réservée. Activez les champs, le port ou le lac dans les réglages du monde.'));return;}
  const site=all.find(s=>s.id===selected)??all[0];selected=site.id;
  tools.append(field('Zone utile',select(selected,all.map(s=>[s.id,s.name]),id=>{selected=id;panel();draw();})),node('p','Glisser la poignée pour déplacer ensemble plateforme et eau. Les chemins restent en place jusqu’au recalcul explicite.','muted'));
  const f=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.find(f=>f.id===site.featureId):undefined;
  if(f?.kind==='plateau'){
   const h=numberInput(f.heightM,v=>void run('Régler la hauteur de la zone',d=>editTerrainSite(d,site.id,{heightM:v})),site.kind==='lake'?6:1,1000,'1'),edge=numberInput(f.edgeM,v=>void run('Régler le talus de la zone',d=>editTerrainSite(d,site.id,{edgeM:v})),2,600,'1');h.disabled=edge.disabled=site.locked;
   tools.append(field(site.kind==='lake'?'Altitude de la berge (m)':'Altitude du replat (m)',h),field('Largeur du talus (m)',edge));
  }
  const lock=node('input');lock.type='checkbox';lock.checked=site.locked;lock.onchange=()=>void run('Verrouiller la zone',d=>editTerrainSite(d,site.id,{locked:lock.checked}));tools.append(field('Verrouiller géométrie et eau',lock));
  const recenter=button('Recentrer l’entrée sur la zone',()=>void run('Recentrer une entrée',d=>recenterTerrainEntry(d,site.id)));recenter.disabled=site.locked;tools.append(recenter);const remove=button('Supprimer cette zone et ses supports',()=>void run('Supprimer une zone utile',d=>removeTerrainSite(d,site.id)));remove.disabled=site.locked;tools.append(remove);
  tools.append(button('Proposer de nouveaux accès',async()=>{
   if(busy)return;busy=true;
   try{
    const preview=previewTerrainAccess(p);messages.replaceChildren(...preview.diagnostics.map(d=>node('p',d.message,'diagnostic '+d.severity)),button('Appliquer les nouveaux accès',()=>void run('Recalculer les accès',d=>applyTerrainAccess(d,preview)),'primary-button'));
   }catch(e){status(String(e));}finally{busy=false;}
  }));
  const diagnostics=validateTerrainAccess(p);tools.append(...diagnostics.map(d=>node('p',d.message,'diagnostic '+d.severity)));
  if(site.kind==='farm'){const farm=button(site.farmZoneId?'Recaler la parcelle sur le replat':'Créer une parcelle de blé',()=>void run('Aménager la parcelle agricole',d=>cultivateTerrainSite(d,site.id)));farm.disabled=site.locked;tools.append(farm);}
  if(site.kind==='harbor')tools.append(node('p','Emplacement réservé : aucun quai ni bâtiment construit. L’approche maritime reste à qualifier avec les futurs équipements.','muted'));
 }
 function world(e:PointerEvent){const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*canvas.width,y=(e.clientY-r.top)/r.height*canvas.height;return {x:b.minX+(x-rect.x)/rect.w*(b.maxX-b.minX),z:b.minZ+(y-rect.y)/rect.h*(b.maxZ-b.minZ),sx:x,sy:y};}
 canvas.onpointerdown=e=>{
  if(busy)return;const q=world(e),hit=sites().map(s=>({s,d:Math.hypot(point(s.entry.x,s.entry.z).x-q.sx,point(s.entry.x,s.entry.z).y-q.sy)})).sort((a,b)=>a.d-b.d)[0];
  if(!hit||hit.d>14)return;selected=hit.s.id;panel();draw();if(hit.s.locked){status('Zone verrouillée.');return;}canvas.setPointerCapture(e.pointerId);drag={id:hit.s.id,x:q.x,z:q.z,dx:0,dz:0};
 };
 canvas.onpointermove=e=>{if(!drag)return;const q=world(e);drag.dx=q.x-drag.x;drag.dz=q.z-drag.z;draw();};
 canvas.onpointerup=()=>{if(!drag)return;const {id,dx,dz}=drag;drag=null;if(Math.hypot(dx,dz)>1)void run('Déplacer une zone utile',d=>editTerrainSite(d,id,{dx,dz}));else draw();};
 canvas.onpointercancel=()=>{drag=null;draw();};
 const stop=session.commands.subscribe(()=>{if(!disposed){messages.replaceChildren();panel();draw();}});draw();panel();
 return {dispose(){disposed=true;stop();canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=null;}};
}
