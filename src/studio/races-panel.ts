/** Studio V3: author fixed race courses with the shared 3D polyline editor and history. */
import * as THREE from 'three';
import {node,button,field,input,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';
import type {PolylineTarget} from './viewport/polyline-tool.ts';
import type {RaceDefinition,RaceGate,RaceKind} from '../gameplay/races.ts';
import {authoredRaceFromTrace,gatesFromTrace,putAuthoredRace,removeAuthoredRace} from '../studio-core/race-authoring.ts';
import {terrainHeight} from '../terrain.ts';
import {installShowcaseRaces} from '../studio-core/race-demo-layouts.ts';
import {trackDiagnostics,trackLength,validateRaceTrack,type RaceTrack,type TrackFeatureKind} from '../gameplay/race-track.ts';
import {availableTrackFeature,roadbedFromGates} from '../gameplay/race-track-presets.ts';

export interface RacePanelContext {
 session:StudioSession;viewport:StudioViewport;
 status(message:string,error?:boolean):void;
 edit(target:PolylineTarget):void;
}
const modes:[RaceKind,string][]=[['flight','Vol en planeur'],['roll','Roulade'],['mixed','Roulade puis vol']];
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
 const make=(next:readonly {x:number;z:number}[])=>authoredRaceFromTrace(p.world,{
   id:options.id,name:options.name,kind:options.kind,old,
   points:next,height:terrainHeight
 });
 return {label:old?'Modifier le circuit '+old.name:'Créer le circuit '+options.name,
   points,min:2,max:24,color:0xf0ba49,
   diagnose:next=>{try{make(next);return null;}catch(e){return String(e instanceof Error?e.message:e);}},
   preview:next=>{try{return linesFor(gatesFromTrace(next,options.kind,terrainHeight,old));}catch{return null;}},
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
     const clearance=gate.center.y-terrainHeight(gate.center.x,gate.center.z);
     line.append(node('strong',(i===0?'Départ':i===race.gates.length-1?'Arrivée':'Passage '+i)+' · '+gate.id),
       field('Largeur (m)',numberInput(gate.width,v=>patch('Largeur de porte',{width:v}),1.5,100)),
       field('Hauteur (m)',numberInput(gate.height,v=>patch('Hauteur de porte',{height:v}),1.5,100)),
       field('Au-dessus du relief (m)',numberInput(Math.round(clearance*100)/100,v=>patch('Altitude de porte',{center:{...gate.center,y:terrainHeight(gate.center.x,gate.center.z)+v}}),-5,150)),
       field('Forme',select(gate.shape,[['circle','Anneau'],['rectangle','Arche']],v=>patch('Forme de porte',{shape:v as RaceGate['shape']}))));
     gateRows.append(line);
   });
   const route=node('details','','section-card');
   route.append(node('summary',race.track?'Route de course · '+Math.round(trackLength(race.track))+' m':'Route de course · non définie'));
   if(race.kind==='flight')route.append(node('p','Les courses entièrement en vol utilisent les anneaux, sans route au sol.','muted'));
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
         field('Position depuis le départ (m)',numberInput(feature.at,v=>modify('Déplacer un élément',{at:v}),0,Math.round(trackLength(track)),.5.toString())),
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
