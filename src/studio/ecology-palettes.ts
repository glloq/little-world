/** Procedural ecology profiles: write only biome strokes, never thousands of entities. */
import type {BrushMode} from './viewport/brush-tool.ts';
export interface EcologyPalette {id:string;label:string;mode:BrushMode;radius:number;strength:number;description:string}
export const ECOLOGY_PALETTES:readonly EcologyPalette[]=[
{id:'woodland',label:'Forêt légère',mode:'forest',radius:24,strength:1,description:'Lisières et bosquets dispersés'},
{id:'deep-forest',label:'Forêt dense',mode:'forest',radius:40,strength:3.5,description:'Bois étendu avec végétation du biotope'},
{id:'meadow',label:'Prairie naturelle',mode:'meadow',radius:35,strength:2,description:'Herbes, fleurs et petits arbustes'},
{id:'highlands',label:'Montagne rocheuse',mode:'mountain',radius:32,strength:1.7,description:'Végétation adaptée aux pentes et altitude'},
{id:'shore',label:'Littoral',mode:'coast',radius:18,strength:1,description:'Habillage côtier sans objets manuels'},
{id:'settlement',label:'Zone aménagée',mode:'village',radius:22,strength:1,description:'Priorité au terrain libre, routes et bâtiments'}
] as const;
export function ecologyPalette(id:string):EcologyPalette{
  const p=ECOLOGY_PALETTES.find(x=>x.id===id);if(!p)throw Error('Palette écologique inconnue');
  return p;
}
