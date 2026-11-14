/** Inventory panel (I). The view model is pure: items come from the gameplay registry, the
 * category from the item's business `category` field (never guessed from its name), the
 * capacity from `maxQuantity`. « New » marks quantities above what the player last saw (UI
 * session state, not saved). Nothing here changes the inventory: usage goes through actions. */
import type {ItemDefinition} from '../../gameplay/schema.ts';
import {el,button} from '../shared/dom.ts';

export const CATEGORY_LABELS:Record<string,string>={nature:'Ressources naturelles',mine:'Minerais et cristaux',farm:'Produits agricoles',tool:'Outils',outil:'Outils',quest:'Objets de mission',mission:'Objets de mission',argent:'Argent',bois:'Bois',cueillette:'Cueillette',poisson:'Poissons',graines:'Graines'};
const ORDER=['Argent','Ressources naturelles','Bois','Cueillette','Poissons','Minerais et cristaux','Produits agricoles','Graines','Outils','Objets de mission','Objets divers'];
export interface InventoryEntry {id:string;name:string;category:string;categoryLabel:string;quantity:number;max:number;description?:string;delta:number;full:boolean;nearlyFull:boolean;tool:boolean}
export interface InventoryViewModel {groups:{label:string;entries:InventoryEntry[]}[];kinds:number;total:number;empty:boolean}
export function inventoryViewModel(items:readonly ItemDefinition[],inventory:Readonly<Record<string,number>>,seen:Readonly<Record<string,number>>):InventoryViewModel{
  const groups=new Map<string,InventoryEntry[]>();let total=0,kinds=0;
  for(const item of items){const quantity=inventory[item.id]??0;if(quantity<=0)continue;kinds++;total+=quantity;
    const label=CATEGORY_LABELS[item.category]??'Objets divers',entry:InventoryEntry={id:item.id,name:item.name,category:item.category,categoryLabel:label,quantity,max:item.maxQuantity,...(item.description?{description:item.description}:{}),delta:Math.max(0,quantity-(seen[item.id]??0)),full:quantity>=item.maxQuantity,nearlyFull:quantity>=item.maxQuantity*.9,tool:item.category==='tool'||item.category==='outil'};
    const list=groups.get(label)??[];list.push(entry);groups.set(label,list);}
  return {groups:[...groups].sort(([a],[b])=>ORDER.indexOf(a)-ORDER.indexOf(b)).map(([label,entries])=>({label,entries:entries.sort((x,y)=>x.name.localeCompare(y.name,'fr'))})),kinds,total,empty:kinds===0};
}
export interface InventoryDeps {items():readonly ItemDefinition[];inventory():Readonly<Record<string,number>>;selectedTool():string|null;selectTool(id:string|null):void}
/** Panel renderer; `seen` is updated when the panel closes (the « new » marks then clear). */
export function inventoryPanel(deps:InventoryDeps){
  let seen:Record<string,number>={},selected:string|null=null;
  return {
    render(body:HTMLElement){
      const vm=inventoryViewModel(deps.items(),deps.inventory(),seen);body.replaceChildren();
      if(vm.empty){body.append(el('p','ui-empty','Votre sac est vide. Ramassez des ressources, creusez ou récoltez pour le remplir.'));return;}
      body.append(el('p','ui-muted',`${vm.kinds} sorte(s) d’objets · ${vm.total} au total`));
      const layout=el('div','ui-inventory'),list=el('div','ui-inventory-list'),detail=el('aside','ui-inventory-detail');layout.append(list,detail);body.append(layout);
      if(!selected||!vm.groups.some(g=>g.entries.some(e=>e.id===selected)))selected=vm.groups[0].entries[0].id;
      const show=(e:InventoryEntry)=>{selected=e.id;detail.replaceChildren(el('h3','',e.name),el('p','ui-muted',e.categoryLabel),el('p','',e.description??'Pas de description.'),el('p','',`Quantité : ${e.quantity} / ${e.max}`+(e.full?' — sac plein pour cet objet':'')));
        if(e.tool){const inHand=deps.selectedTool()===e.id;detail.append(button(inHand?'Ranger':'Prendre en main',()=>{deps.selectTool(inHand?null:e.id);show(e);}))}
        for(const b of list.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.item===e.id));};
      for(const g of vm.groups){list.append(el('h3','ui-group',g.label));const grid=el('div','ui-item-grid');
        for(const e of g.entries){const card=button('',()=>show(e),'ui-item');card.dataset.item=e.id;card.dataset.focusKey='item:'+e.id;card.setAttribute('aria-label',`${e.name}, ${e.quantity}${e.delta?`, nouveau +${e.delta}`:''}${e.full?', plein':''}`);
          card.append(el('span','ui-item-name',e.name),el('span','ui-item-qty','×'+e.quantity));if(e.delta)card.append(el('span','ui-badge','+'+e.delta));if(e.nearlyFull)card.append(el('span','ui-badge ui-warn',e.full?'plein':'presque plein'));
          grid.append(card);}
        list.append(grid);}
      const current=vm.groups.flatMap(g=>g.entries).find(e=>e.id===selected);if(current)show(current);
    },
    /** Called when the panel closes: what was displayed is now « seen ». */
    markSeen(){seen={...deps.inventory()};},
  };
}
