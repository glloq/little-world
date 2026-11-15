/** Non-intrusive world authoring checklist; reports actual document counts and opens native modules. */
import type {StudioSession} from './session.ts';
import {node,button} from './dom.ts';
export interface GuideActions {
  open(module:string):void;
  play():void;
}
const stages=[
  {id:'map',label:'1. Dessiner la géographie',desc:'Définir îles, montagnes, volcans, vallées, plateaux et falaises sur la carte 2D.',action:'Éditer les formes'},
  {id:'regions',label:'2. Délimiter les grandes régions',desc:'Créer les zones polygonales de forêt, marais, plage et montagne, leur relief et leur recette écologique. Tracer une rivière descendante.',action:'Régions et recettes'},
  {id:'terrain',label:'3. Corriger le relief',desc:'Sculpter les chemins d’accès, berges et plateformes dans la vue 3D.',action:'Sculpter'},
  {id:'water',label:'4. Ajouter l’eau',desc:'Terminer les lacs, cascades et connexions hydrologiques.',action:'Créer les cours d’eau'},
  {id:'biomes',label:'5. Peindre les finitions écologiques',desc:'Retoucher localement les biomes et exclusions sans poser des milliers d’objets.',action:'Peindre la nature'},
  {id:'objects',label:'6. Construire et décorer',desc:'Placer des modèles, des assemblages, des lignes de clôtures et des zones remplies.',action:'Ouvrir les objets'},
  {id:'paths',label:'7. Ajouter les déplacements',desc:'Tracer chemins et accès entre les lieux importants.',action:'Éditer les chemins'},
  {id:'characters',label:'8. Rendre le monde vivant',desc:'Ajouter des habitants, leurs routines et les interactions.',action:'Créer des habitants'},
  {id:'zones',label:'9. Définir les activités',desc:'Placer mines, agriculture et régions interactives.',action:'Éditer les zones'},
  {id:'tests',label:'10. Vérifier avant de jouer',desc:'Contrôler ressources, hydrologie, limites de carte et collisions.',action:'Valider'}
] as const;
export function mountCreationGuide(host:HTMLElement,session:StudioSession,actions:GuideActions):void{
  const p=session.document,water=Object.values(p.libraries.water),paths=Object.values(p.libraries.paths),
    zones=Object.values(p.libraries.zones??{}),entities=Object.values(p.entityIndex),
    assets=Object.keys(p.assets),assemblyCount=Object.keys(p.libraries.assemblies??{}).length;
  const root=node('section','','section-card guide-workspace');
  root.append(node('div','ASSISTANT DE CRÉATION','kicker'),node('h2','De la carte vierge au monde jouable'),
    node('p','Ce parcours est facultatif : vous pouvez changer d’étape à tout moment. Tous les outils modifient la même source V3 avec Annuler/Refaire.','muted'));
  const report=node('div','','guide-summary');
  report.append(node('strong',p.manifest.name),
    node('p',`${Math.round(p.world.bounds.maxX-p.world.bounds.minX)} × ${Math.round(p.world.bounds.maxZ-p.world.bounds.minZ)} m · ${water.length} eau(x) · ${paths.length} chemin(s) · ${entities.length} entité(s) · ${zones.length} zone(s) · ${assemblyCount} assemblage(s) · ${assets.length} références d’assets.`,'muted'));
  root.append(report);
  const list=node('div','','guide-steps');
  for(const stage of stages){
    const box=node('div','','section-card guide-step');
    box.append(node('h3',stage.label),node('p',stage.desc,'muted'),
      button(stage.action,()=>actions.open(stage.id),'light-button'));
    list.append(box);
  }
  root.append(list,
    node('h3','Prévisualiser la carte'),
    node('p','Une fois les éléments de base en place, testez les déplacements et interactions avec le lecteur de jeu réel.','muted'),
    button('Jouer ici',actions.play,'primary-button'),
    node('p','Conseil : exportez régulièrement le ZIP source et vérifiez les accès après toute modification importante du relief.','muted'));
  host.replaceChildren(root);
}
