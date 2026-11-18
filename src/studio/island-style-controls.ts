import {SILHOUETTES} from '../studio-core/world-terrain-v5.ts';
import {DEFAULT_LAYOUT,type LayoutRequirements} from '../studio-core/terrain-sites.ts';
/** Shared authoring controls for creation and protected recomposition. */
import {field,node,numberInput,select} from './dom.ts';
import {ISLAND_STYLES,selectIslandStyle,type IslandModel,type IslandStyle} from '../studio-core/island-styles.ts';
import type {MapRequirements} from '../studio-core/map-requirements.ts';
export function islandStyleControls(r:MapRequirements,change:(next:MapRequirements)=>void):HTMLFieldSetElement{
 const box=node('fieldset'),s=r.islandStyle!;
 box.append(node('legend','Style de l’île'),field('Modèle insulaire',select(s.model,Object.entries(ISLAND_STYLES).map(([id,v])=>[id,v.name]),model=>change(selectIslandStyle(r,model as IslandModel)))),node('p',ISLAND_STYLES[s.model].description,'muted'));
 if(s.model!=='caldera')box.append(field('Silhouette de l’île',select(s.silhouette??'natural',Object.entries(SILHOUETTES),v=>change({...r,compositionVersion:5,islandStyle:{...s,silhouette:v as IslandStyle['silhouette']}}))));
 const set=<K extends keyof IslandStyle>(key:K,value:IslandStyle[K])=>change({...r,islandStyle:{...s,[key]:value}});
 box.append(field('Altitude maximale cible (m)',numberInput(s.altitudeM,v=>set('altitudeM',v),30,1000,'10')),
  field('Orientation (° depuis l’axe vertical)',numberInput(s.orientation,v=>set('orientation',v),0,359,'1')),
  ...(s.model==='caldera'?[]:[field('Allongement de la silhouette',numberInput(s.elongation,v=>set('elongation',v),1,2.5,'.05'))]));
 const advanced=node('details');advanced.append(node('summary','Versants et formations locales'),
  ...(['caldera','volcanic'].includes(s.model)?[]:[field('Intensité des vallées',numberInput(s.valleys,v=>set('valleys',v),0,1,'.05'))]),
  ...(s.model==='caldera'?[]:[field('Présence des plateaux locaux',numberInput(s.plateaus,v=>set('plateaus',v),0,1,'.05'))]),
  field('Demandes de cours d’eau',select(s.hydrology,[['preferred','Souhaits adaptés au terrain'],['required','Nombres strictement obligatoires']],v=>set('hydrology',v as IslandStyle['hydrology']))));
 if(s.model==='caldera')advanced.append(field('Organisation de la caldeira',select(s.calderaShape??'regular',[['dominant','Grande île principale et îlots'],['organic','Couronne irrégulière · îles de largeurs variées'],['regular','Couronne régulière historique']],v=>change({...r,compositionVersion:5,islandStyle:{...s,calderaShape:v as 'organic'|'regular'|'dominant'}}))));
 if(s.model==='volcanic')advanced.append(field('État du volcan',select(s.volcanism,[['ancient','Ancien · versants végétalisés'],['active','Actif · sommet volcanique']],v=>set('volcanism',v as IslandStyle['volcanism']))));
 box.append(advanced);
 const layout={...DEFAULT_LAYOUT,...r.layout},areas=node('details');areas.append(node('summary','Zones utiles et accès'));
 const setLayout=<K extends keyof LayoutRequirements>(key:K,value:LayoutRequirements[K])=>change({...r,compositionVersion:5,layout:{...layout,[key]:value},...(key==='lake'?{lakes:value as boolean}:{})});
 const check=(label:string,value:boolean,fn:(v:boolean)=>void)=>{const e=node('input');e.type='checkbox';e.checked=value;e.onchange=()=>fn(e.checked);return field(label,e);};
 areas.append(check('Générer un port maritime N1 dès la création',r.maritimePort??false,v=>change({...r,compositionVersion:5,maritimePort:v,...(!v?{welcomeVillage:'none' as const}:{})})),field('Village d’accueil',select(r.welcomeVillage??'none',[['none','Sans village'],['hamlet','Hameau près du port'],['village','Village près du port']],v=>change({...r,compositionVersion:5,welcomeVillage:v as 'none'|'hamlet'|'village',...(v!=='none'?{maritimePort:true}:{})}))),node('p','Le port est construit dans le projet ; les voyages utilisent ensuite le catalogue maritime publié. Les autres zones sont des réservations.','muted'),
  check('Réserver un emplacement portuaire',layout.harbor,v=>setLayout('harbor',v)),
  field('Nombre de champs à réserver',numberInput(layout.farms,v=>setLayout('farms',v),0,4,'1')),
  check('Souhaiter un lac aménagé',layout.lake,v=>setLayout('lake',v)),
  check('Relier les zones par des chemins',layout.connect,v=>setLayout('connect',v)),
  field('Pente maximale des accès (%)',numberInput(Math.round(layout.maxSlope*100),v=>setLayout('maxSlope',v/100),8,60,'1')),
  check('Accès obligatoires avant création',layout.accessRequired,v=>setLayout('accessRequired',v)));
 box.append(areas);
 const activities={races:'none' as const,ski:false,music:'contextual' as const,...r.activities},fun=node('details');fun.append(node('summary','Courses, ski et musique'));
 const setActivity=(patch:Partial<NonNullable<MapRequirements['activities']>>)=>change({...r,compositionVersion:5,activities:{...activities,...patch}});
 fun.append(field('Circuits de roulade à générer',select(activities.races,[['none','Sans circuit'],['flat','Terrain relativement plat'],['downhill','Descente'],['both','Plat et descente']],v=>setActivity({races:v as typeof activities.races}))),check('Préparer une descente de ski (prototype)',activities.ski,v=>setActivity({ski:v})),field('Musique du monde',select(activities.music,[['contextual','Ambiance Little World selon le contexte'],['off','Sans musique · bruitages conservés']],v=>setActivity({music:v as typeof activities.music}))),node('p','Les pistes sont cherchées sur le relief réel. Une demande impossible bloque la création. Le ski réutilise la glisse et la remontée prototypes ; B alterne skis et snowboard.','muted'));
 const alpine=node('button','Profil Île alpine');alpine.type='button';alpine.onclick=()=>{const next=selectIslandStyle({...r,compositionVersion:5},'central-massif');change({...next,rivers:1,islandStyle:{...next.islandStyle!,altitudeM:650,valleys:.15},activities:{...activities,ski:true}});};fun.append(alpine);box.append(fun);return box;
}
