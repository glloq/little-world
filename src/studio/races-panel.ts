import {parseSkiArea,inspectSkiArea} from '../snow/ski-area.ts';
/** Studio V3: author fixed race courses with the shared 3D polyline editor and history. */
import * as THREE from 'three';
import {node,button,field,input,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';
import type {PolylineTarget} from './viewport/polyline-tool.ts';
import {ALPINE_RACE_ID,raceFromSkiArea} from '../studio-core/ski-race.ts';
import type {RaceDefinition,RaceGate,RaceKind} from '../gameplay/races.ts';
import {authoredRaceFromTrace,gatesFromTrace,putAuthoredRace,removeAuthoredRace} from '../studio-core/race-authoring.ts';
import {terrainHeight} from '../terrain.ts';
import {installShowcaseRaces} from '../studio-core/race-demo-layouts.ts';
import {trackDiagnostics,trackLength,validateRaceTrack,type RaceTrack,type TrackFeatureKind} from '../gameplay/race-track.ts';
import {availableTrackFeature,roadbedFromGates} from '../gameplay/race-track-presets.ts';
import {findRaceTerrainPlacements,inspectRaceTerrain,raceFromTerrainPlacement,type PlacementCandidate,type PlacementStyle} from '../studio-core/race-terrain-planner.ts';
import {projectRaceTerrainEnvironment,skiAreaTerrainEnvironment} from '../studio-core/race-terrain-context.ts';

export interface RacePanelContext {
 session:StudioSession;viewport:StudioViewport;
 status(message:string,error?:boolean):void;
 edit(target:PolylineTarget):void;
}
const modes:[RaceKind,string][]=[['flight','Vol en planeur'],['roll','Roulade'],['mixed','Roulade puis vol'],['surf','Surf / sauts aquatiques'],['ski','Descente sur neige']];
function linesFor(gates:readonly RaceGate[]):THREE.Group{
 const verts:number[]=[];
 const edge=(a:THREE.Vector3,b:THREE.Vector3)=>{verts.push(a.x,a.y,a.z,b.x,b.y,b.z);};
 for(const g of gates){
   const c=new THREE.Vector3(g.center.x,g.center.y,g.center.z),
     right=new THREE.Vector3(g.normal.z,0,-g.normal.x),
     up=new THREE.Vector3(0,1,0);
   const point=(u:number,v:number)=>c.clone().addScaledVector(right,u).addScaledVector(up,v);
   if(g.shape==='circle'){
     for(let i=0;i<20;i++){
       const a=i*Math.PI/10,b=(i+1)*Math.PI/10;
       edge(point(Math.cos(a)*g.width/2,Math.sin(a)*g.height/2),
            point(Math.cos(b)*g.width/2,Math.sin(b)*g.height/2));
     }
   }else{
     const w=g.width/2,h=g.height/2;
     edge(point(-w,-h),point(-w,h));edge(point(-w,h),point(w,h));edge(point(w,h),point(w,-h));
   }
 }
 const geom=new THREE.BufferGeometry();
 geom.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
 const mesh=new THREE.LineSegments(geom,new THREE.LineBasicMaterial({color:0xffce79,depthTest:false}));
 mesh.renderOrder=35;
 const group=new THREE.Group();group.name='RaceAuthoringGatePreview';group.add(mesh);return group;
}
function raceTarget(ctx:RacePanelContext,options:{name:string;kind:RaceKind;id:string;existing?:RaceDefinition}):PolylineTarget{
 const p=ctx.session.document,old=options.existing;
 const points=old?old.gates.map(g=>({x:g.center.x,z:g.center.z})):[];
 const height=options.kind==='surf'?(_:number,__:number)=>p.world.seaLevel:terrainHeight;
 const make=(next:readonly {x:number;z:number}[])=>authoredRaceFromTrace(p.world,{
   id:options.id,name:options.name,kind:options.kind,old,
   points:next,height
 });
 return {label:old?'Modifier le circuit '+old.name:'Créer le circuit '+options.name,
   points,min:2,max:24,color:0xf0ba49,
   diagnose:next=>{try{make(next);return null;}catch(e){return String(e instanceof Error?e.message:e);}},
   preview:next=>{try{return linesFor(gatesFromTrace(next,options.kind,height,old));}catch{return null;}},
   commit:async next=>{const race=make(next);await ctx.session.change(old?'Modifier le tracé de course':'Créer un circuit',[],draft=>putAuthoredRace(draft,race));}
 };
}
function roadTarget(ctx:RacePanelContext,race:RaceDefinition):PolylineTarget{
 const track=race.track??roadbedFromGates(race);
 const p=ctx.session.document;
 return {label:'Piste : '+race.name,points:track.points.map(x=>({...x})),min:2,max:64,color:0xb88c51,
   diagnose:points=>{
     try{validateRaceTrack({...track,points},p.world.bounds);return null;}
     catch(e){return String(e instanceof Error?e.message:e);}
   },
   commit:async points=>{
     const next={...track,points:points.map(p=>({...p}))};
     validateRaceTrack(next,p.world.bounds);
     await ctx.session.change('Modifier la route du circuit',[],draft=>putAuthoredRace(draft,{...race,track:next}));
   }
 };
}
export function mountRacesPanel(host:HTMLElement,ctx:RacePanelContext){
 const p=ctx.session.document,races=Object.values(p.libraries.races??{});
 if(p.libraries.alpine){const area=p.libraries.alpine['composition-alpine'],card=node('fieldset');card.append(node('legend','Descente de ski'),node('p',area.name+' · '+area.points.length+' points · largeur '+area.widthM+' m','muted'));
  const make=(points:{x:number;z:number}[],document=ctx.session.document)=>{const next=parseSkiArea({...area,points},document.world.bounds),env=skiAreaTerrainEnvironment(document),report=inspectSkiArea(next,env);if(!report.ok)throw Error(report.diagnostics.join(' · '));return next;};
  card.append(button('Voir la descente de ski',()=>{const q=area.points.at(-1)!;ctx.viewport.goTo(q.x,q.z,75);}),button('Modifier le tracé de ski',()=>ctx.edit({label:'Descente de ski',points:area.points.map(q=>({...q})),min:2,max:128,color:0x8ae8ff,diagnose:points=>{try{make(points);return null;}catch(e){return String(e);}},commit:async points=>{await ctx.session.change('Modifier la descente de ski',[],draft=>{const next=make(points,draft);
    const race=draft.libraries.races?.[ALPINE_RACE_ID],env=skiAreaTerrainEnvironment(draft);
    if(race&&race.layoutKey===raceFromSkiArea(draft.world,area,env.height).layoutKey)
     putAuthoredRace(draft,raceFromSkiArea(draft.world,next,env.height));
    draft.libraries.alpine={...draft.libraries.alpine,'composition-alpine':next};});}})),field('Équipement de prêt',select(area.equipment,[['skis','Skis'],['snowboard','Snowboard']],async value=>{await ctx.session.change('Équipement alpin',[],draft=>{draft.libraries.alpine!['composition-alpine'].equipment=value as typeof area.equipment;});})));
  const lift=node('input');lift.type='checkbox';lift.checked=area.lift;lift.onchange=()=>{void ctx.session.change('Remontée alpine',[],draft=>{draft.libraries.alpine!['composition-alpine'].lift=lift.checked;});};card.append(field('Remontée mécanique prototype',lift),node('p','B alterne skis et snowboard. Les portes d’un chrono de ski utilisent le tracé enneigé.','muted'));
  if(!p.libraries.races?.[ALPINE_RACE_ID])card.append(button('Créer un chrono sur cette descente',async()=>{
   try{
    await ctx.session.fullDocument();
    await ctx.session.change('Créer le chrono de ski',[],draft=>{
     const piste=draft.libraries.alpine?.['composition-alpine'];
     if(!piste)throw Error('Descente de ski absente');
     const env=skiAreaTerrainEnvironment(draft),report=inspectSkiArea(piste,env);
     if(!report.ok)throw Error(report.diagnostics.join(' · '));
     putAuthoredRace(draft,raceFromSkiArea(draft.world,piste,env.height));
    });
    ctx.status('Chrono de ski ajouté aux circuits du monde.');
   }catch(error){ctx.status(String(error),true);}
  }));
  host.append(card);
 }

 let newKind:RaceKind='roll',newName='Nouveau circuit';
 host.append(node('div','COURSES','kicker'),node('h3','Circuits fixes du monde'),
   node('p','Placez les checkpoints dans l’ordre avec le tracé 3D. Chaque circuit est enregistré dans le projet V3 et compilé dans « Jouer ici ».','muted'),
   field('Nom du nouveau circuit',input(newName,v=>{newName=v.trim();})),
   field('Mode de déplacement',select(newKind,modes,v=>{newKind=v as RaceKind;})),
   button('Tracer un circuit',()=>ctx.edit(raceTarget(ctx,{id:'race:'+crypto.randomUUID(),name:newName,kind:newKind})),'primary-button'),
   button('Ajouter 3 exemples ici',async()=>{
     const target=ctx.viewport.camera.target;
     try{
       let count=0;
       await ctx.session.change('Créer trois circuits de démonstration',[],draft=>{
         count=installShowcaseRaces(draft,{x:target.x,z:target.z},terrainHeight);
       });
       ctx.status(count?count+' circuits exemples ajoutés. Ajustez les portes selon le relief et les obstacles.':'Exemples déjà installés : aucun circuit écrasé.');
     }catch(e){ctx.status(String(e instanceof Error?e.message:e),true);}
   }),
   node('p','Clic = ajouter une porte ; glisser = déplacer ; Entrée = valider ; Échap = annuler. Ajustez ensuite les dimensions et les altitudes des portes.','muted'));
 // Opt-in planner: no source mutation until the author explicitly accepts a proposal.
 const planner=node('details','','section-card');planner.open=true;
 let searchStyle:PlacementStyle='downhill',targetLength=210,trackWidth=8,searchRadius=260;
 const results=node('div','','feature-list');
 const mode=select(searchStyle,[['downhill','Descente avec dénivelé'],['flat','Piste sur terrain relativement plat']],v=>{searchStyle=v as PlacementStyle;});
 const lengthControl=numberInput(targetLength,v=>{targetLength=v;},90,360);
 const widthControl=numberInput(trackWidth,v=>{trackWidth=v;},5,12);
 const radiusControl=numberInput(searchRadius,v=>{searchRadius=v;},60,450);
 const action=button('Analyser le relief autour de la vue',async()=>{
   try{
     results.replaceChildren(node('p','Analyse des pentes et des passages libres…','muted'));
     await ctx.session.fullDocument(); // All terrain edits and masks, not the viewport's partial chunk cache.
     const env=projectRaceTerrainEnvironment(ctx.session.document),anchor=ctx.viewport.camera.target;
     const search=findRaceTerrainPlacements(env,{anchor:{x:anchor.x,z:anchor.z},style:searchStyle,
       targetLength, width:trackWidth,radius:searchRadius,maxResults:3});
     results.replaceChildren(node('p',search.checked+' tracés analysés · '+search.candidates.length+' proposition(s) admissible(s).','muted'));
     if(!search.candidates.length){
       const reason=Object.entries(search.rejected).sort((a,b)=>b[1]-a[1]).slice(0,4)
         .map(([code,count])=>code+' : '+count).join(' ; ');
       results.append(node('p','Aucun passage fiable ici ('+reason+'). Élargissez la zone ou déplacez la vue vers un plateau / versant dégagé.','muted'));
     }
     const display=(proposal:PlacementCandidate,index:number)=>{
       const card=node('div','','feature-row');
       const text=proposal.style==='downhill'?'Descente':'Plat';
       card.append(node('strong','Proposition '+(index+1)+' · '+text+' · score '+proposal.score+'/100'),
         node('p',Math.round(proposal.metrics.lengthM)+' m · '+proposal.metrics.dropM.toFixed(1)+' m de dénivelé · pente max '+Math.round(proposal.metrics.maxSlope*100)+' % · '+proposal.track.features.length+' éléments préplacés','muted'),
         node('p',proposal.notes.join(' · ')||'Tracé simple sans module : vous pouvez en ajouter ensuite.','muted'),
         button('Voir sur le terrain',()=>{
           const entry=proposal.track.points[0],finish=proposal.track.points.at(-1)!;
           ctx.viewport.goTo((entry.x+finish.x)/2,(entry.z+finish.z)/2,Math.max(45,proposal.metrics.lengthM*.7));
           const r=raceFromTerrainPlacement(ctx.session.document.world,'race:preview','Aperçu du parcours',proposal,env);
           ctx.viewport.setRacePreview(r.gates);
           ctx.viewport.setRaceTrackPreview(r.track??null);
         }),
         button('Créer cette piste',async()=>{
           try{
             await ctx.session.fullDocument();
             const latest=projectRaceTerrainEnvironment(ctx.session.document);
             const checked=inspectRaceTerrain(proposal.track,latest,proposal.style);
             if(!checked.valid)throw Error('Le relief ou les zones disponibles ont changé : relancez la recherche ('+checked.issues[0].message+').');
             const id='race:'+crypto.randomUUID(),name=(proposal.style==='downhill'?'Descente':'Circuit plat')+' · '+Math.round(proposal.metrics.lengthM)+' m';
             const created=raceFromTerrainPlacement(ctx.session.document.world,id,name,proposal,latest);
             await ctx.session.change('Créer un circuit implanté sur le relief réel',[],draft=>putAuthoredRace(draft,created));
             ctx.status('Piste créée dans le projet : '+name+'. Tester la roulade et les réceptions avec « Jouer ici ».');
             results.replaceChildren(node('p','Circuit enregistré. Relancez l’analyse pour d’autres emplacements.','muted'));
           }catch(error){ctx.status(String(error instanceof Error?error.message:error),true);}
         },'primary-button'));
       return card;
     };
     for(let i=0;i<search.candidates.length;i++)results.append(display(search.candidates[i],i));
     if(search.candidates.length){
       const first=search.candidates[0],race=raceFromTerrainPlacement(ctx.session.document.world,'race:preview','Aperçu',first,env);
       ctx.viewport.setRacePreview(race.gates);ctx.viewport.setRaceTrackPreview(race.track??null);
     }
     ctx.status(search.candidates.length?
       'Propositions calculées avec le relief du projet V3. Examinez la trajectoire puis validez un seul circuit.':
       'Aucun circuit sûr trouvé dans la zone sélectionnée. Agrandissez le rayon ou changez de secteur.',!search.candidates.length);
   }catch(error){results.replaceChildren(node('p',String(error instanceof Error?error.message:error),'muted'));ctx.status(String(error),true);}
 },'primary-button');
 planner.append(node('summary','Implantation intelligente sur le relief'),
   node('p','Recherche locale bornée dans le relief exact du projet, sans modifier l’île. Vérifie les limites, l’eau, les zones occupées, la pente, le dévers et les zones de réception.','muted'),
   field('Type de circuit',mode),
   field('Longueur cible (m)',lengthControl),
   field('Largeur (m)',widthControl),
   field('Rayon de recherche (m)',radiusControl),
   action,results);
 host.append(planner);
 const list=node('div','','feature-list');
 for(const race of races){
   const row=node('div','','feature-row'),head=node('strong',race.name+' · '+modes.find(x=>x[0]===race.kind)?.[1]);
   const controls=node('div','','chip-row');
   const edit=(label:string,next:RaceDefinition)=>void ctx.session.change(label,[],draft=>putAuthoredRace(draft,next)).catch(e=>ctx.status(String(e),true));
   controls.append(button('Voir',()=>{ctx.viewport.goTo(race.gates[0].center.x,race.gates[0].center.z,45);ctx.viewport.setRacePreview(race.gates);ctx.viewport.setRaceTrackPreview(race.track??null);}),
     button('Modifier le tracé',()=>ctx.edit(raceTarget(ctx,{name:race.name,kind:race.kind,id:race.id,existing:race}))),
     button('Supprimer',()=>void ctx.session.change('Supprimer un circuit',[],draft=>removeAuthoredRace(draft,race.id)).catch(e=>ctx.status(String(e),true))));
   const gateRows=node('details','','section-card');
   gateRows.append(node('summary','Réglage des '+race.gates.length+' checkpoints'));
   race.gates.forEach((gate,i)=>{
     const line=node('div','','feature-row');
     const patch=(label:string,changes:Partial<RaceGate>)=>{
       const gates=race.gates.map((g,j)=>j===i?{...g,...changes}:g);
       edit(label,{...race,gates});
     };
     const baseHeight=race.kind==='surf'?p.world.seaLevel:terrainHeight(gate.center.x,gate.center.z);
     const clearance=gate.center.y-baseHeight;
     line.append(node('strong',(i===0?'Départ':i===race.gates.length-1?'Arrivée':'Passage '+i)+' · '+gate.id),
       field('Largeur (m)',numberInput(gate.width,v=>patch('Largeur de porte',{width:v}),1.5,100)),
       field('Hauteur (m)',numberInput(gate.height,v=>patch('Hauteur de porte',{height:v}),1.5,100)),
       field(race.kind==='surf'?'Au-dessus du niveau marin (m)':'Au-dessus du relief (m)',numberInput(Math.round(clearance*100)/100,v=>patch('Altitude de porte',{center:{...gate.center,y:baseHeight+v}}),-5,150)),
       field('Forme',select(gate.shape,[['circle','Anneau'],['rectangle','Arche']],v=>patch('Forme de porte',{shape:v as RaceGate['shape']}))));
     gateRows.append(line);
   });
   const route=node('details','','section-card');
   route.append(node('summary',race.track?'Route de course · '+Math.round(trackLength(race.track))+' m':'Route de course · non définie'));
   if(race.kind==='ski')route.append(node('p','La neige de la descente fournit le revêtement. Placez les portes sur le couloir de ski.','muted'));
   else if(race.kind==='flight'||race.kind==='surf')route.append(node('p',race.kind==='surf'?'Les courses de surf utilisent des vagues et obstacles aquatiques, sans route terrestre.':'Les courses entièrement en vol utilisent les anneaux, sans route au sol.','muted'));
   else if(!race.track)route.append(button('Créer la piste depuis les checkpoints',()=>{
     try{edit('Créer la route du circuit',{...race,track:roadbedFromGates(race)});}catch(e){ctx.status(String(e),true);}
   },'primary-button'));
   else {
     const track=race.track;
     route.append(node('p','La route est un tracé indépendant des checkpoints. Ses modules restent placés à une distance fixe du départ, même si vous modifiez les virages.','muted'),
       button('Modifier les virages / la route',()=>ctx.edit(roadTarget(ctx,race))),
       field('Largeur de piste (m)',numberInput(track.width,v=>edit('Largeur de piste',{...race,track:{...track,width:v}}),3,18)),
       field('Revêtement',select(track.material,[['dirt','Terre'],['stone','Pierre'],['wood','Bois']],v=>edit('Revêtement de la piste',{...race,track:{...track,material:v as RaceTrack['material']}}))),
       field('Tracé arrondi',select(track.smooth?'yes':'no',[['yes','Courbes souples'],['no','Virages angulaires']],v=>edit('Style des virages',{...race,track:{...track,smooth:v==='yes'}}))));
     const issues=trackDiagnostics(track,{height:terrainHeight});
     for(const issue of issues)route.append(node('p',(issue.severity==='ERROR'?'Erreur : ':'À vérifier : ')+issue.message+' (vers '+Math.round(issue.distance)+' m)','muted'));
     const kinds:readonly [TrackFeatureKind,string][]=[['bank','Virage relevé'],['ramp','Tremplin'],['bumps','Bosses'],['bridge','Pont ou passerelle']];
     let selected:TrackFeatureKind='bank';
     const newFeature=select(selected,kinds,v=>{selected=v as TrackFeatureKind;});
     route.append(node('h4','Modules sur la piste'),field('Nouvel élément',newFeature),
       button('Ajouter un élément',()=>{
         try{
           const feature=availableTrackFeature(track,selected,'feature:'+crypto.randomUUID());
           edit('Ajouter un module de piste',{...race,track:{...track,features:[...track.features,feature]}});
         }catch(e){ctx.status(String(e instanceof Error?e.message:e),true);}
       }));
     for(const feature of track.features){
       const featureEditor=node('details','','section-card');
       featureEditor.append(node('summary',kinds.find(k=>k[0]===feature.kind)?.[1]+' · '+Math.round(feature.at)+'–'+Math.round(feature.at+feature.length)+' m'));
       const modify=(label:string,patch:Partial<typeof feature>)=>{
         edit(label,{...race,track:{...track,features:track.features.map(f=>f.id===feature.id?{...f,...patch}:f)}});
       };
       featureEditor.append(
         field('Position depuis le départ (m)',numberInput(feature.at,v=>modify('Déplacer un élément',{at:v}),0,Math.round(trackLength(track)),'0.5')),
         field('Longueur (m)',numberInput(feature.length,v=>modify('Longueur d’un élément',{length:v}),3,120)),
         ...(feature.kind==='bank'?[field('Inclinaison latérale (°)',numberInput(feature.bankDeg??0,v=>modify('Inclinaison du virage',{bankDeg:v}),-35,35))]:
           [field('Hauteur (m)',numberInput(feature.height,v=>modify('Hauteur de l’obstacle',{height:v}),0,8))]),
         button('Retirer cet élément',()=>edit('Retirer un module de piste',{...race,track:{...track,features:track.features.filter(f=>f.id!==feature.id)}}))
       );
       route.append(featureEditor);
     }
     route.append(button('Retirer la piste (garder les checkpoints)',()=>edit('Retirer la route du circuit',{...race,track:undefined})));
   }
   row.append(head,field('Nom',input(race.name,v=>edit('Renommer un circuit',{...race,name:v}))),controls,route,gateRows);
   list.append(row);
 }
 if(!races.length)list.append(node('p','Aucun circuit fixe enregistré. Créez le premier parcours depuis cette vue.','muted'));
 host.append(node('h4','Circuits du projet ('+races.length+'/64)'),list);
 ctx.viewport.setRacePreview(races[0]?.gates??null);
 ctx.viewport.setRaceTrackPreview(races[0]?.track??null);
 return ()=>{ctx.viewport.setRacePreview(null);ctx.viewport.setRaceTrackPreview(null);};
}
