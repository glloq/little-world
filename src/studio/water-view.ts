import type {WaterBody} from '../world-data.ts';
import {createTerrainSource} from '../terrain.ts';
import {compileWaterBody,validateWaterProfile} from '../water/profile.ts';
import {drawHydroProfile} from '../water/profile-view.ts';
import {waterChunkIds,waterEditChunkIds} from '../water/sectors.ts';
import {putWater,removeWater} from '../studio-core/source.ts';
import {button,field,node,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';

export function mountWater(host:HTMLElement,tools:HTMLElement,s:StudioSession){
 const p=s.document,b=p.world.bounds;
 const empty=():WaterBody=>({id:crypto.randomUUID(),points:[],width:8,depth:2,level:4,profile:{mode:'terrain',offset:-.35}});
 let draft=empty(),disposed=false,generation=0,committing=false;
 const workspace=node('div','','water-workspace'),map=node('canvas'),plot=node('canvas'),summary=node('p','','muted'),messages=node('div');
 map.width=1000;map.height=600;map.setAttribute('aria-label','Tracer le cours d’eau de l’amont vers l’aval');
 plot.width=1000;plot.height=200;plot.setAttribute('aria-label','Profil longitudinal terrain et eau');
 workspace.append(node('p','Cliquer de la source vers l’arrivée. Modifier les points ci-dessous ou inverser le tracé avant validation.','muted'),map,plot,summary,messages);host.replaceChildren(workspace);
 const source=()=>createTerrainSource({seed:p.world.seed,density:p.world.density,seaLevel:p.world.seaLevel},Object.values(p.chunks).flatMap(c=>c.terrainEdits).sort((a,b)=>a.order-b.order));
 const xy=(v:{x:number;z:number})=>({x:20+(v.x-b.minX)/(b.maxX-b.minX)*960,y:20+(v.z-b.minZ)/(b.maxZ-b.minZ)*560});
 function draw(){
  const ctx=map.getContext('2d')!;ctx.fillStyle='#e7efdc';ctx.fillRect(0,0,1000,600);
  for(const w of [...Object.values(p.libraries.water).filter(v=>v.id!==draft.id),draft]){
   ctx.strokeStyle=w.id===draft.id?'#137da8':'#96c4cf';ctx.lineWidth=Math.max(2,w.width/(b.maxX-b.minX)*960);ctx.beginPath();
   w.points.forEach((v,i)=>{const q=xy(v);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.stroke();
  }
  draft.points.forEach((v,i)=>{const q=xy(v);ctx.fillStyle='#175c79';ctx.beginPath();ctx.arc(q.x,q.y,5,0,Math.PI*2);ctx.fill();ctx.fillText(String(i+1),q.x+7,q.y-7);});
 }
 async function refresh(){
  const token=++generation;draw();
  await s.hydrate(waterChunkIds(p.world,draft));if(disposed||token!==generation)return;
  validateWaterProfile(draft.profile,draft.points.length);
  const profile=compileWaterBody(draft,source());drawHydroProfile(plot,profile);
  summary.textContent=profile.points.length?`${draft.points.length} points · ${profile.points.at(-1)!.distance.toFixed(0)} m · Eau : ${profile.points[0].level.toFixed(2)} → ${profile.points.at(-1)!.level.toFixed(2)} m · Terrain brun / eau bleue`:'Ajouter au moins deux points. Les niveaux sont en mètres.';
  messages.replaceChildren(...profile.diagnostics.map(d=>node('p',d.message,'diagnostic '+d.severity)));
 }
 const update=()=>{void refresh().catch(e=>messages.replaceChildren(node('p',String(e),'diagnostic ERROR')));};
 function controls(){
  tools.replaceChildren(node('h3','Eau · tracés et profil'));
  const choices:[string,string][]=[['','Nouveau cours d’eau'],...Object.values(p.libraries.water).map((w,i)=>[w.id,`Eau ${i+1} · ${w.id.slice(0,6)}`] as [string,string])];
  tools.append(field('Tracé d’eau',select(p.libraries.water[draft.id]?draft.id:'',choices,id=>{draft=id?structuredClone(p.libraries.water[id]):empty();s.selection.select(id?{kind:'water',id}:null);controls();update();})));
  const mode=draft.profile?.mode??'constant';
  tools.append(field('Type d’eau',select(mode,[['terrain','Cours d’eau — relief'],['constant','Plan d’eau — horizontal'],['manual','Profil manuel verrouillé']],v=>{
   if(v==='constant')delete draft.profile;
   else if(v==='terrain')draft.profile={mode:'terrain',offset:-.35};
   else {let previous=Infinity;const height=source();draft.profile={mode:'manual',levels:draft.points.map(v=>previous=Math.min(previous,height(v.x,v.z)-.35))};}
   controls();update();
  })));
  const change=(fn:()=>void)=>{fn();update();};
  tools.append(field('Largeur (m)',numberInput(draft.width,v=>change(()=>draft.width=v),1,40)),field('Profondeur (m)',numberInput(draft.depth,v=>change(()=>draft.depth=v),.5,20)));
  if(draft.profile?.mode==='terrain')tools.append(field('Décalage eau / terrain (m)',numberInput(draft.profile.offset,v=>change(()=>{if(draft.profile?.mode==='terrain')draft.profile.offset=v;}),-10,10)));
  if(!draft.profile)tools.append(field('Altitude du plan d’eau (m)',numberInput(draft.level,v=>change(()=>draft.level=v),-20,100)));
  for(const [i,point] of draft.points.entries()){
   const row=node('div','','water-point');row.append(node('strong',`Point ${i+1}`));
   for(const axis of ['x','z'] as const)row.append(field(`Point ${i+1} ${axis.toUpperCase()}`,numberInput(point[axis],v=>change(()=>point[axis]=v),axis==='x'?b.minX+.1:b.minZ+.1,axis==='x'?b.maxX-.1:b.maxZ-.1)));
   if(draft.profile?.mode==='manual')row.append(field(`Point ${i+1} altitude`,numberInput(draft.profile.levels[i],v=>change(()=>{if(draft.profile?.mode==='manual')draft.profile.levels[i]=v;}),-50,150)));
   tools.append(row);
  }
  tools.append(button('Inverser amont / aval',()=>{draft.points.reverse();if(draft.profile?.mode==='manual')draft.profile.levels.reverse();controls();update();}),button('Retirer le dernier point',()=>{draft.points.pop();if(draft.profile?.mode==='manual')draft.profile.levels.pop();controls();update();}));
  tools.append(button('Appliquer le tracé',async()=>{
   if(committing)return;committing=true;
   try{
    await s.hydrate(waterChunkIds(p.world,draft));validateWaterProfile(draft.profile,draft.points.length);
    const profile=compileWaterBody(draft,source()),errors=profile.diagnostics.filter(d=>d.severity==='ERROR');
    if(errors.length)throw Error(errors.map(d=>d.message).join(' '));
    const copy=structuredClone(draft),ids=waterEditChunkIds(p,p.libraries.water[copy.id],copy);
    await s.change('Modifier le tracé d’eau',ids,d=>putWater(d,copy));s.selection.select({kind:'water',id:copy.id});
    if(!disposed){controls();await refresh();messages.append(node('p','Tracé appliqué ; Annuler / Refaire disponibles.','status-success'));}
   }catch(e){if(!disposed)messages.replaceChildren(node('p',String(e),'diagnostic ERROR'));}finally{committing=false;}
  },'primary-button'));
  if(p.libraries.water[draft.id])tools.append(button('Supprimer ce tracé',async()=>{
   try{const id=draft.id;await s.change('Supprimer le tracé d’eau',waterEditChunkIds(p,p.libraries.water[id],undefined),d=>removeWater(d,id));}catch(e){messages.replaceChildren(node('p',String(e),'diagnostic ERROR'));}
  }));
 }
 map.onclick=e=>{
  if(draft.points.length>=100)return;
  const rect=map.getBoundingClientRect(),x=(e.clientX-rect.left)*1000/rect.width,z=(e.clientY-rect.top)*600/rect.height;
  draft.points.push({x:Math.max(b.minX+.1,Math.min(b.maxX-.1,b.minX+(x-20)/960*(b.maxX-b.minX))),z:Math.max(b.minZ+.1,Math.min(b.maxZ-.1,b.minZ+(z-20)/560*(b.maxZ-b.minZ)))});
  if(draft.profile?.mode==='manual')draft.profile.levels.push(draft.profile.levels.at(-1)??draft.level);
  controls();update();
 };
 const selection=s.selection.state.selected;
 if(selection?.kind==='water'&&p.libraries.water[selection.id])draft=structuredClone(p.libraries.water[selection.id]);
 const unsubscribe=s.commands.subscribe(()=>{const selected=s.selection.state.selected,restored=p.libraries.water[draft.id]??(selected?.kind==='water'?p.libraries.water[selected.id]:undefined);draft=restored?structuredClone(restored):empty();if(!disposed){controls();update();}});
 controls();update();
 return {dispose(){disposed=true;generation++;unsubscribe();}};
}
