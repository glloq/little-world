import type {WaterBody} from '../world-data.ts';
import {createTerrainSource} from '../terrain.ts';
import {compileWaterNetwork,validateWaterProfile,validateWaterNetworkFields} from '../water/profile.ts';
import {drawHydroProfile} from '../water/profile-view.ts';
import {waterChunkIds,waterEditChunkIds} from '../water/sectors.ts';
import {putWater,removeWater} from '../studio-core/source.ts';
import {button,field,node,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';

export function mountWater(host:HTMLElement,tools:HTMLElement,s:StudioSession){
 const p=s.document,b=p.world.bounds;
 const empty=():WaterBody=>({id:crypto.randomUUID(),points:[],width:8,depth:2,level:4,profile:{mode:'terrain',offset:-.35}});
 // lastId: the edited river survives undo/redo even though undo prunes it from the selection.
 let draft=empty(),disposed=false,generation=0,committing=false,lastId='';
 const workspace=node('div','','water-workspace'),map=node('canvas'),plot=node('canvas'),summary=node('p','','muted'),messages=node('div');
 map.width=1000;map.height=600;map.setAttribute('aria-label','Tracer le cours d’eau de l’amont vers l’aval');
 plot.width=1000;plot.height=200;plot.setAttribute('aria-label','Profil longitudinal terrain et eau');
 workspace.append(node('p','Cliquer de la source vers l’arrivée. Modifier les points ci-dessous ou inverser le tracé avant validation.','muted'),map,plot,summary,messages);host.replaceChildren(workspace);
 const source=()=>createTerrainSource({seed:p.world.seed,density:p.world.density,seaLevel:p.world.seaLevel,width:p.world.bounds.maxX-p.world.bounds.minX,length:p.world.bounds.maxZ-p.world.bounds.minZ,...(p.world.terrain?{terrain:p.world.terrain}:{})},Object.values(p.chunks).flatMap(c=>c.terrainEdits).sort((a,b)=>a.order-b.order));
 const xy=(v:{x:number;z:number})=>({x:20+(v.x-b.minX)/(b.maxX-b.minX)*960,y:20+(v.z-b.minZ)/(b.maxZ-b.minZ)*560});
 function draw(){
  const ctx=map.getContext('2d')!;ctx.fillStyle='#e7efdc';ctx.fillRect(0,0,1000,600);
  const height=source();
  for(let iz=0;iz<28;iz++)for(let ix=0;ix<48;ix++){
   const h=height(b.minX+(ix+.5)/48*(b.maxX-b.minX),b.minZ+(iz+.5)/28*(b.maxZ-b.minZ));
   const band=Math.max(0,Math.min(20,Math.floor((h-p.world.seaLevel)/4)));
   ctx.fillStyle=h<p.world.seaLevel?'#b6d1ce':`rgb(${168-band*3},${193-band*3},${139-band*3})`;
   ctx.fillRect(20+ix*20,20+iz*20,20,20);
  }
  for(const w of [...Object.values(p.libraries.water).filter(v=>v.id!==draft.id),draft]){
   ctx.strokeStyle=w.id===draft.id?'#137da8':'#96c4cf';ctx.lineWidth=Math.max(2,w.width/(b.maxX-b.minX)*960);ctx.beginPath();
   w.points.forEach((v,i)=>{const q=xy(v);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});if(w.kind==='lake'){ctx.closePath();ctx.fillStyle='rgba(79,159,192,.45)';ctx.fill();}ctx.stroke();
  }
  draft.points.forEach((v,i)=>{const q=xy(v);ctx.fillStyle='#175c79';ctx.beginPath();ctx.arc(q.x,q.y,5,0,Math.PI*2);ctx.fill();ctx.fillText(String(i+1),q.x+7,q.y-7);});
 }
 async function refresh(){
  const token=++generation;draw();
  await s.hydrate(waterChunkIds(p.world,draft));if(disposed||token!==generation)return;draw();
  validateWaterProfile(draft.profile,draft.points.length);
  // Whole network: links to lakes, rivers and the sea are diagnosed with the draft in place.
  const network=compileWaterNetwork([...Object.values(p.libraries.water).filter(w=>w.id!==draft.id),draft],source(),p.world.seaLevel),profile=network.at(-1)!;
  if(draft.kind==='lake'){const ctx=plot.getContext('2d')!;ctx.clearRect(0,0,plot.width,plot.height);summary.textContent=draft.points.length>=3?`Lac · ${draft.points.length} sommets · niveau ${draft.level.toFixed(2)} m · profondeur ${draft.depth} m`:'Cliquer au moins trois sommets du rivage.';messages.replaceChildren(...profile.diagnostics.map(d=>node('p',d.message,'diagnostic '+d.severity)));return;}
  drawHydroProfile(plot,profile);
  summary.textContent=profile.points.length?`${draft.points.length} points · ${profile.points.at(-1)!.distance.toFixed(0)} m · Eau : ${profile.points[0].level.toFixed(2)} → ${profile.points.at(-1)!.level.toFixed(2)} m · Terrain brun / eau bleue`:'Ajouter au moins deux points. Les niveaux sont en mètres.';
  messages.replaceChildren(...profile.diagnostics.map(d=>node('p',d.message,'diagnostic '+d.severity)));
 }
 const update=()=>{void refresh().catch(e=>messages.replaceChildren(node('p',String(e),'diagnostic ERROR')));};
 /** V3 hydrography: river or lake, oriented links (source / outlet), explicit waterfalls. */
 function networkControls(){
  tools.append(field('Forme',select(draft.kind==='lake'?'lake':'river',[['river','Cours d’eau (tracé orienté)'],['lake','Lac (contour, niveau constant)']],v=>{
   if(v==='lake'){draft.kind='lake';delete draft.profile;delete draft.from;delete draft.to;delete draft.falls;}else{delete draft.kind;draft.profile={mode:'terrain',offset:-.35};}controls();update();})));
  if(draft.kind==='lake')return; // level: « Altitude du plan d’eau » below
  const others=Object.values(p.libraries.water).filter(w=>w.id!==draft.id),label=(w:WaterBody)=>(w.kind==='lake'?'Lac ':'Rivière ')+w.id.slice(0,8);
  const links:[string,string][]=[['','Aucun'],['sea','La mer'],...others.map(w=>[(w.kind==='lake'?'lake:':'river:')+w.id,label(w)] as [string,string])];
  const encode=(l?:WaterBody['to'])=>!l?'':l.kind==='sea'?'sea':l.kind+':'+l.id,decode=(v:string):WaterBody['to']=>!v?undefined:v==='sea'?{kind:'sea'}:{kind:v.split(':')[0] as 'lake'|'river',id:v.slice(v.indexOf(':')+1)};
  tools.append(field('Sort de',select(encode(draft.from),links.filter(l=>l[0]!=='sea'),v=>{const l=decode(v);if(l)draft.from=l;else delete draft.from;update();})),
   field('Se jette dans',select(encode(draft.to),links,v=>{const l=decode(v);if(l)draft.to=l;else delete draft.to;update();})));
  const falls=node('div','','water-falls');falls.append(node('h4','Cascades (niveaux haut et bas explicites)'));
  for(const [k,f] of (draft.falls??[]).entries()){const row=node('div','','water-point');row.append(field(`Cascade ${k+1} au point`,numberInput(f.at+1,v=>{f.at=Math.round(v)-1;update();},2,Math.max(2,draft.points.length-1),'1')),field('Haut (m)',numberInput(f.top,v=>{f.top=v;update();},-50,150)),field('Bas (m)',numberInput(f.bottom,v=>{f.bottom=v;update();},-50,150)),button('Retirer la cascade',()=>{draft.falls=draft.falls!.filter(x=>x!==f);if(!draft.falls.length)delete draft.falls;controls();update();}));falls.append(row);}
  if(draft.points.length>=3)falls.append(button('Ajouter une cascade',()=>{const at=Math.floor(draft.points.length/2),c=compileWaterNetwork([draft],source(),p.world.seaLevel)[0],q=draft.points[at],near=c.points.reduce((a,v)=>Math.hypot(v.x-q.x,v.z-q.z)<Math.hypot(a.x-q.x,a.z-q.z)?v:a,c.points[0]),top=Math.floor(near.level*10)/10;draft.falls=[...(draft.falls??[]),{at,top,bottom:Math.round((top-3)*10)/10}];controls();update();}));
  tools.append(falls);
 }
 function controls(){
  tools.replaceChildren(node('h3','Eau · tracés et profil'));
  const choices:[string,string][]=[['','Nouveau cours d’eau'],...Object.values(p.libraries.water).map((w,i)=>[w.id,`Eau ${i+1} · ${w.id.slice(0,6)}`] as [string,string])];
  tools.append(field('Tracé d’eau',select(p.libraries.water[draft.id]?draft.id:'',choices,id=>{draft=id?structuredClone(p.libraries.water[id]):empty();lastId=id;s.selection.select(id?{kind:'water',id}:null);controls();update();})));
  networkControls();
  const mode=draft.profile?.mode??'constant';
  if(draft.kind!=='lake')tools.append(field('Type d’eau',select(mode,[['terrain','Cours d’eau — relief'],['constant','Plan d’eau — horizontal'],['manual','Profil manuel verrouillé']],v=>{
   if(v==='constant')delete draft.profile;
   else if(v==='terrain')draft.profile={mode:'terrain',offset:-.35};
   else {let previous=Infinity;const height=source();draft.profile={mode:'manual',levels:draft.points.map(v=>previous=Math.min(previous,height(v.x,v.z)-.35))};}
   controls();update();
  })));
  const change=(fn:()=>void)=>{fn();update();};
  tools.append(field('Largeur (m)',numberInput(draft.width,v=>change(()=>draft.width=v),1,40)),field('Profondeur (m)',numberInput(draft.depth,v=>change(()=>draft.depth=v),.5,20)));
  if(draft.profile?.mode==='terrain')tools.append(field('Décalage eau / terrain (m)',numberInput(draft.profile.offset,v=>change(()=>{if(draft.profile?.mode==='terrain')draft.profile.offset=v;}),-10,10)));
  if(!draft.profile)tools.append(field('Altitude du plan d’eau (m)',numberInput(draft.level,v=>change(()=>draft.level=v),-20,100)));
  tools.append(button('Inverser amont / aval',()=>{draft.points.reverse();if(draft.profile?.mode==='manual')draft.profile.levels.reverse();controls();update();}),button('Retirer le dernier point',()=>{draft.points.pop();if(draft.profile?.mode==='manual')draft.profile.levels.pop();controls();update();}));
  tools.append(button('Appliquer le tracé',async()=>{
   if(committing)return;committing=true;
   try{
    await s.hydrate(waterChunkIds(p.world,draft));validateWaterProfile(draft.profile,draft.points.length);validateWaterNetworkFields(draft);
    const profile=compileWaterNetwork([...Object.values(p.libraries.water).filter(w=>w.id!==draft.id),draft],source(),p.world.seaLevel).at(-1)!,errors=profile.diagnostics.filter(d=>d.severity==='ERROR');
    if(errors.length)throw Error(errors.map(d=>d.message).join(' '));
    const copy=structuredClone(draft),ids=waterEditChunkIds(p,p.libraries.water[copy.id],copy);lastId=copy.id;
    await s.change('Modifier le tracé d’eau',ids,d=>putWater(d,copy));s.selection.select({kind:'water',id:copy.id});
    if(!disposed){controls();await refresh();messages.append(node('p','Tracé appliqué ; Annuler / Refaire disponibles.','status-success'));}
   }catch(e){if(!disposed)messages.replaceChildren(node('p',String(e),'diagnostic ERROR'));}finally{committing=false;}
  },'primary-button'));
  if(p.libraries.water[draft.id])tools.append(button('Supprimer ce tracé',async()=>{
   try{const id=draft.id;await s.change('Supprimer le tracé d’eau',waterEditChunkIds(p,p.libraries.water[id],undefined),d=>removeWater(d,id));}catch(e){messages.replaceChildren(node('p',String(e),'diagnostic ERROR'));}
  }));
  for(const [i,point] of draft.points.entries()){
   const row=node('div','','water-point');row.append(node('strong',`Point ${i+1}`));
   for(const axis of ['x','z'] as const)row.append(field(`Point ${i+1} ${axis.toUpperCase()}`,numberInput(point[axis],v=>change(()=>point[axis]=v),axis==='x'?b.minX+.1:b.minZ+.1,axis==='x'?b.maxX-.1:b.maxZ-.1)));
   if(draft.profile?.mode==='manual')row.append(field(`Point ${i+1} altitude`,numberInput(draft.profile.levels[i],v=>change(()=>{if(draft.profile?.mode==='manual')draft.profile.levels[i]=v;}),-50,150)));
   tools.append(row);
  }

 }
 map.onclick=e=>{
  if(draft.points.length>=100)return;
  const rect=map.getBoundingClientRect(),x=(e.clientX-rect.left)*1000/rect.width,z=(e.clientY-rect.top)*600/rect.height;
  draft.points.push({x:Math.round(100*Math.max(b.minX+.1,Math.min(b.maxX-.1,b.minX+(x-20)/960*(b.maxX-b.minX))))/100,z:Math.round(100*Math.max(b.minZ+.1,Math.min(b.maxZ-.1,b.minZ+(z-20)/560*(b.maxZ-b.minZ))))/100});
  if(draft.profile?.mode==='manual')draft.profile.levels.push(draft.profile.levels.at(-1)??draft.level);
  controls();update();
 };
 const selection=s.selection.state.selected;
 if(selection?.kind==='water'&&p.libraries.water[selection.id]){draft=structuredClone(p.libraries.water[selection.id]);lastId=draft.id;}
 const unsubscribe=s.commands.subscribe(()=>{const selected=s.selection.state.selected,restored=p.libraries.water[draft.id]??p.libraries.water[lastId]??(selected?.kind==='water'?p.libraries.water[selected.id]:undefined);draft=restored?structuredClone(restored):empty();if(restored)lastId=restored.id;if(!disposed){controls();update();}});
 controls();update();
 return {dispose(){disposed=true;generation++;unsubscribe();}};
}
