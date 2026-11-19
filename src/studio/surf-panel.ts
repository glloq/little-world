/** Minimal authoring tool for deterministic surf sea zones. No transient UI data in the map. */
import {node,button,field,numberInput,select,input} from './dom.ts';
import {projectRaceTerrainEnvironment} from '../studio-core/race-terrain-context.ts';
import {planThreeSurfBeaches} from '../surf/surf-island-planner.ts';
import {putAuthoredRace} from '../studio-core/race-authoring.ts';
import {validateSurfZone,type SurfZone} from '../surf/wave-field.ts';
import type {SurfWaveStyle} from '../surf/wave-shape.ts';
import {validateSurfFeature,type SurfFeature, type SurfFeatureKind} from '../surf/surf-features.ts';
import type {StudioSession} from './session.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';

export interface SurfPanelContext {
 session:StudioSession;viewport:StudioViewport;status:(message:string,error?:boolean)=>void;
}
const dirs:[string,string,number,number][]=[
 ['north','Vers le nord',0,-1],['south','Vers le sud',0,1],
 ['east','Vers l’est',1,0],['west','Vers l’ouest',-1,0]
];
const presets={
 gentle:{amplitude:.65,wavelength:25,speed:4.5,style:'gentle'},
 rolling:{amplitude:1.2,wavelength:32,speed:6.2,style:'long'},
 power:{amplitude:2,wavelength:42,speed:7.8,style:'powerful'},
 arcade:{amplitude:1.5,wavelength:24,speed:8.5,style:'fast'},
 /** Long swell: twice the usual spacing (fewer, faster, taller waves; ÷2–3 triangles). */
 longSwell:{amplitude:2.2,wavelength:72,speed:9,style:'long'}
} as const;
/** Swell shapes (wave-shape.ts). 'classic' = historical profile of older maps. */
const styleLabels:readonly (readonly [SurfWaveStyle,string])[]=[
 ['classic','Classique (historique)'],['gentle','Houle douce'],['long','Vagues longues'],
 ['fast','Vagues rapides'],['powerful','Vagues puissantes'],['tubular','Vagues tubulaires'],
 ['shorebreak','Shorebreak (bord de plage)']];
