/** Inventory V3: fixed stock/hamster/favourites layout, pointer drag and long-press selection.
 * View-only state stays here. Every mutation is delegated to gameplay actions.
 */
import {foodGasValue} from '../../gameplay/food-effects.ts';
import {el,button} from '../shared/dom.ts';
import {inventoryViewModel,type InventoryDeps,type InventoryEntry} from './inventory.ts';
import {equipSlot,isEquipment,matchesInventoryFilter,planFoodConsumption,FAVORITE_COUNT,type InventoryFilter,type EquipTarget,type FoodLine} from './inventory-logic.ts';

export interface InventoryV3Deps extends InventoryDeps {
  worldId?:string;
  canConsume?:(id:string)=>string|null;
  consumeBatch?:(items:FoodLine[])=>{ok:boolean;message:string};
  confirm?:(text:string,confirmLabel:string)=>Promise<boolean>;
  notify?:(message:string)=>void;
}
const FILTERS:readonly {id:InventoryFilter;label:string}[]=[
  {id:'all',label:'Tout'},{id:'food',label:'Aliments'},
  {id:'resources',label:'Ressources'},{id:'equipment',label:'Équipements'},
];
const ICONS:Readonly<Record<string,string>>={
  'food:apple':'🍎','food:pear':'🍐','food:plum':'●','food:cherry':'🍒',
  'food:berry':'🫐','food:hazelnut':'🌰','food:walnut':'🌰','farm:carrot':'🥕',
  'farm:pumpkin':'🎃','food:potato':'🥔','food:chanterelle':'🍄',
  'food:cepe':'🍄','food:cheese':'🧀','food:bread':'🍞','food:jam':'🍯','food:soup':'🥣',
  'tool:pickaxe':'⛏','tool:pickaxe-steel':'⛏','tool:axe':'🪓',
  'tool:miners-helmet':'⛑','tool:fishing-rod':'🎣',
  'instrument:flute':'♫','instrument:ocarina':'♫','instrument:ukulele':'♫',
};
const FALLBACK:Readonly<Record<string,string>>={mine:'◆',nature:'❀',farm:'❧',graines:'✿',argent:'●',bois:'▤',cueillette:'❀',poisson:'♓',quest:'✦',mission:'✦',outil:'⚒',instrument:'♫'};
function icon(item:Pick<InventoryEntry,'id'|'category'>):string{return ICONS[item.id]??FALLBACK[item.category]??'⬡';}
function storageKey():string{return 'little-world:inventory-v3:favorites';}
function readFavorites():Array<string|null>|null{
  try{
    const value=JSON.parse(localStorage.getItem(storageKey())??'null');
    if(!Array.isArray(value)||value.length!==FAVORITE_COUNT||
       !value.every(x=>x===null||typeof x==='string'&&x.length<=100))return null;
    return value as Array<string|null>;
  }catch{return null;}
}
function writeFavorites(values:readonly (string|null)[]):void{
  try{localStorage.setItem(storageKey(),JSON.stringify(values));}catch{/* private mode */}
}
/** Built from static markup: no second WebGL scene, models or external image resources. */
const HAMSTER=String.raw`<svg viewBox="0 0 200 242" role="img" aria-label="Hamster avec sac à dos" xmlns="http://www.w3.org/2000/svg">
 <ellipse cx="99" cy="230" rx="70" ry="8" fill="#c9cfbe"/>
 <rect x="140" y="103" width="32" height="80" rx="13" fill="#927353" stroke="#684f39" stroke-width="3"/>
 <path d="M146 120h22v12h-22z" fill="#cfb184"/>
 <ellipse cx="102" cy="150" rx="66" ry="74" fill="#cb9763" stroke="#9c6c44" stroke-width="3"/>
 <ellipse cx="101" cy="158" rx="44" ry="56" fill="#f7e4c6"/>
 <circle cx="58" cy="62" r="30" fill="#ca9564" stroke="#9c6c44" stroke-width="3"/>
 <circle cx="141" cy="62" r="30" fill="#ca9564" stroke="#9c6c44" stroke-width="3"/>
 <circle cx="58" cy="63" r="18" fill="#df9e9c"/>
 <circle cx="141" cy="63" r="18" fill="#df9e9c"/>
 <ellipse cx="100" cy="111" rx="68" ry="62" fill="#d1a16c" stroke="#9c6c44" stroke-width="3"/>
 <ellipse cx="69" cy="130" rx="30" ry="25" fill="#f8dfc1"/>
 <ellipse cx="131" cy="130" rx="30" ry="25" fill="#f8dfc1"/>
 <circle cx="80" cy="101" r="7" fill="#34291f"/>
 <circle cx="120" cy="101" r="7" fill="#34291f"/>
 <ellipse cx="100" cy="124" rx="8" ry="6" fill="#b47d77"/>
 <path d="M100 131q-11 16-20 2m20-2q11 16 20 2" stroke="#92665c" stroke-width="3" stroke-linecap="round" fill="none"/>
 <ellipse cx="37" cy="165" rx="14" ry="24" fill="#c79261" transform="rotate(28 37 165)"/>
 <ellipse cx="166" cy="165" rx="14" ry="24" fill="#c79261" transform="rotate(-28 166 165)"/>
 <ellipse cx="70" cy="216" rx="29" ry="15" fill="#bc865e"/>
 <ellipse cx="135" cy="216" rx="29" ry="15" fill="#bc865e"/>
</svg>`;

