/** Optional workshop content for future island manifests. This file is data only:
 * no station or consumable is made playable until authoring, runtime and UI are wired.
 * Outputs use stable IDs; never treat an item as edible from its name or category.
 */
import type {ItemDefinition} from '../gameplay/schema.ts';
import {parseProductionRecipe,type ProductionRecipeV1} from './production.ts';

export const PRODUCTION_ITEMS:ItemDefinition[]=[
  {id:'material:flour',name:'Farine',category:'matériaux',maxQuantity:999},
  {id:'food:bread',name:'Pain',category:'aliment',maxQuantity:999},
  {id:'food:jam',name:'Confiture de fruits',category:'aliment',maxQuantity:999},
  {id:'food:soup',name:'Soupe de légumes',category:'aliment',maxQuantity:999},
  {id:'material:stone-block',name:'Bloc de pierre taillée',category:'matériaux',maxQuantity:999},
  {id:'material:iron-ingot',name:'Lingot de fer',category:'matériaux',maxQuantity:999},
  {id:'material:reed-fibre',name:'Fibres de roseaux',category:'textiles',maxQuantity:999},
  {id:'item:reed-basket',name:'Panier tressé',category:'artisanat',maxQuantity:99},
  {id:'material:plank',name:'Planche',category:'bois',maxQuantity:999},
  {id:'item:wooden-crate',name:'Caisse en bois',category:'artisanat',maxQuantity:99},
];
export const STARTER_RECIPES:ProductionRecipeV1[]=[
  {recipeId:'mill:wheat-flour',version:1,stationType:'mill',inputs:[{itemId:'farm:wheat',quantity:3}],outputs:[{itemId:'material:flour',quantity:1}],durationGameMinutes:5,serviceFeeCoins:1},
  {recipeId:'bakery:bread',version:1,stationType:'bakery',inputs:[{itemId:'material:flour',quantity:2}],outputs:[{itemId:'food:bread',quantity:1}],durationGameMinutes:8,serviceFeeCoins:2},
  {recipeId:'kitchen:jam',version:1,stationType:'kitchen',inputs:[{itemId:'food:berry',quantity:4},{itemId:'food:apple',quantity:1}],outputs:[{itemId:'food:jam',quantity:2}],durationGameMinutes:8,serviceFeeCoins:2},
  {recipeId:'kitchen:soup',version:1,stationType:'kitchen',inputs:[{itemId:'farm:carrot',quantity:2},{itemId:'farm:pumpkin',quantity:1}],outputs:[{itemId:'food:soup',quantity:2}],durationGameMinutes:10,serviceFeeCoins:3},
  {recipeId:'stonecut:blocks',version:1,stationType:'stonecutter',inputs:[{itemId:'mine:stone',quantity:3}],outputs:[{itemId:'material:stone-block',quantity:2}],durationGameMinutes:6,serviceFeeCoins:2},
  {recipeId:'smelt:iron',version:1,stationType:'smelter',inputs:[{itemId:'mine:iron',quantity:3},{itemId:'wood:log',quantity:1}],outputs:[{itemId:'material:iron-ingot',quantity:1}],durationGameMinutes:15,serviceFeeCoins:3},
  {recipeId:'smith:pickaxe',version:1,stationType:'smithy',inputs:[{itemId:'material:iron-ingot',quantity:2},{itemId:'wood:log',quantity:1}],outputs:[{itemId:'tool:pickaxe',quantity:1}],durationGameMinutes:12,serviceFeeCoins:4},
  {recipeId:'reed:fibres',version:1,stationType:'basketry',inputs:[{itemId:'forage:reed',quantity:3}],outputs:[{itemId:'material:reed-fibre',quantity:2}],durationGameMinutes:5,serviceFeeCoins:1},
  {recipeId:'reed:basket',version:1,stationType:'basketry',inputs:[{itemId:'material:reed-fibre',quantity:2}],outputs:[{itemId:'item:reed-basket',quantity:1}],durationGameMinutes:9,serviceFeeCoins:2},
  {recipeId:'sawmill:planks',version:1,stationType:'sawmill',inputs:[{itemId:'wood:log',quantity:2}],outputs:[{itemId:'material:plank',quantity:4}],durationGameMinutes:6,serviceFeeCoins:1},
  {recipeId:'carpenter:crate',version:1,stationType:'carpenter',inputs:[{itemId:'material:plank',quantity:4}],outputs:[{itemId:'item:wooden-crate',quantity:1}],durationGameMinutes:8,serviceFeeCoins:2},
];
/** Reject catalog drift and duplicate definitions at build/Studio validation time. */
export function validateStarterRecipes(availableItemIds:ReadonlySet<string>):void {
  const items=new Set<string>();
  for(const item of PRODUCTION_ITEMS){
    if(items.has(item.id)||availableItemIds.has(item.id))throw Error('Objet produit dupliqué : '+item.id);
    items.add(item.id);
  }
  const all=new Set([...availableItemIds,...items]),recipes=new Set<string>();
  for(const raw of STARTER_RECIPES){
    const recipe=parseProductionRecipe(raw,all);
    if(recipes.has(recipe.recipeId))throw Error('Recette dupliquée : '+recipe.recipeId);
    recipes.add(recipe.recipeId);
  }
}