export function mountSurfPanel(host:HTMLElement,ctx:SurfPanelContext):void{
 const p=ctx.session.document,zones=Object.values(p.libraries.surfZones??{});
 host.append(node('div','SURF','kicker'),node('h3','Zones de vagues'),
  node('p','Placez la caméra au-dessus de la mer, choisissez une direction vers la côte puis créez une zone de surf. Les vagues sont calculées à 30 Hz dans le jeu.','muted'));
 let width=220,length=300,direction='north',preset:keyof typeof presets='rolling';
 let title='Nouvelle plage de surf';
 const create=button('Créer une zone au centre de la vue',async()=>{
  try{
   const world=ctx.session.document.world,env=projectRaceTerrainEnvironment(ctx.session.document);
   const center=ctx.viewport.camera.target,d=dirs.find(v=>v[0]===direction)!;
   const longX=Math.abs(d[2])>.5,longZ=!longX;
   const zone:SurfZone={id:'surf:'+crypto.randomUUID(),minX:center.x-(longX?length:width)/2,
     maxX:center.x+(longX?length:width)/2,minZ:center.z-(longZ?length:width)/2,
     maxZ:center.z+(longZ?length:width)/2,dirX:d[2],dirZ:d[3],
     seaLevel:world.seaLevel,seed:Math.max(0,world.seed),...presets[preset],
     // New zones: rounded outline and gently curved crests, invisible border into the sea.
     shoreFadeDepth:3,edgeFade:Math.max(10,Math.min(45,Math.min(width,length)*.16)),barrelStrength:.85,
     form:{organic:true,curvature:0,meander:4,meanderLength:160}};
   validateSurfZone(zone);
   if(zone.minX<world.bounds.minX+4||zone.maxX>world.bounds.maxX-4||
      zone.minZ<world.bounds.minZ+4||zone.maxZ>world.bounds.maxZ-4)
     throw Error('Zone trop proche des limites du monde : déplacez la caméra ou réduisez la taille');
   for(let ix=-1;ix<=1;ix++)for(let iz=-1;iz<=1;iz++){
     const x=center.x+ix*(zone.maxX-zone.minX)*.42,z=center.z+iz*(zone.maxZ-zone.minZ)*.42;
     if(world.seaLevel-env.height(x,z)<1.1)throw Error('Zone sur terre ou mer trop peu profonde : choisir une zone de mer libre');
     if(env.occupation(x,z))throw Error('Zone occupée : '+env.occupation(x,z));
   }
   if(Object.keys(ctx.session.document.libraries.surfZones??{}).length>=32)throw Error('32 zones maximum');
   await ctx.session.change('Créer zone surf',[],draft=>{
     draft.libraries.surfZones={...(draft.libraries.surfZones??{}),[zone.id]:zone};
   });
   ctx.status('Zone surf créée. Prévisualisez-la avec Jouer ici, et tracez un circuit dans Courses.');
  }catch(e){ctx.status(String(e instanceof Error?e.message:e),true);}
 },'primary-button');
 host.append(field('Nom de projet (repère local)',input(title,v=>{title=v;})),
  field('Largeur (m)',numberInput(width,v=>width=v,20,500)),
  field('Longueur (m)',numberInput(length,v=>length=v,30,1000)),
  field('Direction des vagues vers la côte',select(direction,dirs.map(d=>[d[0],d[1]] as const),v=>direction=v)),
  field('Style des vagues',select(preset,[['gentle','Douces'],['rolling','Longues vagues'],['power','Grandes vagues'],['arcade','Arcade'],['longSwell','Houle longue (72 m)']],v=>preset=v as keyof typeof presets)),
  create,
  node('p','Enregistrez les zones avec le projet Studio V3. Les anciennes îles sans zone restent inchangées. Les tremplins et boosts seront placés dans le panneau Courses après leur intégration.','muted')
 );
 const generateCoast=button('Implanter 3 plages surf A/B/C',async()=>{
  try{
   const project=ctx.session.document,env=projectRaceTerrainEnvironment(project);
   const plan=planThreeSurfBeaches(env.height,project.world.bounds,project.world.seaLevel,
     Math.max(0,project.world.seed),project.world.worldId,env.occupation);
   if(plan.beaches.length!==3)
     throw Error('Côte insuffisante pour trois zones sûres : '+plan.warnings.join(' ; '));
   const old=Object.values(project.libraries.surfZones??{});
   for(const b of plan.beaches)for(const other of old){
    if(b.zone.minX<other.maxX&&b.zone.maxX>other.minX&&
       b.zone.minZ<other.maxZ&&b.zone.maxZ>other.minZ)
      throw Error('Une zone surf occupe déjà la future plage '+b.name);
   }
   const features=plan.beaches.flatMap(b=>b.features);
   if(old.length+plan.beaches.length>32||
      Object.keys(project.libraries.surfFeatures??{}).length+features.length>200||
      Object.keys(project.libraries.races??{}).length+plan.beaches.length>64)
    throw Error('Bibliothèques surf/courses pleines : aucun changement effectué');
   await ctx.session.change('Installer les 3 plages de surf sur le relief',[],draft=>{
    draft.libraries.surfZones={...(draft.libraries.surfZones??{}),
      ...Object.fromEntries(plan.beaches.map(b=>[b.zone.id,b.zone]))};
    draft.libraries.surfFeatures={...(draft.libraries.surfFeatures??{}),
      ...Object.fromEntries(features.map(f=>[f.id,f]))};
    for(const beach of plan.beaches)putAuthoredRace(draft,beach.gates);
   });
   const port=plan.calmPort;
   ctx.status('Plages A/B/C et 3 courses installées. '+
    (port?'Eau calme repérée à '+Math.round(port.x)+', '+Math.round(port.z)+
      ' (quai et bateau à implanter séparément).':'Emplacement du port à choisir manuellement.')+
    ' Ouvrez Courses puis Jouer ici pour tester.');
  }catch(e){ctx.status(String(e instanceof Error?e.message:e),true);}
 },'primary-button');
 host.append(node('h4','Implantation côtière assistée'),
  node('p','Cherche automatiquement une côte praticable pour 3 plages : A débutants, B tubes et grandes vagues, C boosts et tremplin. Crée 3 courses réelles et réserve un repère de port calme sans inventer de quai. Si le terrain est incompatible, ne modifie rien.','muted'),
  generateCoast);
 const list=node('div','','feature-list');
 for(const zone of zones){
   const row=node('div','','feature-row'),controls=node('div','','chip-row');
   const update=(patch:Partial<SurfZone>)=>void ctx.session.change('Modifier zone surf',[],draft=>{
     const next=validateSurfZone({...zone,...patch});
     (draft.libraries.surfZones??={})[zone.id]=next;
   }).catch(e=>ctx.status(String(e),true));
   controls.append(button('Voir',()=>ctx.viewport.goTo((zone.minX+zone.maxX)/2,(zone.minZ+zone.maxZ)/2,150)),
     button('Supprimer',()=>void ctx.session.change('Supprimer zone surf',[],draft=>{
       if(draft.libraries.surfZones)delete draft.libraries.surfZones[zone.id];
     }).catch(e=>ctx.status(String(e),true))));
   row.append(node('strong',zone.id),controls,
     field('Hauteur des vagues (m)',numberInput(zone.amplitude,v=>update({amplitude:v}),.05,5)),
     field('Longueur d’onde (m)',numberInput(zone.wavelength,v=>update({wavelength:v}),4,120)),
     field('Vitesse front (m/s)',numberInput(zone.speed,v=>update({speed:v}),.5,22)),
     field('Intensité du tube 3D (0 = aucun)',numberInput(zone.barrelStrength??0,v=>update({barrelStrength:v}),0,1)),
     field('Forme de la houle',select(zone.style??'classic',styleLabels,v=>update({style:v as SurfWaveStyle}))),
     field('Contour de la zone',select(zone.form?.organic?'organic':'rectangle',
       [['rectangle','Rectangle (historique)'],['organic','Organique (bords invisibles)']],
       v=>update({form:{...zone.form,organic:v==='organic'},edgeFade:v==='organic'?Math.max(zone.edgeFade??12,24):zone.edgeFade}))),
     field('Courbure des crêtes (‰/m, négatif = vers le large)',numberInput((zone.form?.curvature??0)*1000,
       v=>update({form:{...zone.form,curvature:v/1000}}),-10,10)),
     field('Ondulation des crêtes (m)',numberInput(zone.form?.meander??0,v=>update({form:{...zone.form,meander:v}}),0,30)),
     field('Longueur d’ondulation (m)',numberInput(zone.form?.meanderLength??160,v=>update({form:{...zone.form,meanderLength:v}}),30,2000)),
     field('Fondu des bords (m)',numberInput(zone.edgeFade??12,v=>update({edgeFade:v}),1,100)));
   list.append(row);
 }
 if(!zones.length)list.append(node('p','Aucune zone de surf : les eaux restent calmes et leur physique historique est conservée.','muted'));
 host.append(node('h4','Zones du projet ('+zones.length+'/32)'),list);
 // Every module is authored relative to a validated, active wave zone.
 let featureKind:SurfFeatureKind='boost',featurePower=5;
 const addFeature=button('Placer un module à la caméra',async()=>{
  try{
   const point=ctx.viewport.camera.target,zone=zones.find(z=>
     point.x>=z.minX&&point.x<=z.maxX&&point.z>=z.minZ&&point.z<=z.maxZ);
   if(!zone)throw Error('Placez la caméra au-dessus d’une zone surf existante');
   const env=projectRaceTerrainEnvironment(ctx.session.document);
   if(env.height(point.x,point.z)>zone.seaLevel-.8)throw Error('Module surf trop près du rivage ou hors de l’eau');
   const f:SurfFeature={id:'surf-feature:'+crypto.randomUUID(),kind:featureKind,
     x:point.x,z:point.z,dirX:zone.dirX,dirZ:zone.dirZ,
     radius:featureKind==='ramp'?4.5:featureKind==='boost'?5:2,
     power:featureKind==='buoy'?0:featurePower,cooldownTicks:featureKind==='buoy'?25:150};
   validateSurfFeature(f);
   if(Object.keys(ctx.session.document.libraries.surfFeatures??{}).length>=200)throw Error('200 modules surf maximum');
   await ctx.session.change('Ajouter module surf',[],draft=>{
     draft.libraries.surfFeatures={...(draft.libraries.surfFeatures??{}),[f.id]:f};
   });
   ctx.status('Module aquatique ajouté à la zone de surf.');
  }catch(e){ctx.status(String(e instanceof Error?e.message:e),true);}
 },'primary-button');
 host.append(node('h4','Modules aquatiques'),
   node('p','Les modules sont statiques et déclenchent leurs effets à 30 Hz. Le joueur peut les utiliser hors d’une course.','muted'),
   field('Type de module',select(featureKind,[['boost','Anneau accélérateur'],['ramp','Tremplin'],['buoy','Bouée']],v=>featureKind=v as SurfFeatureKind)),
   field('Puissance / impulsion',numberInput(featurePower,v=>featurePower=v,0,25)),
   addFeature);
 const features=Object.values(p.libraries.surfFeatures??{});
 for(const f of features){
   const row=node('div','','feature-row');
   row.append(node('strong',f.kind+' · '+f.id),
     button('Voir',()=>ctx.viewport.goTo(f.x,f.z,35)),
     field('Puissance',numberInput(f.power,v=>void ctx.session.change('Puissance module surf',[],draft=>{
       (draft.libraries.surfFeatures??={})[f.id]=validateSurfFeature({...f,power:v});
     }).catch(e=>ctx.status(String(e),true)),0,25)),
     button('Supprimer',()=>void ctx.session.change('Supprimer module surf',[],draft=>{
       if(draft.libraries.surfFeatures)delete draft.libraries.surfFeatures[f.id];
     }).catch(e=>ctx.status(String(e),true))));
   host.append(row);
 }

}
