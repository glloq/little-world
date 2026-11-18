/** Inventory panel (I). The view model is pure: items come from the gameplay registry, the
 * category from the item's business `category` field (never guessed from its name), the
 * capacity from `maxQuantity`. « New » marks quantities above what the player last saw (UI
 * session state, not saved). Nothing here changes the inventory: usage goes through actions. */
import type {ItemDefinition} from '../../gameplay/schema.ts';
import {foodGasValue} from '../../gameplay/food-effects.ts';
import {el,button} from '../shared/dom.ts';

export const CATEGORY_LABELS:Record<string,string>={nature:'Ressources naturelles',mine:'Minerais et cristaux',farm:'Produits agricoles',tool:'Outils',outil:'Outils',quest:'Objets de mission',mission:'Objets de mission',argent:'Argent',bois:'Bois',cueillette:'Cueillette',poisson:'Poissons',graines:'Graines'};
const ORDER=['Argent','Ressources naturelles','Bois','Cueillette','Poissons','Minerais et cristaux','Produits agricoles','Graines','Outils','Instruments','Objets de mission','Objets divers'];
const FOOD_ICONS:Readonly<Record<string,string>>={
  'food:apple':'🍎','food:pear':'🍐','food:plum':'🟣','food:cherry':'🍒',
  'food:berry':'🫐','food:hazelnut':'🌰','food:walnut':'🌰','farm:carrot':'🥕',
  'farm:pumpkin':'🎃','food:potato':'🥔','food:chanterelle':'🍄',
  'food:cepe':'🍄','food:cheese':'🧀',
};
export interface InventoryEntry {id:string;name:string;category:string;categoryLabel:string;quantity:number;max:number;description?:string;delta:number;full:boolean;nearlyFull:boolean;tool:boolean}
export interface InventoryViewModel {groups:{label:string;entries:InventoryEntry[]}[];kinds:number;total:number;empty:boolean}
export function inventoryViewModel(items:readonly ItemDefinition[],inventory:Readonly<Record<string,number>>,seen:Readonly<Record<string,number>>):InventoryViewModel{
  const groups=new Map<string,InventoryEntry[]>();let total=0,kinds=0;
  for(const item of items){const quantity=inventory[item.id]??0;if(quantity<=0)continue;kinds++;total+=quantity;
    const label=CATEGORY_LABELS[item.category]??(item.category==='instrument'?'Instruments':'Objets divers'),entry:InventoryEntry={id:item.id,name:item.name,category:item.category,categoryLabel:label,quantity,max:item.maxQuantity,...(item.description?{description:item.description}:{}),delta:Math.max(0,quantity-(seen[item.id]??0)),full:quantity>=item.maxQuantity,nearlyFull:quantity>=item.maxQuantity*.9,tool:item.category==='tool'||item.category==='outil'};
    const list=groups.get(label)??[];list.push(entry);groups.set(label,list);}
  return {groups:[...groups].sort(([a],[b])=>ORDER.indexOf(a)-ORDER.indexOf(b)).map(([label,entries])=>({label,entries:entries.sort((x,y)=>x.name.localeCompare(y.name,'fr'))})),kinds,total,empty:kinds===0};
}
export interface InventoryDeps {items():readonly ItemDefinition[];inventory():Readonly<Record<string,number>>;selectedTool():string|null;selectTool(id:string|null):void|boolean;headgear?:{equipped():boolean;setEquipped(value:boolean):void};gasLevel?:()=>number;gasCapacity?:()=>number;consume?:(id:string)=>boolean;playInstrument?:(id:string)=>void}
/** Panel renderer; `seen` is updated when the panel closes (the « new » marks then clear). */
export function inventoryPanel(deps:InventoryDeps){
  let seen:Record<string,number>={},selected:string|null=null;
  const render=(body:HTMLElement)=>{
      const vm=inventoryViewModel(deps.items(),deps.inventory(),seen);body.replaceChildren();
      const all=vm.groups.flatMap(g=>g.entries),equipment=all.filter(e=>e.tool||['cosmetic','accessory','equipment','instrument'].includes(e.category));
      const resources=vm.groups.map(g=>({...g,entries:g.entries.filter(e=>!equipment.some(t=>t.id===e.id))})).filter(g=>g.entries.length);
      const icon=(e:InventoryEntry)=>{
        if(FOOD_ICONS[e.id])return FOOD_ICONS[e.id];
        const text=(e.id+' '+e.name).toLowerCase();
        if(/pêche|peche|fishing|canne/.test(text))return '🎣';
        if(/casque|helmet/.test(text))return '⛑';
        if(/pioche|pickaxe/.test(text))return '⛏';
        if(/pelle|shovel/.test(text))return '♠';
        if(/marteau|hammer/.test(text))return '⚒';
        if(/musique|music|flûte|flute/.test(text))return '♫';
        if(/noisette|noix|nut/.test(text))return '◉';
        if(/patate|pomme.de.terre/.test(text))return '🥔';
        if(/fromage|cheese/.test(text))return '◩';
        if(/poisson|fish/.test(text))return '♓';
        if(/bois|wood|log/.test(text))return '▤';
        return {mine:'◆',nature:'❀',farm:'❧',graines:'✿',argent:'●',bois:'▤',cueillette:'❀',poisson:'♓',quest:'✦',mission:'✦'}[e.category]??'⬡';
      };
      body.append(el('p','ui-inventory-count',vm.empty?'Sac vide':vm.kinds+' types · '+vm.total+' objets'));
      const layout=el('div','ui-inventory'),left=el('section','ui-inventory-list'),right=el('aside','ui-inventory-equipment');
      left.setAttribute('aria-label','Ressources');right.setAttribute('aria-label','Équipement');
      left.append(el('h3','ui-group','Ressources'));
      if(vm.empty)left.append(el('p','ui-empty','Votre sac est vide. Ramassez des ressources, creusez ou récoltez pour le remplir.'));
      const detail=el('div','ui-inventory-detail');
      function show(e:InventoryEntry){
        selected=e.id;detail.replaceChildren(el('h3','',e.name),el('p','ui-muted',e.categoryLabel),el('p','',e.description??'Aucune description.'),el('p','ui-muted','Quantité : '+e.quantity+' / '+e.max));
        if(e.id==='tool:miners-helmet'&&deps.headgear){
          // Separate head slot: putting on a helmet never replaces the pickaxe.
          const wearing=deps.headgear.equipped();
          detail.append(button(wearing?'Retirer le casque':'Équiper le casque',()=>{
            deps.headgear!.setEquipped(!wearing);show(e);
          },'ui-button ui-primary'));
        }else if(e.tool||e.category==='instrument'){
          const inHand=deps.selectedTool()===e.id;
          detail.append(button(inHand?'Ranger':'Équiper',()=>{deps.selectTool(inHand?null:e.id);show(e);},'ui-button ui-primary'));
          if(e.category==='instrument'&&inHand&&deps.playInstrument)detail.append(button('Jouer',()=>deps.playInstrument!(e.id),'ui-button ui-primary'));
        }
        else if(equipment.some(t=>t.id===e.id)){detail.append(el('p','ui-muted','Équipement cosmétique prévu : action non disponible pour cet objet.'));}
        const gas=foodGasValue(e.id);
        if(gas&&deps.consume){
          const level=deps.gasLevel?.()??0,max=deps.gasCapacity?.()??200;
          const gained=Math.max(0,Math.min(gas,max-level));
          detail.append(el('p','ui-muted','Recharge : +'+gas+' gaz · Réserve '+Math.round(level)+' / '+Math.round(max)));
          const action=button('Manger (+'+Math.round(gained)+' gaz)',()=>{if(deps.consume?.(e.id))render(body);},'ui-button');
          action.disabled=gained<=0;detail.append(action);
        }
        for(const card of layout.querySelectorAll<HTMLButtonElement>('[data-item]'))card.setAttribute('aria-pressed',String(card.dataset.item===e.id));
      }
      function card(e:InventoryEntry){
        const item=button('',()=>show(e),'ui-item');item.dataset.item=e.id;item.dataset.focusKey='item:'+e.id;
        item.setAttribute('aria-label',e.name+', quantité '+e.quantity+(e.delta?', nouveau +'+e.delta:''));
        item.append(el('span','ui-item-symbol',icon(e)),el('span','ui-item-name',e.name),el('span','ui-item-qty','×'+e.quantity));
        const gas=foodGasValue(e.id);if(gas)item.append(el('span','ui-item-gas','+'+gas+' gaz'));
        if(e.delta)item.append(el('span','ui-badge','+'+e.delta));
        if(e.nearlyFull)item.append(el('span','ui-badge ui-warn',e.full?'Plein':'Presque plein'));
        if(deps.selectedTool()===e.id||e.id==='tool:miners-helmet'&&deps.headgear?.equipped())item.classList.add('ui-equipped');
        return item;
      }
      if(resources.length)for(const g of resources){left.append(el('h4','ui-group',g.label));const grid=el('div','ui-item-grid');
        for(const e of g.entries)grid.append(card(e));left.append(grid);}
      else if(!vm.empty)left.append(el('p','ui-empty','Aucune ressource. Les objets collectés sont dans la colonne équipement.'));
      right.append(el('h3','ui-group','À utiliser / équiper'));
      const slots=el('div','ui-equipment-grid');for(const e of equipment)slots.append(card(e));
      if(!equipment.length)slots.append(el('p','ui-empty','Aucun outil ni accessoire pour le moment.'));
      right.append(slots,detail);layout.append(left,right);body.append(layout);
      if(all.length){const current=all.find(e=>e.id===selected)??all[0];show(current);}
      else detail.append(el('p','ui-empty','Sélectionnez un objet pour voir son usage.'));
  };
  return {render,
    /** Called when the panel closes: what was displayed is now « seen ». */
    markSeen(){seen={...deps.inventory()};},
  };
}
