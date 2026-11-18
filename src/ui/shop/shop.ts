/** Compact counter UI. Inventory V3 glyphs and selection affordances; all writes use gameplay. */
import {SHOPS,COIN,priceOf,type ShopKind} from '../../gameplay/economy.ts';
import type {WorkshopServiceView,WorkshopActionResult} from '../../economy/workshop-services.ts';
import type {MarketView} from '../../economy/island-markets.ts';
import {el,button} from '../shared/dom.ts';
import {itemIcon} from '../shared/item-icons.ts';
import {tradeLimit,ownedBuybackLines,selectedSaleTotal} from './shop-logic.ts';

export interface ShopLine {itemId:string;name:string;price:number;owned:number;canAct:boolean;reason?:string;
  /** Seller's physical stock (buy) or the merchant's per-item resale limit (sell). */
  available?:number}
export interface ShopViewModel {name:string;greeting:string;coins:number;buy:ShopLine[];sell:ShopLine[];
  marketBudget?:number;islandId?:string;revision?:number}
export function shopViewModel(kind:ShopKind,inventory:Readonly<Record<string,number>>,name:(id:string)=>string,
  max:(id:string)=>number,market?:MarketView):ShopViewModel{
  const shop=SHOPS[kind],coins=inventory[COIN]??0;
  if(market){
    const buy=market.buy.map(offer=>{
      const owned=inventory[offer.itemId]??0,full=owned>=max(offer.itemId),
        unavailable=offer.available<1,expensive=coins<offer.unitPrice;
      return {itemId:offer.itemId,name:name(offer.itemId),price:offer.unitPrice,owned,
        available:offer.available,canAct:!unavailable&&!expensive&&!full,
        ...(unavailable?{reason:'Rupture de stock'}:full?{reason:'Sac plein'}:expensive?{reason:'Pièces insuffisantes'}:{})};
    });
    const sell=market.sell.map(offer=>{
      const owned=inventory[offer.itemId]??0,
        unavailable=offer.available<1,full=coins+offer.unitPrice>max(COIN);
      return {itemId:offer.itemId,name:name(offer.itemId),price:offer.unitPrice,owned,
        available:offer.available,canAct:owned>0&&!unavailable&&!full,
        ...(owned===0?{reason:'Absent du sac'}:unavailable?{reason:'Rachat temporairement indisponible'}:
          full?{reason:'Bourse pleine'}:{})};
    });
    return {name:shop.name,greeting:shop.greeting,coins,buy,sell,
      islandId:market.islandId,marketBudget:market.cashCoins,revision:market.revision};
  }
  const buy=shop.sells.map(id=>{
    const price=priceOf(id).buy??0,owned=inventory[id]??0,full=owned>=max(id);
    return {itemId:id,name:name(id),price,owned,canAct:price>0&&coins>=price&&!full,
      ...(full?{reason:id.startsWith('tool:')?'Déjà possédé':'Sac plein'}:coins<price?{reason:'Pièces insuffisantes'}:{})};
  });
  const sell=shop.buys.map(id=>{
    const price=priceOf(id).sell??0,owned=inventory[id]??0;
    return {itemId:id,name:name(id),price,owned,canAct:owned>0&&price>0,
      ...(owned?{}:{reason:'Absent du sac'})};
  });
  return {name:shop.name,greeting:shop.greeting,coins,buy,sell};
}
export interface ShopDeps {
  kind():ShopKind|null;
  counterId?():string|null;
  inventory():Readonly<Record<string,number>>;
  name(id:string):string;
  category?(id:string):string;
  max(id:string):number;
  trade(kind:ShopKind,itemId:string,quantity:number,mode:'buy'|'sell',expectedRevision?:number):
    {ok:boolean;message?:string;reason?:string};
  /** Atomic multi-item sale; never emulate it with a sequence of partial trades. */
  sellBatch?(kind:ShopKind,lines:readonly {itemId:string;quantity:number}[],expectedRevision?:number):
    {ok:boolean;message?:string;reason?:string};
  market?:{view(kind:ShopKind,counterId:string):MarketView};
  production?:{
    list(kind:ShopKind,counterId:string):WorkshopServiceView[];
    start(kind:ShopKind,counterId:string,recipeId:string,batches:number):WorkshopActionResult;
    collect(kind:ShopKind,counterId:string,jobId:string):WorkshopActionResult;
  };
  notify(ok:boolean,text:string):void;
}
const MAX_BATCH=20;
export function shopPanel(deps:ShopDeps){
  let mode:'buy'|'sell'|'craft'='buy',lastCounter:string|null=null;
  let selectedId:string|null=null,quantity=1,search='',multi=false,bodyRef:HTMLElement|null=null;
  let suppressClick:{itemId:string;until:number}|null=null;
  const selectedSales=new Map<string,number>(),batchByRecipe=new Map<string,number>();
  const report=(result:{ok:boolean;message?:string;reason?:string})=>
    deps.notify(result.ok,result.ok?result.message??'Opération effectuée':result.reason??'Action refusée');
  const repaint=()=>{if(bodyRef)render(bodyRef);};
  function changeTab(next:'buy'|'sell'|'craft'){
    if(mode===next)return;
    mode=next;selectedId=null;quantity=1;search='';multi=false;selectedSales.clear();repaint();
  }
  function toggleMulti(){
    multi=!multi;selectedSales.clear();selectedId=null;quantity=1;repaint();
  }
  function render(body:HTMLElement){
    bodyRef=body;
    const oldScroll=body.querySelector<HTMLElement>('.ui-shop-scroll')?.scrollTop??0;
    const focusKey=(document.activeElement as HTMLElement|null)?.dataset.focusKey;
    const kind=deps.kind(),counterId=deps.counterId?.()??null;
    body.replaceChildren();
    if(!kind){body.append(el('p','ui-empty','Aucun comptoir à proximité.'));return;}
    if(counterId!==lastCounter){
      lastCounter=counterId;mode='buy';selectedId=null;quantity=1;search='';
      multi=false;selectedSales.clear();batchByRecipe.clear();
    }
    const inventory=deps.inventory(),market=counterId?deps.market?.view(kind,counterId):undefined;
    const vm=shopViewModel(kind,inventory,deps.name,deps.max,market);
    const workstations=counterId&&deps.production?deps.production.list(kind,counterId):[];
    if(mode==='craft'&&!workstations.length)mode='buy';
    const shell=el('div','ui-shop-v3');
    const header=el('div','ui-shop-summary');
    const greeting=el('span','ui-shop-greeting','« '+vm.greeting+' »');
    const purse=el('span','ui-shop-purse',vm.coins+' pièces');
    purse.setAttribute('aria-label','Votre bourse : '+vm.coins+' pièces');
    header.append(greeting,purse);shell.append(header);
    const tabs=el('nav','ui-shop-v3-tabs');tabs.setAttribute('aria-label','Commerce');
    const choices:readonly {id:'buy'|'sell'|'craft';label:string}[]=[
      {id:'buy',label:'Acheter'},{id:'sell',label:'Vendre'},...(workstations.length?[{id:'craft' as const,label:'Transformer'}]:[])];
    for(const tab of choices){
      const b=button(tab.label,()=>changeTab(tab.id),'ui-shop-tab');
      b.dataset.focusKey='shop-tab:'+tab.id;b.setAttribute('aria-pressed',String(mode===tab.id));
      tabs.append(b);
    }
    shell.append(tabs);
    if(mode==='craft'){
      const scroller=el('div','ui-shop-scroll ui-shop-craft-scroll');
      const refresh=button('Actualiser les fabrications',()=>repaint(),'ui-button');
      scroller.append(refresh);
      for(const station of workstations){
        const section=el('section','ui-shop-section'),heading=el('h3','ui-group',station.title);
        section.dataset.station=station.stationId;section.append(heading);
        for(const recipe of station.recipes){
          const batches=batchByRecipe.get(recipe.recipeId)??1;
          const line=el('div','ui-shop-row');line.dataset.recipe=recipe.recipeId;
          const title=recipe.outputs.map(o=>String(o.quantity*batches)+' × '+deps.name(o.itemId)).join(' + ');
          const inputs=recipe.inputs.map(i=>String(i.quantity*batches)+' × '+deps.name(i.itemId)+
            ' ('+String(inventory[i.itemId]??0)+' disponibles)').join(' + ');
          const cost=recipe.serviceFeeCoins*batches,duration=recipe.durationGameMinutes*batches;
          const feasible=recipe.inputs.every(i=>(inventory[i.itemId]??0)>=i.quantity*batches)&&vm.coins>=cost;
          const details=el('div','ui-shop-craft-details');
          details.append(el('strong','ui-shop-name',title),el('p','ui-muted','Ingrédients : '+inputs),
            el('p','ui-muted','Service : '+cost+' pièces · '+duration+' min de jeu'));
          line.append(details);
          const controls=el('div','ui-row ui-shop-craft-actions');
          const minus=button('−',()=>{batchByRecipe.set(recipe.recipeId,Math.max(1,batches-1));repaint();},'ui-button','Diminuer la quantité');
          minus.disabled=batches<=1;
          const count=el('span','ui-shop-batch',String(batches));count.setAttribute('aria-label',batches+' lots');
          const plus=button('+',()=>{batchByRecipe.set(recipe.recipeId,Math.min(MAX_BATCH,batches+1));repaint();},'ui-button','Augmenter la quantité');
          plus.disabled=batches>=MAX_BATCH;
          const craft=button('Lancer',()=>{
            report(deps.production!.start(kind,counterId!,recipe.recipeId,batches));repaint();
          },'ui-button ui-primary');
          craft.disabled=!feasible;if(!feasible)craft.title='Ingrédients ou pièces insuffisants';
          controls.append(minus,count,plus,craft);line.append(controls);section.append(line);
        }
        if(station.jobs.length)section.append(el('h4','ui-group','Fabrications en cours et terminées'));
        for(const job of station.jobs){
          const row=el('div','ui-shop-row');row.dataset.job=job.jobId;
          const name=job.outputs.map(o=>o.quantity+' × '+deps.name(o.itemId)).join(' + ');
          const due=job.status==='ready'?'Prêt à récupérer':
            'Terminé dans '+Math.max(0,job.finishesAtGameMinute-station.gameMinute)+' min de jeu';
          row.append(el('span','ui-shop-name',name),el('span','ui-muted',due));
          if(job.status==='ready'){
            const collect=button('Récupérer',()=>{report(deps.production!.collect(kind,counterId!,job.jobId));repaint();},
              'ui-button ui-primary');
            row.append(collect);
          }
          section.append(row);
        }
        scroller.append(section);
      }
      shell.append(scroller);
    }else{
      const way=mode,all=way==='buy'?vm.buy:ownedBuybackLines(vm.sell);
      const current=all.find(line=>line.itemId===selectedId);
      if(!current){selectedId=all[0]?.itemId??null;quantity=1;}
      const selected=all.find(line=>line.itemId===selectedId)??null;
      const limit=(line:ShopLine)=>tradeLimit(line,way,vm.coins,deps.max(COIN),deps.max(line.itemId));
      if(selected)quantity=Math.max(1,Math.min(quantity,Math.max(1,limit(selected))));
      for(const [id,count] of selectedSales){
        const line=all.find(x=>x.itemId===id);
        if(!line||limit(line)<1)selectedSales.delete(id);
        else selectedSales.set(id,Math.min(count,limit(line)));
      }
      const toolbar=el('div','ui-shop-toolbar');
      const input=el('input','ui-shop-search');input.type='search';
      input.placeholder='Rechercher un objet';input.value=search;
      input.setAttribute('aria-label','Rechercher dans le catalogue');
      input.dataset.focusKey='shop-search';
      toolbar.append(input);
      if(way==='sell'&&deps.sellBatch){
        const toggle=button(multi?'Terminer sélection':'☐ Sélection multiple',toggleMulti,'ui-shop-multi');
        toggle.dataset.focusKey='shop-multiselect';toggle.setAttribute('aria-pressed',String(multi));toolbar.append(toggle);
      }
      shell.append(toolbar);
      const scroller=el('div','ui-shop-scroll');scroller.setAttribute('aria-label',
        way==='buy'?'Articles à acheter':'Articles de votre sac repris par le comptoir');
      const list=el('div','ui-shop-grid');
      for(const line of all){
        const maxQty=limit(line),isSelected=multi?selectedSales.has(line.itemId):selectedId===line.itemId;
        const row=el('button','ui-shop-item');row.type='button';row.dataset.item=line.itemId;
        row.dataset.focusKey='shop-item:'+line.itemId;
        row.dataset.search=line.name.toLocaleLowerCase();
        row.setAttribute('aria-pressed',String(isSelected));
        row.setAttribute('aria-label',line.name+', '+(way==='buy'?'stock '+(line.available??'illimité'):'sac '+line.owned)+
          ', '+line.price+' pièces par unité'+(maxQty===0?', indisponible':''));
        if(maxQty===0)row.classList.add('ui-shop-item-unavailable');
        if(multi&&way==='sell'){
          row.append(el('span','ui-shop-check',selectedSales.has(line.itemId)?'☑':'☐'));
        }
        row.append(el('span','ui-shop-icon',itemIcon({id:line.itemId,category:deps.category?.(line.itemId)??''})));
        const text=el('span','ui-shop-item-text');
        text.append(el('span','ui-shop-item-name',line.name),
          el('span','ui-shop-item-stock',way==='buy'?'Stock ×'+(line.available??'∞'):
            'Sac ×'+line.owned+(selectedSales.has(line.itemId)?' · Vente ×'+selectedSales.get(line.itemId):'')));
        row.append(text,el('span','ui-shop-item-price',line.price+' p.'));
        if(maxQty===0&&line.reason)row.title=line.reason;
        row.addEventListener('click',e=>{
          if(suppressClick?.itemId===line.itemId&&performance.now()<suppressClick.until){
            suppressClick=null;e.preventDefault();return;
          }
          suppressClick=null;
          if(way==='sell'&&e.shiftKey&&!multi){multi=true;selectedSales.clear();}
          if(multi&&way==='sell'){
            if(selectedSales.has(line.itemId))selectedSales.delete(line.itemId);
            else if(maxQty>0)selectedSales.set(line.itemId,1);
          }else{selectedId=line.itemId;quantity=1;}
          repaint();
        });
        if(way==='sell'&&deps.sellBatch){
          let timer:ReturnType<typeof setTimeout>|null=null,startX=0,startY=0;
          const clear=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
          row.addEventListener('pointerdown',e=>{
            if(e.button!==0||multi||maxQty<1)return;
            clear();startX=e.clientX;startY=e.clientY;
            timer=setTimeout(()=>{
              timer=null;multi=true;selectedSales.clear();selectedSales.set(line.itemId,1);
              suppressClick={itemId:line.itemId,until:performance.now()+800};repaint();
            },450);
          });
          row.addEventListener('pointermove',e=>{
            if(Math.hypot(e.clientX-startX,e.clientY-startY)>10)clear();
          });
          row.addEventListener('pointerup',clear);
          row.addEventListener('pointercancel',clear);
          row.addEventListener('contextmenu',e=>e.preventDefault());
        }
        list.append(row);
      }
      if(!all.length)scroller.append(el('p','ui-empty',way==='buy'?'Aucun article proposé.':
        'Ce comptoir ne reprend aucun objet actuellement présent dans votre sac.'));
      if(way==='sell'){
        const offered=new Set(vm.sell.map(x=>x.itemId));
        const excluded=Object.entries(inventory).filter(([id,count])=>id!==COIN&&count>0&&!offered.has(id)).length;
        if(excluded)scroller.append(el('p','ui-shop-note',excluded+' type(s) d’objet de votre sac ne sont pas repris ici.'));
      }
      scroller.append(list);shell.append(scroller);
      const filterRows=()=>{for(const row of list.querySelectorAll<HTMLButtonElement>('.ui-shop-item'))
        row.hidden=!row.dataset.search?.includes(search.toLocaleLowerCase().trim());};
      input.addEventListener('input',()=>{search=input.value;filterRows();});
      filterRows();
      const footer=el('footer','ui-shop-checkout');
      if(multi&&way==='sell'&&deps.sellBatch){
        const rows=[...selectedSales].map(([id,count])=>({line:all.find(x=>x.itemId===id),count}))
          .filter((x):x is {line:ShopLine;count:number}=>!!x.line);
        const total=selectedSaleTotal(all,selectedSales),canPay=total>0&&
          total<=(vm.marketBudget??Infinity)&&total<=deps.max(COIN)-vm.coins;
        const info=el('div','ui-shop-checkout-info');
        info.append(el('strong','',rows.length+' type(s) · '+rows.reduce((n,r)=>n+r.count,0)+' unité(s)'),
          el('span','ui-shop-total','+'+total+' pièces'));
        const adjust=el('div','ui-shop-multi-amounts');
        for(const {line,count} of rows){
          const chip=el('span','ui-shop-amount-chip');
          const minus=button('−',()=>{selectedSales.set(line.itemId,Math.max(1,count-1));repaint();},
            'ui-shop-amount-btn','Retirer une unité de '+line.name);minus.disabled=count<=1;
          const plus=button('+',()=>{selectedSales.set(line.itemId,Math.min(limit(line),count+1));repaint();},
            'ui-shop-amount-btn','Ajouter une unité de '+line.name);plus.disabled=count>=limit(line);
          chip.append(el('span','',line.name+' ×'+count),minus,plus);adjust.append(chip);
        }
        const actions=el('div','ui-shop-checkout-actions');
        const maxAll=button('Max / objet',()=>{
          for(const [id] of selectedSales){const line=all.find(x=>x.itemId===id);if(line)selectedSales.set(id,limit(line));}
          repaint();
        },'ui-shop-small-button');
        maxAll.disabled=!rows.length;
        const reset=button('1 / objet',()=>{for(const id of selectedSales.keys())selectedSales.set(id,1);repaint();},
          'ui-shop-small-button');reset.disabled=!rows.length;
        const sale=button('Vendre sélection',()=>{
          const lines=[...selectedSales].map(([itemId,quantity])=>({itemId,quantity}));
          report(deps.sellBatch!(kind,lines,vm.revision));
          repaint();
        },'ui-button ui-primary');
        sale.disabled=!canPay||!rows.length;sale.title=!canPay?'Montant ou sélection incompatible avec le comptoir':'';
        actions.append(reset,maxAll,sale);footer.append(info,adjust,actions);
      }else if(selected){
        const maximum=limit(selected),info=el('div','ui-shop-checkout-info');
        info.append(el('strong','',selected.name),
          el('span','ui-shop-total',(way==='buy'?'−':'+')+selected.price*quantity+' pièces'));
        const controls=el('div','ui-shop-quantity-controls');
        const minus=button('−',()=>{quantity=Math.max(1,quantity-1);repaint();},'ui-shop-quantity-button');
        minus.disabled=quantity<=1;
        const count=el('span','ui-shop-quantity',String(quantity));count.setAttribute('aria-label',quantity+' unités');
        const plus=button('+',()=>{quantity=Math.min(maximum,quantity+1);repaint();},'ui-shop-quantity-button');
        plus.disabled=quantity>=maximum;
        const allButton=button('Max',()=>{quantity=Math.max(1,maximum);repaint();},'ui-shop-small-button');
        allButton.disabled=maximum<=1;
        controls.append(minus,count,plus,allButton);
        const action=button(way==='buy'?'Acheter':'Vendre',()=>{
          report(deps.trade(kind,selected.itemId,quantity,way,vm.revision));repaint();
        },'ui-button ui-primary');action.disabled=maximum<1;
        if(action.disabled)action.title=selected.reason??'Action indisponible';
        footer.append(info,controls,action);
      }else footer.append(el('span','ui-muted','Sélectionnez un objet pour commencer.'));
      shell.append(footer);
    }
    body.append(shell);
    const scroll=body.querySelector<HTMLElement>('.ui-shop-scroll');if(scroll)scroll.scrollTop=oldScroll;
    if(focusKey){
      const focus=[...body.querySelectorAll<HTMLElement>('[data-focus-key]')].find(x=>x.dataset.focusKey===focusKey);
      focus?.focus({preventScroll:true});
    }
  }
  return {render,cancelSelection(){
    if(!multi)return false;
    multi=false;selectedSales.clear();repaint();return true;
  }};
}