type ActivePointer={id:string;pointerId:number;x:number;y:number;kind:string;timer:ReturnType<typeof setTimeout>|null;dragging:boolean;ghost:HTMLElement|null};

export function inventoryPanelV3(deps:InventoryV3Deps){
  let seen:Record<string,number>={};
  let filter:InventoryFilter='all',selectedId:string|null=null,multi=false;
  const checked=new Set<string>();
  let favorites=readFavorites(),pointer:ActivePointer|null=null,suppressClick:string|null=null;
  let bodyRef:HTMLElement|null=null;
  const report=(message:string)=>deps.notify?.(message);
  function highlightZones(id:string|null){
    const item=id?deps.items().find(x=>x.id===id):null;
    document.querySelectorAll<HTMLElement>('.ui-bag-v3 [data-hamster-target]').forEach(zone=>{
      const target=zone.dataset.hamsterTarget;
      const valid=!!item&&(target==='mouth'?foodGasValue(item.id)>0:equipSlot(item)===target);
      zone.classList.toggle('ui-hamster-valid',valid);
    });
  }
  function clearPointer(){
    if(!pointer)return;
    if(pointer.timer!==null)clearTimeout(pointer.timer);
    pointer.ghost?.remove();pointer=null;
    document.body.classList.remove('ui-inventory-dragging');
    highlightZones(selectedId);
  }
  function ensureFavorites(items:readonly InventoryEntry[]){
    if(favorites)return;
    favorites=Array.from({length:FAVORITE_COUNT},()=>null as string|null);
    const equipment=items.filter(x=>isEquipment(x)&&equipSlot(x)!==null);
    equipment.slice(0,FAVORITE_COUNT).forEach((e,i)=>{favorites![i]=e.id;});
    writeFavorites(favorites);
  }
  function assignFavorite(id:string,index:number){
    const entry=deps.items().find(x=>x.id===id);
    if(!entry||!isEquipment(entry)||(deps.inventory()[id]??0)<=0){report('Cet objet ne peut pas être ajouté aux favoris.');return;}
    if(!favorites||index<0||index>=FAVORITE_COUNT)return;
    const previous=favorites.indexOf(id);
    if(previous>=0)favorites[previous]=null;
    favorites[index]=id;writeFavorites(favorites);renderCurrent();
  }
  function renderCurrent(){
    if(!bodyRef)return;
    const active=document.activeElement as HTMLElement|null,key=active?.dataset.focusKey;
    render(bodyRef);
    if(key)bodyRef.querySelector<HTMLElement>('[data-focus-key="'+CSS.escape(key)+'"]')?.focus();
  }
  function equip(id:string,target:EquipTarget){
    const item=deps.items().find(x=>x.id===id);
    if(!item||equipSlot(item)!==target||(deps.inventory()[id]??0)<=0){report('Cet objet ne peut pas être équipé ici.');return;}
    if(target==='hands'){
      const wearing=deps.selectedTool()===id;
      if(deps.selectTool(wearing?null:id)===false){report('Équipement refusé.');return;}
    }else if(target==='head'&&deps.headgear){
      deps.headgear.setEquipped(!deps.headgear.equipped());
    }else{report('Cet emplacement sera disponible plus tard.');return;}
    selectedId=id;renderCurrent();
  }
  function consume(id:string){
    const reason=deps.canConsume?.(id);
    if(reason){report(reason);return;}
    if(deps.consume?.(id)){selectedId=id;renderCurrent();}
  }
  async function consumeSelection(){
    const ids=[...checked],items=deps.inventory();
    if(!ids.length)return;
    if(ids.some(id=>foodGasValue(id)<=0)){report('La sélection contient des objets non comestibles.');return;}
    const missing=Math.max(0,(deps.gasCapacity?.()??200)-(deps.gasLevel?.()??0));
    const plan=planFoodConsumption(ids,items,missing);
    if(!plan.lines.length){report('Aucune consommation utile : réserve pleine ou stock vide.');return;}
    if(deps.canConsume){
      const reason=deps.canConsume(plan.lines[0].itemId);
      if(reason){report(reason);return;}
    }
    const title=plan.lines.map(x=>x.quantity+' × '+(deps.items().find(i=>i.id===x.itemId)?.name??x.itemId)).join(', ');
    const yes=await (deps.confirm?.('Manger '+title+' pour récupérer '+plan.gain+' gaz'+(plan.waste?' ('+plan.waste+' gaz excédentaires)':'')+' ?', 'Manger')??Promise.resolve(true));
    if(!yes)return;
    // Recalculate from the live runtime after the confirmation; preview isn't authority.
    const latest=planFoodConsumption(ids,deps.inventory(),(deps.gasCapacity?.()??200)-(deps.gasLevel?.()??0));
    if(!latest.lines.length)return;
    const outcome=deps.consumeBatch?.(latest.lines);
    if(!outcome){report('Consommation groupée indisponible.');return;}
    report(outcome.message);
    if(outcome.ok){checked.clear();multi=false;renderCurrent();}
  }
  function drop(id:string,x:number,y:number){
    const element=document.elementFromPoint(x,y) as HTMLElement|null;
    const zone=element?.closest<HTMLElement>('[data-hamster-target]');
    const favorite=element?.closest<HTMLElement>('[data-favorite-index]');
    if(favorite){assignFavorite(id,Number(favorite.dataset.favoriteIndex));return;}
    if(!zone)return;
    const target=zone.dataset.hamsterTarget;
    if(target==='mouth'){if(foodGasValue(id)>0)consume(id);else report('Cet objet ne se mange pas.');}
    else if(target==='hands'||target==='head'||target==='back'||target==='feet')equip(id,target);
  }
  function bindPointer(node:HTMLButtonElement,id:string){
    node.addEventListener('contextmenu',e=>e.preventDefault());
    node.addEventListener('pointerdown',e=>{
      if(e.button!==0||multi)return;
      clearPointer();
      pointer={id,pointerId:e.pointerId,x:e.clientX,y:e.clientY,kind:e.pointerType,
        timer:null,dragging:false,ghost:null};
      node.setPointerCapture(e.pointerId);
      pointer.timer=setTimeout(()=>{
        if(!pointer||pointer.id!==id||pointer.dragging)return;
        clearPointer();multi=true;checked.add(id);selectedId=id;renderCurrent();
      },450);
    });
    node.addEventListener('pointermove',e=>{
      const p=pointer;if(!p||p.id!==id||p.pointerId!==e.pointerId)return;
      const dx=e.clientX-p.x,dy=e.clientY-p.y;
      if(!p.dragging&&Math.hypot(dx,dy)<10)return;
      if(!p.dragging){
        if(p.timer!==null){clearTimeout(p.timer);p.timer=null;}
        // Let vertical touch movement scroll the stock instead of grabbing a card.
        if(p.kind==='touch'&&Math.abs(dy)>Math.abs(dx)*1.25){clearPointer();return;}
        p.dragging=true;
        node.setPointerCapture(e.pointerId);
        const item=deps.items().find(i=>i.id===id);
        p.ghost=el('div','ui-drag-ghost',(item?ICONS[item.id]??'⬡':'⬡')+' '+(item?.name??id));
        document.body.append(p.ghost);
        document.body.classList.add('ui-inventory-dragging');
        highlightZones(id);
      }
      if(p.ghost){p.ghost.style.left=e.clientX+14+'px';p.ghost.style.top=e.clientY+14+'px';}
      e.preventDefault();
    });
    node.addEventListener('pointerup',e=>{
      const p=pointer;if(!p||p.id!==id||p.pointerId!==e.pointerId)return;
      const dragged=p.dragging;
      if(dragged){suppressClick=id;drop(id,e.clientX,e.clientY);setTimeout(()=>{if(suppressClick===id)suppressClick=null;},0);}
      clearPointer();
    });
    node.addEventListener('pointercancel',()=>clearPointer());
    node.addEventListener('click',e=>{
      if(suppressClick===id){suppressClick=null;e.preventDefault();return;}
      if(multi){if(checked.has(id))checked.delete(id);else checked.add(id);renderCurrent();return;}
      if(e.shiftKey){multi=true;checked.add(id);selectedId=id;renderCurrent();return;}
      selectedId=id;renderCurrent();
    });
  }
  function render(body:HTMLElement){
    bodyRef=body;clearPointer();
    const scrollBefore=body.querySelector<HTMLElement>('.ui-inventory-stock-scroll')?.scrollTop??0;
    const vm=inventoryViewModel(deps.items(),deps.inventory(),seen);
    const all=vm.groups.flatMap(g=>g.entries);
    ensureFavorites(all);
    // A sold or consumed stack cannot remain selected; favourites keep their IDs but show empty.
    for(const id of checked)if(!all.some(x=>x.id===id))checked.delete(id);
    if(!all.some(x=>x.id===selectedId))selectedId=all[0]?.id??null;
    body.replaceChildren();
    const shell=el('div','ui-bag-v3');
    const count=el('div','ui-inventory-count',vm.empty?'Sac vide':vm.kinds+' types · '+vm.total+' objets');
    const layout=el('div','ui-bag-layout');
    const stock=el('section','ui-inventory-list ui-bag-stock'),portrait=el('section','ui-bag-portrait'),gear=el('aside','ui-inventory-equipment ui-bag-favorites');
    stock.setAttribute('aria-label','Stock du sac');
    portrait.setAttribute('aria-label','Hamster : zones de dépôt');
    gear.setAttribute('aria-label','Dix favoris équipables');
    const filters=el('nav','ui-bag-filters');filters.setAttribute('aria-label','Filtrer le sac');
    for(const choice of FILTERS){
      const b=button(choice.label,()=>{filter=choice.id;renderCurrent();const sc=body.querySelector<HTMLElement>('.ui-inventory-stock-scroll');if(sc)sc.scrollTop=0;},'ui-bag-filter');
      b.setAttribute('aria-pressed',String(filter===choice.id));b.dataset.focusKey='bag-filter:'+choice.id;filters.append(b);
    }
    const multiSwitch=button(multi?'☑':'☐',()=>{multi=!multi;checked.clear();renderCurrent();},'ui-bag-filter','Sélection multiple');
    multiSwitch.setAttribute('aria-label',multi?'Quitter la sélection multiple':'Activer la sélection multiple');
    multiSwitch.dataset.focusKey='bag-multiselect';filters.append(multiSwitch);
    const scroller=el('div','ui-inventory-stock-scroll');
    const grid=el('div','ui-item-grid ui-bag-items');
    function card(e:InventoryEntry,short=false){
      const card=el('button','ui-item ui-bag-card'+(short?' ui-bag-card-mini':''));
      card.type='button';card.dataset.item=e.id;card.dataset.focusKey='item:'+e.id;
      card.setAttribute('aria-label',e.name+', quantité '+e.quantity);
      card.setAttribute('aria-pressed',String(selectedId===e.id));
      const symbol=el('span','ui-item-symbol',icon(e)),name=el('span','ui-item-name',e.name),qty=el('span','ui-item-qty','×'+e.quantity);
      card.append(symbol,name,qty);
      if(e.delta)card.append(el('span','ui-badge','+'+e.delta));
      if(multi){if(checked.has(e.id))card.classList.add('ui-bag-checked');card.append(el('span','ui-bag-check',checked.has(e.id)?'☑':'☐'));}
      if(deps.selectedTool()===e.id||e.id==='tool:miners-helmet'&&deps.headgear?.equipped())card.classList.add('ui-equipped');
      if(foodGasValue(e.id))card.dataset.edible='true';
      bindPointer(card,e.id);return card;
    }
    const shown=all.filter(e=>matchesInventoryFilter(e,filter));
    if(!shown.length)scroller.append(el('p','ui-empty',vm.empty?'Votre sac est vide.':'Aucun objet dans cette catégorie.'));
    else for(const entry of shown)grid.append(card(entry));
    scroller.append(grid);scroller.scrollTop=scrollBefore;
    const categories=el('p','ui-bag-categories',vm.groups.map(g=>g.label).join(' · '));
    stock.append(el('h3','ui-group','Stock'),filters,categories,scroller);
    if(multi){
      const tools=el('div','ui-bag-select-tools');
      tools.append(el('span','','Sélection : '+checked.size));
      tools.append(button('Tout',()=>{shown.forEach(x=>checked.add(x.id));renderCurrent();},'ui-button ui-bag-small'));
      tools.append(button('Annuler',()=>{multi=false;checked.clear();renderCurrent();},'ui-button ui-bag-small'));
      stock.append(tools);
    }
    portrait.append(el('h3','ui-group','Hamster'));
    const stage=el('div','ui-hamster-stage');
    const picture=el('div','ui-hamster-art');picture.innerHTML=HAMSTER;stage.append(picture);
    const targets:readonly {slot:'head'|'hands'|'back'|'feet'|'mouth';label:string;symbol:string}[]=[
      {slot:'head',label:'Tête',symbol:'⛑'},
      {slot:'hands',label:'Main',symbol:'✋'},
      {slot:'mouth',label:'Manger',symbol:'●'},
      {slot:'back',label:'Dos',symbol:'▣'},
      {slot:'feet',label:'Pieds',symbol:'⌁'},
    ];
    const selectedItem=all.find(x=>x.id===selectedId);
    for(const target of targets){
      const b=button(target.symbol,()=>{
        if(!selectedItem)return;
        if(target.slot==='mouth'){if(foodGasValue(selectedItem.id)>0)consume(selectedItem.id);else report('Cet objet ne se mange pas.');}
        else equip(selectedItem.id,target.slot);
      },'ui-hamster-target ui-hamster-'+target.slot,target.label);
      b.dataset.hamsterTarget=target.slot;b.setAttribute('aria-label',target.label);
      const valid=selectedItem&&(target.slot==='mouth'?foodGasValue(selectedItem.id)>0:equipSlot(selectedItem)===target.slot);
      b.classList.toggle('ui-hamster-valid',!!valid);
      if(target.slot==='hands'&&deps.selectedTool()||target.slot==='head'&&deps.headgear?.equipped())b.classList.add('ui-hamster-wearing');
      stage.append(b);
    }
    portrait.append(stage,el('p','ui-bag-hint','Glisser un objet ici, ou sélectionner puis toucher une zone.'));
    gear.append(el('h3','ui-group','Équipement · 10 favoris'));
    const slots=el('div','ui-equipment-grid ui-bag-gear-grid');
    for(let index=0;index<FAVORITE_COUNT;index++){
      const id=favorites?.[index]??null,entry=all.find(e=>e.id===id);
      const slot=el('div','ui-bag-slot');
      slot.dataset.favoriteIndex=String(index);
      if(entry){
        const c=card(entry,true);c.dataset.favoriteIndex=String(index);slot.append(c);
      }else{
        const b=button('+',()=>{
          filter='equipment';renderCurrent();
        },'ui-bag-empty','Ajouter un équipement');
        b.setAttribute('aria-label','Favori '+(index+1)+' : vide');b.dataset.favoriteIndex=String(index);slot.append(b);
      }
      slots.append(slot);
    }
    gear.append(slots,el('p','ui-bag-hint','Glisser un outil sur une case pour l’ajouter aux favoris.'));
    layout.append(stock,portrait,gear);
    const actions=el('footer','ui-bag-actions ui-inventory-detail');
    if(multi){
      const selected=[...checked],edible=selected.length>0&&selected.every(id=>foodGasValue(id)>0);
      actions.append(el('strong','',''+selected.length+' type(s) sélectionné(s)'));
      const plan=planFoodConsumption(selected,deps.inventory(),(deps.gasCapacity?.()??200)-(deps.gasLevel?.()??0));
      const eat=button('Manger sélection · +'+plan.gain+' gaz',()=>{void consumeSelection();},'ui-button ui-primary');
      eat.disabled=!edible||!plan.lines.length;actions.append(eat);
    }else if(selectedItem){
      const title=el('div','ui-bag-selected');title.append(el('strong','',selectedItem.name),el('span','ui-muted','×'+selectedItem.quantity+(foodGasValue(selectedItem.id)?' · +'+foodGasValue(selectedItem.id)+' gaz':'')));
      actions.append(title);
      actions.append(el('span','ui-bag-current-category',selectedItem.categoryLabel));
      const target=equipSlot(selectedItem);
      if(foodGasValue(selectedItem.id)){
        const eat=button('Manger',()=>consume(selectedItem.id),'ui-button ui-primary');
        eat.disabled=(deps.gasCapacity?.()??200)<=(deps.gasLevel?.()??0);
        actions.append(eat);
      }
      if(target){
        const equipped=target==='hands'?deps.selectedTool()===selectedItem.id:target==='head'&&!!deps.headgear?.equipped();
        actions.append(button(equipped?'Ranger':'Équiper',()=>equip(selectedItem.id,target),'ui-button ui-primary'));
        if(target==='hands'){
          const idx=favorites?.indexOf(selectedItem.id)??-1;
          if(idx<0)actions.append(button('Ajouter aux favoris',()=>{
            const free=favorites?.indexOf(null)??-1;
            if(free<0){report('Les dix favoris sont occupés. Glissez cet objet sur une case à remplacer.');return;}
            assignFavorite(selectedItem.id,free);
          },'ui-button'));
        }
        if(selectedItem.category==='instrument'&&equipped&&deps.playInstrument)actions.append(button('Jouer',()=>deps.playInstrument?.(selectedItem.id),'ui-button'));
      }
      actions.append(el('span','ui-bag-description',selectedItem.description??selectedItem.categoryLabel));
    }else actions.append(el('span','ui-muted','Sélectionnez un objet.'));
    shell.append(count,layout,actions);body.append(shell);
  }
  return {
    render,markSeen(){seen={...deps.inventory()};multi=false;checked.clear();clearPointer();},
    isInteracting(){return pointer!==null;},
    cancelSelection(){if(!multi)return false;multi=false;checked.clear();renderCurrent();return true;},
  };
}
