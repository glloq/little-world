/** Game economy V1 — money, tools, resources, prices and shops (pure, no rendering).
 * Money is an inventory item (`coin`) so that it is saved, validated and granted atomically by
 * the existing gameplay runtime like any other item. Shops are counters (entities with a `Shop`
 * kind) next to mines, forests, ports and markets: they sell tools and buy the resources of
 * their place. Every transaction is checked here (price, stock, carried quantity) and applied
 * as ONE inventory change; a future server would replace this authority, not the contracts. */
import type {ItemDefinition} from './schema.ts';

export const COIN='coin';
/** Starting purse of a new game (enough for one basic tool). */
export const STARTING_COINS=40;
/** A new game also starts with a few seed packets so the first field can be sown at once. */
export const STARTING_KIT=[{itemId:'seed:wheat',quantity:3},{itemId:'seed:carrot',quantity:2}];
export type ToolId='tool:axe'|'tool:pickaxe'|'tool:pickaxe-steel'|'tool:fishing-rod';
interface Priced extends ItemDefinition {buy?:number;sell?:number}
/** Core item catalogue (merged into every playable world, project items win on id clashes). */
export const ECONOMY_ITEMS:Priced[]=[
  {id:COIN,name:'Pièces',category:'argent',maxQuantity:9999,description:'Monnaie des comptoirs et des marchés.'},
  {id:'tool:axe',name:'Hache',category:'outil',maxQuantity:1,buy:25,sell:10,description:'Abat les arbres et fournit des bûches.'},
  {id:'tool:pickaxe',name:'Pioche',category:'outil',maxQuantity:1,buy:30,sell:12,description:'Creuse la roche quatre fois plus vite qu’à mains nues.'},
  {id:'tool:pickaxe-steel',name:'Pioche d’acier',category:'outil',maxQuantity:1,buy:140,sell:60,description:'Vient à bout des filons durs et du cristal.'},
  {id:'tool:fishing-rod',name:'Canne à pêche',category:'outil',maxQuantity:1,buy:20,sell:8,description:'Permet de pêcher dans la mer, les rivières et les lacs.'},
  {id:'wood:log',name:'Bûche',category:'bois',maxQuantity:999,sell:3,buy:6,description:'Bois d’un arbre abattu.'},
  {id:'food:apple',name:'Pomme',category:'cueillette',maxQuantity:999,sell:2,buy:4},
  {id:'food:pear',name:'Poire',category:'cueillette',maxQuantity:999,sell:2,buy:4},
  {id:'food:plum',name:'Prune',category:'cueillette',maxQuantity:999,sell:2,buy:4},
  {id:'food:cherry',name:'Cerises',category:'cueillette',maxQuantity:999,sell:3,buy:5},
  {id:'forage:mushroom',name:'Champignon',category:'cueillette',maxQuantity:999,sell:4,buy:7,description:'Pousse sous le couvert des forêts humides.'},
  {id:'forage:flower',name:'Bouquet de fleurs',category:'cueillette',maxQuantity:999,sell:2,buy:4},
  {id:'forage:reed',name:'Roseaux',category:'cueillette',maxQuantity:999,sell:1,buy:2},
  {id:'fish:trout',name:'Truite',category:'poisson',maxQuantity:999,sell:8},
  {id:'fish:perch',name:'Perche',category:'poisson',maxQuantity:999,sell:6},
  {id:'fish:carp',name:'Carpe',category:'poisson',maxQuantity:999,sell:7},
  {id:'fish:mackerel',name:'Maquereau',category:'poisson',maxQuantity:999,sell:7},
  {id:'fish:sardine',name:'Sardine',category:'poisson',maxQuantity:999,sell:4},
  {id:'fish:seabass',name:'Bar',category:'poisson',maxQuantity:999,sell:14},
  {id:'fish:golden',name:'Poisson doré',category:'poisson',maxQuantity:99,sell:60,description:'Très rare. Les pêcheurs en parlent avec respect.'},
  {id:'seed:wheat',name:'Semences de blé',category:'graines',maxQuantity:99,buy:2,sell:1},
  {id:'seed:carrot',name:'Semences de carottes',category:'graines',maxQuantity:99,buy:3,sell:1},
  {id:'seed:pumpkin',name:'Semences de citrouille',category:'graines',maxQuantity:99,buy:5,sell:2},
];
/** Sale prices of items defined by other systems (mine, farm). */
const EXTERNAL_PRICES:Record<string,{sell:number;buy?:number}>={'mine:stone':{sell:1,buy:3},'mine:iron':{sell:9},'mine:crystal':{sell:35},'farm:wheat':{sell:3},'farm:carrot':{sell:4},'farm:pumpkin':{sell:9}};
export function priceOf(itemId:string):{sell?:number;buy?:number}{const i=ECONOMY_ITEMS.find(x=>x.id===itemId);return i?{sell:i.sell,buy:i.buy}:EXTERNAL_PRICES[itemId]??{};}
export type ShopKind='mine'|'forest'|'port'|'market'|'farm'|'inn';
export interface ShopDefinition {kind:ShopKind;name:string;sells:string[];buys:string[];greeting:string}
/** Counter catalogues per place (data, editable in a later Studio panel). */
export const SHOPS:Record<ShopKind,ShopDefinition>={
  mine:{kind:'mine',name:'Comptoir de la mine',sells:['tool:pickaxe','tool:pickaxe-steel'],buys:['mine:stone','mine:iron','mine:crystal'],greeting:'Une pioche solide, et la montagne vous rendra riche.'},
  forest:{kind:'forest',name:'Comptoir du bûcheron',sells:['tool:axe'],buys:['wood:log','forage:mushroom','forage:flower'],greeting:'Coupez sans dévaster : la forêt repousse si on la respecte.'},
  port:{kind:'port',name:'Comptoir du port',sells:['tool:fishing-rod'],buys:['fish:trout','fish:perch','fish:carp','fish:mackerel','fish:sardine','fish:seabass','fish:golden','forage:reed'],greeting:'Le poisson est frais ? Je vous l’achète.'},
  market:{kind:'market',name:'Marché',sells:['tool:axe','tool:fishing-rod','seed:wheat','seed:carrot','seed:pumpkin','wood:log'],buys:['food:apple','food:pear','food:plum','food:cherry','forage:mushroom','forage:flower','farm:wheat','farm:carrot','farm:pumpkin','wood:log'],greeting:'Fruits, champignons, récoltes : tout se vend au marché !'},
  farm:{kind:'farm',name:'Comptoir agricole',sells:['seed:wheat','seed:carrot','seed:pumpkin'],buys:['farm:wheat','farm:carrot','farm:pumpkin','food:apple','food:pear','food:plum','food:cherry'],greeting:'Des semences pour la saison ?'},
  inn:{kind:'inn',name:'Auberge',sells:['food:apple','food:cherry'],buys:['fish:trout','fish:carp','fish:seabass','forage:mushroom'],greeting:'Une table chaude et du poisson grillé, voilà le bonheur.'},
};
export interface Purse {count(itemId:string):number;apply(changes:{itemId:string;quantity:number}[]):boolean;max(itemId:string):number}
export type TradeResult={ok:true;message:string;changes:{itemId:string;quantity:number}[]}|{ok:false;reason:string};
/** Buying `quantity` of an item at a counter: checks catalogue, coins and capacity; one change set. */
export function buy(shop:ShopDefinition,itemId:string,quantity:number,purse:Purse,name=(id:string)=>id):TradeResult{
  if(!shop.sells.includes(itemId))return {ok:false,reason:'Ce comptoir ne vend pas cet article'};
  const price=priceOf(itemId).buy;if(!price||!Number.isInteger(quantity)||quantity<1||quantity>99)return {ok:false,reason:'Quantité ou prix invalide'};
  const cost=price*quantity;if(purse.count(COIN)<cost)return {ok:false,reason:`Il manque ${cost-purse.count(COIN)} pièces`};
  if(purse.count(itemId)+quantity>purse.max(itemId))return {ok:false,reason:itemId.startsWith('tool:')?'Vous en avez déjà un':'Sac plein pour cet article'};
  const changes=[{itemId:COIN,quantity:-cost},{itemId,quantity}];if(!purse.apply(changes))return {ok:false,reason:'Transaction refusée'};
  return {ok:true,message:`Acheté : ${quantity} × ${name(itemId)} (−${cost} pièces)`,changes};
}
export function sell(shop:ShopDefinition,itemId:string,quantity:number,purse:Purse,name=(id:string)=>id):TradeResult{
  if(!shop.buys.includes(itemId))return {ok:false,reason:'Ce comptoir n’achète pas cet article'};
  const price=priceOf(itemId).sell;if(!price||!Number.isInteger(quantity)||quantity<1)return {ok:false,reason:'Quantité ou prix invalide'};
  if(purse.count(itemId)<quantity)return {ok:false,reason:'Vous n’en avez pas assez'};
  const gain=Math.min(price*quantity,purse.max(COIN)-purse.count(COIN));if(gain<=0)return {ok:false,reason:'Bourse pleine'};
  const changes=[{itemId,quantity:-quantity},{itemId:COIN,quantity:gain}];if(!purse.apply(changes))return {ok:false,reason:'Transaction refusée'};
  return {ok:true,message:`Vendu : ${quantity} × ${name(itemId)} (+${gain} pièces)`,changes};
}
/** Items of the economy added to a world's registry when the project does not define them. */
export function economyItems(existing:ItemDefinition[]):ItemDefinition[]{
  const have=new Set(existing.map(i=>i.id)),out=[...existing];
  for(const {buy:_b,sell:_s,...item}of ECONOMY_ITEMS)if(!have.has(item.id))out.push({...item});
  return out;
}
/** Mining strength per strike (cell hit points are in mine-data: 20 … 500). */
export function pickPower(has:(id:string)=>boolean):{power:number;tool:string}{
  if(has('tool:pickaxe-steel'))return {power:25,tool:'Pioche d’acier'};if(has('tool:pickaxe'))return {power:8,tool:'Pioche'};return {power:2,tool:'Mains nues'};
}
