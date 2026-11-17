/** Shared authoring controls for creation and protected recomposition. */
import {field,node,numberInput,select} from './dom.ts';
import {ISLAND_STYLES,selectIslandStyle,type IslandModel,type IslandStyle} from '../studio-core/island-styles.ts';
import type {MapRequirements} from '../studio-core/map-requirements.ts';
export function islandStyleControls(r:MapRequirements,change:(next:MapRequirements)=>void):HTMLFieldSetElement{
 const box=node('fieldset'),s=r.islandStyle!;
 box.append(node('legend','Style de l’île'),field('Modèle insulaire',select(s.model,Object.entries(ISLAND_STYLES).map(([id,v])=>[id,v.name]),model=>change(selectIslandStyle(r,model as IslandModel)))),node('p',ISLAND_STYLES[s.model].description,'muted'));
 const set=<K extends keyof IslandStyle>(key:K,value:IslandStyle[K])=>change({...r,islandStyle:{...s,[key]:value}});
 box.append(field('Altitude maximale cible (m)',numberInput(s.altitudeM,v=>set('altitudeM',v),30,1000,'10')),
  field('Orientation (° depuis l’axe vertical)',numberInput(s.orientation,v=>set('orientation',v),0,359,'1')),
  ...(s.model==='caldera'?[]:[field('Allongement de la silhouette',numberInput(s.elongation,v=>set('elongation',v),1,2.5,'.05'))]));
 const advanced=node('details');advanced.append(node('summary','Versants et formations locales'),
  ...(['caldera','volcanic'].includes(s.model)?[]:[field('Intensité des vallées',numberInput(s.valleys,v=>set('valleys',v),0,1,'.05'))]),
  ...(s.model==='caldera'?[]:[field('Présence des plateaux locaux',numberInput(s.plateaus,v=>set('plateaus',v),0,1,'.05'))]),
  field('Demandes de cours d’eau',select(s.hydrology,[['preferred','Souhaits adaptés au terrain'],['required','Nombres strictement obligatoires']],v=>set('hydrology',v as IslandStyle['hydrology']))));
 if(s.model==='volcanic')advanced.append(field('État du volcan',select(s.volcanism,[['ancient','Ancien · versants végétalisés'],['active','Actif · sommet volcanique']],v=>set('volcanism',v as IslandStyle['volcanism']))));
 box.append(advanced);return box;
}
